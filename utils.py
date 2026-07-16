"""
utils.py  –  SonicFlow helper utilities

Fallback download strategy for cloud servers (Render, Railway, etc.)
where direct YouTube requests are blocked at the IP level.

Strategy:
  1. Call the Invidious REST API directly  (/api/v1/videos/{id})
     → This is a plain HTTP request to an Invidious server.
     → Invidious fetches the YouTube stream info on our behalf.
     → Returns JSON with direct audio stream URLs (googlevideo.com CDN).
  2. Download the raw audio stream directly from the CDN URL.
     → googlevideo.com CDN does NOT check the requesting server's IP.
  3. Convert to MP3 with ffmpeg.

yt-dlp is NOT used in the fallback — it always routes back to YouTube's
blocked API regardless of what URL you pass to it.
"""

import os
import re
import json
import ssl
import time
import urllib.request
import urllib.parse

# ---------------------------------------------------------------------------
# SSL context that skips certificate verification (for Invidious instances)
# ---------------------------------------------------------------------------
_ssl_ctx = ssl.create_default_context()
_ssl_ctx.check_hostname = False
_ssl_ctx.verify_mode = ssl.CERT_NONE

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
    if re.match(r'^[a-zA-Z0-9_-]{11}$', url.strip()):
        return url.strip()
    return None

# ---------------------------------------------------------------------------
# Invidious instance list  (API-enabled, sorted by uptime from api.invidious.io)
# ---------------------------------------------------------------------------
INVIDIOUS_INSTANCES = [
    "https://inv.nadeko.net",
    "https://invidious.nerdvpn.de",
    "https://inv.bp.projectsegfau.lt",
    "https://invidious.privacydev.net",
    "https://invidious.io.lol",
    "https://invidious.tiekoetter.com",
    "https://y.com.sb",
    "https://vid.puffyan.us",
    "https://yt.cdaut.de",
]

# ---------------------------------------------------------------------------
# Invidious REST helper  (direct HTTP, no yt-dlp involved)
# ---------------------------------------------------------------------------

def _invidious_api(path, timeout=10):
    """
    Try each Invidious instance for a given API path.
    Returns (instance_url, json_data) or (None, None).
    """
    for instance in INVIDIOUS_INSTANCES:
        url = f"{instance}{path}"
        try:
            req = urllib.request.Request(
                url,
                headers={
                    'User-Agent': 'Mozilla/5.0 (compatible; SonicFlow/1.0)',
                    'Accept': 'application/json',
                }
            )
            with urllib.request.urlopen(req, timeout=timeout, context=_ssl_ctx) as resp:
                if resp.status != 200:
                    continue
                data = json.loads(resp.read().decode('utf-8'))
                return instance, data
        except Exception as e:
            print(f"[Invidious] {instance} API error: {e}")
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
        f"&fields=videoId,title,author,lengthSeconds,videoThumbnails"
    )
    if not data:
        return []

    results = []
    for item in (data or [])[:limit]:
        vid_id = item.get('videoId', '')
        thumbs = item.get('videoThumbnails', [])
        # Prefer 'high' quality thumbnail; skip relative URLs
        thumb = next(
            (t['url'] for t in thumbs
             if t.get('quality') == 'high' and t.get('url', '').startswith('http')),
            f"https://img.youtube.com/vi/{vid_id}/hqdefault.jpg"
        )
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
        next((t['url'] for t in thumbs
              if t.get('quality') == 'maxresdefault'
              and t.get('url', '').startswith('http')), None)
        or next((t['url'] for t in thumbs
                 if t.get('quality') == 'high'
                 and t.get('url', '').startswith('http')), None)
        or f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg"
    )
    return {
        'title': data.get('title', 'Unknown Track'),
        'author': data.get('author', 'Unknown Artist'),
        'thumbnail_url': thumb,
    }

# ---------------------------------------------------------------------------
# Core fallback: Invidious API → direct CDN download → ffmpeg
# ---------------------------------------------------------------------------

def _pick_best_audio(adaptive_formats, instance):
    """
    Pick the best audio-only stream from Invidious adaptiveFormats.
    Returns the URL string or None.
    """
    audio = [
        f for f in adaptive_formats
        if f.get('type', '').startswith('audio/')
        and f.get('url')
    ]
    if not audio:
        return None

    # Sort by bitrate descending
    audio.sort(key=lambda x: int(x.get('bitrate', 0)), reverse=True)
    url = audio[0]['url']

    # If the instance returns a relative/proxied URL, prefix with instance domain
    if url.startswith('/'):
        url = instance + url

    return url


def fallback_cobalt_download(url, download_id, downloads_dir, log_callback=None):
    """
    Fallback downloader for cloud servers where YouTube is IP-blocked.

    Steps:
      1. Extract the YouTube video ID.
      2. Query each Invidious instance's REST API for audio stream URLs.
         (This is a plain HTTP call — Invidious fetches from YouTube on its own server.)
      3. Download the raw audio directly from the returned URL.
         (googlevideo.com CDN has no IP restriction once you have the signed URL.)
      4. Convert to MP3 using ffmpeg.

    NOTE: yt-dlp is deliberately NOT used here — when passed an Invidious
    URL, yt-dlp still internally routes to YouTube's API using Render's
    blocked IP, which causes the same bot-check error.
    """
    import subprocess

    def log(msg):
        if log_callback:
            log_callback(msg)
        print(msg)

    video_id = extract_youtube_id(url)
    if not video_id:
        log(f"[WARNING] Cannot extract YouTube video ID from: {url}")
        return False

    raw_path  = os.path.join(downloads_dir, f"{download_id}_raw")
    mp3_path  = os.path.join(downloads_dir, f"{download_id}.mp3")

    for instance in INVIDIOUS_INSTANCES:
        try:
            log(f"> Backup engine: querying {instance.replace('https://', '')} API...")

            # ── Step 1: Get video metadata + stream URLs from Invidious API ──
            api_url = f"{instance}/api/v1/videos/{video_id}"
            req = urllib.request.Request(
                api_url,
                headers={
                    'User-Agent': 'Mozilla/5.0 (compatible; SonicFlow/1.0)',
                    'Accept': 'application/json',
                }
            )
            with urllib.request.urlopen(req, timeout=12, context=_ssl_ctx) as resp:
                if resp.status != 200:
                    log(f"[WARNING] {instance.replace('https://','')} returned HTTP {resp.status}")
                    continue
                data = json.loads(resp.read().decode('utf-8'))

            adaptive_formats = data.get('adaptiveFormats', [])
            if not adaptive_formats:
                log(f"[WARNING] {instance.replace('https://','')} returned no adaptive formats")
                continue

            audio_url = _pick_best_audio(adaptive_formats, instance)
            if not audio_url:
                log(f"[WARNING] {instance.replace('https://','')} has no audio-only streams")
                continue

            log(f"> Got audio stream. Downloading from CDN...")

            # ── Step 2: Download raw audio stream ──
            dl_req = urllib.request.Request(
                audio_url,
                headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                    'Referer':    f'https://www.youtube.com/watch?v={video_id}',
                    'Origin':     'https://www.youtube.com',
                }
            )
            downloaded_bytes = 0
            with urllib.request.urlopen(dl_req, timeout=180, context=_ssl_ctx) as resp:
                with open(raw_path, 'wb') as f:
                    while True:
                        chunk = resp.read(65536)  # 64 KB chunks
                        if not chunk:
                            break
                        f.write(chunk)
                        downloaded_bytes += len(chunk)

            size_mb = round(downloaded_bytes / 1024 / 1024, 1)
            log(f"> Downloaded {size_mb} MB. Converting to MP3...")

            # ── Step 3: Convert to MP3 with ffmpeg ──
            result = subprocess.run(
                ['ffmpeg', '-y', '-i', raw_path,
                 '-vn', '-acodec', 'libmp3lame', '-q:a', '2',
                 mp3_path],
                capture_output=True,
                text=True,
                timeout=120
            )

            # Clean up raw file regardless of result
            try:
                os.remove(raw_path)
            except Exception:
                pass

            if result.returncode != 0:
                log(f"[WARNING] ffmpeg failed: {result.stderr[-200:]}")
                continue

            if os.path.exists(mp3_path) and os.path.getsize(mp3_path) > 10_000:
                log(f"> Backup engine: conversion complete via {instance.replace('https://', '')}!")
                return True
            else:
                log(f"[WARNING] MP3 output missing or too small — skipping")
                continue

        except urllib.error.HTTPError as he:
            log(f"[WARNING] {instance.replace('https://','')} HTTP {he.code}: {he.reason}")
        except urllib.error.URLError as ue:
            log(f"[WARNING] {instance.replace('https://','')} connection error: {ue.reason}")
        except subprocess.TimeoutExpired:
            log(f"[WARNING] ffmpeg timed out for {instance.replace('https://', '')}")
        except Exception as e:
            log(f"[WARNING] {instance.replace('https://','')} unexpected error: {e}")

        # Clean up any partial files before next instance
        for leftover in [raw_path, mp3_path]:
            try:
                if os.path.exists(leftover):
                    os.remove(leftover)
            except Exception:
                pass

    log("[ERROR] All Invidious instances exhausted — no audio stream could be retrieved.")
    return False
