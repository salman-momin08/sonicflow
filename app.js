/* ==========================================================================
   SONICFLOW CORE APPLICATION LOGIC
   ========================================================================== */

// --- FALLBACK AND CURATED HIGH-QUALITY AUDIO LIBRARY ---
const FALLBACK_LIBRARY = [
    {
        id: "fb_1",
        name: "Abstract Fashion Pop",
        artist: "Alex-Productions",
        album: "Electronic Chill Vol. 1",
        duration: 372,
        audio: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
        audiodownload: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
        image: "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=350&auto=format&fit=crop",
        genre: "electronic"
    },
    {
        id: "fb_2",
        name: "Summer Walk",
        artist: "Olexy",
        album: "Chill Out Sessions",
        duration: 423,
        audio: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
        audiodownload: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
        image: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=350&auto=format&fit=crop",
        genre: "lofi"
    },
    {
        id: "fb_3",
        name: "Inspiring Dream Vibes",
        artist: "Keys of Moon",
        album: "Acoustic Journeys",
        duration: 302,
        audio: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
        audiodownload: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
        image: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=350&auto=format&fit=crop",
        genre: "acoustic"
    },
    {
        id: "fb_4",
        name: "Lofi Study Beats",
        artist: "FASSounds",
        album: "Midnight Coffee",
        duration: 302,
        audio: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
        audiodownload: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
        image: "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?q=80&w=350&auto=format&fit=crop",
        genre: "lofi"
    },
    {
        id: "fb_5",
        name: "Synthwave Journey",
        artist: "Dreamer",
        album: "Cyberpunk Outrun",
        duration: 343,
        audio: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3",
        audiodownload: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3",
        image: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?q=80&w=350&auto=format&fit=crop",
        genre: "synthwave"
    },
    {
        id: "fb_6",
        name: "Ambient Chillout",
        artist: "Sky",
        album: "Cinematic Atmosphere",
        duration: 362,
        audio: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3",
        audiodownload: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3",
        image: "https://images.unsplash.com/photo-1465847899084-d164df4dedc6?q=80&w=350&auto=format&fit=crop",
        genre: "cinematic"
    },
    {
        id: "fb_7",
        name: "Riot Control",
        artist: "Action Rock Squad",
        album: "High Speed Chase",
        duration: 394,
        audio: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3",
        audiodownload: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3",
        image: "https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?q=80&w=350&auto=format&fit=crop",
        genre: "rock"
    }
];

class SonicFlowApp {
    constructor() {
        // App State
        this.currentTrack = null;
        this.playlist = [...FALLBACK_LIBRARY];
        this.history = JSON.parse(localStorage.getItem('sf_downloads_history')) || [];
        this.favorites = JSON.parse(localStorage.getItem('sf_favorites')) || [];
        
        this.isPlaying = false;
        this.isMuted = false;
        this.volumeLevel = 0.8;
        this.isShuffle = false;
        this.isRepeat = 'none'; // 'none' | 'one' | 'all'
        
        this.clientId = localStorage.getItem('sf_jamendo_client_id') || '709fa152';
        this.visualizerStyle = localStorage.getItem('sf_visualizer_style') || 'bars';
        this.theme = localStorage.getItem('sf_theme') || 'theme-royal-glass';
        this.eqPreset = 'flat';
        
        // Audio Element
        this.audio = new Audio();
        this.audio.crossOrigin = "anonymous";
        
        // Web Audio API Nodes
        this.audioContext = null;
        this.mediaSource = null;
        this.analyser = null;
        this.eqBass = null;
        this.eqMid = null;
        this.eqTreble = null;
        
        // Dom Elements Cached
        this.initDomElements();
        
        // Initialize App
        this.initEventListeners();
        this.applyTheme(this.theme);
        this.loadCuratedExplore();
        this.updateLibraryStats();
        
        // Setup Visualizer Canvas Size
        this.resizeVisualizerCanvas();
        window.addEventListener('resize', () => this.resizeVisualizerCanvas());
        
        // Check for shared URL play parameter on startup
        const params = new URLSearchParams(window.location.search);
        const playId = params.get('play');
        if (playId) {
            this.loadSharedTrack(playId);
        }
    }

    initDomElements() {
        // Nav & Sidebar
        this.navItems = document.querySelectorAll('.nav-item');
        this.tabPanels = document.querySelectorAll('.tab-panel');
        this.themeBtn = document.getElementById('theme-btn');
        this.menuToggleBtn = document.querySelector('.menu-toggle-btn');
        this.sidebar = document.querySelector('.sidebar');
        
        // Navigation shortcuts
        this.exploreToSearchBtn = document.getElementById('explore-to-search-btn');
        this.libToSearchBtn1 = document.getElementById('lib-to-search-btn1');
        this.libToSearchBtn2 = document.getElementById('lib-to-search-btn2');

        // Explore Panel elements
        this.genreCards = document.querySelectorAll('.genre-card');
        this.trendingTracksContainer = document.getElementById('trending-tracks-container');
        
        // Search Panel elements
        this.searchInput = document.getElementById('search-input');
        this.searchLimit = document.getElementById('search-limit');
        this.searchSource = document.getElementById('search-source');
        this.downloadQualityPref = document.getElementById('download-quality-pref');
        this.searchTriggerBtn = document.getElementById('search-trigger-btn');
        this.searchResultsContainer = document.getElementById('search-results-container');
        this.searchResultsTitle = document.getElementById('search-results-title');
        
        // Converter Panel elements
        this.converterUrlInput = document.getElementById('converter-url-input');
        this.convertBtn = document.getElementById('convert-btn');
        this.converterFormat = document.getElementById('converter-format');
        this.converterDashboard = document.getElementById('converter-dashboard');
        this.convStatusMessage = document.getElementById('conv-status-message');
        this.convPercentage = document.getElementById('conv-percentage');
        this.convProgressFill = document.getElementById('conv-progress-fill');
        this.convSpeed = document.getElementById('conv-speed');
        this.convEta = document.getElementById('conv-eta');
        this.convSize = document.getElementById('conv-size');
        this.convLogs = document.getElementById('conv-logs');
        this.convSuccessCard = document.getElementById('conv-success-card');
        this.convSuccessTitle = document.getElementById('conv-success-title');
        this.convSuccessMeta = document.getElementById('conv-success-meta');
        this.convDownloadBtn = document.getElementById('conv-download-btn');
        
        // Library Panel elements
        this.libTotalDownloads = document.getElementById('lib-total-downloads');
        this.libTotalFavorites = document.getElementById('lib-total-favorites');
        this.libStorageSaved = document.getElementById('lib-storage-saved');
        this.libNavBtns = document.querySelectorAll('.lib-nav-btn');
        this.libPanels = document.querySelectorAll('.lib-panel');
        this.downloadsContainer = document.getElementById('library-downloads-container');
        this.favoritesContainer = document.getElementById('library-favorites-container');
        
        // Settings Panel elements
        this.themeOptions = document.querySelectorAll('.theme-option');
        this.prefEqToggle = document.getElementById('pref-eq-toggle');
        this.prefBitrate = document.getElementById('pref-bitrate');
        this.prefVisualizerStyle = document.getElementById('pref-visualizer-style');
        this.settingsJamendoKey = document.getElementById('settings-jamendo-key');
        this.saveSettingsBtn = document.getElementById('save-settings-btn');
        
        // Playback Bar elements
        this.playerCover = document.getElementById('player-cover');
        this.playerTitle = document.getElementById('player-title');
        this.playerArtist = document.getElementById('player-artist');
        this.playerFavBtn = document.getElementById('player-fav-btn');
        this.playerShuffleBtn = document.getElementById('player-shuffle');
        this.playerPrevBtn = document.getElementById('player-prev');
        this.playerPlayPauseBtn = document.getElementById('player-play-pause');
        this.playerNextBtn = document.getElementById('player-next');
        this.playerRepeatBtn = document.getElementById('player-repeat');
        this.playerCurrentTime = document.getElementById('player-current-time');
        this.playerDuration = document.getElementById('player-duration');
        this.playerSeeker = document.getElementById('player-seeker');
        this.playerSeekerFill = document.getElementById('player-seeker-fill');
        this.playerSeekerContainer = document.getElementById('player-seeker-container');
        this.visualizerCanvas = document.getElementById('visualizer-canvas');
        this.visualizerToggleBtn = document.getElementById('visualizer-toggle-btn');
        
        // Equalizer Panel elements
        this.eqToggleBtn = document.getElementById('eq-toggle-btn');
        this.eqDropdown = document.getElementById('eq-dropdown');
        this.eqCloseBtn = document.getElementById('eq-close-btn');
        this.eqPresets = document.getElementById('eq-presets');
        this.eqBass = document.getElementById('eq-bass');
        this.eqMid = document.getElementById('eq-mid');
        this.eqTreble = document.getElementById('eq-treble');
        this.eqBassVal = document.getElementById('eq-bass-val');
        this.eqMidVal = document.getElementById('eq-mid-val');
        this.eqTrebleVal = document.getElementById('eq-treble-val');
        
        // Volume Control elements
        this.volumeToggleBtn = document.getElementById('volume-toggle-btn');
        this.volumeSlider = document.getElementById('volume-slider');
        this.volumeFill = document.getElementById('volume-fill');
        this.playerDownloadBtn = document.getElementById('player-download-btn');
    }

    initEventListeners() {
        // Tab switching
        this.navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const tabId = item.getAttribute('data-tab');
                this.switchTab(tabId);
            });
        });
        
        // Navigation Shortcuts
        if (this.exploreToSearchBtn) this.exploreToSearchBtn.addEventListener('click', () => this.switchTab('search'));
        if (this.libToSearchBtn1) this.libToSearchBtn1.addEventListener('click', () => this.switchTab('search'));
        if (this.libToSearchBtn2) this.libToSearchBtn2.addEventListener('click', () => this.switchTab('search'));

        // Menu Toggle (Mobile)
        if (this.menuToggleBtn) {
            this.menuToggleBtn.addEventListener('click', () => {
                this.sidebar.classList.toggle('open');
            });
        }
        
        // Quick Theme Toggle
        if (this.themeBtn) {
            this.themeBtn.addEventListener('click', () => {
                const themes = ['theme-royal-glass', 'theme-neon-cyberpunk', 'theme-obsidian-dark', 'theme-emerald-gold', 'theme-midnight-blue'];
                let currentIdx = themes.indexOf(this.theme);
                let nextIdx = (currentIdx + 1) % themes.length;
                this.applyTheme(themes[nextIdx]);
            });
        }

        // Genre filter click
        this.genreCards.forEach(card => {
            card.addEventListener('click', () => {
                const genre = card.getAttribute('data-genre');
                this.switchTab('search');
                this.searchInput.value = genre;
                this.triggerSearch(genre);
            });
        });

        // Search trigger
        if (this.searchTriggerBtn) {
            this.searchTriggerBtn.addEventListener('click', () => {
                this.triggerSearch(this.searchInput.value);
            });
        }
        if (this.searchInput) {
            this.searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.triggerSearch(this.searchInput.value);
                }
            });
        }

        // Converter
        if (this.convertBtn) {
            this.convertBtn.addEventListener('click', () => {
                const url = this.converterUrlInput.value.trim();
                if (url) {
                    this.startAudioConversion(url);
                } else {
                    alert('Please enter a valid video or media stream link.');
                }
            });
        }

        // Library Sub-tabs
        this.libNavBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.libNavBtns.forEach(b => b.classList.remove('active'));
                this.libPanels.forEach(p => p.classList.remove('active'));
                
                btn.classList.add('active');
                const panelId = `lib-${btn.getAttribute('data-lib-tab')}-panel`;
                document.getElementById(panelId).classList.add('active');
            });
        });

        // Settings themes
        this.themeOptions.forEach(opt => {
            opt.addEventListener('click', () => {
                this.themeOptions.forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                this.applyTheme(opt.getAttribute('data-theme'));
            });
        });
        
        // Save Settings
        if (this.saveSettingsBtn) {
            this.saveSettingsBtn.addEventListener('click', () => {
                this.clientId = this.settingsJamendoKey.value.trim() || '709fa152';
                localStorage.setItem('sf_jamendo_client_id', this.clientId);
                alert('API Configuration updated successfully!');
            });
        }

        // Settings controls links
        if (this.prefEqToggle) {
            this.prefEqToggle.addEventListener('change', (e) => {
                const checked = e.target.checked;
                this.prefEqToggle.checked = checked;
                if (!checked && this.eqBass) {
                    // Reset filters
                    this.updateEQNode('bass', 0);
                    this.updateEQNode('mid', 0);
                    this.updateEQNode('treble', 0);
                    this.eqBass.value = 0;
                    this.eqMid.value = 0;
                    this.eqTreble.value = 0;
                    this.eqBassVal.textContent = "0dB";
                    this.eqMidVal.textContent = "0dB";
                    this.eqTrebleVal.textContent = "0dB";
                    this.eqPresets.value = "flat";
                }
            });
        }
        if (this.prefVisualizerStyle) {
            this.prefVisualizerStyle.addEventListener('change', (e) => {
                this.visualizerStyle = e.target.value;
                localStorage.setItem('sf_visualizer_style', this.visualizerStyle);
            });
        }

        // Share active track
        this.playerShareBtn = document.getElementById('player-share-btn');
        if (this.playerShareBtn) {
            this.playerShareBtn.addEventListener('click', (e) => {
                if (this.currentTrack) {
                    this.shareTrack(e, this.currentTrack.id);
                } else {
                    this.showToast("No Track Active", "Play a track first to share!");
                }
            });
        }

        // --- AUDIO PLAYER CONTROLS ---
        if (this.playerPlayPauseBtn) {
            this.playerPlayPauseBtn.addEventListener('click', () => {
                this.togglePlayPause();
            });
        }
        if (this.playerPrevBtn) {
            this.playerPrevBtn.addEventListener('click', () => this.playPreviousTrack());
        }
        if (this.playerNextBtn) {
            this.playerNextBtn.addEventListener('click', () => this.playNextTrack());
        }
        
        if (this.playerShuffleBtn) {
            this.playerShuffleBtn.addEventListener('click', () => {
                this.isShuffle = !this.isShuffle;
                this.playerShuffleBtn.classList.toggle('active', this.isShuffle);
            });
        }
        
        if (this.playerRepeatBtn) {
            this.playerRepeatBtn.addEventListener('click', () => {
                if (this.isRepeat === 'none') {
                    this.isRepeat = 'all';
                    this.playerRepeatBtn.classList.add('active');
                    this.playerRepeatBtn.innerHTML = '<i class="fa-solid fa-repeat"></i>';
                    this.playerRepeatBtn.title = "Repeat: All";
                } else if (this.isRepeat === 'all') {
                    this.isRepeat = 'one';
                    this.playerRepeatBtn.classList.add('active');
                    this.playerRepeatBtn.innerHTML = '<i class="fa-solid fa-repeat"></i><span style="font-size:0.55rem;position:absolute;bottom:0px;font-weight:900;">1</span>';
                    this.playerRepeatBtn.title = "Repeat: One";
                } else {
                    this.isRepeat = 'none';
                    this.playerRepeatBtn.classList.remove('active');
                    this.playerRepeatBtn.innerHTML = '<i class="fa-solid fa-repeat"></i>';
                    this.playerRepeatBtn.title = "Repeat: Off";
                }
            });
        }

        // Seeker range change
        if (this.playerSeeker) {
            this.playerSeeker.addEventListener('input', (e) => {
                const percent = e.target.value;
                this.playerSeekerFill.style.width = `${percent}%`;
            });
            this.playerSeeker.addEventListener('change', (e) => {
                const percent = e.target.value;
                if (this.audio.duration) {
                    this.audio.currentTime = (percent / 100) * this.audio.duration;
                }
            });
        }

        // Audio element events
        this.audio.addEventListener('timeupdate', () => {
            if (this.audio.duration) {
                const currentTime = this.audio.currentTime;
                const duration = this.audio.duration;
                const percent = (currentTime / duration) * 100;
                this.playerSeeker.value = percent;
                this.playerSeekerFill.style.width = `${percent}%`;
                this.playerCurrentTime.textContent = this.formatTime(currentTime);
                this.playerDuration.textContent = this.formatTime(duration);
            }
        });
        
        this.audio.addEventListener('loadedmetadata', () => {
            this.playerDuration.textContent = this.formatTime(this.audio.duration || 0);
        });

        this.audio.addEventListener('ended', () => {
            if (this.isRepeat === 'one') {
                this.audio.currentTime = 0;
                this.audio.play().catch(e => console.log("Audio play error on repeat:", e));
            } else {
                this.playNextTrack();
            }
        });

        // Favorite current track
        if (this.playerFavBtn) {
            this.playerFavBtn.addEventListener('click', () => {
                if (this.currentTrack) {
                    this.toggleFavorite(this.currentTrack);
                }
            });
        }

        // Active Track Download
        if (this.playerDownloadBtn) {
            this.playerDownloadBtn.addEventListener('click', () => {
                if (this.currentTrack) {
                    this.downloadTrack(this.currentTrack);
                } else {
                    alert('Select a track to download.');
                }
            });
        }

        // --- VOLUME CONTROLS ---
        if (this.volumeSlider) {
            this.volumeSlider.addEventListener('input', (e) => {
                const value = e.target.value;
                this.volumeFill.style.width = `${value}%`;
                this.volumeLevel = value / 100;
                this.audio.volume = this.volumeLevel;
                
                if (this.volumeLevel === 0) {
                    this.isMuted = true;
                    this.volumeToggleBtn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';
                } else if (this.volumeLevel < 0.4) {
                    this.isMuted = false;
                    this.volumeToggleBtn.innerHTML = '<i class="fa-solid fa-volume-low"></i>';
                } else {
                    this.isMuted = false;
                    this.volumeToggleBtn.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
                }
            });
        }

        if (this.volumeToggleBtn) {
            this.volumeToggleBtn.addEventListener('click', () => {
                this.isMuted = !this.isMuted;
                if (this.isMuted) {
                    this.audio.volume = 0;
                    this.volumeToggleBtn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';
                    this.volumeFill.style.width = '0%';
                } else {
                    this.audio.volume = this.volumeLevel;
                    this.volumeToggleBtn.innerHTML = this.volumeLevel < 0.4 ? '<i class="fa-solid fa-volume-low"></i>' : '<i class="fa-solid fa-volume-high"></i>';
                    this.volumeFill.style.width = `${this.volumeLevel * 100}%`;
                }
            });
        }

        // --- EQUALIZER MODAL CONTROLS ---
        if (this.eqToggleBtn) {
            this.eqToggleBtn.addEventListener('click', () => {
                this.eqDropdown.classList.toggle('d-none');
            });
        }
        if (this.eqCloseBtn) {
            this.eqCloseBtn.addEventListener('click', () => {
                this.eqDropdown.classList.add('d-none');
            });
        }

        // Equalizer sliders input
        if (this.eqBass) {
            this.eqBass.addEventListener('input', (e) => {
                const val = e.target.value;
                this.eqBassVal.textContent = (val > 0 ? '+' : '') + val + "dB";
                this.updateEQNode('bass', val);
                this.eqPresets.value = "custom";
            });
        }
        if (this.eqMid) {
            this.eqMid.addEventListener('input', (e) => {
                const val = e.target.value;
                this.eqMidVal.textContent = (val > 0 ? '+' : '') + val + "dB";
                this.updateEQNode('mid', val);
                this.eqPresets.value = "custom";
            });
        }
        if (this.eqTreble) {
            this.eqTreble.addEventListener('input', (e) => {
                const val = e.target.value;
                this.eqTrebleVal.textContent = (val > 0 ? '+' : '') + val + "dB";
                this.updateEQNode('treble', val);
                this.eqPresets.value = "custom";
            });
        }
        
        if (this.eqPresets) {
            this.eqPresets.addEventListener('change', (e) => {
                this.applyEQPreset(e.target.value);
            });
        }

        // Canvas style cycling
        if (this.visualizerToggleBtn) {
            this.visualizerToggleBtn.addEventListener('click', () => {
                const styles = ['bars', 'wave', 'circular', 'none'];
                let currentIdx = styles.indexOf(this.visualizerStyle);
                let nextIdx = (currentIdx + 1) % styles.length;
                this.visualizerStyle = styles[nextIdx];
                
                // Sync select settings
                if (this.prefVisualizerStyle) {
                    this.prefVisualizerStyle.value = this.visualizerStyle;
                }
                localStorage.setItem('sf_visualizer_style', this.visualizerStyle);
            });
        }
    }

    // --- VIEW MANAGEMENT ---
    switchTab(tabId) {
        // Toggle Active Class in Nav links
        this.navItems.forEach(item => {
            if (item.getAttribute('data-tab') === tabId) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
        
        // Close sidebar on mobile
        this.sidebar.classList.remove('open');

        // Toggle Active Class in Panel Views
        this.tabPanels.forEach(panel => {
            if (panel.id === `${tabId}-tab`) {
                panel.classList.add('active');
            } else {
                panel.classList.remove('active');
            }
        });

        // Update main page title header
        const pageTitles = {
            explore: 'Explore Tracks',
            search: 'Search HQ Engine',
            converter: 'Convert Video Links',
            library: 'My Sound Library',
            settings: 'Dashboard Settings'
        };
        document.getElementById('page-title').textContent = pageTitles[tabId] || 'SonicFlow';
        
        // Refresh local contents if switching to My Library
        if (tabId === 'library') {
            this.renderLibraryViews();
        }
    }

    applyTheme(themeName) {
        document.body.className = '';
        document.body.classList.add(themeName);
        this.theme = themeName;
        localStorage.setItem('sf_theme', themeName);
        
        // Update selection states in settings
        this.themeOptions.forEach(opt => {
            if (opt.getAttribute('data-theme') === themeName) {
                opt.classList.add('active');
            } else {
                opt.classList.remove('active');
            }
        });
    }

    // --- CURATED CONTENT STREAM ---
    loadCuratedExplore() {
        this.trendingTracksContainer.innerHTML = '';
        
        FALLBACK_LIBRARY.forEach((track, index) => {
            const row = document.createElement('div');
            row.className = 'track-row';
            row.addEventListener('click', (e) => {
                if (e.target.closest('.btn-icon') || e.target.closest('.btn')) {
                    // Prevent row clicking if download or fav is pressed
                    return;
                }
                this.playTrack(track, FALLBACK_LIBRARY);
            });
            
            const isFav = this.favorites.some(f => f.id === track.id);
            const favIconClass = isFav ? 'fa-solid fa-heart text-pink' : 'fa-regular fa-heart';
            
            row.innerHTML = `
                <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-secondary); text-align: center;">${index + 1}</div>
                <img src="${track.image}" class="track-row-art" alt="${track.name}">
                <div class="track-row-name-artist">
                    <span class="track-name-bold">${track.name}</span>
                    <span class="track-artist-sub">${track.artist}</span>
                </div>
                <div class="track-row-album">${track.album}</div>
                <div class="track-row-actions">
                    <button class="btn-icon" onclick="app.toggleTrackFavorite(event, '${track.id}')" title="Favorite">
                        <i class="${favIconClass}" id="fav-row-icon-${track.id}"></i>
                    </button>
                    <button class="btn-icon" onclick="app.shareTrack(event, '${track.id}')" title="Share Link">
                        <i class="fa-solid fa-share-nodes"></i>
                    </button>
                    <button class="btn btn-outline btn-sm" onclick="app.triggerTrackDownload(event, '${track.id}')">
                        <i class="fa-solid fa-download"></i> HQ
                    </button>
                </div>
            `;
            this.trendingTracksContainer.appendChild(row);
        });
    }

    // --- SEARCH LOGIC (YouTube, Jamendo & Internet Archive integration) ---
    async triggerSearch(query) {
        if (!query || query.trim() === '') {
            this.renderFeaturedSearchSuggestions();
            return;
        }
        
        query = query.trim();
        this.searchResultsTitle.textContent = `Search results for "${query}"`;
        this.searchResultsContainer.innerHTML = `
            <div class="loader-container" style="grid-column: 1 / -1;">
                <div class="spinner"></div>
                <p>Retrieving matching studio audio tracks...</p>
            </div>
        `;
        
        const limit = this.searchLimit.value;
        let source = this.searchSource ? this.searchSource.value : 'youtube';
        
        if (source === 'youtube') {
            const apiURL = `/api/search?q=${encodeURIComponent(query)}&limit=${limit}`;
            try {
                const response = await fetch(apiURL);
                if (!response.ok) throw new Error('API Request Failed');
                
                const data = await response.json();
                if (data.results && data.results.length > 0) {
                    this.playlist = data.results;
                    this.renderSearchResults(data.results);
                } else {
                    this.fallbackLocalSearch(query);
                }
            } catch (error) {
                console.error("YouTube search API error, falling back to Archive...", error);
                source = 'archive';
            }
        }
        
        if (source === 'jamendo') {
            const apiURL = `https://api.jamendo.com/v3.0/tracks/?client_id=${this.clientId}&format=json&limit=${limit}&search=${encodeURIComponent(query)}&include=musicinfo&audioformat=mp32`;
            
            try {
                const response = await fetch(apiURL);
                if (!response.ok) throw new Error('API Request Failed');
                
                const data = await response.json();
                if (data.results && data.results.length > 0) {
                    const mappedTracks = data.results.map(item => ({
                        id: item.id,
                        name: item.name,
                        artist: item.artist_name,
                        album: item.album_name || "Single Release",
                        duration: item.duration,
                        audio: item.audio,
                        audiodownload: item.audiodownload_allowed ? item.audiodownload : item.audio,
                        image: item.image || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=150&auto=format&fit=crop",
                        genre: item.musicinfo ? item.musicinfo.genre : "General"
                    }));
                    
                    this.playlist = mappedTracks;
                    this.renderSearchResults(mappedTracks);
                } else {
                    this.fallbackLocalSearch(query);
                }
            } catch (error) {
                console.error("Jamendo search fetch error. Falling back to local library matching.", error);
                this.fallbackLocalSearch(query);
            }
        } else if (source === 'archive') {
            const archiveUrl = `https://archive.org/advancedsearch.php?q=mediatype:audio AND (title:(${encodeURIComponent(query)}) OR creator:(${encodeURIComponent(query)}) OR ${encodeURIComponent(query)})&fl[]=identifier,title,creator,album,downloads,format&rows=${limit}&output=json`;
            
            try {
                const response = await fetch(archiveUrl);
                if (!response.ok) throw new Error('Archive search request failed');
                
                const data = await response.json();
                if (data.response && data.response.docs && data.response.docs.length > 0) {
                    const mappedTracks = data.response.docs.map(item => ({
                        id: item.identifier,
                        name: item.title || "Archive Recording",
                        artist: item.creator || "Archive Creator",
                        album: item.album || "Archive Collection",
                        duration: 240,
                        audio: "pending",
                        audiodownload: "pending",
                        image: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=150&auto=format&fit=crop",
                        genre: "Audio Archive",
                        isArchive: true
                    }));
                    
                    this.playlist = mappedTracks;
                    this.renderSearchResults(mappedTracks);
                } else {
                    this.fallbackLocalSearch(query);
                }
            } catch (error) {
                console.error("Archive.org search error. Falling back to local search.", error);
                this.fallbackLocalSearch(query);
            }
        }
    }
    
    fallbackLocalSearch(query) {
        const matches = FALLBACK_LIBRARY.filter(track => 
            track.name.toLowerCase().includes(query.toLowerCase()) || 
            track.artist.toLowerCase().includes(query.toLowerCase()) ||
            track.genre.toLowerCase().includes(query.toLowerCase())
        );
        
        if (matches.length > 0) {
            this.playlist = matches;
            this.renderSearchResults(matches);
        } else {
            this.searchResultsContainer.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1; width:100%;">
                    <i class="fa-solid fa-face-frown-open"></i>
                    <h4>No direct matches found</h4>
                    <p>Try searching for words like: 'lofi', 'synthwave', 'rock', 'chill', 'pop'</p>
                </div>
            `;
        }
    }
    
    renderFeaturedSearchSuggestions() {
        this.searchResultsTitle.textContent = "Featured Suggestions";
        this.playlist = [...FALLBACK_LIBRARY];
        this.renderSearchResults(FALLBACK_LIBRARY);
    }
    
    renderSearchResults(tracks) {
        this.searchResultsContainer.innerHTML = '';
        
        tracks.forEach(track => {
            const card = document.createElement('div');
            card.className = 'search-card';
            
            const isPlaying = this.currentTrack && this.currentTrack.id === track.id && this.isPlaying;
            const playBtnIconClass = isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play';
            const playBtnGlowClass = isPlaying ? 'playing' : '';
            
            const isFav = this.favorites.some(f => f.id === track.id);
            const favIconClass = isFav ? 'fa-solid fa-heart text-pink' : 'fa-regular fa-heart';
            
            card.innerHTML = `
                <div class="card-art-wrapper">
                    <img src="${track.image}" class="card-art" alt="${track.name}">
                    <div class="card-play-overlay">
                        <button class="card-play-btn ${playBtnGlowClass}" onclick="app.togglePlayTrackCard(event, '${track.id}')">
                            <i class="${playBtnIconClass}" id="card-play-icon-${track.id}"></i>
                        </button>
                    </div>
                </div>
                
                <div class="card-details">
                    <span class="card-title">${track.name}</span>
                    <span class="card-artist">${track.artist}</span>
                </div>
                
                <div class="card-footer">
                    <span class="card-duration">${this.formatTime(track.duration)}</span>
                    <div class="card-actions">
                        <button class="btn-icon" onclick="app.toggleTrackFavorite(event, '${track.id}')" title="Favorite">
                            <i class="${favIconClass}" id="fav-card-icon-${track.id}"></i>
                        </button>
                        <button class="btn-icon" onclick="app.shareTrack(event, '${track.id}')" title="Share Link">
                            <i class="fa-solid fa-share-nodes"></i>
                        </button>
                        <button class="btn-icon active" onclick="app.triggerTrackDownload(event, '${track.id}')" title="Download MP3">
                            <i class="fa-solid fa-arrow-down"></i>
                        </button>
                    </div>
                </div>
            `;
            
            this.searchResultsContainer.appendChild(card);
        });
    }

    // --- WEB AUDIO API & EQUALIZER SYSTEM ---
    initAudioContext() {
        if (this.audioContext) return;
        
        try {
            // Initialize AudioContext
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.mediaSource = this.audioContext.createMediaElementSource(this.audio);
            
            // Analyser node
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            
            // Equalizer nodes
            this.eqBass = this.audioContext.createBiquadFilter();
            this.eqBass.type = 'lowshelf';
            this.eqBass.frequency.value = 100; // Bass: 100Hz
            
            this.eqMid = this.audioContext.createBiquadFilter();
            this.eqMid.type = 'peaking';
            this.eqMid.Q.value = 1.0;
            this.eqMid.frequency.value = 1000; // Mids: 1kHz
            
            this.eqTreble = this.audioContext.createBiquadFilter();
            this.eqTreble.type = 'highshelf';
            this.eqTreble.frequency.value = 8000; // Treble: 8kHz
            
            // Node connections chain
            // mediaSource -> eqBass -> eqMid -> eqTreble -> analyser -> destination
            this.mediaSource.connect(this.eqBass);
            this.eqBass.connect(this.eqMid);
            this.eqMid.connect(this.eqTreble);
            this.eqTreble.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination);
            
            // Set initial state from equalizer slider values
            this.updateEQNode('bass', document.getElementById('eq-bass').value);
            this.updateEQNode('mid', document.getElementById('eq-mid').value);
            this.updateEQNode('treble', document.getElementById('eq-treble').value);
            
            // Start Visualizer Canvas Rendering Loop
            this.startVisualizerLoop();
        } catch (e) {
            console.error("Failed to initialize Web Audio API:", e);
        }
    }

    updateEQNode(band, value) {
        if (!this.audioContext) return;
        
        const gainVal = parseFloat(value);
        if (band === 'bass' && this.eqBass) {
            this.eqBass.gain.setValueAtTime(gainVal, this.audioContext.currentTime);
        } else if (band === 'mid' && this.eqMid) {
            this.eqMid.gain.setValueAtTime(gainVal, this.audioContext.currentTime);
        } else if (band === 'treble' && this.eqTreble) {
            this.eqTreble.gain.setValueAtTime(gainVal, this.audioContext.currentTime);
        }
    }

    applyEQPreset(presetName) {
        this.eqPreset = presetName;
        const sliders = {
            bass: 0,
            mid: 0,
            treble: 0
        };
        
        switch(presetName) {
            case 'bass':
                sliders.bass = 8;
                sliders.mid = 1;
                sliders.treble = -2;
                break;
            case 'vocal':
                sliders.bass = -3;
                sliders.mid = 7;
                sliders.treble = 3;
                break;
            case 'electronic':
                sliders.bass = 6;
                sliders.mid = -1;
                sliders.treble = 5;
                break;
            case 'acoustic':
                sliders.bass = 3;
                sliders.mid = 3;
                sliders.treble = 4;
                break;
            case 'flat':
            default:
                sliders.bass = 0;
                sliders.mid = 0;
                sliders.treble = 0;
                break;
        }
        
        // Sync sliders & Labels
        document.getElementById('eq-bass').value = sliders.bass;
        document.getElementById('eq-mid').value = sliders.mid;
        document.getElementById('eq-treble').value = sliders.treble;
        
        this.eqBassVal.textContent = (sliders.bass > 0 ? '+' : '') + sliders.bass + "dB";
        this.eqMidVal.textContent = (sliders.mid > 0 ? '+' : '') + sliders.mid + "dB";
        this.eqTrebleVal.textContent = (sliders.treble > 0 ? '+' : '') + sliders.treble + "dB";
        
        // Apply to Web Audio Nodes
        this.updateEQNode('bass', sliders.bass);
        this.updateEQNode('mid', sliders.mid);
        this.updateEQNode('treble', sliders.treble);
    }

    // --- CANVAS DYNAMIC VISUALIZER ---
    resizeVisualizerCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.visualizerCanvas.getBoundingClientRect();
        this.visualizerCanvas.width = rect.width * dpr;
        this.visualizerCanvas.height = rect.height * dpr;
        const ctx = this.visualizerCanvas.getContext('2d');
        ctx.scale(dpr, dpr);
    }

    startVisualizerLoop() {
        const canvas = this.visualizerCanvas;
        const ctx = canvas.getContext('2d');
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        const draw = () => {
            requestAnimationFrame(draw);
            
            const w = canvas.width / (window.devicePixelRatio || 1);
            const h = canvas.height / (window.devicePixelRatio || 1);
            
            ctx.clearRect(0, 0, w, h);
            
            if (this.visualizerStyle === 'none' || !this.isPlaying) {
                // If visualizer is turned off or paused, render a subtle flat resting wave
                ctx.strokeStyle = this.getThemeAccentColor(0.2);
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(0, h / 2);
                ctx.lineTo(w, h / 2);
                ctx.stroke();
                return;
            }

            if (this.visualizerStyle === 'bars') {
                // Frequency Bars style
                this.analyser.getByteFrequencyData(dataArray);
                
                const barWidth = (w / bufferLength) * 2.2;
                let barHeight;
                let x = 0;
                
                const accentColorStr = this.getThemeAccentColor(1.0);
                const secondaryColorStr = this.getThemeAccentSecondaryColor();
                
                for(let i = 0; i < bufferLength; i++) {
                    barHeight = (dataArray[i] / 255) * h;
                    
                    // Create gradient color per bar
                    const gradient = ctx.createLinearGradient(0, h, 0, h - barHeight);
                    gradient.addColorStop(0, accentColorStr);
                    gradient.addColorStop(1, secondaryColorStr);
                    
                    ctx.fillStyle = gradient;
                    ctx.fillRect(x, h - barHeight, barWidth - 1, barHeight);
                    
                    x += barWidth;
                }
            } else if (this.visualizerStyle === 'wave') {
                // Sinusoidal Wave style
                this.analyser.getByteTimeDomainData(dataArray);
                
                ctx.lineWidth = 2.5;
                ctx.strokeStyle = this.getThemeAccentColor(1.0);
                ctx.beginPath();
                
                const sliceWidth = w / bufferLength;
                let x = 0;
                
                for(let i = 0; i < bufferLength; i++) {
                    const v = dataArray[i] / 128.0;
                    const y = (v * h) / 2;
                    
                    if(i === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                    
                    x += sliceWidth;
                }
                
                ctx.lineTo(w, h / 2);
                ctx.stroke();
            } else if (this.visualizerStyle === 'circular') {
                // Radial visualizer
                this.analyser.getByteFrequencyData(dataArray);
                
                const centerX = w / 2;
                const centerY = h / 2;
                const baseRadius = Math.min(centerX, centerY) * 0.35;
                
                // Pulsing central node
                let averageVolume = 0;
                for (let i = 0; i < bufferLength; i++) {
                    averageVolume += dataArray[i];
                }
                averageVolume /= bufferLength;
                const scale = 1 + (averageVolume / 255) * 0.2;
                
                ctx.strokeStyle = this.getThemeAccentColor(0.8);
                ctx.lineWidth = 2;
                
                // Draw circular rays
                const maxRays = 40;
                for (let i = 0; i < maxRays; i++) {
                    const angle = (i / maxRays) * Math.PI * 2;
                    const dataIndex = Math.floor((i / maxRays) * bufferLength * 0.6);
                    const amplitude = (dataArray[dataIndex] / 255.0) * baseRadius * 1.2;
                    
                    const x1 = centerX + Math.cos(angle) * baseRadius * scale;
                    const y1 = centerY + Math.sin(angle) * baseRadius * scale;
                    const x2 = centerX + Math.cos(angle) * (baseRadius * scale + amplitude);
                    const y2 = centerY + Math.sin(angle) * (baseRadius * scale + amplitude);
                    
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.stroke();
                }
                
                // Central circle core
                ctx.fillStyle = this.getThemeAccentColor(0.3);
                ctx.beginPath();
                ctx.arc(centerX, centerY, baseRadius * scale, 0, Math.PI * 2);
                ctx.fill();
            }
        };
        
        draw();
    }
    
    getThemeAccentColor(alpha = 1.0) {
        const computedStyles = getComputedStyle(document.body);
        const rgb = computedStyles.getPropertyValue('--accent-rgb').trim() || "46, 134, 222";
        return `rgba(${rgb}, ${alpha})`;
    }
    
    getThemeAccentSecondaryColor() {
        return getComputedStyle(document.body).getPropertyValue('--accent-secondary').trim() || "#00cec9";
    }

    // --- PLAYBACK ENGINE WORKFLOW ---
    async playTrack(track, list = null) {
        // Instantiate Web Audio context on first user touch
        this.initAudioContext();
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        if (list) {
            this.playlist = list;
        }

        // Lazy-resolve Archive.org track files to get direct audio streams
        if (track.isArchive && track.audio === "pending") {
            const spin = document.createElement('div');
            spin.className = 'loader-container';
            spin.innerHTML = '<div class="spinner"></div><p style="font-size:0.8rem">Resolving stream URL...</p>';
            this.playerTitle.textContent = "Resolving audio link...";
            this.playerArtist.textContent = track.name;
            
            const success = await this.resolveArchiveTrack(track);
            if (!success) {
                this.playerTitle.textContent = "Welcome to SonicFlow";
                this.playerArtist.textContent = "Select a track to start listening";
                return;
            }
        }

        const isNewTrack = !this.currentTrack || this.currentTrack.id !== track.id;
        
        if (isNewTrack) {
            this.currentTrack = track;
            
            // Sync bottom bar details
            this.playerTitle.textContent = track.name;
            this.playerArtist.textContent = track.artist;
            this.playerCover.src = track.image;
            
            // Reset seeker
            this.playerSeeker.value = 0;
            this.playerSeekerFill.style.width = '0%';
            this.playerCurrentTime.textContent = '0:00';
            this.playerDuration.textContent = this.formatTime(track.duration);
            
            // Set source url
            this.audio.src = track.audio;
            this.audio.load();
        }
        
        this.isPlaying = true;
        this.playerPlayPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
        this.playerPlayPauseBtn.title = "Pause";
        
        // Sync favorite heart active icon
        const isFav = this.favorites.some(f => f.id === track.id);
        this.playerFavBtn.innerHTML = isFav ? '<i class="fa-solid fa-heart text-pink"></i>' : '<i class="fa-regular fa-heart"></i>';

        this.audio.play()
            .then(() => {
                this.updatePlayStateInUI();
            })
            .catch(error => {
                console.error("Audio playback error:", error);
                this.isPlaying = false;
                this.playerPlayPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
            });
    }

    togglePlayPause() {
        if (!this.currentTrack) {
            // Play first available track
            if (this.playlist.length > 0) {
                this.playTrack(this.playlist[0]);
            }
            return;
        }

        this.initAudioContext();
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        if (this.isPlaying) {
            this.audio.pause();
            this.isPlaying = false;
            this.playerPlayPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
            this.playerPlayPauseBtn.title = "Play";
        } else {
            this.audio.play()
                .then(() => {
                    this.isPlaying = true;
                    this.playerPlayPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
                    this.playerPlayPauseBtn.title = "Pause";
                })
                .catch(e => console.log("Playback start error:", e));
        }
        
        this.updatePlayStateInUI();
    }

    playNextTrack() {
        if (this.playlist.length === 0) return;
        
        let nextIdx = 0;
        if (this.isShuffle) {
            nextIdx = Math.floor(Math.random() * this.playlist.length);
        } else if (this.currentTrack) {
            const currentIdx = this.playlist.findIndex(t => t.id === this.currentTrack.id);
            if (currentIdx !== -1) {
                nextIdx = (currentIdx + 1) % this.playlist.length;
            }
        }
        
        this.playTrack(this.playlist[nextIdx]);
    }

    playPreviousTrack() {
        if (this.playlist.length === 0) return;
        
        let prevIdx = 0;
        if (this.isShuffle) {
            prevIdx = Math.floor(Math.random() * this.playlist.length);
        } else if (this.currentTrack) {
            const currentIdx = this.playlist.findIndex(t => t.id === this.currentTrack.id);
            if (currentIdx !== -1) {
                prevIdx = (currentIdx - 1 + this.playlist.length) % this.playlist.length;
            }
        }
        
        this.playTrack(this.playlist[prevIdx]);
    }

    updatePlayStateInUI() {
        // Sync play icons across all page tracks
        const cards = document.querySelectorAll('.search-card');
        cards.forEach(card => {
            const playBtn = card.querySelector('.card-play-btn');
            const playIcon = card.querySelector('.card-play-btn i');
            if (!playBtn || !playIcon) return;
            
            const cardId = playIcon.id.replace('card-play-icon-', '');
            if (this.currentTrack && cardId === this.currentTrack.id && this.isPlaying) {
                playBtn.classList.add('playing');
                playIcon.className = 'fa-solid fa-pause';
            } else {
                playBtn.classList.remove('playing');
                playIcon.className = 'fa-solid fa-play';
            }
        });
    }

    togglePlayTrackCard(e, trackId) {
        e.stopPropagation();
        const targetTrack = this.playlist.find(t => t.id === trackId) || FALLBACK_LIBRARY.find(t => t.id === trackId);
        if (!targetTrack) return;
        
        if (this.currentTrack && this.currentTrack.id === trackId) {
            this.togglePlayPause();
        } else {
            this.playTrack(targetTrack);
        }
    }

    // --- FAVORITE LIST MANAGER ---
    toggleTrackFavorite(e, trackId) {
        e.stopPropagation();
        const track = this.playlist.find(t => t.id === trackId) || FALLBACK_LIBRARY.find(t => t.id === trackId);
        if (track) {
            this.toggleFavorite(track);
        }
    }

    toggleFavorite(track) {
        const idx = this.favorites.findIndex(f => f.id === track.id);
        const isFavNow = idx === -1;
        
        if (isFavNow) {
            this.favorites.push(track);
        } else {
            this.favorites.splice(idx, 1);
        }
        
        localStorage.setItem('sf_favorites', JSON.stringify(this.favorites));
        this.updateLibraryStats();
        
        // Update current player bottom bar button class
        if (this.currentTrack && this.currentTrack.id === track.id) {
            this.playerFavBtn.innerHTML = isFavNow ? '<i class="fa-solid fa-heart text-pink"></i>' : '<i class="fa-regular fa-heart"></i>';
        }
        
        // Sync inline UI rows & grids
        const heartIcons = document.querySelectorAll(`#fav-row-icon-${track.id}, #fav-card-icon-${track.id}`);
        heartIcons.forEach(icon => {
            icon.className = isFavNow ? 'fa-solid fa-heart text-pink' : 'fa-regular fa-heart';
        });

        // Re-render library screen if currently viewed
        this.renderLibraryViews();
    }

    // --- DOWNLOADS & STORAGE MANAGER ---
    triggerTrackDownload(e, trackId) {
        e.stopPropagation();
        const track = this.playlist.find(t => t.id === trackId) || FALLBACK_LIBRARY.find(t => t.id === trackId);
        if (track) {
            this.downloadTrack(track);
        }
    }

    async downloadTrack(track) {
        if (track.isYoutube) {
            this.switchTab('converter');
            this.converterUrlInput.value = `https://www.youtube.com/watch?v=${track.id}`;
            this.startAudioConversion(this.converterUrlInput.value);
            return;
        }

        // Lazy-resolve Archive.org track files to get direct audio streams
        if (track.isArchive && track.audio === "pending") {
            const success = await this.resolveArchiveTrack(track);
            if (!success) return;
        }

        const qualityVal = this.downloadQualityPref ? this.downloadQualityPref.value : '320';
        console.log(`Downloading track: ${track.name} at ${qualityVal}kbps...`);
        
        try {
            // Direct browser download mechanism (fetching as blob to preserve naming)
            const response = await fetch(track.audiodownload || track.audio);
            if (!response.ok) throw new Error('Download request failed');
            
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `${track.name} - ${track.artist} (${qualityVal}kbps).mp3`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            // Add to history
            this.addToDownloadsHistory(track, blob.size);
        } catch(error) {
            console.error("Blob download failed, falling back to standard redirect trigger.", error);
            // Secure fallback
            const a = document.createElement('a');
            a.href = track.audiodownload || track.audio;
            a.target = '_blank';
            a.download = `${track.name} - ${track.artist}.mp3`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            // Estimate size (average 6MB)
            this.addToDownloadsHistory(track, 6.2 * 1024 * 1024);
        }
    }

    addToDownloadsHistory(track, byteSize) {
        const downloadObj = {
            id: track.id + '_' + Date.now(),
            trackId: track.id,
            name: track.name,
            artist: track.artist,
            image: track.image,
            duration: track.duration,
            date: new Date().toLocaleDateString(),
            sizeMB: (byteSize / (1024 * 1024)).toFixed(1),
            bitrate: this.prefBitrate ? this.prefBitrate.value : '320'
        };
        
        this.history.unshift(downloadObj);
        localStorage.setItem('sf_downloads_history', JSON.stringify(this.history));
        
        this.updateLibraryStats();
        this.renderLibraryViews();
    }

    updateLibraryStats() {
        this.libTotalFavorites.textContent = this.favorites.length;
        this.libTotalDownloads.textContent = this.history.length;
        
        let totalSize = 0;
        this.history.forEach(item => {
            totalSize += parseFloat(item.sizeMB || 6.2);
        });
        
        this.libStorageSaved.textContent = totalSize.toFixed(1) + " MB";
    }

    renderLibraryViews() {
        // 1. Render downloads list
        this.downloadsContainer.innerHTML = '';
        if (this.history.length === 0) {
            this.downloadsContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-folder-open"></i>
                    <h4>No downloads yet</h4>
                    <p>Tracks you download will appear here for easy access.</p>
                    <button class="btn btn-outline" id="lib-to-search-btn1">Find tracks</button>
                </div>
            `;
            // Re-bind shortcut
            document.getElementById('lib-to-search-btn1').addEventListener('click', () => this.switchTab('search'));
        } else {
            this.history.forEach(item => {
                const row = document.createElement('div');
                row.className = 'track-row';
                
                row.innerHTML = `
                    <div style="text-align: center;"><i class="fa-solid fa-circle-down text-cyan"></i></div>
                    <img src="${item.image}" class="track-row-art" alt="${item.name}">
                    <div class="track-row-name-artist">
                        <span class="track-name-bold">${item.name}</span>
                        <span class="track-artist-sub">${item.artist} | ${item.date}</span>
                    </div>
                    <div class="track-row-album" style="color:var(--accent-secondary);font-weight:700;">HQ ${item.bitrate}kbps | ${item.sizeMB} MB</div>
                    <div class="track-row-actions">
                        <button class="btn btn-outline btn-sm" onclick="app.playDownloadedLibraryTrack('${item.trackId}')">
                            <i class="fa-solid fa-play"></i> Listen
                        </button>
                    </div>
                `;
                this.downloadsContainer.appendChild(row);
            });
        }

        // 2. Render favorites list
        this.favoritesContainer.innerHTML = '';
        if (this.favorites.length === 0) {
            this.favoritesContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-heart"></i>
                    <h4>No favorite tracks</h4>
                    <p>Click the heart icon on any song to save it here.</p>
                    <button class="btn btn-outline" id="lib-to-search-btn2">Find tracks</button>
                </div>
            `;
            // Re-bind shortcut
            document.getElementById('lib-to-search-btn2').addEventListener('click', () => this.switchTab('search'));
        } else {
            this.favorites.forEach((track, index) => {
                const row = document.createElement('div');
                row.className = 'track-row';
                row.addEventListener('click', (e) => {
                    if (e.target.closest('.btn-icon') || e.target.closest('.btn')) return;
                    this.playTrack(track, this.favorites);
                });
                
                row.innerHTML = `
                    <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-secondary); text-align: center;">${index + 1}</div>
                    <img src="${track.image}" class="track-row-art" alt="${track.name}">
                    <div class="track-row-name-artist">
                        <span class="track-name-bold">${track.name}</span>
                        <span class="track-artist-sub">${track.artist}</span>
                    </div>
                    <div class="track-row-album">${track.album}</div>
                    <div class="track-row-actions">
                        <button class="btn-icon" onclick="app.toggleTrackFavorite(event, '${track.id}')" title="Remove Favorite">
                            <i class="fa-solid fa-heart text-pink"></i>
                        </button>
                        <button class="btn btn-outline btn-sm" onclick="app.triggerTrackDownload(event, '${track.id}')">
                            <i class="fa-solid fa-download"></i> HQ
                        </button>
                    </div>
                `;
                this.favoritesContainer.appendChild(row);
            });
        }
    }

    playDownloadedLibraryTrack(trackId) {
        const track = FALLBACK_LIBRARY.find(t => t.id === trackId) || this.favorites.find(t => t.id === trackId);
        if (track) {
            this.playTrack(track);
        } else {
            alert('Audio source file not found.');
        }
    }

    // --- UNIVERSAL URL CONVERTER PIPELINE (YouTube to MP3 via local Python server) ---
    async startAudioConversion(url) {
        // Show conversion panel, reset logs and controls
        this.converterDashboard.classList.remove('d-none');
        this.convSuccessCard.classList.add('d-none');
        this.convLogs.innerHTML = `<div class="log-line text-cyan">> Connecting to local Python Extraction Daemon...</div>`;
        this.updateConvProgress(0, "--", "--", "--");
        
        const format = this.converterFormat.value || 'mp3';
        const bitrate = document.querySelector('input[name="conv-bitrate"]:checked')?.value || '320';
        
        try {
            const res = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: url,
                    bitrate: bitrate,
                    format: format
                })
            });
            
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || 'Backend rejected conversion task.');
            }
            
            const data = await res.json();
            const downloadId = data.download_id;
            
            // Poll progress endpoints
            let loggedLinesCount = 0;
            const progressInterval = setInterval(async () => {
                try {
                    const statusRes = await fetch(`/api/progress/${downloadId}`);
                    if (!statusRes.ok) return;
                    
                    const task = await statusRes.json();
                    
                    // Render logs
                    if (task.logs && task.logs.length > loggedLinesCount) {
                        for (let i = loggedLinesCount; i < task.logs.length; i++) {
                            const line = document.createElement('div');
                            line.className = 'log-line';
                            if (task.logs[i].startsWith('[ERROR]')) line.classList.add('text-red');
                            if (task.logs[i].startsWith('[WARNING]')) line.classList.add('text-yellow');
                            line.textContent = task.logs[i];
                            this.convLogs.appendChild(line);
                        }
                        loggedLinesCount = task.logs.length;
                        this.convLogs.scrollTop = this.convLogs.scrollHeight;
                    }
                    
                    this.updateConvProgress(task.percentage, task.speed, task.eta, task.size_mb);
                    
                    if (task.status === 'completed') {
                        clearInterval(progressInterval);
                        this.finishAudioConversion(task.filename.replace('.mp3', ''), downloadId);
                    } else if (task.status === 'error') {
                        clearInterval(progressInterval);
                        const errLine = document.createElement('div');
                        errLine.className = 'log-line text-red';
                        errLine.textContent = `[ERROR] Extraction failed: ${task.error}`;
                        this.convLogs.appendChild(errLine);
                        this.convStatusMessage.textContent = "Conversion failed.";
                    }
                } catch (pollErr) {
                    console.error("Progress polling error:", pollErr);
                }
            }, 1000);
            
        } catch (err) {
            console.error("Failed to start conversion:", err);
            const errLine = document.createElement('div');
            errLine.className = 'log-line text-red';
            errLine.textContent = `[ERROR] Failed to communicate: ${err.message}`;
            this.convLogs.appendChild(errLine);
            this.convStatusMessage.textContent = "Connection failed.";
        }
    }
    
    updateConvProgress(pct, speed, eta, size) {
        this.convProgressFill.style.width = `${pct}%`;
        this.convPercentage.textContent = `${pct}%`;
        
        if (pct === 0) {
            this.convStatusMessage.textContent = "Connecting to media stream host...";
        } else if (pct < 40) {
            this.convStatusMessage.textContent = "Extracting audio tracks...";
        } else if (pct < 80) {
            this.convStatusMessage.textContent = "Re-encoding container to MP3...";
        } else if (pct < 100) {
            this.convStatusMessage.textContent = "Embedding audio headers...";
        } else {
            this.convStatusMessage.textContent = "Done!";
        }
        
        this.convSpeed.textContent = speed !== "--" ? `${speed}` : "--";
        this.convEta.textContent = eta !== "0" ? `${eta}` : "Completed";
        this.convSize.textContent = `${size}`;
    }
    
    finishAudioConversion(title, downloadId) {
        this.convSuccessTitle.textContent = `"${title}" Extracted!`;
        this.convSuccessMeta.textContent = `High-Quality conversion pipeline ready.`;
        this.convSuccessCard.classList.remove('d-none');
        
        // Hook direct button to retrieve file
        this.convDownloadBtn.onclick = () => {
            const a = document.createElement('a');
            a.href = `/api/retrieve/${downloadId}`;
            a.download = `${title}.mp3`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            // Add track to local history
            this.addToDownloadsHistory({
                id: downloadId,
                name: title,
                artist: "YouTube Extractor",
                image: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=350&auto=format&fit=crop",
                duration: 240
            }, 6.2 * 1024 * 1024);
        };
    }

    // --- INTERNET ARCHIVE LAZY LOAD METADATA RESOLVER ---
    async resolveArchiveTrack(track) {
        if (track.isYoutube) {
            track.audio = `/api/stream?id=${track.id}`;
            track.audiodownload = `/api/stream?id=${track.id}`;
            return true;
        }
        
        if (!track.isArchive || track.audio !== "pending") return true;
        
        try {
            const metaUrl = `https://archive.org/metadata/${track.id}`;
            const response = await fetch(metaUrl);
            if (!response.ok) throw new Error('Metadata fetch failed');
            
            const data = await response.json();
            if (data.files && data.files.length > 0) {
                // Look for the first MP3 file
                const mp3File = data.files.find(f => f.name.toLowerCase().endsWith('.mp3') || (f.format && f.format.includes('MP3')));
                if (mp3File) {
                    track.audio = `https://archive.org/download/${track.id}/${encodeURIComponent(mp3File.name)}`;
                    track.audiodownload = track.audio;
                    
                    // Parse length string (format MM:SS or seconds)
                    if (mp3File.length) {
                        if (mp3File.length.includes(':')) {
                            const parts = mp3File.length.split(':').map(Number);
                            if (parts.length === 2) {
                                track.duration = parts[0] * 60 + parts[1];
                            } else if (parts.length === 3) {
                                track.duration = parts[0] * 3600 + parts[1] * 60 + parts[2];
                            }
                        } else {
                            const secs = parseFloat(mp3File.length);
                            if (!isNaN(secs)) {
                                track.duration = secs;
                            }
                        }
                    }
                    return true;
                }
            }
            throw new Error('No compatible MP3 files found in metadata record');
        } catch (err) {
            console.error("Archive.org track resolve error:", err);
            alert("Could not load direct MP3 from Archive.org. Playing standard track preview.");
            
            // Revert properties so it doesn't fail
            track.audio = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";
            track.audiodownload = track.audio;
            track.isArchive = false;
            return false;
        }
    }

    // --- TIME FORMATTING UTILITIES ---
    formatTime(seconds) {
        if (isNaN(seconds) || seconds === null) return "0:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    // --- SOCIAL SHARING ENGINE ---
    async loadSharedTrack(videoId) {
        try {
            console.log(`Resolving shared track ID: ${videoId}...`);
            const res = await fetch(`/api/info?id=${videoId}`);
            if (!res.ok) throw new Error("Metadata resolve failed");
            
            const track = await res.json();
            this.playlist = [track];
            this.playTrack(track);
            this.showToast("Shared Track Loaded", track.name);
        } catch (err) {
            console.error("Error loading shared track:", err);
            this.showToast("Load Failed", "Could not load shared video metadata.");
        }
    }

    shareTrack(e, trackId) {
        if (e) e.stopPropagation();
        
        // Dynamically build shareable URL using active origin
        const shareUrl = `${window.location.origin}/?play=${trackId}`;
        
        navigator.clipboard.writeText(shareUrl).then(() => {
            this.showToast("Link Copied!", "Share link copied to clipboard");
        }).catch(err => {
            console.error("Failed to copy share link:", err);
            alert(`Copy and share this link: ${shareUrl}`);
        });
    }

    showToast(title, message) {
        let toast = document.getElementById('app-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'app-toast';
            toast.className = 'toast-notification';
            document.body.appendChild(toast);
        }
        toast.innerHTML = `<i class="fa-solid fa-circle-check"></i> <div><strong>${title}</strong>: ${message}</div>`;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
}

// Instantiate App globally for access from HTML event handlers
window.app = new SonicFlowApp();
