# Use official Python runtime as a base image
FROM python:3.10-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV FLASK_HOST=0.0.0.0
ENV FLASK_PORT=5000

# Install system dependencies (ffmpeg is required by yt-dlp to extract and convert MP3s)
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application files
COPY . .

# Create downloads directory and ensure it has write permissions
RUN mkdir -p downloads && chmod -R 777 downloads

# Expose port
EXPOSE 5000

# Run the application
CMD ["python", "app.py"]
