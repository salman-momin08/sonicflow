import os
import re
import json
import ssl
import time
import urllib.request
import urllib.parse
import urllib.error

# ---------------------------------------------------------------------------
# Security helpers
# ---------------------------------------------------------------------------

ALLOWED_DOMAINS = {
    'youtube.com', 'www.youtube.com', 'youtu.be', 'www.youtu.be',
    'soundcloud.com', 'www.soundcloud.com',
    'jamendo.com', 'www.jamendo.com',
    'archive.org', 'www.archive.org',
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
        r'(?:v=|/)([a-zA-Z0-9_-]{11})(?:[&?]|$)',
        r'youtu\.be/([a-zA-Z0-9_-]{11})',
        r'embed/([a-zA-Z0-9_-]{11})',
    ]
    for pattern in patterns:
        m = re.search(pattern, url)
        if m:
            return m.group(1)
    # If the url itself looks like a bare video ID
    if re.match(r'^[a-zA-Z0-9_-]{11}$', url.strip()):
        return url.strip()
    return None

# ---------------------------------------------------------------------------
# Invidious-based downloader
# ---------------------------------------------------------------------------
# Public Invidious instances — ordered by reliability.
# These act as YouTube API proxies and return direct googlevideo.com CDN URLs
# which are NOT IP-restricted once obtained, so they work from any cloud server.
INVIDIOUS_INSTANCES = [
    "https://inv.bp.projectsegfau.lt",
    "https://invidious.privacydev.net",
    "https://invidious.io.lol",
    "https://yt.cdaut.de",
    "https://invidious.nerdvpn.de",
    "https://invidious.tiekoetter.com",
    "https://vid.puffyan.us",
    "https://y.com.sb",
]

def _invidious_get(path, timeout=10):
    """Try each Invidious instance for a given API path, return (instance, json_data)."""
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    for instance in INVIDIOUS_INSTANCES:
        url = f"{instance}{path}"
        try:
            req = urllib.request.Request(
                url,
                headers={
                    'User-Agent': 'Mozilla/5.0',
                    'Accept': 'application/json',
                }
            )
            with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                return instance, data
        except Exception as e:
            print(f"[Invidious] {instance} failed: {e}")
            continue
    return None, None


def invidious_search(query, limit=12):
    """
    Search YouTube via Invidious API.
    Returns list of result dicts compatible with the SonicFlow search format.
    """
    encoded = urllib.parse.quote(query)
    _, data = _invidious_get(f"/api/v1/search?q={encoded}&type=video&fields=videoId,title,author,lengthSeconds,videoThumbnails")
    if not data:
        return []

    results = []
    for item in data[:limit]:
        vid_id = item.get('videoId', '')
        thumbnails = item.get('videoThumbnails', [])
        thumb = next((t['url'] for t in thumbnails if t.get('quality') == 'high'), '')
        if thumb and thumb.startswith('/'):
            thumb = ''  # skip relative paths
        if not thumb:
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


def invidious_get_info(video_id):
    """
    Fetch video metadata from Invidious.
    Returns dict with title, author, thumbnail_url.
    """
    _, data = _invidious_get(f"/api/v1/videos/{video_id}?fields=title,author,videoThumbnails,adaptiveFormats,formatStreams")
    if not data:
        return None
    thumbnails = data.get('videoThumbnails', [])
    thumb = next((t['url'] for t in thumbnails if t.get('quality') == 'maxresdefault'), '')
    if not thumb:
        thumb = next((t['url'] for t in thumbnails if t.get('quality') == 'high'), '')
    if not thumb:
        thumb = f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg"
    return {
        'title': data.get('title', 'Unknown Track'),
        'author': data.get('author', 'Unknown Artist'),
        'thumbnail_url': thumb,
        'raw': data,
    }


def invidious_get_audio_url(video_id):
    """
    Get the best direct audio stream URL for a YouTube video via Invidious.
    Returns (audio_url, info_dict) or (None, None).
    """
    _, data = _invidious_get(f"/api/v1/videos/{video_id}")
    if not data:
        return None, None

    # Prefer adaptiveFormats (audio-only streams)
    adaptive = data.get('adaptiveFormats', [])
    audio_streams = [
        f for f in adaptive
        if f.get('type', '').startswith('audio/')
        and f.get('url')
        and not f.get('url', '').startswith('/')  # skip proxied relative URLs
    ]

    if audio_streams:
        # Sort by bitrate descending, pick best
        audio_streams.sort(key=lambda x: int(x.get('bitrate', 0)), reverse=True)
        best = audio_streams[0]
        return best['url'], data

    # Fallback: formatStreams contain muxed video+audio — use as last resort
    streams = data.get('formatStreams', [])
    for s in streams:
        if s.get('url') and not s.get('url', '').startswith('/'):
            return s['url'], data

    return None, None


def fallback_cobalt_download(url, download_id, downloads_dir, log_callback=None):
    """
    Fallback downloader using Invidious API.

    Strategy:
    1. Extract YouTube video ID from the URL.
    2. Query Invidious instances for direct audio CDN URL (googlevideo.com).
    3. Download the raw audio stream directly — CDN URLs are not IP-restricted.
    4. Convert to MP3 using ffmpeg subprocess.

    This bypasses yt-dlp entirely and never touches youtube.com from the server,
    so datacenter IP blocks do not apply.
    """
    import subprocess

    def log(msg):
        if log_callback:
            log_callback(msg)
        print(msg)

    video_id = extract_youtube_id(url)
    if not video_id:
        log(f"[WARNING] Could not extract YouTube video ID from: {url}")
        return False

    log(f"> Backup engine: resolving audio stream via Invidious network (video: {video_id})...")

    audio_url, raw_data = invidious_get_audio_url(video_id)

    if not audio_url:
        log("[WARNING] Invidious network: no working instance returned an audio URL.")
        return False

    log(f"> Backup engine: got direct CDN audio stream. Downloading...")

    raw_path = os.path.join(downloads_dir, f"{download_id}_raw")
    mp3_path = os.path.join(downloads_dir, f"{download_id}.mp3")

    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

        req = urllib.request.Request(
            audio_url,
            headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Referer': f'https://www.youtube.com/watch?v={video_id}',
            }
        )
        with urllib.request.urlopen(req, timeout=120, context=ctx) as resp:
            with open(raw_path, 'wb') as f:
                while True:
                    chunk = resp.read(65536)
                    if not chunk:
                        break
                    f.write(chunk)

        log(f"> Backup engine: stream downloaded ({round(os.path.getsize(raw_path)/1024/1024, 1)} MB). Converting to MP3...")

        # Convert to MP3 with ffmpeg
        result = subprocess.run(
            ['ffmpeg', '-y', '-i', raw_path, '-vn',
             '-acodec', 'libmp3lame', '-q:a', '2',
             mp3_path],
            capture_output=True, text=True, timeout=120
        )

        os.remove(raw_path)

        if result.returncode != 0:
            log(f"[WARNING] ffmpeg conversion error: {result.stderr[-300:]}")
            return False

        log("> Backup engine: MP3 conversion complete!")
        return True

    except Exception as e:
        log(f"[WARNING] Backup engine download failed: {e}")
        try:
            if os.path.exists(raw_path):
                os.remove(raw_path)
        except Exception:
            pass
        return False
