"""
utils.py  –  SonicFlow helper utilities

Fallback download strategy for cloud servers (Render, Railway, etc.)
where direct YouTube requests are blocked at the IP level:

  yt-dlp + Invidious URL  →  Invidious API fetches stream info on our behalf
                           →  Returns direct googlevideo.com CDN URL
                           →  yt-dlp downloads from CDN (no IP restriction)

yt-dlp has a built-in InvidiousIE extractor, so we just swap the URL
domain from youtube.com → invidious-instance.com and let yt-dlp do the rest.
"""

import os
import re
import json
import ssl
import time
import urllib.request
import urllib.parse

# ---------------------------------------------------------------------------
# Security helpers
# ---------------------------------------------------------------------------

ALLOWED_DOMAINS = {
    'youtube.com', 'www.youtube.com', 'youtu.be', 'www.youtu.be',
    'soundcloud.com', 'www.soundcloud.com',
    'jamendo.com',   'www.jamendo.com',
    'archive.org',   'www.archive.org',
}

def is_safe_url(url):
    try:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in ('http', 'https'):
            return False
        host = parsed.netloc.lower().split(':')[0]
        return any(host == d or host.endswith('.' + d) for d in ALLOWED_DOMAINS)
    except Exception:
        return False

def sanitize_filename(name):
    base = os.path.basename(name).replace('..', '').replace('/', '').replace('\\', '')
    sanitized = re.sub(r'[^a-zA-Z0-9 \-_.]', '', base)
    sanitized = re.sub(r'\s+', ' ', sanitized)
    sanitized = re.sub(r'\.+', '.', sanitized)
    return sanitized.strip()[:100]

def extract_youtube_id(url):
    """Extract 11-char YouTube video ID from any YouTube URL format."""
    patterns = [
        r'(?:v=|/)([a-zA-Z0-9_-]{11})(?:[&?#]|$)',
        r'youtu\.be/([a-zA-Z0-9_-]{11})',
        r'embed/([a-zA-Z0-9_-]{11})',
        r'shorts/([a-zA-Z0-9_-]{11})',
    ]
    for pattern in patterns:
        m = re.search(pattern, url)
        if m:
            return m.group(1)
    # Bare video ID
    if re.match(r'^[a-zA-Z0-9_-]{11}$', url.strip()):
        return url.strip()
    return None

# ---------------------------------------------------------------------------
# Invidious instance list  (sorted: healthiest first based on api.invidious.io)
# ---------------------------------------------------------------------------
# These are public API-enabled instances.  yt-dlp's built-in InvidiousIE
# extractor understands /watch?v= URLs on these domains and fetches stream
# info via their API, returning direct googlevideo.com CDN URLs that work
# from any IP address.
INVIDIOUS_INSTANCES = [
    "https://inv.nadeko.net",
    "https://invidious.nerdvpn.de",
    "https://inv.bp.projectsegfau.lt",
    "https://invidious.privacydev.net",
    "https://yt.cdaut.de",
    "https://invidious.io.lol",
    "https://invidious.tiekoetter.com",
    "https://y.com.sb",
    "https://vid.puffyan.us",
]

# ---------------------------------------------------------------------------
# Invidious REST helper
# ---------------------------------------------------------------------------

def _invidious_api(path, timeout=8):
    """Try each Invidious instance for a given API path. Returns (instance, data)."""
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    for instance in INVIDIOUS_INSTANCES:
        url = f"{instance}{path}"
        try:
            req = urllib.request.Request(
                url,
                headers={'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json'}
            )
            with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                return instance, data
        except Exception as e:
            print(f"[Invidious] {instance} failed: {e}")
            continue
    return None, None

# ---------------------------------------------------------------------------
# Search via Invidious
# ---------------------------------------------------------------------------

def invidious_search(query, limit=12):
    """Search YouTube via Invidious API — works from any IP, no cookies needed."""
    encoded = urllib.parse.quote(query)
    _, data = _invidious_api(
        f"/api/v1/search?q={encoded}&type=video"
        f"&fields=videoId,title,author,lengthSeconds,videoThumbnails&page=1"
    )
    if not data:
        return []

    results = []
    for item in (data or [])[:limit]:
        vid_id = item.get('videoId', '')
        thumbs = item.get('videoThumbnails', [])
        thumb = next((t['url'] for t in thumbs if t.get('quality') == 'high'), '')
        # Some instances return relative thumbnail URLs – fall back to YouTube
        if not thumb or thumb.startswith('/'):
            thumb = f"https://img.youtube.com/vi/{vid_id}/hqdefault.jpg"
        results.append({
            "id": vid_id,
            "name": item.get('title', 'Unknown'),
            "artist": item.get('author', 'Unknown Artist'),
            "album": "YouTube Audio",
            "duration": item.get('lengthSeconds', 0),
            "audio": f"https://www.youtube.com/watch?v={vid_id}",
            "audiodownload": f"https://www.youtube.com/watch?v={vid_id}",
            "image": thumb,
            "genre": "Web Stream",
            "isYoutube": True,
        })
    return results

# ---------------------------------------------------------------------------
# Metadata via Invidious
# ---------------------------------------------------------------------------

def invidious_get_info(video_id):
    """Fetch video metadata from Invidious. Returns dict or None."""
    _, data = _invidious_api(
        f"/api/v1/videos/{video_id}"
        f"?fields=title,author,videoThumbnails"
    )
    if not data:
        return None
    thumbs = data.get('videoThumbnails', [])
    thumb = (
        next((t['url'] for t in thumbs if t.get('quality') == 'maxresdefault'), None)
        or next((t['url'] for t in thumbs if t.get('quality') == 'high'), None)
        or f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg"
    )
    if thumb.startswith('/'):
        thumb = f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg"
    return {
        'title': data.get('title', 'Unknown Track'),
        'author': data.get('author', 'Unknown Artist'),
        'thumbnail_url': thumb,
    }

# ---------------------------------------------------------------------------
# Fallback downloader  (called when yt-dlp + YouTube URL fails)
# ---------------------------------------------------------------------------

def fallback_cobalt_download(url, download_id, downloads_dir, log_callback=None):
    """
    Fallback downloader for cloud servers where YouTube IPs are blocked.

    Strategy: re-use yt-dlp but swap the URL from youtube.com to an
    Invidious instance.  yt-dlp's built-in InvidiousIE extractor calls
    the Invidious API, which returns direct googlevideo.com CDN audio URLs
    that are NOT restricted by server IP.

    This is the simplest possible approach and requires zero extra libraries.
    """
    import yt_dlp

    def log(msg):
        if log_callback:
            log_callback(msg)
        print(msg)

    video_id = extract_youtube_id(url)
    if not video_id:
        log(f"[WARNING] Cannot extract video ID from: {url}")
        return False

    output_template = os.path.join(downloads_dir, f"{download_id}.%(ext)s")

    base_opts = {
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
    }

    for instance in INVIDIOUS_INSTANCES:
        # Construct an Invidious watch URL — yt-dlp InvidiousIE handles these natively
        invidious_url = f"{instance}/watch?v={video_id}"
        try:
            log(f"> Backup engine: trying via {instance.replace('https://', '')}...")
            with yt_dlp.YoutubeDL(base_opts) as ydl:
                ydl.download([invidious_url])

            # Check the MP3 was created
            mp3_path = os.path.join(downloads_dir, f"{download_id}.mp3")
            if os.path.exists(mp3_path) and os.path.getsize(mp3_path) > 10_000:
                log(f"> Backup engine: success via {instance.replace('https://', '')}!")
                return True

        except Exception as e:
            log(f"[WARNING] {instance.replace('https://', '')} failed: {str(e)[:120]}")
            # Clean up any partial files before trying next instance
            for f in os.listdir(downloads_dir):
                if f.startswith(download_id) and not f.endswith('.mp3'):
                    try:
                        os.remove(os.path.join(downloads_dir, f))
                    except Exception:
                        pass

    log("[ERROR] All Invidious instances failed.")
    return False
