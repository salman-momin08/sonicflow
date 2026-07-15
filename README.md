# SonicFlow - High-Quality MP3 Downloader & Player

SonicFlow is a premium, modern web application designed to search, stream, and download music in high-fidelity quality. Backed by a local Python Flask server, it provides an ad-free download pipeline that automatically converts streams to **320kbps MP3s**, fetches cover artwork, and injects **ID3 tags** (Title, Artist, Album) directly into the files.

---

## Features

- **Mainstream Music Search**: Find and stream any song instantly.
- **High-Quality Transcoding**: Automated conversion to true 320kbps MP3s powered by FFmpeg.
- **Automatic ID3 Tagging**: Downloads and embeds high-resolution cover art and tag metadata.
- **HTML5 Player & Equalizer**: 3-band biquad audio equalizer (Bass, Mid, Treble) and live canvas wave visualizers.
- **100% Ad-Free**: Background downloads with zero redirects or spammy tabs.
- **Social Music Sharing**: Clicking the share icon on any track copies an auto-play link (`/?play=VIDEO_ID`) to the clipboard, allowing friends to load and listen to that exact song instantly in the player.
- **Docker Containerized**: Built for quick local hosting and sharing.

---

## Option A: Run via Docker (Recommended for Sharing)

If you have Docker installed, you can build, configure, and launch the application with a single command.

### 1. Build & Start the Container
Open your terminal (PowerShell or Bash) in the project directory and run:
```bash
docker-compose up --build -d
```
This command builds the Python image, configures system-level FFmpeg, starts the Flask server, and exposes it on port `5000`.

### 2. Access the Application
- **Local Access**: Open your browser and navigate to: [http://localhost:5000](http://localhost:5000)
- **Share on Your Local Wi-Fi**: 
  1. Find your computer's local IP address by running `ipconfig` (Windows) or `ip a` (Linux/Mac) in the terminal (e.g. `192.168.1.15`).
  2. Tell your friends to open their browser on any device (phone, tablet, laptop) connected to the same Wi-Fi and visit:
     `http://YOUR_LOCAL_IP:5000` (e.g., `http://192.168.1.15:5000`)
- **Persisted Files**: All downloaded tracks will save directly to the local `./downloads` directory on your computer, mapped via Docker volumes.

### 3. Stop the Container
To stop the server, run:
```bash
docker-compose down
```

---

## Option B: Run Natively (Python Server)

If you prefer to run the server directly on your host machine:

### 1. Install Dependencies
Ensure you have Python installed and on your PATH. Run:
```bash
pip install -r requirements.txt
```

### 2. Start the Server
Run:
```bash
python app.py
```
*Note: On native startup, the app will automatically fetch and compile the FFmpeg binaries using `static-ffmpeg`.*

### 3. Access the Application
Open your browser and visit: [http://localhost:5000](http://localhost:5000)

---

## Public Cloud Deployment (Railway & Vercel)

To host your application publicly so that your friends can access it from anywhere in the world, refer to the detailed **[DEPLOYMENT.md](file:///c:/Users/kmomin/Downloads/MP3/DEPLOYMENT.md)** guide.

---

## Project Structure

- **`app.py`**: Python Flask server handling searches, metadata tag parsing, streaming proxies, and download jobs.
- **`app.js`**: Core client-side controller managing playback state, equalizer, and real-time visual terminal logging.
- **`index.html`**: Premium glassmorphism player layout and search panels.
- **`styles.css`**: Styling sheets driving the Royal Glass, Cyberpunk Glow, and Emerald Gold themes.
- **`Dockerfile` & `docker-compose.yml`**: Docker deployment and volume configurations.
- **`requirements.txt`**: Package manifests for Flask, yt-dlp, mutagen, and static-ffmpeg.
- **`vercel.json`**: Routing configuration mapping for serverless builds.
- **`.gitignore`**: Defines file patterns excluded from Git repository pushes (caches, downloads, virtual envs).
