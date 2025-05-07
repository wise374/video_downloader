import os
import tempfile
import ssl
import certifi
import shutil
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import yt_dlp
import asyncio
from typing import Optional
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Set up SSL certificates
ssl_context = ssl.create_default_context(cafile=certifi.where())
ssl._create_default_https_context = lambda: ssl_context

# Set environment variables for SSL
os.environ['SSL_CERT_FILE'] = certifi.where()
os.environ['REQUESTS_CA_BUNDLE'] = certifi.where()

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class DownloadRequest(BaseModel):
    url: str
    format: str
    platform: str

class PreviewRequest(BaseModel):
    url: str
    platform: str

def get_ydl_opts(format: str, output_path: str) -> dict:
    common_opts = {
        'outtmpl': output_path,
        'quiet': True,
        'no_warnings': True,
        'extract_flat': False,
        # Add headers to mimic a browser request
        'http_headers': {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Connection': 'keep-alive',
        },
        # Add retry options
        'retries': 10,
        'fragment_retries': 10,
        'skip_unavailable_fragments': True,
        # Add progress hooks for better error handling
        'progress_hooks': [lambda d: logger.info(f"Download progress: {d.get('status', 'unknown')}")],
        # Add additional options for better compatibility
        'nocheckcertificate': False,  # Enable certificate checking
        'ignoreerrors': True,
        'no_color': True,
        'prefer_insecure': False,  # Disable insecure connections
        'geo_bypass': True,
        # Add SSL options
        'legacy_server_connect': False,  # Use modern connection
    }

    if format == "mp3":
        return {
            **common_opts,
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
        }
    else:  # mp4
        return {
            **common_opts,
            'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        }

@app.post("/preview")
async def preview_video(request: PreviewRequest):
    if request.platform not in ["youtube", "facebook", "instagram"]:
        raise HTTPException(status_code=400, detail="Invalid platform")

    # Detect Facebook share URLs and return a user-friendly error
    if request.platform == "facebook" and "/share/" in request.url:
        raise HTTPException(
            status_code=400,
            detail="Facebook share links are not supported. Please use a direct video, watch, or reel URL."
        )

    try:
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
            'http_headers': {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Connection': 'keep-alive',
            },
            'nocheckcertificate': False,
            'ignoreerrors': True,
            'no_color': True,
            'prefer_insecure': False,
            'geo_bypass': True,
            'legacy_server_connect': False,
            'socket_timeout': 10,
            'retries': 3,
            'fragment_retries': 3,
            'skip_unavailable_fragments': True,
            'extract_flat': True,
            'force_generic_extractor': False,
            'extractor_retries': 3,
        }

        # Add cookies.txt support for Facebook and Instagram
        if request.platform in ["facebook", "instagram"]:
            cookie_path = os.path.join(os.path.dirname(__file__), 'cookies.txt')
            if os.path.exists(cookie_path):
                ydl_opts['cookiefile'] = cookie_path

        if request.platform == "youtube":
            ydl_opts.update({
                'http_headers': {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                },
                'extractor_args': {
                    'youtube': {
                        'player_client': ['android', 'web'],
                        'player_skip': ['webpage', 'configs'],
                    }
                },
                'socket_timeout': 10,
                'retries': 3,
            })
            url = request.url
        elif request.platform == "facebook":
            url = request.url.replace('m.facebook.com', 'www.facebook.com')
            ydl_opts.update({
                'socket_timeout': 15,
                'retries': 3,
                'fragment_retries': 3,
                'extractor_args': {
                    'facebook': {
                        'timeout': 15,
                    }
                }
            })
        else:
            url = request.url

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                logger.info(f"Extracting info for URL: {url}")
                info = ydl.extract_info(url, download=False)
                logger.info(f"yt-dlp info: {info}")
                if not info:
                    raise HTTPException(
                        status_code=400,
                        detail="Could not extract video information. The video might be private or restricted."
                    )

                # Get thumbnail URL
                thumbnail = info.get('thumbnail')
                if not thumbnail:
                    thumbnails = info.get('thumbnails', [])
                    if thumbnails:
                        thumbnail = max(thumbnails, key=lambda x: x.get('width', 0) * x.get('height', 0))['url']
                    else:
                        thumbnail = None

                # Format duration
                duration = info.get('duration')
                if duration:
                    try:
                        total_seconds = int(float(duration))
                        minutes = total_seconds // 60
                        seconds = total_seconds % 60
                        duration_str = f"{minutes}:{seconds:02d}"
                    except (ValueError, TypeError):
                        duration_str = None
                else:
                    duration_str = None

                # Get upload date in a readable format
                upload_date = info.get('upload_date')
                if upload_date:
                    try:
                        year = upload_date[:4]
                        month = upload_date[4:6]
                        day = upload_date[6:8]
                        upload_date = f"{year}-{month}-{day}"
                    except:
                        upload_date = None

                # Always return all fields, even if missing
                return JSONResponse({
                    'title': info.get('title', 'Unknown Title'),
                    'thumbnail': thumbnail or '',
                    'duration': duration_str or '',
                    'uploader': info.get('uploader', 'Unknown'),
                    'view_count': info.get('view_count', 0),
                    'upload_date': upload_date or '',
                    'description': (info.get('description', '')[:200] + '...') if info.get('description') else '',
                })
            except Exception as e:
                logger.error(f"Preview error: {str(e)}")
                # Return a clear error to the frontend
                raise HTTPException(status_code=400, detail=f"Error extracting video information: {str(e)}")
    except Exception as e:
        logger.error(f"Preview error: {str(e)}")
        if "timed out" in str(e):
            raise HTTPException(status_code=408, detail="Request timed out. Please try again.")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/download")
async def download_video(request: DownloadRequest):
    if request.format not in ["mp4", "mp3"]:
        raise HTTPException(status_code=400, detail="Invalid format. Must be mp4 or mp3")
    
    if request.platform not in ["youtube", "facebook", "instagram"]:
        raise HTTPException(status_code=400, detail="Invalid platform")

    # Create a temporary directory
    temp_dir = tempfile.mkdtemp()
    try:
        # Set up the output path
        output_path = os.path.join(temp_dir, f"download.%(ext)s")
        
        # Configure yt-dlp options
        ydl_opts = get_ydl_opts(request.format, output_path)
        
        # Download the video/audio
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                # Get video info first
                logger.info(f"Extracting info for URL: {request.url}")
                try:
                    info = ydl.extract_info(request.url, download=False)
                    if not info:
                        raise HTTPException(
                            status_code=400,
                            detail="Could not extract video information. The video might be private or restricted."
                        )
                    title = info.get('title', 'download')
                except Exception as e:
                    logger.error(f"Error extracting video info: {str(e)}")
                    raise HTTPException(
                        status_code=400,
                        detail="Could not extract video information. Please check the URL and try again."
                    )
                
                # Download the video/audio
                logger.info("Starting download...")
                try:
                    ydl.download([request.url])
                except Exception as e:
                    logger.error(f"Error during download: {str(e)}")
                    raise HTTPException(
                        status_code=500,
                        detail="Failed to download the video. Please try again later."
                    )
                
                # Find the downloaded file
                downloaded_file = None
                for file in os.listdir(temp_dir):
                    if file.startswith("download."):
                        downloaded_file = os.path.join(temp_dir, file)
                        break
                
                if not downloaded_file:
                    raise HTTPException(status_code=500, detail="Failed to download file")
                
                logger.info(f"Download completed: {downloaded_file}")
                
                # Create a new temporary file for the response
                response_file = tempfile.NamedTemporaryFile(delete=False, suffix=f".{request.format}")
                shutil.copy2(downloaded_file, response_file.name)
                response_file.close()
                
                # Return the file
                return FileResponse(
                    response_file.name,
                    media_type="application/octet-stream",
                    filename=f"{title}.{request.format}",
                    background=None  # This ensures the file isn't deleted until after the response is sent
                )
            except yt_dlp.utils.DownloadError as e:
                error_msg = str(e)
                logger.error(f"Download error: {error_msg}")
                if "403" in error_msg:
                    raise HTTPException(
                        status_code=403,
                        detail="Access denied. The video might be restricted or private."
                        )
                elif "404" in error_msg:
                    raise HTTPException(
                        status_code=404,
                        detail="Video not found. The URL might be invalid or the video has been removed."
                        )
                else:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Download error: {error_msg}"
                        )
            except Exception as e:
                logger.error(f"Processing error: {str(e)}")
                raise HTTPException(status_code=500, detail=f"Processing error: {str(e)}")
    except Exception as e:
        logger.error(f"Server error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Clean up the temporary directory
        try:
            shutil.rmtree(temp_dir)
        except Exception as e:
            logger.error(f"Error cleaning up temporary directory: {e}")

# Mount the frontend directory after API routes
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'frontend')
app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 