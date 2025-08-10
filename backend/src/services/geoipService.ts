import { Reader } from '@maxmind/geoip2-node';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface IPInfo {
  country: string;
  countryCode: string;
  provider: string;
}

export class GeoIPService {
  private static countryReader: Reader | null = null;
  private static asnReader: Reader | null = null;
  private static initialized = false;

  private static async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const geoipDir = path.join(__dirname, '../geoipdb');
      const countryDbPath = path.join(geoipDir, 'GeoLite2-Country.mmdb');
      const asnDbPath = path.join(geoipDir, 'GeoLite2-ASN.mmdb');

      this.countryReader = await Reader.open(countryDbPath);
      this.asnReader = await Reader.open(asnDbPath);
      
      this.initialized = true;
      logger.info('GeoIP service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize GeoIP service:', error);
      // Continue without GeoIP functionality
    }
  }

  static async getIPInfo(ip: string): Promise<IPInfo> {
    await this.initialize();

    try {
      if (!this.countryReader || !this.asnReader) {
        throw new Error('GeoIP databases not available');
      }

      const countryResponse = this.countryReader.country(ip);
      const asnResponse = this.asnReader.asn(ip);

      return {
        country: countryResponse.country?.names?.en || 'Unknown',
        countryCode: countryResponse.country?.isoCode || 'SG',
        provider: asnResponse.autonomousSystemOrganization || 'Unknown'
      };
    } catch (error) {
      logger.warn('Failed to get IP info, using defaults:', { ip, error });
      return {
        country: 'Unknown',
        countryCode: 'SG',
        provider: 'Unknown'
      };
    }
  }

  static determineRegion(countryCode: string): string {
    const asiaCountryCodes = [
      "AF", "AFG", "AM", "ARM", "AZ", "AZE", "BH", "BHR", "BD", "BGD", "BT", "BTN", 
      "MM", "MMR", "KH", "KHM", "CN", "CHN", "CY", "CYP", "GE", "GEO", "IN", "IND", 
      "ID", "IDN", "IR", "IRN", "IQ", "IRQ", "IL", "ISR", "JP", "JPN", "JO", "JOR", 
      "KZ", "KAZ", "KP", "PRK", "KR", "KOR", "KW", "KWT", "KG", "KGZ", "LA", "LAO", 
      "LB", "LBN", "MY", "MYS", "MV", "MDV", "MN", "MNG", "NP", "NPL", "OM", "OMN", 
      "PK", "PAK", "PH", "PHL", "QA", "QAT", "SA", "SAU", "SG", "SGP", "LK", "LKA", 
      "SY", "SYR", "TJ", "TJK", "TH", "THA", "TL", "TLS", "TM", "TKM", "AE", "ARE", 
      "UZ", "UZB", "VN", "VNM", "YE", "YEM"
    ];

    if (countryCode === 'AU' || countryCode === 'AUS') {
      return 'australia';
    }
    
    if (asiaCountryCodes.includes(countryCode)) {
      return 'asia';
    }
    
    return 'global';
  }
}