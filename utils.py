import os
import re
import json
import urllib.request
import urllib.parse

# Whitelist of allowed domains to prevent SSRF
ALLOWED_DOMAINS = {
    'youtube.com', 'www.youtube.com', 'youtu.be', 'www.youtu.be',
    'soundcloud.com', 'www.soundcloud.com',
    'jamendo.com', 'www.jamendo.com',
    'archive.org', 'www.archive.org'
}

def is_safe_url(url):
    try:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in ('http', 'https'):
            return False
        host = parsed.netloc.lower()
        if ':' in host:
            host = host.split(':')[0]
        return any(host == domain or host.endswith('.' + domain) for domain in ALLOWED_DOMAINS)
    except Exception:
        return False

def sanitize_filename(name):
    base = os.path.basename(name)
    base = base.replace('..', '').replace('/', '').replace('\\', '')
    sanitized = re.sub(r'[^a-zA-Z0-9 \-_.]', '', base)
    sanitized = re.sub(r'\s+', ' ', sanitized)
    sanitized = re.sub(r'\.+', '.', sanitized)
    return sanitized.strip()[:100]

def fallback_cobalt_download(url, download_id, downloads_dir, log_callback=None):
    def log(msg):
        if log_callback:
            log_callback(msg)
        print(msg)

    # Create unverified SSL context to bypass SSL validation errors on community-managed instances
    import ssl
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    instances = [
        "https://api.cobalt.tools/",
        "https://co.wuk.sh/",
        "https://cobalt.api.ryz.cx/",
        "https://cobalt.kuro.team/",
        "https://cobalt.moe/",
        "https://cobalt.sh/"
    ]
    
    try:
        # Dynamically query working instances from the public cobalt tracker directory
        req = urllib.request.Request(
            "https://cobalt.directory/api/working?type=api",
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        )
        with urllib.request.urlopen(req, timeout=5, context=ctx) as res:
            data = json.loads(res.read().decode('utf-8'))
            if isinstance(data, list):
                for inst in data:
                    url_val = inst.get('url')
                    if url_val and url_val not in instances:
                        if not url_val.endswith('/'):
                            url_val += '/'
                        instances.append(url_val)
    except Exception as dir_err:
        log(f"[WARNING] Could not fetch dynamic instances: {dir_err}")
    
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Origin": "https://cobalt.tools",
        "Referer": "https://cobalt.tools/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    payload = {
        "url": url,
        "downloadMode": "audio",
        "audioFormat": "mp3",
        "isAudioOnly": True
    }
    
    for instance in instances:
        try:
            log(f"> Attempting backup stream resolver via: {instance}")
            req = urllib.request.Request(
                instance, 
                data=json.dumps(payload).encode('utf-8'),
                headers=headers,
                method='POST'
            )
            with urllib.request.urlopen(req, timeout=12, context=ctx) as res:
                response_data = json.loads(res.read().decode('utf-8'))
                stream_url = response_data.get('url')
                if stream_url:
                    log(f"> Backup resolved audio link successfully!")
                    output_filename = f"{download_id}.mp3"
                    output_path = os.path.join(downloads_dir, output_filename)
                    
                    stream_req = urllib.request.Request(stream_url, headers={"User-Agent": headers["User-Agent"]})
                    with urllib.request.urlopen(stream_req, context=ctx) as stream_res:
                        with open(output_path, 'wb') as out_f:
                            while True:
                                chunk = stream_res.read(1024 * 64)
                                if not chunk:
                                    break
                                out_f.write(chunk)
                    return True
                else:
                    log(f"[WARNING] Resolver {instance} responded: {response_data}")
        except urllib.error.HTTPError as he:
            try:
                err_body = he.read().decode('utf-8', errors='ignore')
                log(f"[WARNING] Resolver {instance} responded with HTTP {he.code}: {err_body}")
            except Exception:
                log(f"[WARNING] Resolver {instance} responded with HTTP {he.code}")
        except Exception as e:
            log(f"[WARNING] Resolver {instance} encountered an error: {e}")
            
    return False
