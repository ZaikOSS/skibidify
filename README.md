# 🎵 Skibidify - The Ultimate Spotify Clone & Music Player

A sleek, pixel-perfect Spotify desktop look-alike application running inside **Docker** with **Docker Compose**, featuring full Spotify dark theme aesthetics, authentic typography, official Spotify Web API integration, and unlocked Premium-style features.

---

## ✨ Features

- **Iconic Spotify UI**:
  - Dark theme with Spotify palette (`#121212`, `#181818`, `#1DB954`).
  - Official Spotify typography (`SpotifyMixUI` extracted directly from the Spotify Windows desktop client).
  - Navigation sidebar with Home, Search, Library, and custom playlists.
  - Interactive top bar with navigation history, profile, and search input.
  - 6 Quick-play cards with time-based greetings ("Good morning", "Good afternoon", "Good evening").
  - Hero header with dynamic gradient matching playlist art.
  - Hover-activated green play buttons with smooth micro-interactions.

- **Spotify Server Integration**:
  - Official Spotify Web API integration via Client Credentials OAuth flow.
  - Real-time search across tracks, artists, and albums.
  - Curated featured playlists and genre browsing cards.
  - In-app settings modal to input your Spotify Developer API keys anytime.

- **Free "Premium-Style" Features (Unlocked & Legal)**:
  - **No Ads**: Pure music listening with 0 audio or visual interruptions.
  - **Unlimited Skips**: Skip forward or backward without restrictions.
  - **On-Demand Playback**: Play any track directly without forced shuffle.
  - **Pro Studio 5-Band Equalizer**: Web Audio API DSP equalizer with presets (Bass Booster 🔥, Treble Boost ✨, Electronic, Rock, Vocal Clarity).
  - **Real-Time Synced Karaoke Lyrics**: Interactive lyrics view synchronized to the track.
  - **Local PC Music Library**: Unlimited offline playback of local files. Drop `.mp3`, `.wav`, `.flac`, `.ogg` into `./music/` or drag & drop files onto the app window.
  - **Lossless Audio Streaming**: Range request streaming support for instant scrubbing.
  - **Custom Playlist Creation**: Create, like, and organize your music library.

---

## 🚀 Running with Docker Compose

Ensure Docker Desktop is running, then launch:

```bash
docker compose up -d --build
```

Access the app in your browser at:
👉 **[http://localhost:8888](http://localhost:8888)**

To stop the container:
```bash
docker compose down
```

---

## 🛠️ Configuration (Optional)

To enable direct official Spotify metadata and previews, create a `.env` file or click the Settings gear icon in the app:

```env
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
PORT=8888
```
*(If omitted, Skibidify automatically streams legal CC tracks from Jamendo and your local PC music folder!)*
