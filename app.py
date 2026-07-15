import os
import sys
import time
import json
import threading
import urllib.request
from flask import Flask, request, jsonify, send_from_directory, Response

# Core Python libraries for audio downloading & metadata
import yt_dlp
import static_ffmpeg
from mutagen.mp3 import MP3
from mutagen.id3 import ID3, APIC, TIT2, TPE1, TALB

app = Flask(__name__)

# Initialize static-ffmpeg to add FFmpeg binaries to system PATH automatically
print("Initializing FFmpeg binaries...")
try:
    static_ffmpeg.add_paths()
    print("FFmpeg initialized successfully.")
except Exception as e:
    print(f"Error initializing static-ffmpeg: {e}")

# Base Directories
WORKSPACE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOADS_DIR = os.path.join(WORKSPACE_DIR, "downloads")

if not os.path.exists(DOWNLOADS_DIR):
    os.makedirs(DOWNLOADS_DIR)

# Global Registry to track background download tasks
# download_id -> {status, percentage, speed, eta, size_mb, filename, logs: [], error: None}
active_downloads = {}
downloads_lock = threading.Lock()

# Helper logger for yt-dlp to capture inner log stdout lines
class YtdlpLogger:
    def __init__(self, download_id):
        self.download_id = download_id

    def debug(self, msg):
        self.add_log(msg)

    def warning(self, msg):
        self.add_log(f"[WARNING] {msg}")

    def error(self, msg):
        self.add_log(f"[ERROR] {msg}")
        with downloads_lock:
            if self.download_id in active_downloads:
                active_downloads[self.download_id]['error'] = msg

    def add_log(self, msg):
        # Ignore raw progress outputs in console logs to prevent flooding
        if "[download]" in msg and "%" in msg:
            return
        
        with downloads_lock:
            if self.download_id in active_downloads:
                active_downloads[self.download_id]['logs'].append(msg)
                # Keep logs array length reasonable
                if len(active_downloads[self.download_id]['logs']) > 100:
                    active_downloads[self.download_id]['logs'].pop(0)

# --- FLASK STATIC ROUTES ---

@app.route('/')
def index():
    return send_from_directory(WORKSPACE_DIR, "index.html")

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory(WORKSPACE_DIR, path)

# --- FLASK REST API ENDPOINTS ---

# 1. Search YouTube for Audio Tracks
@app.route('/api/search')
def api_search():
    query = request.args.get('q', '').strip()
    limit = int(request.args.get('limit', 12))
    
    if not query:
        return jsonify({"results": []})
        
    print(f"Searching YouTube for: {query}")
    
    ydl_opts = {
        'default_search': 'ytsearch',
        'nocheckcertificate': True,
        'quiet': True,
        'extract_flat': True,
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # Run search query
            search_results = ydl.extract_info(f"ytsearch{limit}:{query}", download=False)
            
            mapped_results = []
            if 'entries' in search_results:
                for entry in search_results['entries']:
                    if not entry:
                        continue
                    
                    mapped_results.append({
                        "id": entry.get('id'),
                        "name": entry.get('title'),
                        "artist": entry.get('channel') or entry.get('uploader') or "Unknown Artist",
                        "album": "YouTube Audio",
                        "duration": entry.get('duration') or 0,
                        "audio": entry.get('url') or f"https://www.youtube.com/watch?v={entry.get('id')}",
                        "audiodownload": f"https://www.youtube.com/watch?v={entry.get('id')}",
                        "image": f"https://img.youtube.com/vi/{entry.get('id')}/hqdefault.jpg",
                        "genre": "Web Stream",
                        "isYoutube": True
                    })
            
            return jsonify({"results": mapped_results})
            
    except Exception as e:
        print(f"Search API error: {e}")
        return jsonify({"error": str(e)}), 500

# 2. Trigger Track Download & Conversion (MP3 + ID3 Tags)
@app.route('/api/download', methods=['POST'])
def api_download():
    data = request.json or {}
    url = data.get('url', '').strip()
    title = data.get('title', '').strip()
    artist = data.get('artist', '').strip()
    album = data.get('album', 'Single Release').strip()
    bitrate = data.get('bitrate', '320').strip()
    
    if not url:
        return jsonify({"error": "URL parameter is required"}), 400
        
    # Generate unique task id
    download_id = f"dl_{int(time.time())}"
    
    with downloads_lock:
        active_downloads[download_id] = {
            "status": "pending",
            "percentage": 0,
            "speed": "--",
            "eta": "--",
            "size_mb": "0 MB",
            "filename": "",
            "logs": ["> Connecting to remote streaming cluster..."],
            "error": None
        }
        
    # Launch background thread to execute download & conversion
    thread = threading.Thread(target=process_download_task, args=(download_id, url, title, artist, album, bitrate))
    thread.daemon = True
    thread.start()
    
    return jsonify({"download_id": download_id})

# 3. Retrieve Task Progress
@app.route('/api/progress/<download_id>')
def api_progress(download_id):
    with downloads_lock:
        task = active_downloads.get(download_id)
        if not task:
            return jsonify({"error": "Task not found"}), 404
        return jsonify(task)

# 4. Stream / Retrieve finished MP3 File
@app.route('/api/retrieve/<download_id>')
def api_retrieve(download_id):
    with downloads_lock:
        task = active_downloads.get(download_id)
        if not task:
            return "Task not found", 404
        if task['status'] != 'completed':
            return "Task is not finished", 400
            
        filename = task['filename']
        
    return send_from_directory(DOWNLOADS_DIR, filename, as_attachment=True)

# 5. List Downloaded Files
@app.route('/api/downloads')
def api_downloads():
    try:
        files = []
        for filename in os.listdir(DOWNLOADS_DIR):
            if filename.endswith(".mp3"):
                path = os.path.join(DOWNLOADS_DIR, filename)
                stat = os.stat(path)
                files.append({
                    "filename": filename,
                    "size_mb": round(stat.st_size / (1024 * 1024), 2),
                    "created": time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(stat.st_ctime))
                })
        return jsonify({"files": files})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# 6. Proxy / Stream Live Audio from YouTube (Range & Seeker support)
@app.route('/api/stream')
def api_stream():
    video_id = request.args.get('id', '').strip()
    if not video_id:
        return "Video ID required", 400
        
    ydl_opts = {
        'format': 'bestaudio/best',
        'nocheckcertificate': True,
        'quiet': True,
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(video_id, download=False)
            stream_url = info.get('url')
            if not stream_url:
                return "Stream URL not found", 404
                
            # Parse target headers for proxy request
            req_headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            }
            range_header = request.headers.get('Range')
            if range_header:
                req_headers['Range'] = range_header
                
            req = urllib.request.Request(stream_url, headers=req_headers)
            
            try:
                upstream_res = urllib.request.urlopen(req)
                
                # Stream chunk generator
                def generate():
                    try:
                        while True:
                            chunk = upstream_res.read(1024 * 64) # 64KB chunks
                            if not chunk:
                                break
                            yield chunk
                    except Exception as gen_err:
                        print(f"Streaming generator break: {gen_err}")
                    finally:
                        upstream_res.close()
                        
                response = Response(
                    generate(),
                    status=upstream_res.status,
                    content_type=upstream_res.getheader('Content-Type') or 'audio/mpeg'
                )
                
                # Map range and size headers
                for header in ['Content-Range', 'Content-Length', 'Accept-Ranges']:
                    val = upstream_res.getheader(header)
                    if val:
                        response.headers[header] = val
                        
                response.headers['Access-Control-Allow-Origin'] = '*'
                return response
                
            except urllib.error.HTTPError as he:
                return f"Upstream response failed: {he.code}", he.code
                
    except Exception as e:
        print(f"Streaming handler exception: {e}")
        return str(e), 500


# 7. Get Video Metadata Info by ID (for link sharing)
@app.route('/api/info')
def api_info():
    video_id = request.args.get('id', '').strip()
    if not video_id:
        return jsonify({"error": "Video ID required"}), 400
        
    ydl_opts = {
        'nocheckcertificate': True,
        'quiet': True,
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(video_id, download=False)
            return jsonify({
                "id": info.get('id'),
                "name": info.get('title'),
                "artist": info.get('channel') or info.get('uploader') or "Unknown Artist",
                "album": "Shared Audio",
                "duration": info.get('duration') or 0,
                "audio": f"/api/stream?id={info.get('id')}",
                "audiodownload": f"https://www.youtube.com/watch?v={info.get('id')}",
                "image": f"https://img.youtube.com/vi/{info.get('id')}/hqdefault.jpg",
                "genre": "Web Stream",
                "isYoutube": True
            })
    except Exception as e:
        print(f"Info API error: {e}")
        return jsonify({"error": str(e)}), 500


# --- BACKGROUND TASK RUNNER ---

def process_download_task(download_id, url, target_title, target_artist, target_album, bitrate):
    print(f"Starting background download {download_id} for URL: {url}")
    
    # Progress hook function inside closure to reference download_id
    def progress_hook(d):
        if d['status'] == 'downloading':
            total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
            downloaded = d.get('downloaded_bytes', 0)
            
            percentage = 0
            if total > 0:
                percentage = int((downloaded / total) * 100)
                
            speed = d.get('speed', 0)
            speed_mb = round(speed / (1024 * 1024), 2) if speed else 0
            eta = d.get('eta', 0)
            downloaded_mb = round(downloaded / (1024 * 1024), 2)
            total_mb = round(total / (1024 * 1024), 2) if total > 0 else "--"
            
            with downloads_lock:
                if download_id in active_downloads:
                    active_downloads[download_id].update({
                        "status": "downloading",
                        "percentage": percentage,
                        "speed": f"{speed_mb} MB/s" if speed_mb > 0 else "--",
                        "eta": f"{eta}s" if eta else "--",
                        "size_mb": f"{downloaded_mb}/{total_mb} MB"
                    })
        elif d['status'] == 'finished':
            with downloads_lock:
                if download_id in active_downloads:
                    active_downloads[download_id].update({
                        "status": "converting",
                        "percentage": 95,
                        "speed": "--",
                        "eta": "Converting..."
                    })
                    active_downloads[download_id]['logs'].append("> Extracting audio streams and converting to MP3...")

    # Configure yt-dlp options
    temp_template = os.path.join(DOWNLOADS_DIR, f"{download_id}_%(title)s.%(ext)s")
    
    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': temp_template,
        'logger': YtdlpLogger(download_id),
        'progress_hooks': [progress_hook],
        'nocheckcertificate': True,
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': bitrate,
        }],
    }
    
    try:
        # Extract metadata info first
        with yt_dlp.YoutubeDL({'nocheckcertificate': True, 'quiet': True}) as ydl:
            info = ydl.extract_info(url, download=False)
            
            # Resolve tags if not custom provided
            title = target_title or info.get('title', 'Unknown Track')
            artist = target_artist or info.get('channel') or info.get('uploader') or 'Unknown Artist'
            album = target_album or 'SonicFlow Audio Extractor'
            thumbnail_url = info.get('thumbnail')
            
        with downloads_lock:
            active_downloads[download_id]['logs'].append(f"> Target Title: {title}")
            active_downloads[download_id]['logs'].append(f"> Target Artist: {artist}")
            active_downloads[download_id]['logs'].append("> Initiating connection to stream client...")
            
        # Download and convert
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
            
        # Locate the output file (we find the newly created MP3 starting with the download_id)
        final_filename = ""
        for file in os.listdir(DOWNLOADS_DIR):
            if file.startswith(download_id) and file.endswith(".mp3"):
                final_filename = file
                break
                
        if not final_filename:
            raise Exception("Could not find the extracted audio output file.")
            
        final_filepath = os.path.join(DOWNLOADS_DIR, final_filename)
        
        # Download thumbnail artwork
        art_data = None
        if thumbnail_url:
            with downloads_lock:
                active_downloads[download_id]['logs'].append("> Fetching high-resolution cover artwork...")
            try:
                # Custom User-Agent to bypass image download blocks
                req = urllib.request.Request(
                    thumbnail_url, 
                    headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
                )
                with urllib.request.urlopen(req) as response:
                    art_data = response.read()
            except Exception as art_err:
                print(f"Error downloading cover art: {art_err}")
                with downloads_lock:
                    active_downloads[download_id]['logs'].append(f"[WARNING] Cover artwork download failed: {art_err}")

        # Inject ID3 tags & Album Cover art using mutagen
        with downloads_lock:
            active_downloads[download_id]['logs'].append("> Injecting ID3 tagging fields and embedding artwork...")
            
        try:
            audio = MP3(final_filepath, ID3=ID3)
            try:
                audio.add_tags()
            except Exception:
                pass # Tags already exist
                
            # Set basic strings
            audio.tags.add(TIT2(encoding=3, text=title))
            audio.tags.add(TPE1(encoding=3, text=artist))
            audio.tags.add(TALB(encoding=3, text=album))
            
            # Embed Cover image
            if art_data:
                audio.tags.add(APIC(
                    encoding=3,
                    mime='image/jpeg' if 'jpg' in thumbnail_url or 'jpeg' in thumbnail_url else 'image/png',
                    type=3, # 3 represents front cover
                    desc='Front Cover',
                    data=art_data
                ))
            audio.save()
            
        except Exception as tag_err:
            print(f"Metadata tag injection error: {tag_err}")
            with downloads_lock:
                active_downloads[download_id]['logs'].append(f"[WARNING] Tag injection failed: {tag_err}")

        # Rename file to cleaner format: Title - Artist.mp3 (replacing unsafe characters)
        clean_title = "".join([c for c in title if c.isalpha() or c.isdigit() or c in ' -_()']).strip()
        clean_artist = "".join([c for c in artist if c.isalpha() or c.isdigit() or c in ' -_()']).strip()
        clean_filename = f"{clean_title} - {clean_artist}.mp3"
        clean_filepath = os.path.join(DOWNLOADS_DIR, clean_filename)
        
        try:
            # Overwrite if exists
            if os.path.exists(clean_filepath):
                os.remove(clean_filepath)
            os.rename(final_filepath, clean_filepath)
            final_filename = clean_filename
        except Exception as rename_err:
            print(f"Error renaming final audio file: {rename_err}")
            # Fallback keeps the download_id filename

        with downloads_lock:
            active_downloads[download_id].update({
                "status": "completed",
                "percentage": 100,
                "filename": final_filename,
                "speed": "--",
                "eta": "Finished"
            })
            active_downloads[download_id]['logs'].append(f"> Completed! Saved as: {final_filename}")
            
    except Exception as e:
        print(f"Download thread error: {e}")
        with downloads_lock:
            if download_id in active_downloads:
                active_downloads[download_id].update({
                    "status": "error",
                    "error": str(e)
                })
                active_downloads[download_id]['logs'].append(f"[ERROR] Task failed: {e}")


if __name__ == '__main__':
    host = os.environ.get('FLASK_HOST', '0.0.0.0')
    port = int(os.environ.get('FLASK_PORT', 5000))
    print("Starting SonicFlow Backend Server...")
    print(f"Serving frontend files and exposing APIs on: http://{host}:{port}")
    app.run(host=host, port=port, debug=False)
