# Video Downloader

A modern, fullstack web app to download videos from YouTube, Facebook, and Instagram. Built with FastAPI (Python) for the backend and a beautiful HTML/CSS/JS frontend.

## Features
- Download videos from YouTube, Facebook, and Instagram
- Preview video details before downloading
- Choose between MP4 and MP3 formats
- Responsive, modern UI
- Facebook/Instagram support with cookies.txt

## Setup

### 1. Clone the repository
```bash
git clone <your-repo-url>
cd <repo-directory>
```

### 2. Install backend dependencies
```bash
cd video-downloader/backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. (Optional) Add `cookies.txt` for Facebook/Instagram
- Export your cookies using a browser extension like [Get cookies.txt](https://chrome.google.com/webstore/detail/get-cookiestxt/)
- Save the file as `cookies.txt` in `video-downloader/backend/`

### 4. Run the backend server
```bash
cd video-downloader/backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 5. Open the frontend
- Open `video-downloader/frontend/index.html` in your browser, **or**
- Access via [http://localhost:8000](http://localhost:8000) if served by FastAPI

## Usage
1. Select a platform (YouTube, Facebook, Instagram)
2. Paste the video URL
3. Click **Preview** to see video details
4. Click **Download** to save the video (choose format if prompted)

## Facebook/Instagram Support
- For some videos, you must be logged in. Use `cookies.txt` as described above.
- Share links are **not supported**. Use direct video, watch, or reel URLs.

## Tech Stack
- **Backend:** FastAPI, yt-dlp
- **Frontend:** HTML, CSS, JavaScript

## License
See [LICENSE](LICENSE).

## Contact
For issues or suggestions, open an issue or contact the maintainer. 