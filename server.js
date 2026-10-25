import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8888;
const MUSIC_DIR = path.join(__dirname, 'music');

// Ensure music directory exists
if (!fs.existsSync(MUSIC_DIR)) {
  fs.mkdirSync(MUSIC_DIR, { recursive: true });
}

// Multer storage for uploaded music files
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, MUSIC_DIR),
  filename: (req, file, cb) => {
    // Preserve original filename or clean it
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, cleanName);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB max
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed (mp3, wav, ogg, m4a, flac, aac)'));
    }
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Spotify OAuth Token Cache
let spotifyTokenCache = {
  token: null,
  expiresAt: 0
};

let spotifyConfig = {
  clientId: process.env.SPOTIFY_CLIENT_ID || '',
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET || ''
};

// Function to fetch Spotify App Token via Client Credentials flow
async function getSpotifyToken() {
  if (!spotifyConfig.clientId || !spotifyConfig.clientSecret) {
    return null;
  }

  const now = Date.now();
  if (spotifyTokenCache.token && spotifyTokenCache.expiresAt > now + 60000) {
    return spotifyTokenCache.token;
  }

  try {
    const authString = Buffer.from(`${spotifyConfig.clientId}:${spotifyConfig.clientSecret}`).toString('base64');
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Spotify token exchange failed:', errText);
      return null;
    }

    const data = await response.json();
    spotifyTokenCache = {
      token: data.access_token,
      expiresAt: now + (data.expires_in * 1000)
    };
    return spotifyTokenCache.token;
  } catch (err) {
    console.error('Error getting Spotify token:', err.message);
    return null;
  }
}

// Stream audio with HTTP Range support (crucial for seek bar)
app.get('/music/:filename', (req, res) => {
  const filePath = path.join(MUSIC_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
    '.flac': 'audio/flac',
    '.aac': 'audio/aac'
  };
  const contentType = mimeTypes[ext] || 'audio/mpeg';

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': contentType,
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

// Curated stock tracks with rich metadata and artwork
const STOCK_COVERS = [
  'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=500&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=500&auto=format&fit=crop&q=80'
];

// Get list of local music files
app.get('/api/local-tracks', (req, res) => {
  try {
    const files = fs.readdirSync(MUSIC_DIR);
    const audioFiles = files.filter(f => {
      const ext = path.extname(f).toLowerCase();
      return ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'].includes(ext);
    });

    const tracks = audioFiles.map((file, index) => {
      const rawName = path.parse(file).name;
      // Parse artist - title if naming pattern exists
      let title = rawName;
      let artist = 'Skibidify Local Artist';
      let album = 'Local Files';

      if (rawName.includes(' - ')) {
        const parts = rawName.split(' - ');
        artist = parts[0].trim();
        title = parts.slice(1).join(' - ').trim();
      } else if (rawName.includes('_')) {
        title = rawName.split('_').join(' ');
        artist = 'Skibidify Artist';
      }

      const cover = STOCK_COVERS[index % STOCK_COVERS.length];

      return {
        id: `local-${index}-${encodeURIComponent(file)}`,
        title,
        artist,
        album,
        duration: 210, // default placeholder or estimate
        durationFormatted: '3:30',
        streamUrl: `/music/${encodeURIComponent(file)}`,
        cover,
        source: 'local',
        fileName: file
      };
    });

    res.json({ tracks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload local track
app.post('/api/upload', upload.single('audio'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No audio file provided' });
  }

  const rawName = path.parse(req.file.filename).name;
  res.json({
    message: 'Track uploaded successfully!',
    track: {
      id: `local-uploaded-${Date.now()}`,
      title: rawName.replace(/_/g, ' '),
      artist: 'Local Artist',
      album: 'Imported Tracks',
      duration: 180,
      durationFormatted: '3:00',
      streamUrl: `/music/${encodeURIComponent(req.file.filename)}`,
      cover: STOCK_COVERS[0],
      source: 'local'
    }
  });
});

// Spotify credentials management
app.get('/api/spotify/credentials', (req, res) => {
  res.json({
    configured: Boolean(spotifyConfig.clientId && spotifyConfig.clientSecret),
    clientId: spotifyConfig.clientId ? `${spotifyConfig.clientId.slice(0, 4)}...${spotifyConfig.clientId.slice(-4)}` : ''
  });
});

app.post('/api/spotify/credentials', (req, res) => {
  const { clientId, clientSecret } = req.body;
  if (clientId) spotifyConfig.clientId = clientId.trim();
  if (clientSecret) spotifyConfig.clientSecret = clientSecret.trim();
  spotifyTokenCache = { token: null, expiresAt: 0 };
  res.json({
    configured: Boolean(spotifyConfig.clientId && spotifyConfig.clientSecret),
    message: 'Credentials updated successfully'
  });
});

// Search tracks (Spotify API + Free Legal Jamendo / CC Music Engine)
app.get('/api/spotify/search', async (req, res) => {
  const query = req.query.q || '';
  if (!query) {
    return res.json({ tracks: [], artists: [], playlists: [] });
  }

  const token = await getSpotifyToken();

  // If official Spotify credentials are provided, search Spotify's real servers!
  if (token) {
    try {
      const spRes = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track,artist,album&limit=20`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (spRes.ok) {
        const data = await spRes.json();
        const tracks = (data.tracks?.items || []).map(item => {
          const durationSec = Math.round(item.duration_ms / 1000);
          const mins = Math.floor(durationSec / 60);
          const secs = String(durationSec % 60).padStart(2, '0');
          return {
            id: item.id,
            title: item.name,
            artist: item.artists.map(a => a.name).join(', '),
            album: item.album.name,
            duration: durationSec,
            durationFormatted: `${mins}:${secs}`,
            cover: item.album.images?.[0]?.url || STOCK_COVERS[0],
            streamUrl: item.preview_url || null,
            externalUrl: item.external_urls?.spotify,
            popularity: item.popularity,
            source: 'spotify'
          };
        });

        const artists = (data.artists?.items || []).map(item => ({
          id: item.id,
          name: item.name,
          image: item.images?.[0]?.url || STOCK_COVERS[1],
          followers: item.followers?.total || 0,
          genres: item.genres || []
        }));

        return res.json({ tracks, artists, source: 'spotify_official' });
      }
    } catch (err) {
      console.error('Spotify API search failed:', err.message);
    }
  }

  // Legitimate High-Fidelity Music Search fallback via Jamendo API (licensed CC audio)
  try {
    const jamendoUrl = `https://api.jamendo.com/v3.0/tracks/?client_id=563f1053&format=jsonpretty&limit=20&namesearch=${encodeURIComponent(query)}&include=musicinfo&audioformat=mp32`;
    const jRes = await fetch(jamendoUrl);
    if (jRes.ok) {
      const data = await jRes.json();
      if (data.results && data.results.length > 0) {
        const tracks = data.results.map(item => {
          const durationSec = item.duration;
          const mins = Math.floor(durationSec / 60);
          const secs = String(durationSec % 60).padStart(2, '0');
          return {
            id: `jam-${item.id}`,
            title: item.name,
            artist: item.artist_name,
            album: item.album_name || 'Single',
            duration: durationSec,
            durationFormatted: `${mins}:${secs}`,
            cover: item.album_image || item.image || STOCK_COVERS[0],
            streamUrl: item.audio, // Real 100% playable MP3 stream!
            source: 'jamendo_legal',
            license: item.license_ccurl
          };
        });

        return res.json({ tracks, source: 'jamendo_full_stream' });
      }
    }
  } catch (err) {
    console.error('Jamendo search failed:', err.message);
  }

  // If offline or both external requests fail, search local music library
  try {
    const files = fs.readdirSync(MUSIC_DIR);
    const matched = files.filter(f => f.toLowerCase().includes(query.toLowerCase()));
    const tracks = matched.map((file, i) => ({
      id: `local-search-${i}`,
      title: path.parse(file).name.replace(/_/g, ' '),
      artist: 'Local Library',
      album: 'Local Music',
      duration: 210,
      durationFormatted: '3:30',
      streamUrl: `/music/${encodeURIComponent(file)}`,
      cover: STOCK_COVERS[i % STOCK_COVERS.length],
      source: 'local'
    }));

    return res.json({ tracks, source: 'local_fallback' });
  } catch (err) {
    return res.json({ tracks: [], source: 'empty' });
  }
});

// Featured playlists & curated catalog
app.get('/api/spotify/featured', async (req, res) => {
  const token = await getSpotifyToken();

  if (token) {
    try {
      const spRes = await fetch('https://api.spotify.com/v1/browse/featured-playlists?limit=12', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (spRes.ok) {
        const data = await spRes.json();
        const playlists = (data.playlists?.items || []).map(p => ({
          id: p.id,
          name: p.name,
          description: p.description,
          cover: p.images?.[0]?.url,
          trackCount: p.tracks?.total || 0,
          source: 'spotify'
        }));
        return res.json({ playlists });
      }
    } catch (err) {
      console.error('Error fetching Spotify featured playlists:', err.message);
    }
  }

  // Pre-configured rich Spotify-style curated playlists
  const featuredPlaylists = [
    {
      id: 'pl-today-top-hits',
      name: "Today's Top Hits",
      description: "Sabrina Carpenter is on top of the Hottest 50!",
      cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&auto=format&fit=crop&q=80',
      trackCount: 50
    },
    {
      id: 'pl-phonk-sigma',
      name: "Skibidi Phonk & Drift",
      description: "Aggressive phonk, drift bass, and Brazilian phonk bangers.",
      cover: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&auto=format&fit=crop&q=80',
      trackCount: 38
    },
    {
      id: 'pl-lofi-beats',
      name: "Lofi Beats for Coding",
      description: "Beats to relax, study, and code to. Ultra chill vibes.",
      cover: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80',
      trackCount: 65
    },
    {
      id: 'pl-synthwave-nights',
      name: "Synthwave & Retrowave",
      description: "Neon retro 80s analog synthesizers and cyberpunk night drives.",
      cover: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=500&auto=format&fit=crop&q=80',
      trackCount: 42
    },
    {
      id: 'pl-beast-mode',
      name: "Beast Mode Workout",
      description: "High energy bass and fast BPM to crush your personal bests.",
      cover: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=500&auto=format&fit=crop&q=80',
      trackCount: 55
    },
    {
      id: 'pl-deep-focus',
      name: "Deep Focus Ambient",
      description: "Atmospheric, ambient music for hyper-concentration.",
      cover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&auto=format&fit=crop&q=80',
      trackCount: 48
    }
  ];

  res.json({ playlists: featuredPlaylists });
});

// Synced lyrics endpoint
app.get('/api/spotify/lyrics', (req, res) => {
  const { title, artist } = req.query;
  // Dynamic lyrics generator with timing for karaoke synced view
  const sampleLyrics = [
    { time: 0, text: `♪ (Intro beat drops) ♪` },
    { time: 6, text: `Welcome to Skibidify, vibes are alive` },
    { time: 11, text: `Zero ads, crystal clear sound through the night` },
    { time: 17, text: `Streaming high fidelity, pushing the bass` },
    { time: 23, text: `No interruptions, setting the pace` },
    { time: 29, text: `♪ (Synth melody rising) ♪` },
    { time: 35, text: `Turn it up louder, let the frequency flow` },
    { time: 42, text: `From local files to the world below` },
    { time: 48, text: `Skibidify Premium, everywhere you go!` },
    { time: 55, text: `♪ (Outro beat fading) ♪` }
  ];

  res.json({
    title: title || 'Track',
    artist: artist || 'Artist',
    synced: true,
    lyrics: sampleLyrics
  });
});

// Health check status
app.get('/api/status', (req, res) => {
  res.json({
    app: 'Skibidify',
    version: '1.0.0',
    status: 'online',
    container: process.env.IS_DOCKER ? 'docker' : 'native',
    spotifyConfigured: Boolean(spotifyConfig.clientId && spotifyConfig.clientSecret),
    premiumFeaturesUnlocked: true
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`===============================================`);
  console.log(`🎵 Skibidify Music Server running on port ${PORT}`);
  console.log(`🚀 Access Skibidify at http://localhost:${PORT}`);
  console.log(`===============================================`);
});
