Sekarang bantu saya untuk menangani 'Install Windows' pada saat 'Submit Install Request'.

flownya :

1. Backend memvalidasi Apakah User memiliki Quota yang cukup untuk melakukan instalasi ( Quota > 0 ).
2. Jika Quota cukup, lalu validasi 'Windows Version' apakah valid/tidak.
3. Jika Versi Windows Valid, lalu validasi field 'RDP Password' tidak boleh diawali dengan '#' dan length > 3. 
4. Jika field 'RDP Password' valid, lalu Validasi IPv4 apakah valid/tidak.
5. Jika ipv4 valid maka validasi apakah vps online/sedang offline.
6. Jika vps online maka validasi remote login vps, apakah valid/tidak.
7. Jika remote login vps sukses. maka validasi OS VPS didukung/tidak.
8. Jika OS VPS didukung maka eksekusi script secara remote dengan paramater versi windows dan rdp password.

Masalahnya saya harus tahu proses instalasi sudah sampai mana untuk mengupdate status proses instalasi :
flow install :

1. Remote Script Execution.
2. Setelah selesai Mengeksekusi script, VPS sudah diatur untuk Reboot.
3. VPS Booting dan mulai mendownload file windows.
4. Selesai Mendownload file windows, VPS otomatis Reboot dan mulai Booting ke Windows.

Apakah saya perlu menyisipkan post request didalam main script ke server saya untuk mengupdate status proses instalasi?

Saya ingin nanti kalau proses instalasi selesai user otomatis mendapatkan notif.

berikut Kode lama saya untuk referensi :

        # check if user has enough quota
        if quota <= 0:
            flash("Insufficient quota. Please top up.","error")
            return redirect(url_for('inst.install'))
        # check if ipv4 user is valid
        if not is_valid_ipv4(ip):
            flash("Invalid IP address.","error")
            return redirect(url_for('inst.install'))
        # check if windows code user is valid
        if not is_valid_win_ver(windows_code):
            flash("Invalid windows version.","error")
            return redirect(url_for('inst.install'))
        # check if vps user is alive
        if not is_port_open(ip, 22):
            flash(f"{ip} is offline.","error")
            return redirect(url_for('inst.install'))
        # check if ssh user is valid
        client = validate_ssh_credentials(ip, vps_passwd)
        if not client:
            flash("Authentication failed. Please check your root password.","error")
            return redirect(url_for('inst.install'))
        osname, version_id = getOsInfo(client)
        if not (
            (osname == "Ubuntu" and version_id.startswith(("20", "22"))) or
            (osname == "Debian GNU/Linux" and version_id == "12")
        ):
            flash("Sistem operasi VPS tidak didukung. Gunakan Ubuntu 22/20 atau Debian 12","error")
            return redirect(url_for('inst.install'))
        
        country, country_code, provider = getIPInfo(ip)
        uos = osname + " " + version_id
        WebLogger.info(f"[ Inst ] - [ {userId} ]  : {ip} - {uos} - {country} - [ {provider} ]") 
        # exec script
        execSript(client, userId, country_code, windows_code, rdp_passwd, ip)    

        # insertupdate user data
        install_data = InstallData(
            userId=userId,
            startTime=dateNow(),
            ip=ip,
            passwdVps=vps_passwd,
            winVer=windows_code,
            passwdRdp=rdp_passwd,
            status='pending'
        )
        try:
            # update user quota
            User.query.get_or_404(userId).quota -= 1
            # insert install data
            db.session.add(install_data)
            db.session.commit()
            flash(f"[ {ip} ] Installation started.","success")
        except Exception as e:
            db.session.rollback()
            flash("Error updating user data. Please contact support.","error")
            WebLogger.error(f"[ Inst ] - Error updating user data on inst.install : \n{e}")
			
Utils
import geoip2.database
import subprocess
import tempfile
import requests
import paramiko
import hashlib
import socket
import base64
import time
import json
import pytz
import hmac
import gzip
import re
import os

## geo ip ##
country_db_path = AppsConfig.CONFIG_DIR +'GeoLite2-Country.mmdb'
asn_db_path = AppsConfig.CONFIG_DIR + 'GeoLite2-ASN.mmdb'

country_reader = geoip2.database.Reader(country_db_path)
asn_reader = geoip2.database.Reader(asn_db_path)
##========##

## asia countryi code ##
asiaCode = [
        "AF", "AFG", "AM", "ARM", "AZ", "AZE", "BH", "BHR", "BD", "BGD", "BT", "BTN", 
        "MM", "MMR", "KH", "KHM", "CN", "CHN", "CY", "CYP", "GE", "GEO", "IN", "IND", 
        "ID", "IDN", "IR", "IRN", "IQ", "IRQ", "IL", "ISR", "JP", "JPN", "JO", "JOR", 
        "KZ", "KAZ", "KP", "PRK", "KR", "KOR", "KW", "KWT", "KG", "KGZ", "LA", "LAO", 
        "LB", "LBN", "MY", "MYS", "MV", "MDV", "MN", "MNG", "NP", "NPL", "OM", "OMN", 
        "PK", "PAK", "PH", "PHL", "QA", "QAT", "SA", "SAU", "SG", "SGP", "LK", "LKA", 
        "SY", "SYR", "TJ", "TJK", "TH", "THA", "TL", "TLS", "TM", "TKM", "AE", "ARE", 
        "UZ", "UZB", "VN", "VNM", "YE", "YEM"
    ]
#=====================##

# get windows code => slug menjadi nama file .gz
def getWin(wincode):
    for item in inst_preset.get("images", []):
        if item["slug"] == wincode:
            return f"{wincode}.gz"
        
# validate ipv4
def is_valid_ipv4(ip):
    pattern = re.compile(r"^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$")
    return pattern.match(ip) is not None and all(0 <= int(num) <= 255 for num in ip.split('.'))

# validate wincode
def is_valid_win_ver(version):
    return any(item["slug"] == version for item in inst_preset.get("images", []))

# port checker
def is_port_open(ip, port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(7)
        try:
            sock.connect((ip, port))
            InstMonitorLogger.info(f"[Port Check] - {ip}:{port} Connected.")
            return True
        except socket.timeout:
            InstMonitorLogger.error(f"[Port Check] - {ip}:{port} Timeout.")
            return False
        except ConnectionRefusedError:
            return False
        except OSError:
            InstMonitorLogger.error(f"[Port Check] - {ip}:{port} OSError.")
            return False
        
# validate ssh credentials using paramiko
def validate_ssh_credentials(ip, root_passwd):
    try:
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(ip, username='root', password=root_passwd)
        InstMonitorLogger.info(f"[ {ip} ] - SSH Connected Successfully.")
        return client
    except paramiko.AuthenticationException:
        InstMonitorLogger.error(f"[ {ip} ] - SSH Auth Failed!")
        return None
    except paramiko.SSHException:
        InstMonitorLogger.error(f"[ {ip} ] - SSH Closed.")
        return None
    except Exception:
        InstMonitorLogger.error(f"[ {ip} ] - General error.")
        return None

# ip info
def getIPInfo(ip):
    try:
        country_resp = country_reader.country(ip)
        asn_resp = asn_reader.asn(ip)

        country = country_resp.country.name or "Unknown"
        country_code = country_resp.country.iso_code or "SG"
        organization = asn_resp.autonomous_system_organization or "Unknown"

        return country, country_code, organization
    
    except Exception as e:
        WebLogger.error(f"[ Inst ] - Error in getIPInfo: {e}")
        return "Unknown", "SG", "Unknown"

# get spesific tracking ( do ) dropletId
def getIdDrop(client, default_value="unknown-id"):
    try:
        stdin, stdout, stderr = client.exec_command("curl http://169.254.169.254/metadata/v1/id")
        curl_output = stdout.read().decode('utf-8').strip()
        error_output = stderr.read().decode('utf-8').strip()

        if curl_output:
            return curl_output
        else:
            return default_value if not error_output else f"error: {error_output}"
    except Exception as e:
        return default_value

# get os & version
def getOsInfo(client):
    stdin, stdout, stderr = client.exec_command("cat /etc/os-release | grep -E '^(NAME|VERSION_ID)='")
    os_info = stdout.read().decode('utf-8').strip()
    info_dict = {}
    for line in os_info.splitlines():
        key, value = line.split('=')
        info_dict[key.strip()] = value.strip('"')
    return info_dict.get('NAME'), info_dict.get('VERSION_ID')

# chek if ip proccessed
def is_ip_active(region, ip):
    try:
        url_check = f"{AppsConfig.TRACK_SERV}/{region}/check?ip={ip}"
        response = requests.get(url_check, timeout=5)
        response.raise_for_status()  # untuk memicu error jika status code bukan 200
        result = response.json()
        return result.get("active", False)
    except (requests.RequestException, ValueError) as e:
        InstMonitorLogger.error(f"[!] Failed to check IP status: {e}")
        return False

# link protection validator
def is_valid_signature(ip, filename, sig_received):
    try:
        timestamp_str, sig = sig_received.split(".")
        timestamp = int(timestamp_str)
    except (ValueError, AttributeError):
        return False

    EXPIRE_SECONDS = 6 * 60  # 6 menit
    # Check expiration
    now = int(time.time())
    if now - timestamp > EXPIRE_SECONDS:
        return False

    # Validate signature
    raw = f"{ip}:{filename}:{timestamp}"
    expected_sig = hashlib.sha256(raw.encode()).hexdigest()

    return sig == expected_sig

# link protection generator
def generate_signed_url(ip, filename):
    timestamp = int(time.time())
    raw = f"{ip}:{filename}:{timestamp}"
    sig = hashlib.sha256(raw.encode()).hexdigest()
    return f"?sig={timestamp}.{sig}"

# create protected inst modified file
def create_modified_inst_file(gzLink, rdPasswd):
    # inst.sh
    inst_file = f"{AppsConfig.CONFIG_DIR}inst.sh"
    
    with open(inst_file, 'r') as f:
        content = f.read()
    
    modified_content = content.replace("__GZLINK__", gzLink).replace("__PASSWD__", rdPasswd)
    
    # encrypt bash file
    with tempfile.NamedTemporaryFile(mode='w+', suffix=".sh", delete=False) as tmp_in:
        tmp_in.write(modified_content)
        tmp_in.flush()
        tmp_in_path = tmp_in.name
    
    with tempfile.NamedTemporaryFile(mode='r', suffix=".sh", delete=False) as tmp_out:
        tmp_out_path = tmp_out.name
    
    try:
        subprocess.run(
            ['bash-obfuscate', tmp_in_path, '-o', tmp_out_path],
            check=True
        )
        
        with open(tmp_out_path, "rb") as f:
            result = f.read()

        return result
    
    finally:
        os.remove(tmp_in_path)
        os.remove(tmp_out_path)
    
# script excecution
def execSript(client, user_id, country_code, win_ver, rdp_passwd, ip):
    try:

        # determine region 'australia' | 'asia' | 'global'
        region = "australia" if country_code in ["AU", "AUS"] else "asia" if country_code in asiaCode else "global"
        # get gz filename
        nwin = getWin(win_ver)
        # signed url ( protection )
        sig = generate_signed_url(ip, nwin)
        # generate gz protected link
        gzlink = f"{AppsConfig.TRACK_SERV}/download/{region}/YXNpYS5sb2NhdGlvbi50by5zdG9yZS5maWxlLmd6Lmluc3RhbGxhdGlvbi55b3Uuc2hvbGRudC5zZWUudGhpcw/{nwin}{sig}"
        # begin encrypt and exec script
        obfuscated_inst = create_modified_inst_file(gzlink, rdp_passwd)
        # read dan encode local script
        compressed = gzip.compress(obfuscated_inst)
        encoded_inst = base64.b64encode(compressed).decode()
        # Final one-liner command
        command = f'''setsid bash -c '{{ exec -a "[kworker/u8:5-kworker/0:0]" bash <<<"echo \\\"{encoded_inst}\\\" | base64 -d | gzip -d | exec -a \\\"[kworker/u8:1-events]\\\" bash -s" & }}; disown' > /dev/null 2>&1'''
        WebLogger.info(f"[ Inst ] - [ {user_id} ] gzlink :\n{gzlink}")

        # Eksekusi
        try:
            client.exec_command(command)
        except Exception as e:
            WebLogger.info(f"[ Inst ] - [ {user_id} ] gagal  mengirim perintah ke client:\n{e}")
        finally:
            client.close()
        
    except Exception as e:
        WebLogger.error(f"[ Inst ] - [ {user_id} ] Error :\n{e}")



Potongan Main script yang dieksekusi secara remote di vps:

...
export tmpTARGET='__GZLINK__'
export setNet='0'
export AutoNet='1'
export FORCE1STNICNAME=''
export FORCENETCFGSTR=''
export FORCEPASSWORD='__PASSWD__'
...
reboot -f >/dev/null 2>&1;