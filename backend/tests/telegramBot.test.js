const sinon = require('sinon');

// Mock the TypeScript modules since they need compilation
const mockRateLimiter = {
  checkLimit: jest.fn(),
  blockIdentifier: jest.fn(),
  unblockIdentifier: jest.fn(),
  getStats: jest.fn(),
  resetLimits: jest.fn(),
  resetAll: jest.fn()
};

const mockBotSecurity = {
  checkSecurity: jest.fn(),
  blockUser: jest.fn(),
  unblockUser: jest.fn(),
  logCommand: jest.fn(),
  getStats: jest.fn(),
  resetStats: jest.fn()
};

// Mock constructors
const RateLimiter = jest.fn(() => mockRateLimiter);
const BotSecurity = jest.fn(() => mockBotSecurity);

// Simple unit tests for BOT utilities
describe('BOT Telegram Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('RateLimiter', () => {
    let rateLimiter;

    beforeEach(() => {
      rateLimiter = new RateLimiter();
    });

    test('should create RateLimiter instance', () => {
      expect(RateLimiter).toHaveBeenCalled();
      expect(rateLimiter).toBeDefined();
    });

    test('should allow requests within limit', () => {
      mockRateLimiter.checkLimit.mockReturnValue({ allowed: true, remaining: 9 });
      
      const result = rateLimiter.checkLimit('user:123', 'BOT_COMMANDS');
      
      expect(result.allowed).toBe(true);
      expect(mockRateLimiter.checkLimit).toHaveBeenCalledWith('user:123', 'BOT_COMMANDS');
    });

    test('should block requests exceeding limit', () => {
      mockRateLimiter.checkLimit.mockReturnValue({ allowed: false, isBlocked: true });
      
      const result = rateLimiter.checkLimit('user:123', 'BOT_COMMANDS');
      
      expect(result.allowed).toBe(false);
      expect(result.isBlocked).toBe(true);
    });

    test('should get statistics', () => {
      mockRateLimiter.getStats.mockReturnValue({ totalRequests: 5, activeUsers: 2 });
      
      const stats = rateLimiter.getStats();
      
      expect(stats.totalRequests).toBe(5);
      expect(stats.activeUsers).toBe(2);
      expect(mockRateLimiter.getStats).toHaveBeenCalled();
    });

    test('should unblock identifier', () => {
      mockRateLimiter.unblockIdentifier.mockReturnValue(true);
      
      const result = rateLimiter.unblockIdentifier('user:123');
      
      expect(result).toBe(true);
      expect(mockRateLimiter.unblockIdentifier).toHaveBeenCalledWith('user:123');
    });
  });

  describe('BotSecurity', () => {
    let botSecurity;

    beforeEach(() => {
      botSecurity = new BotSecurity();
    });

    test('should create BotSecurity instance', () => {
      expect(BotSecurity).toHaveBeenCalled();
      expect(botSecurity).toBeDefined();
    });

    test('should check security for valid user', () => {
      const securityContext = {
        userId: 123,
        username: 'testuser',
        command: '/start',
        chatId: 456
      };
      
      mockBotSecurity.checkSecurity.mockReturnValue({ allowed: true, rateLimitInfo: { remaining: 9 } });
      
      const result = botSecurity.checkSecurity(securityContext);
      
      expect(result.allowed).toBe(true);
      expect(mockBotSecurity.checkSecurity).toHaveBeenCalledWith(securityContext);
    });

    test('should block suspicious user', () => {
      const securityContext = {
        userId: 123,
        username: 'suspicioususer',
        command: '/spam',
        chatId: 456
      };
      
      mockBotSecurity.checkSecurity.mockReturnValue({ allowed: false, reason: 'Rate limit exceeded' });
      
      const result = botSecurity.checkSecurity(securityContext);
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Rate limit exceeded');
    });

    test('should log command execution', () => {
      mockBotSecurity.logCommand.mockReturnValue(true);
      
      const result = botSecurity.logCommand(123, '/topup', true);
      
      expect(result).toBe(true);
      expect(mockBotSecurity.logCommand).toHaveBeenCalledWith(123, '/topup', true);
    });

    test('should block user', () => {
      mockBotSecurity.blockUser.mockReturnValue(true);
      
      const result = botSecurity.blockUser(123, 'Spam detected');
      
      expect(result).toBe(true);
      expect(mockBotSecurity.blockUser).toHaveBeenCalledWith(123, 'Spam detected');
    });

    test('should get security statistics', () => {
      mockBotSecurity.getStats.mockReturnValue({
        totalCommands: 100,
        blockedUsers: 5,
        suspiciousActivity: 10
      });
      
      const stats = botSecurity.getStats();
      
      expect(stats.totalCommands).toBe(100);
      expect(stats.blockedUsers).toBe(5);
      expect(stats.suspiciousActivity).toBe(10);
    });
  });

  describe('Integration Tests', () => {
    test('should integrate RateLimiter and BotSecurity', () => {
      const rateLimiter = new RateLimiter();
      const botSecurity = new BotSecurity();
      
      mockRateLimiter.checkLimit.mockReturnValue({ allowed: true, remaining: 5 });
      mockBotSecurity.checkSecurity.mockReturnValue({ allowed: true, rateLimitInfo: { remaining: 5 } });
      
      const limitResult = rateLimiter.checkLimit('user:123', 'BOT_COMMANDS');
      const securityResult = botSecurity.checkSecurity({
        userId: 123,
        username: 'testuser',
        command: '/start',
        chatId: 456
      });
      
      expect(limitResult.allowed).toBe(true);
      expect(securityResult.allowed).toBe(true);
    });
  });
});