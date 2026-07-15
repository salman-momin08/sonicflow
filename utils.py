import os
import re
import json
import ssl
import urllib.request
import urllib.parse
import urllib.error

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
    """
    Fallback downloader: tries multiple yt-dlp player clients that bypass
    YouTube's bot detection on datacenter IPs without needing cookies or PO tokens.
    All public Cobalt API instances now require JWT auth and are not viable.
    """
    import yt_dlp

    def log(msg):
        if log_callback:
            log_callback(msg)
        print(msg)

    # These player clients are known to bypass bot detection on cloud IPs
    # without requiring PO tokens or valid browser cookies
    fallback_clients = [
        ('tv_embedded', 'YouTube TV Embedded client'),
        ('mweb', 'YouTube Mobile Web client'),
        ('ios', 'YouTube iOS client'),
        ('web_safari', 'YouTube Web Safari client'),
    ]

    for client, label in fallback_clients:
        try:
            log(f"> Backup engine: trying {label}...")
            output_template = os.path.join(downloads_dir, f"{download_id}.%(ext)s")
            ydl_opts = {
                'format': 'bestaudio/best',
                'outtmpl': output_template,
                'postprocessors': [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '192',
                }],
                'nocheckcertificate': True,
                'quiet': True,
                'no_warnings': True,
                'extractor_args': {
                    'youtube': {
                        'player_client': client
                    }
                }
            }
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])

            # Check if output file was created
            for file in os.listdir(downloads_dir):
                if file.startswith(download_id) and file.endswith('.mp3'):
                    log(f"> Backup engine succeeded with {label}!")
                    return True
        except Exception as e:
            log(f"[WARNING] Backup engine {label} failed: {e}")

    return False
