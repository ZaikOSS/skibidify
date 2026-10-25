// ============================================================
// SKIBIDIFY - SPOTIFY CLIENT CONTROLLER
// ============================================================

const state = {
  currentTrack: null,
  queue: [],
  queueIndex: -1,
  isPlaying: false,
  isShuffle: false,
  repeatMode: 0, // 0: off, 1: repeat all, 2: repeat one
  volume: 0.8,
  isMuted: false,
  likedTrackIds: new Set(JSON.parse(localStorage.getItem('skibidify_liked') || '[]')),
  customPlaylists: JSON.parse(localStorage.getItem('skibidify_playlists') || '[]'),
  localTracks: [],
  featuredPlaylists: [],
  activeView: 'home',
  activePlaylist: null,
  rightPanelMode: null, // 'lyrics' or 'queue'
};

// DOM References
const audio = document.getElementById('audioPlayer');
const viewContainer = document.getElementById('viewContainer');
const searchInput = document.getElementById('searchInput');
const searchClearBtn = document.getElementById('searchClearBtn');
const playerThumb = document.getElementById('playerThumb');
const playerTitle = document.getElementById('playerTitle');
const playerArtist = document.getElementById('playerArtist');
const playerBtnLike = document.getElementById('playerBtnLike');
const btnPlayPause = document.getElementById('btnPlayPause');
const playIconSvg = document.getElementById('playIconSvg');
const btnPrev = document.getElementById('btnPrev');
const btnNext = document.getElementById('btnNext');
const btnShuffle = document.getElementById('btnShuffle');
const btnRepeat = document.getElementById('btnRepeat');
const timeCurrent = document.getElementById('timeCurrent');
const timeDuration = document.getElementById('timeDuration');
const progressBarContainer = document.getElementById('progressBarContainer');
const progressBarFill = document.getElementById('progressBarFill');
const progressBarHandle = document.getElementById('progressBarHandle');
const volumeSliderContainer = document.getElementById('volumeSliderContainer');
const volumeBarFill = document.getElementById('volumeBarFill');
const btnMute = document.getElementById('btnMute');
const volumeIconSvg = document.getElementById('volumeIconSvg');
const rightPanel = document.getElementById('rightPanel');
const rightPanelTitle = document.getElementById('rightPanelTitle');
const rightPanelContent = document.getElementById('rightPanelContent');
const btnCloseRightPanel = document.getElementById('btnCloseRightPanel');
const btnToggleNowPlaying = document.getElementById('btnToggleNowPlaying');
const btnToggleLyrics = document.getElementById('btnToggleLyrics');
const btnToggleQueue = document.getElementById('btnToggleQueue');
const btnEqualizer = document.getElementById('btnEqualizer');
const eqModal = document.getElementById('eqModal');
const btnCloseEq = document.getElementById('btnCloseEq');
const eqPresetSelect = document.getElementById('eqPresetSelect');
const btnOpenSettings = document.getElementById('btnOpenSettings');
const spotifyConfigModal = document.getElementById('spotifyConfigModal');
const btnCloseConfig = document.getElementById('btnCloseConfig');
const btnSaveSpotifyConfig = document.getElementById('btnSaveSpotifyConfig');
const spotifyClientIdInput = document.getElementById('spotifyClientIdInput');
const spotifyClientSecretInput = document.getElementById('spotifyClientSecretInput');
const spotifyConfigStatus = document.getElementById('spotifyConfigStatus');
const btnUploadLocal = document.getElementById('btnUploadLocal');
const localFileInput = document.getElementById('localFileInput');
const toastEl = document.getElementById('toast');
const sidebarPlaylistsEl = document.getElementById('sidebarPlaylists');
const btnCreatePlaylist = document.getElementById('btnCreatePlaylist');
const likedSongsCountEl = document.getElementById('likedSongsCount');
const localTracksCountEl = document.getElementById('localTracksCount');

// Web Audio API Equalizer Setup
let audioCtx = null;
let audioSourceNode = null;
let eqFilters = [];
const EQ_FREQUENCIES = [60, 250, 1000, 4000, 16000];

function initAudioContext() {
  if (audioCtx) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
    audioSourceNode = audioCtx.createMediaElementSource(audio);

    eqFilters = EQ_FREQUENCIES.map((freq, i) => {
      const filter = audioCtx.createBiquadFilter();
      if (i === 0) {
        filter.type = 'lowshelf';
      } else if (i === EQ_FREQUENCIES.length - 1) {
        filter.type = 'highshelf';
      } else {
        filter.type = 'peaking';
        filter.Q.value = 1.0;
      }
      filter.frequency.value = freq;
      filter.gain.value = 0;
      return filter;
    });

    // Chain nodes together
    let prevNode = audioSourceNode;
    eqFilters.forEach(f => {
      prevNode.connect(f);
      prevNode = f;
    });
    prevNode.connect(audioCtx.destination);
  } catch (err) {
    console.warn('Web Audio API not supported or blocked by browser policy:', err);
  }
}

// Show Toast Alert
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 3000);
}

// Format Seconds to M:SS
function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

// ============================================================
// AUDIO PLAYBACK CONTROLS
// ============================================================

function playTrack(track, queueList = null) {
  if (queueList) {
    state.queue = [...queueList];
    state.queueIndex = state.queue.findIndex(t => t.id === track.id);
  } else if (!state.queue.some(t => t.id === track.id)) {
    state.queue.push(track);
    state.queueIndex = state.queue.length - 1;
  }

  state.currentTrack = track;
  audio.src = track.streamUrl;

  initAudioContext();
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  audio.play().then(() => {
    state.isPlaying = true;
    updatePlayerUI();
  }).catch(err => {
    console.error('Audio playback failed:', err);
    showToast('Playback error: ' + (track.source === 'spotify' ? 'Preview restricted by Spotify' : err.message));
  });

  updatePlayerUI();
  renderCurrentViewHighlight();
}

function togglePlayPause() {
  if (!state.currentTrack) {
    if (state.queue.length > 0) {
      playTrack(state.queue[0], state.queue);
    } else if (state.localTracks.length > 0) {
      playTrack(state.localTracks[0], state.localTracks);
    }
    return;
  }

  if (state.isPlaying) {
    audio.pause();
    state.isPlaying = false;
  } else {
    initAudioContext();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    audio.play();
    state.isPlaying = true;
  }
  updatePlayerUI();
  renderCurrentViewHighlight();
}

function playNextTrack() {
  if (state.queue.length === 0) return;

  if (state.isShuffle) {
    state.queueIndex = Math.floor(Math.random() * state.queue.length);
  } else {
    state.queueIndex++;
    if (state.queueIndex >= state.queue.length) {
      if (state.repeatMode === 1) {
        state.queueIndex = 0;
      } else {
        state.isPlaying = false;
        updatePlayerUI();
        return;
      }
    }
  }

  const next = state.queue[state.queueIndex];
  if (next) playTrack(next);
}

function playPrevTrack() {
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }

  if (state.queue.length === 0) return;
  state.queueIndex--;
  if (state.queueIndex < 0) {
    state.queueIndex = state.queue.length - 1;
  }
  const prev = state.queue[state.queueIndex];
  if (prev) playTrack(prev);
}

// Update Player Bar UI
function updatePlayerUI() {
  if (state.currentTrack) {
    playerThumb.src = state.currentTrack.cover;
    playerTitle.textContent = state.currentTrack.title;
    playerArtist.textContent = state.currentTrack.artist;
    playerBtnLike.classList.toggle('liked', state.likedTrackIds.has(state.currentTrack.id));
    document.title = `${state.currentTrack.title} • ${state.currentTrack.artist} - Skibidify`;
  }

  if (state.isPlaying) {
    playIconSvg.innerHTML = '<path d="M2.7 1a.7.7 0 0 0-.7.7v12.6a.7.7 0 0 0 .7.7h2.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7H2.7zm8 0a.7.7 0 0 0-.7.7v12.6a.7.7 0 0 0 .7.7h2.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7h-2.6z"/>';
    btnPlayPause.title = 'Pause';
  } else {
    playIconSvg.innerHTML = '<path d="M3 1.713a.7.7 0 0 1 1.05-.607l10.89 6.288a.7.7 0 0 1 0 1.212L4.05 14.894A.7.7 0 0 1 3 14.288V1.713z"/>';
    btnPlayPause.title = 'Play';
  }

  btnShuffle.classList.toggle('active', state.isShuffle);
  btnRepeat.classList.toggle('active', state.repeatMode > 0);
  if (state.repeatMode === 2) {
    btnRepeat.title = 'Repeat One';
  } else if (state.repeatMode === 1) {
    btnRepeat.title = 'Repeat All';
  } else {
    btnRepeat.title = 'Enable Repeat';
  }
}

// Audio Element Events
audio.addEventListener('timeupdate', () => {
  if (!audio.duration) return;
  const curr = audio.currentTime;
  const dur = audio.duration;
  timeCurrent.textContent = formatTime(curr);
  timeDuration.textContent = formatTime(dur);
  const pct = (curr / dur) * 100;
  progressBarFill.style.width = `${pct}%`;

  // Update synced lyrics if lyrics panel open
  if (state.rightPanelMode === 'lyrics') {
    updateSyncedLyrics(curr);
  }
});

audio.addEventListener('ended', () => {
  if (state.repeatMode === 2) {
    audio.currentTime = 0;
    audio.play();
  } else {
    playNextTrack();
  }
});

audio.addEventListener('play', () => {
  state.isPlaying = true;
  updatePlayerUI();
  renderCurrentViewHighlight();
});

audio.addEventListener('pause', () => {
  state.isPlaying = false;
  updatePlayerUI();
  renderCurrentViewHighlight();
});

// Scrubbing / Progress Bar
progressBarContainer.addEventListener('click', (e) => {
  if (!audio.duration) return;
  const rect = progressBarContainer.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const pct = Math.max(0, Math.min(1, clickX / rect.width));
  audio.currentTime = pct * audio.duration;
});

// Volume Controls
function setVolume(vol) {
  state.volume = Math.max(0, Math.min(1, vol));
  audio.volume = state.isMuted ? 0 : state.volume;
  volumeBarFill.style.width = `${(state.isMuted ? 0 : state.volume) * 100}%`;
  updateVolumeIcon();
}

function updateVolumeIcon() {
  if (state.isMuted || state.volume === 0) {
    volumeIconSvg.innerHTML = '<path d="m11.28 3.28 4.22 4.22a.75.75 0 0 1 0 1.06l-4.22 4.22a.75.75 0 0 1-1.06-1.06L13.94 8l-3.72-3.72a.75.75 0 0 1 1.06-1.06zM2 4.85l6.925-4A.75.75 0 0 1 10 1.5v13a.75.75 0 0 1-1.075.65L2 11.15H0V4.85h2z"/>';
  } else if (state.volume < 0.5) {
    volumeIconSvg.innerHTML = '<path d="M9.741.85a.75.75 0 0 1 .375.65v13a.75.75 0 0 1-1.125.65l-6.925-4H0V4.85h2.066l6.925-4a.75.75 0 0 1 .75 0zM12 5.5a.75.75 0 0 1 .75.75 2.5 2.5 0 0 1 0 3.5.75.75 0 1 1-1.06-1.06 1 1 0 0 0 0-1.38.75.75 0 0 1 .31-.81z"/>';
  } else {
    volumeIconSvg.innerHTML = '<path d="M9.741.85a.75.75 0 0 1 .375.65v13a.75.75 0 0 1-1.125.65l-6.925-4H0V4.85h2.066l6.925-4a.75.75 0 0 1 .75 0zM12 4a.75.75 0 0 1 .75.75 4.5 4.5 0 0 1 0 6.5.75.75 0 1 1-1.06-1.06 3 3 0 0 0 0-4.38.75.75 0 0 1 .31-.81z"/>';
  }
}

volumeSliderContainer.addEventListener('click', (e) => {
  const rect = volumeSliderContainer.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  state.isMuted = false;
  setVolume(pct);
});

btnMute.addEventListener('click', () => {
  state.isMuted = !state.isMuted;
  setVolume(state.volume);
});

// Like / Heart Toggle
function toggleLikeTrack(track) {
  if (!track) return;
  if (state.likedTrackIds.has(track.id)) {
    state.likedTrackIds.delete(track.id);
    showToast(`Removed from Liked Songs`);
  } else {
    state.likedTrackIds.add(track.id);
    showToast(`Added to Liked Songs`);
  }
  localStorage.setItem('skibidify_liked', JSON.stringify([...state.likedTrackIds]));
  updatePlayerUI();
  updateLibraryCounts();
  if (state.activeView === 'liked') {
    renderLikedSongs();
  }
}

playerBtnLike.addEventListener('click', () => toggleLikeTrack(state.currentTrack));

btnPlayPause.addEventListener('click', togglePlayPause);
btnNext.addEventListener('click', playNextTrack);
btnPrev.addEventListener('click', playPrevTrack);

btnShuffle.addEventListener('click', () => {
  state.isShuffle = !state.isShuffle;
  showToast(state.isShuffle ? 'Shuffle enabled' : 'Shuffle disabled');
  updatePlayerUI();
});

btnRepeat.addEventListener('click', () => {
  state.repeatMode = (state.repeatMode + 1) % 3;
  const msgs = ['Repeat off', 'Repeat all', 'Repeat track'];
  showToast(msgs[state.repeatMode]);
  updatePlayerUI();
});

// Keyboard Shortcuts
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') {
    e.preventDefault();
    togglePlayPause();
  } else if (e.code === 'ArrowRight' && e.ctrlKey) {
    playNextTrack();
  } else if (e.code === 'ArrowLeft' && e.ctrlKey) {
    playPrevTrack();
  } else if (e.code === 'KeyM') {
    btnMute.click();
  }
});

// ============================================================
// VIEWS & UI RENDERING
// ============================================================

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function renderHome() {
  state.activeView = 'home';
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.getElementById('navHome').classList.add('active');

  const greeting = getGreeting();

  // Top 6 Quick Cards
  const quickTracks = state.localTracks.slice(0, 6);

  viewContainer.innerHTML = `
    <div class="home-view">
      <h1 class="view-greeting">${greeting}</h1>

      <div class="quick-grid">
        ${quickTracks.map(track => `
          <div class="quick-card" onclick="window.skibidify.playTrackById('${track.id}')">
            <img src="${track.cover}" class="quick-card-img" alt="">
            <span class="quick-card-title">${track.title}</span>
            <button class="quick-card-play" title="Play">
              <svg viewBox="0 0 16 16" fill="currentColor"><path d="M3 1.713a.7.7 0 0 1 1.05-.607l10.89 6.288a.7.7 0 0 1 0 1.212L4.05 14.894A.7.7 0 0 1 3 14.288V1.713z"/></svg>
            </button>
          </div>
        `).join('')}
      </div>

      <!-- Featured Playlists Section -->
      <div class="section-block">
        <div class="section-header">
          <h2 class="section-title">Featured Playlists</h2>
        </div>
        <div class="cards-grid">
          ${state.featuredPlaylists.map(pl => `
            <div class="spotify-card" onclick="window.skibidify.openPlaylist('${pl.id}')">
              <div class="card-img-wrapper">
                <img src="${pl.cover}" class="card-img" alt="">
                <button class="card-play-btn" title="Play">
                  <svg viewBox="0 0 16 16" fill="currentColor"><path d="M3 1.713a.7.7 0 0 1 1.05-.607l10.89 6.288a.7.7 0 0 1 0 1.212L4.05 14.894A.7.7 0 0 1 3 14.288V1.713z"/></svg>
                </button>
              </div>
              <div class="card-title">${pl.name}</div>
              <div class="card-desc">${pl.description}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Local PC Library Section -->
      <div class="section-block">
        <div class="section-header">
          <h2 class="section-title">Your PC Music Library (Unlimited & Free)</h2>
          <span class="section-more-link" onclick="window.skibidify.renderLocalTracks()">See all</span>
        </div>
        <div class="cards-grid">
          ${state.localTracks.map(track => `
            <div class="spotify-card" onclick="window.skibidify.playTrackById('${track.id}')">
              <div class="card-img-wrapper">
                <img src="${track.cover}" class="card-img" alt="">
                <button class="card-play-btn" title="Play">
                  <svg viewBox="0 0 16 16" fill="currentColor"><path d="M3 1.713a.7.7 0 0 1 1.05-.607l10.89 6.288a.7.7 0 0 1 0 1.212L4.05 14.894A.7.7 0 0 1 3 14.288V1.713z"/></svg>
                </button>
              </div>
              <div class="card-title">${track.title}</div>
              <div class="card-desc">${track.artist} • ${track.album}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

// Search View & Genre Tiles
const GENRES = [
  { name: 'Pop', color: '#8d67ab', img: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300' },
  { name: 'Phonk', color: '#e91429', img: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=300' },
  { name: 'Hip-Hop', color: '#bc5900', img: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=300' },
  { name: 'Dance / EDM', color: '#006450', img: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300' },
  { name: 'Lofi / Study', color: '#27856a', img: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300' },
  { name: 'Gaming', color: '#e8115b', img: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=300' },
  { name: 'Rock', color: '#b02897', img: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=300' },
  { name: 'Workout', color: '#777777', img: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=300' },
];

function renderSearch(query = '') {
  state.activeView = 'search';
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.getElementById('navSearch').classList.add('active');

  if (!query) {
    viewContainer.innerHTML = `
      <div class="search-view">
        <h2 class="section-title">Browse all</h2>
        <div class="genre-grid">
          ${GENRES.map(g => `
            <div class="genre-tile" style="background-color: ${g.color};" onclick="window.skibidify.searchGenre('${g.name}')">
              <span>${g.name}</span>
              <img src="${g.img}" alt="">
            </div>
          `).join('')}
        </div>
      </div>
    `;
    return;
  }

  // Show loading indicator
  viewContainer.innerHTML = `
    <div class="search-view">
      <div style="padding: 40px; text-align: center; color: var(--text-subdued);">
        Searching official Spotify servers & legal streams for "${query}"...
      </div>
    </div>
  `;

  fetch(`/api/spotify/search?q=${encodeURIComponent(query)}`)
    .then(res => res.json())
    .then(data => {
      const tracks = data.tracks || [];
      if (tracks.length === 0) {
        viewContainer.innerHTML = `
          <div class="search-view">
            <h2>No results found for "${query}"</h2>
            <p style="color:var(--text-subdued);">Please make sure your words are spelled correctly or search another genre.</p>
          </div>
        `;
        return;
      }

      const topResult = tracks[0];

      viewContainer.innerHTML = `
        <div class="search-view">
          <div class="search-results-container">
            <div class="search-top-row">
              <!-- Top Result Card -->
              <div>
                <h2 class="section-title" style="margin-bottom: 16px;">Top result</h2>
                <div class="top-result-card" onclick="window.skibidify.playSearchedTrack('${topResult.id}')">
                  <img src="${topResult.cover}" class="top-result-img" alt="">
                  <div class="top-result-title">${topResult.title}</div>
                  <div class="top-result-meta">
                    <span>${topResult.artist}</span>
                    <span class="pill-badge">${topResult.source === 'spotify' ? 'SPOTIFY' : 'FULL STREAM'}</span>
                  </div>
                  <button class="card-play-btn" style="opacity:1; transform:none;" title="Play">
                    <svg viewBox="0 0 16 16" fill="currentColor"><path d="M3 1.713a.7.7 0 0 1 1.05-.607l10.89 6.288a.7.7 0 0 1 0 1.212L4.05 14.894A.7.7 0 0 1 3 14.288V1.713z"/></svg>
                  </button>
                </div>
              </div>

              <!-- Songs List -->
              <div>
                <h2 class="section-title" style="margin-bottom: 16px;">Songs</h2>
                <div class="track-table-container" style="padding:0;">
                  <table class="track-table">
                    <tbody>
                      ${tracks.slice(0, 5).map((track, idx) => `
                        <tr class="track-row" onclick="window.skibidify.playSearchedTrack('${track.id}')">
                          <td class="track-index-col">
                            <span class="track-index-num">${idx + 1}</span>
                            <span class="track-row-play-btn"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M3 1.713a.7.7 0 0 1 1.05-.607l10.89 6.288a.7.7 0 0 1 0 1.212L4.05 14.894A.7.7 0 0 1 3 14.288V1.713z"/></svg></span>
                          </td>
                          <td>
                            <div class="track-info-cell">
                              <img src="${track.cover}" class="track-thumb" alt="">
                              <div class="track-title-block">
                                <span class="track-title-cell">${track.title}</span>
                                <span class="track-artist-cell">${track.artist}</span>
                              </div>
                            </div>
                          </td>
                          <td>${track.album || ''}</td>
                          <td style="text-align:right;">${track.durationFormatted || '3:30'}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <!-- More Results Grid -->
            <div class="section-block">
              <h2 class="section-title">More Results</h2>
              <div class="cards-grid">
                ${tracks.slice(5).map(track => `
                  <div class="spotify-card" onclick="window.skibidify.playSearchedTrack('${track.id}')">
                    <div class="card-img-wrapper">
                      <img src="${track.cover}" class="card-img" alt="">
                      <button class="card-play-btn" title="Play">
                        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M3 1.713a.7.7 0 0 1 1.05-.607l10.89 6.288a.7.7 0 0 1 0 1.212L4.05 14.894A.7.7 0 0 1 3 14.288V1.713z"/></svg>
                      </button>
                    </div>
                    <div class="card-title">${track.title}</div>
                    <div class="card-desc">${track.artist}</div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      `;

      // Store in search results pool
      window.lastSearchResults = tracks;
    })
    .catch(err => {
      viewContainer.innerHTML = `<div style="padding:40px; color:red;">Search error: ${err.message}</div>`;
    });
}

// Render Local PC Tracks View
function renderLocalTracks() {
  state.activeView = 'local';
  const tracks = state.localTracks;

  viewContainer.innerHTML = `
    <div class="playlist-view">
      <div class="playlist-hero" style="background: linear-gradient(180deg, #1e3c72 0%, var(--bg-base) 100%);">
        <div class="hero-cover local-music-cover" style="display:flex; align-items:center; justify-content:center;">
          <svg viewBox="0 0 16 16" fill="white" width="80" height="80">
            <path d="M6 13c0 1.105-1.12 2-2.5 2S1 14.105 1 13s1.12-2 2.5-2 2.5.895 2.5 2zm9-2c0 1.105-1.12 2-2.5 2s-2.5-.895-2.5-2 1.12-2 2.5-2 2.5.895 2.5 2z"/>
            <path fill-rule="evenodd" d="M14 11V2h1v9h-1zM5 13V4h1v9H5z"/>
            <path d="M5 4.879l9-2.571v-1.02L5 3.86v1.02z"/>
          </svg>
        </div>
        <div class="hero-meta">
          <span class="hero-type">Playlist</span>
          <h1 class="hero-title">Your Local Files</h1>
          <p class="hero-desc">High resolution audio files loaded from your PC's storage. Unlimited offline playback.</p>
          <div class="hero-stats">Skibidify • ${tracks.length} songs</div>
        </div>
      </div>

      <div class="action-bar">
        <button class="hero-play-circle" onclick="window.skibidify.playAllLocal()" title="Play">
          <svg viewBox="0 0 16 16" fill="currentColor"><path d="M3 1.713a.7.7 0 0 1 1.05-.607l10.89 6.288a.7.7 0 0 1 0 1.212L4.05 14.894A.7.7 0 0 1 3 14.288V1.713z"/></svg>
        </button>
        <button class="btn-pill btn-secondary" onclick="document.getElementById('localFileInput').click()">
          + Add Local Files
        </button>
      </div>

      <div class="track-table-container">
        <table class="track-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Title</th>
              <th>Album</th>
              <th>Format</th>
              <th>🕒</th>
            </tr>
          </thead>
          <tbody>
            ${tracks.map((track, idx) => `
              <tr class="track-row ${state.currentTrack?.id === track.id ? 'playing' : ''}" onclick="window.skibidify.playTrackById('${track.id}')">
                <td class="track-index-col">
                  <span class="track-index-num">${idx + 1}</span>
                  <span class="track-row-play-btn"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M3 1.713a.7.7 0 0 1 1.05-.607l10.89 6.288a.7.7 0 0 1 0 1.212L4.05 14.894A.7.7 0 0 1 3 14.288V1.713z"/></svg></span>
                </td>
                <td>
                  <div class="track-info-cell">
                    <img src="${track.cover}" class="track-thumb" alt="">
                    <div class="track-title-block">
                      <span class="track-title-cell">${track.title}</span>
                      <span class="track-artist-cell">${track.artist}</span>
                    </div>
                  </div>
                </td>
                <td>${track.album}</td>
                <td>MP3 Lossless</td>
                <td style="text-align:right;">${track.durationFormatted || '3:30'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// Render Liked Songs View
function renderLikedSongs() {
  state.activeView = 'liked';
  const likedTracks = state.localTracks.filter(t => state.likedTrackIds.has(t.id));

  viewContainer.innerHTML = `
    <div class="playlist-view">
      <div class="playlist-hero" style="background: linear-gradient(180deg, #450af5 0%, var(--bg-base) 100%);">
        <div class="hero-cover liked-songs-gradient" style="display:flex; align-items:center; justify-content:center;">
          <svg viewBox="0 0 16 16" fill="white" width="80" height="80">
            <path d="M15.724 4.22A4.13 4.13 0 0 0 12.181 2c-1.34 0-2.874.78-3.681 2.05C7.693 2.78 6.16 2 4.819 2a4.13 4.13 0 0 0-3.543 2.22c-1.54 2.566-.156 6.876 5.8 11.038l.924.642.924-.642c5.956-4.162 7.34-8.472 5.8-11.038z"/>
          </svg>
        </div>
        <div class="hero-meta">
          <span class="hero-type">Playlist</span>
          <h1 class="hero-title">Liked Songs</h1>
          <p class="hero-desc">All your favorite tracks in one place.</p>
          <div class="hero-stats">Zakar • ${likedTracks.length} songs</div>
        </div>
      </div>

      <div class="action-bar">
        <button class="hero-play-circle" onclick="window.skibidify.playAllLiked()" title="Play">
          <svg viewBox="0 0 16 16" fill="currentColor"><path d="M3 1.713a.7.7 0 0 1 1.05-.607l10.89 6.288a.7.7 0 0 1 0 1.212L4.05 14.894A.7.7 0 0 1 3 14.288V1.713z"/></svg>
        </button>
      </div>

      <div class="track-table-container">
        ${likedTracks.length === 0 ? `
          <div style="padding: 40px; text-align: center; color: var(--text-subdued);">
            <h3>Songs you like will appear here</h3>
            <p>Save songs by clicking the heart icon on any track.</p>
          </div>
        ` : `
          <table class="track-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Title</th>
                <th>Album</th>
                <th>🕒</th>
              </tr>
            </thead>
            <tbody>
              ${likedTracks.map((track, idx) => `
                <tr class="track-row ${state.currentTrack?.id === track.id ? 'playing' : ''}" onclick="window.skibidify.playTrackById('${track.id}')">
                  <td class="track-index-col">
                    <span class="track-index-num">${idx + 1}</span>
                    <span class="track-row-play-btn"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M3 1.713a.7.7 0 0 1 1.05-.607l10.89 6.288a.7.7 0 0 1 0 1.212L4.05 14.894A.7.7 0 0 1 3 14.288V1.713z"/></svg></span>
                  </td>
                  <td>
                    <div class="track-info-cell">
                      <img src="${track.cover}" class="track-thumb" alt="">
                      <div class="track-title-block">
                        <span class="track-title-cell">${track.title}</span>
                        <span class="track-artist-cell">${track.artist}</span>
                      </div>
                    </div>
                  </td>
                  <td>${track.album}</td>
                  <td style="text-align:right;">${track.durationFormatted || '3:30'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `}
      </div>
    </div>
  `;
}

// Render Playlist View
function openPlaylist(playlistId) {
  state.activeView = 'playlist';
  const pl = state.featuredPlaylists.find(p => p.id === playlistId);
  if (!pl) return;

  // Generate songs for this playlist combining local tracks & thematic songs
  const tracks = state.localTracks;

  viewContainer.innerHTML = `
    <div class="playlist-view">
      <div class="playlist-hero" style="background: linear-gradient(180deg, #7b1fa2 0%, var(--bg-base) 100%);">
        <img src="${pl.cover}" class="hero-cover" alt="">
        <div class="hero-meta">
          <span class="hero-type">Featured Playlist</span>
          <h1 class="hero-title">${pl.name}</h1>
          <p class="hero-desc">${pl.description}</p>
          <div class="hero-stats">Spotify • ${pl.trackCount || 50} songs</div>
        </div>
      </div>

      <div class="action-bar">
        <button class="hero-play-circle" onclick="window.skibidify.playAllLocal()" title="Play">
          <svg viewBox="0 0 16 16" fill="currentColor"><path d="M3 1.713a.7.7 0 0 1 1.05-.607l10.89 6.288a.7.7 0 0 1 0 1.212L4.05 14.894A.7.7 0 0 1 3 14.288V1.713z"/></svg>
        </button>
      </div>

      <div class="track-table-container">
        <table class="track-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Title</th>
              <th>Album</th>
              <th>🕒</th>
            </tr>
          </thead>
          <tbody>
            ${tracks.map((track, idx) => `
              <tr class="track-row ${state.currentTrack?.id === track.id ? 'playing' : ''}" onclick="window.skibidify.playTrackById('${track.id}')">
                <td class="track-index-col">
                  <span class="track-index-num">${idx + 1}</span>
                  <span class="track-row-play-btn"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M3 1.713a.7.7 0 0 1 1.05-.607l10.89 6.288a.7.7 0 0 1 0 1.212L4.05 14.894A.7.7 0 0 1 3 14.288V1.713z"/></svg></span>
                </td>
                <td>
                  <div class="track-info-cell">
                    <img src="${track.cover}" class="track-thumb" alt="">
                    <div class="track-title-block">
                      <span class="track-title-cell">${track.title}</span>
                      <span class="track-artist-cell">${track.artist}</span>
                    </div>
                  </div>
                </td>
                <td>${track.album}</td>
                <td style="text-align:right;">${track.durationFormatted || '3:30'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderCurrentViewHighlight() {
  document.querySelectorAll('.track-row').forEach(row => {
    row.classList.remove('playing');
  });
  if (state.currentTrack) {
    const selector = `[onclick*="${state.currentTrack.id}"]`;
    document.querySelectorAll(selector).forEach(el => {
      if (el.classList.contains('track-row')) el.classList.add('playing');
    });
  }
}

function updateLibraryCounts() {
  likedSongsCountEl.textContent = state.likedTrackIds.size;
  localTracksCountEl.textContent = state.localTracks.length;
}

// Synced Lyrics View
let cachedLyrics = [];
function toggleLyricsPanel() {
  if (state.rightPanelMode === 'lyrics' && rightPanel.classList.contains('open')) {
    rightPanel.classList.remove('open');
    state.rightPanelMode = null;
    return;
  }

  state.rightPanelMode = 'lyrics';
  rightPanelTitle.textContent = 'Lyrics';
  rightPanel.classList.add('open');

  const title = state.currentTrack?.title || 'Skibidify Vibes';
  const artist = state.currentTrack?.artist || 'Artist';

  rightPanelContent.innerHTML = `<div style="color:var(--text-subdued);">Loading lyrics...</div>`;

  fetch(`/api/spotify/lyrics?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`)
    .then(r => r.json())
    .then(data => {
      cachedLyrics = data.lyrics || [];
      rightPanelContent.innerHTML = `
        <div class="lyrics-container" id="lyricsContainer">
          ${cachedLyrics.map((l, i) => `
            <div class="lyrics-line" id="lyric-${i}" onclick="window.skibidify.seekLyric(${l.time})">
              ${l.text}
            </div>
          `).join('')}
        </div>
      `;
    });
}

function updateSyncedLyrics(currentTime) {
  if (!cachedLyrics || cachedLyrics.length === 0) return;
  let activeIdx = 0;
  for (let i = 0; i < cachedLyrics.length; i++) {
    if (currentTime >= cachedLyrics[i].time) {
      activeIdx = i;
    }
  }

  document.querySelectorAll('.lyrics-line').forEach((el, idx) => {
    el.classList.toggle('active', idx === activeIdx);
  });
}

// Queue Panel
function toggleQueuePanel() {
  if (state.rightPanelMode === 'queue' && rightPanel.classList.contains('open')) {
    rightPanel.classList.remove('open');
    state.rightPanelMode = null;
    return;
  }

  state.rightPanelMode = 'queue';
  rightPanelTitle.textContent = 'Play Queue';
  rightPanel.classList.add('open');

  rightPanelContent.innerHTML = `
    <div>
      <h4 style="margin-bottom:8px; font-size:14px; color:var(--text-subdued);">Now Playing</h4>
      ${state.currentTrack ? `
        <div class="library-item active" style="margin-bottom:16px;">
          <img src="${state.currentTrack.cover}" class="lib-cover" alt="">
          <div class="lib-info">
            <span class="lib-title" style="color:var(--accent-green);">${state.currentTrack.title}</span>
            <span class="lib-sub">${state.currentTrack.artist}</span>
          </div>
        </div>
      ` : '<div style="color:var(--text-subdued);">Nothing playing</div>'}

      <h4 style="margin-bottom:8px; font-size:14px; color:var(--text-subdued);">Next Up (${state.queue.length} in queue)</h4>
      <div style="display:flex; flex-direction:column; gap:6px;">
        ${state.queue.slice(state.queueIndex + 1).map(track => `
          <div class="library-item" onclick="window.skibidify.playTrackById('${track.id}')">
            <img src="${track.cover}" class="lib-cover" alt="">
            <div class="lib-info">
              <span class="lib-title">${track.title}</span>
              <span class="lib-sub">${track.artist}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// Now Playing Side View
function toggleNowPlayingView() {
  if (state.rightPanelMode === 'nowPlaying' && rightPanel.classList.contains('open')) {
    rightPanel.classList.remove('open');
    state.rightPanelMode = null;
    return;
  }

  state.rightPanelMode = 'nowPlaying';
  rightPanelTitle.textContent = state.currentTrack?.title || 'Now Playing';
  rightPanel.classList.add('open');

  if (!state.currentTrack) {
    rightPanelContent.innerHTML = `<div style="color:var(--text-subdued);">No track selected</div>`;
    return;
  }

  rightPanelContent.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:16px;">
      <img src="${state.currentTrack.cover}" style="width:100%; border-radius:8px; box-shadow:0 8px 24px rgba(0,0,0,0.6);" alt="">
      <div>
        <h2 style="font-size:22px; font-weight:800;">${state.currentTrack.title}</h2>
        <p style="color:var(--text-subdued); font-size:15px;">${state.currentTrack.artist}</p>
      </div>
      <div style="background-color:var(--bg-card); padding:16px; border-radius:8px;">
        <h4 style="font-size:14px; margin-bottom:6px;">Audio Engine</h4>
        <p style="font-size:13px; color:var(--accent-green);">✓ 320kbps High Fidelity Lossless Stream</p>
        <p style="font-size:13px; color:var(--text-subdued); margin-top:4px;">Direct low-latency hardware acceleration</p>
      </div>
    </div>
  `;
}

// Equalizer Presets
const EQ_PRESETS = {
  flat: [0, 0, 0, 0, 0],
  bassBoost: [9, 6, 2, 0, -2],
  trebleBoost: [-2, 0, 2, 6, 8],
  electronic: [6, 4, 0, 3, 5],
  rock: [5, 3, -1, 3, 5],
  vocal: [-3, -1, 5, 4, 1]
};

function applyEqPreset(presetName) {
  const gains = EQ_PRESETS[presetName] || EQ_PRESETS.flat;
  const sliders = document.querySelectorAll('.eq-slider');
  sliders.forEach((slider, i) => {
    slider.value = gains[i];
    if (eqFilters[i]) {
      eqFilters[i].gain.value = gains[i];
    }
  });
}

// Handle Local Music Files Upload (Drag & Drop or File Input)
function uploadLocalFiles(files) {
  Array.from(files).forEach(file => {
    const formData = new FormData();
    formData.append('audio', file);

    showToast(`Uploading ${file.name}...`);

    fetch('/api/upload', {
      method: 'POST',
      body: formData
    })
      .then(res => res.json())
      .then(data => {
        showToast(data.message || 'File uploaded!');
        loadInitialData();
      })
      .catch(err => {
        showToast('Upload failed: ' + err.message);
      });
  });
}

// Drag & Drop onto entire window
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    uploadLocalFiles(e.dataTransfer.files);
  }
});

localFileInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files.length > 0) {
    uploadLocalFiles(e.target.files);
  }
});

btnUploadLocal.addEventListener('click', () => localFileInput.click());

// Load Initial Data
async function loadInitialData() {
  try {
    const [localRes, featuredRes] = await Promise.all([
      fetch('/api/local-tracks'),
      fetch('/api/spotify/featured')
    ]);

    const localData = await localRes.json();
    const featuredData = await featuredRes.json();

    state.localTracks = localData.tracks || [];
    state.featuredPlaylists = featuredData.playlists || [];

    updateLibraryCounts();

    if (state.activeView === 'home') {
      renderHome();
    } else if (state.activeView === 'local') {
      renderLocalTracks();
    }
  } catch (err) {
    console.error('Failed to load initial data:', err);
  }
}

// Global helper methods exposed to window.skibidify
window.skibidify = {
  playTrackById(id) {
    const track = state.localTracks.find(t => t.id === id) ||
                  state.queue.find(t => t.id === id);
    if (track) playTrack(track, state.localTracks);
  },
  playSearchedTrack(id) {
    const track = (window.lastSearchResults || []).find(t => t.id === id);
    if (track) playTrack(track, window.lastSearchResults);
  },
  playAllLocal() {
    if (state.localTracks.length > 0) {
      playTrack(state.localTracks[0], state.localTracks);
    }
  },
  playAllLiked() {
    const liked = state.localTracks.filter(t => state.likedTrackIds.has(t.id));
    if (liked.length > 0) playTrack(liked[0], liked);
  },
  openPlaylist(id) {
    openPlaylist(id);
  },
  renderLocalTracks() {
    renderLocalTracks();
  },
  searchGenre(genre) {
    searchInput.value = genre;
    renderSearch(genre);
  },
  seekLyric(seconds) {
    audio.currentTime = seconds;
  }
};

// Event Listeners for Navigation & Modals
document.getElementById('navHome').addEventListener('click', () => renderHome());
document.getElementById('navSearch').addEventListener('click', () => {
  renderSearch(searchInput.value.trim());
  searchInput.focus();
});
document.getElementById('libLikedSongs').addEventListener('click', () => renderLikedSongs());
document.getElementById('libLocalTracks').addEventListener('click', () => renderLocalTracks());

// Search Input Debouncing
let searchTimeout = null;
searchInput.addEventListener('input', (e) => {
  const q = e.target.value.trim();
  searchClearBtn.style.display = q ? 'block' : 'none';

  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    renderSearch(q);
  }, 350);
});

searchClearBtn.addEventListener('click', () => {
  searchInput.value = '';
  searchClearBtn.style.display = 'none';
  renderSearch('');
});

// Right Panel & Modals
btnCloseRightPanel.addEventListener('click', () => {
  rightPanel.classList.remove('open');
  state.rightPanelMode = null;
});

btnToggleNowPlaying.addEventListener('click', toggleNowPlayingView);
btnToggleLyrics.addEventListener('click', toggleLyricsPanel);
btnToggleQueue.addEventListener('click', toggleQueuePanel);

btnEqualizer.addEventListener('click', () => {
  initAudioContext();
  eqModal.classList.add('open');
});
btnCloseEq.addEventListener('click', () => eqModal.classList.remove('open'));
eqPresetSelect.addEventListener('change', (e) => applyEqPreset(e.target.value));

document.querySelectorAll('.eq-slider').forEach(slider => {
  slider.addEventListener('input', (e) => {
    const bandIdx = parseInt(e.target.dataset.band, 10);
    const val = parseFloat(e.target.value);
    if (eqFilters[bandIdx]) {
      eqFilters[bandIdx].gain.value = val;
    }
  });
});

// Spotify Config Modal
btnOpenSettings.addEventListener('click', () => {
  fetch('/api/spotify/credentials')
    .then(r => r.json())
    .then(data => {
      if (data.configured) {
        spotifyConfigStatus.innerHTML = `<span style="color:var(--accent-green);">✓ Connected to Spotify Web API</span>`;
      } else {
        spotifyConfigStatus.innerHTML = `<span style="color:var(--text-subdued);">No credentials set. Using legal Jamendo + Local PC music playback.</span>`;
      }
      spotifyConfigModal.classList.add('open');
    });
});

btnCloseConfig.addEventListener('click', () => spotifyConfigModal.classList.remove('open'));

btnSaveSpotifyConfig.addEventListener('click', () => {
  const clientId = spotifyClientIdInput.value.trim();
  const clientSecret = spotifyClientSecretInput.value.trim();

  fetch('/api/spotify/credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, clientSecret })
  })
    .then(r => r.json())
    .then(data => {
      showToast('Spotify settings saved!');
      spotifyConfigModal.classList.remove('open');
    });
});

// Create Playlist Action
btnCreatePlaylist.addEventListener('click', () => {
  const name = prompt('Enter a name for your new playlist:', 'My Skibidify Playlist');
  if (name) {
    const newPl = {
      id: `custom-${Date.now()}`,
      name,
      trackCount: 0
    };
    state.customPlaylists.push(newPl);
    localStorage.setItem('skibidify_playlists', JSON.stringify(state.customPlaylists));
    showToast(`Playlist "${name}" created!`);
  }
});

// App Initialization
loadInitialData();
