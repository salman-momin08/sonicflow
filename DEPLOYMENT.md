# Deployment Guide - Public Hosting

To share SonicFlow with your friends anywhere in the world, you can host the application on a cloud provider. Below are instructions for deploying to **Railway** (highly recommended for Docker/FFmpeg support) and **Vercel** (for serverless hosting).

---

## Option A: Railway (Recommended)

Railway natively supports Docker containers and is the absolute best fit for SonicFlow because it allows long-running downloads, custom FFmpeg execution, and file storage.

### Method 1: Using the Railway CLI (Fastest)

1. **Install the CLI**:
   Open your host terminal (Command Prompt or PowerShell) and install the Railway CLI:
   ```bash
   npm install -g @railway/cli
   ```
2. **Log In**:
   Run the login command and follow the browser prompts:
   ```bash
   railway login
   ```
3. **Initialize & Deploy**:
   Inside your project directory (`c:\Users\kmomin\Downloads\MP3`), run:
   ```bash
   railway init
   ```
   Follow the prompts to create a new project. Then deploy the container:
   ```bash
   railway up
   ```
4. **Generate Public Domain**:
   - Go to your [Railway Dashboard](https://railway.app/).
   - Click on your newly created service card.
   - Go to **Settings** -> **Generate Domain** (under Networking).
   - You will receive a secure public URL (e.g. `https://sonicflow-production.up.railway.app`) that you can send to your friends!

### Method 2: Deployment via GitHub (Automated)

1. Create a new repository on GitHub.
2. Push your project files (including `Dockerfile`, `docker-compose.yml`, `app.py`, etc.) to GitHub.
3. Log in to [Railway](https://railway.app/) and create a new project.
4. Select **Deploy from GitHub repo** and select your repository.
5. Railway will automatically detect the `Dockerfile`, build it, and deploy it.
6. Generate a public domain under service settings.

---

## Option B: Vercel (Serverless Python)

Vercel is designed for static assets and serverless functions. 

> [!WARNING]
> **Serverless Limitations**: Serverless functions on Vercel have a strict execution timeout (usually 10–15 seconds on free accounts). Downloading and converting long songs via `yt-dlp` and `ffmpeg` may trigger timeout errors. Additionally, serverless filesystems are read-only except for the `/tmp` folder.

If you still wish to deploy on Vercel:

### 1. Create a `vercel.json` configuration
We must define routes to handle API calls through serverless python functions. We will create a `vercel.json` file in the project root:

```json
{
  "builds": [
    {
      "src": "app.py",
      "use": "@vercel/python"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "app.py"
    },
    {
      "src": "/(.*)",
      "dest": "/$1"
    }
  ]
}
```

### 2. Deploy via Vercel CLI
1. Install the CLI:
   ```bash
   npm install -g vercel
   ```
2. Log in and deploy:
   ```bash
   vercel login
   ```
3. Run the deploy command inside the project directory:
   ```bash
   vercel
   ```
   Follow the prompts to link the project and deploy it.
