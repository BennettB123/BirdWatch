(function() {
    'use strict';

    const BASE_PATH = '/birdwatch';
    const HEARTBEAT_INTERVAL = 10000;
    const RETRY_INTERVAL = 5000;
    const LIVE_THRESHOLD = 6; // seconds - consider "live" if within this threshold

    let hls = null;
    let heartbeatTimer = null;
    let retryTimer = null;
    let controlsTimeout = null;
    let isPlaying = false;
    let isSeeking = false;

    // Playlist info from HLS.js
    let playlistStart = 0;
    let playlistEnd = 0;
    let playlistDuration = 0;
    let lastSegmentStart = 0;
    let segmentDuration = 4;

    // DOM Elements
    const video = document.getElementById('video');
    const statusOverlay = document.getElementById('status-overlay');
    const statusMessage = document.getElementById('status-message');
    const statusIndicator = document.querySelector('.status-indicator');
    const statusText = document.getElementById('status-text');
    const userInfo = document.getElementById('user-info');
    const qualityInfo = document.getElementById('quality-info');
    const videoWrapper = document.getElementById('video-wrapper');
    const playerControls = document.getElementById('player-controls');

    // Control elements
    const playPauseBtn = document.getElementById('play-pause-btn');
    const liveBtn = document.getElementById('live-btn');
    const timeBehind = document.getElementById('time-behind');
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    const progressPlayed = document.getElementById('progress-played');
    const progressBuffered = document.getElementById('progress-buffered');
    const progressHandle = document.getElementById('progress-handle');
    const progressTooltip = document.getElementById('progress-tooltip');

    // Load user info
    async function loadUserInfo() {
        try {
            const response = await fetch(BASE_PATH + '/api/user');
            if (response.ok) {
                const user = await response.json();
                userInfo.textContent = user.name || user.email || '';
            }
        } catch (err) {
            console.error('Failed to load user info:', err);
        }
    }

    // Heartbeat
    async function sendHeartbeat() {
        try {
            const response = await fetch(BASE_PATH + '/api/user/heartbeat', {
                method: 'POST',
                credentials: 'same-origin'
            });
            if (!response.ok && response.status === 401) {
                window.location.href = BASE_PATH + '/';
            }
        } catch (err) {
            console.error('Heartbeat failed:', err);
        }
    }

    function startHeartbeat() {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        sendHeartbeat();
        heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
    }

    // Stream status display
    function setStreamStatus(online, message) {
        if (online) {
            statusIndicator.classList.remove('offline');
            statusIndicator.classList.add('online');
            statusText.textContent = message || 'Live';
        } else {
            statusIndicator.classList.remove('online');
            statusIndicator.classList.add('offline');
            statusText.textContent = message || 'Offline';
        }
    }

    function showOverlay(message) {
        statusMessage.textContent = message;
        statusOverlay.style.display = 'flex';
    }

    function hideOverlay() {
        statusOverlay.style.display = 'none';
    }

    // Format time as M:SS
    function formatTime(seconds) {
        if (!isFinite(seconds) || seconds < 0) seconds = 0;
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return m + ':' + String(s).padStart(2, '0');
    }

    // Get how far behind live edge we are
    function getLiveOffset() {
        if (playlistEnd <= 0) return 0;
        return playlistEnd - video.currentTime;
    }

    // Check if we're considered "live"
    function isLive() {
        return getLiveOffset() <= LIVE_THRESHOLD;
    }

    // Update live button and time behind display
    function updateLiveIndicator() {
        const live = isLive();
        const offset = Math.round(getLiveOffset());

        if (live) {
            liveBtn.classList.add('is-live');
            timeBehind.classList.remove('visible');
            timeBehind.textContent = '';
        } else {
            liveBtn.classList.remove('is-live');
            timeBehind.textContent = '-' + formatTime(offset);
            timeBehind.classList.add('visible');
        }
    }

    // Update progress bar
    function updateProgress() {
        if (isSeeking || playlistDuration <= 0) return;

        const live = isLive();

        // When live, lock scrubber to the right edge (100%)
        let displayProgress;
        if (live) {
            displayProgress = 1;
        } else {
            displayProgress = (video.currentTime - playlistStart) / playlistDuration;
            displayProgress = Math.max(0, Math.min(1, displayProgress));
        }

        progressPlayed.style.width = (displayProgress * 100) + '%';
        progressHandle.style.left = (displayProgress * 100) + '%';

        // Show buffered range
        if (video.buffered && video.buffered.length > 0) {
            const bufferedEnd = video.buffered.end(video.buffered.length - 1);
            const bufferedProgress = (bufferedEnd - playlistStart) / playlistDuration;
            progressBuffered.style.width = (Math.min(1, bufferedProgress) * 100) + '%';
        }

        updateLiveIndicator();
    }

    // Update play/pause button state
    function updatePlayPauseButton() {
        if (video.paused) {
            playPauseBtn.classList.remove('is-playing');
        } else {
            playPauseBtn.classList.add('is-playing');
        }
    }

    // Update fullscreen button state
    function updateFullscreenButton() {
        const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement;
        if (isFullscreen) {
            fullscreenBtn.classList.add('is-fullscreen');
            videoWrapper.classList.add('is-fullscreen');
        } else {
            fullscreenBtn.classList.remove('is-fullscreen');
            videoWrapper.classList.remove('is-fullscreen');
        }
    }

    // Control visibility
    function showControls() {
        playerControls.classList.add('visible');
        videoWrapper.classList.add('controls-visible');
        clearTimeout(controlsTimeout);
        if (!video.paused) {
            controlsTimeout = setTimeout(hideControls, 3000);
        }
    }

    function hideControls() {
        if (!video.paused && !isSeeking) {
            playerControls.classList.remove('visible');
            videoWrapper.classList.remove('controls-visible');
        }
    }

    // Seek to position
    function seekToPosition(clientX) {
        if (playlistDuration <= 0) return;

        const rect = progressBar.getBoundingClientRect();
        let pos = (clientX - rect.left) / rect.width;
        pos = Math.max(0, Math.min(1, pos));

        const seekTime = playlistStart + pos * playlistDuration;
        video.currentTime = seekTime;

        progressPlayed.style.width = (pos * 100) + '%';
        progressHandle.style.left = (pos * 100) + '%';
        updateLiveIndicator();
    }

    // Show tooltip at position
    function showTooltip(clientX) {
        if (playlistDuration <= 0) return;

        const rect = progressBar.getBoundingClientRect();
        let pos = (clientX - rect.left) / rect.width;
        pos = Math.max(0, Math.min(1, pos));

        const time = playlistStart + pos * playlistDuration;
        const offset = playlistEnd - time;

        if (offset <= LIVE_THRESHOLD) {
            progressTooltip.textContent = 'Live';
        } else {
            progressTooltip.textContent = '-' + formatTime(offset);
        }

        progressTooltip.style.left = (pos * 100) + '%';
        progressTooltip.classList.add('visible');
    }

    function hideTooltip() {
        progressTooltip.classList.remove('visible');
    }

    // Go to live edge (beginning of latest segment)
    function goToLive() {
        if (lastSegmentStart > 0) {
            video.currentTime = lastSegmentStart;
        } else if (playlistEnd > 0) {
            video.currentTime = Math.max(playlistStart, playlistEnd - segmentDuration);
        }
        if (video.paused) {
            video.play().catch(function() {});
        }
    }

    // Toggle play/pause
    function togglePlayPause() {
        if (video.paused) {
            video.play().catch(function() {});
        } else {
            video.pause();
        }
    }

    // Toggle fullscreen
    function toggleFullscreen() {
        if (document.fullscreenElement || document.webkitFullscreenElement) {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            }
        } else {
            if (videoWrapper.requestFullscreen) {
                videoWrapper.requestFullscreen();
            } else if (videoWrapper.webkitRequestFullscreen) {
                videoWrapper.webkitRequestFullscreen();
            }
        }
    }

    // Initialize control event listeners
    function initControls() {
        // Play/pause
        playPauseBtn.addEventListener('click', togglePlayPause);
        video.addEventListener('click', function(e) {
            if (e.target === video) {
                togglePlayPause();
            }
        });

        // Live button
        liveBtn.addEventListener('click', goToLive);

        // Fullscreen
        fullscreenBtn.addEventListener('click', toggleFullscreen);
        video.addEventListener('dblclick', toggleFullscreen);

        // Progress bar - mouse events
        progressContainer.addEventListener('mousedown', function(e) {
            isSeeking = true;
            seekToPosition(e.clientX);
            showTooltip(e.clientX);
        });

        document.addEventListener('mousemove', function(e) {
            if (isSeeking) {
                seekToPosition(e.clientX);
                showTooltip(e.clientX);
            }
        });

        document.addEventListener('mouseup', function() {
            if (isSeeking) {
                isSeeking = false;
                hideTooltip();
            }
        });

        progressContainer.addEventListener('mousemove', function(e) {
            if (!isSeeking) {
                showTooltip(e.clientX);
            }
        });

        progressContainer.addEventListener('mouseleave', function() {
            if (!isSeeking) {
                hideTooltip();
            }
        });

        // Progress bar - touch events
        progressContainer.addEventListener('touchstart', function(e) {
            isSeeking = true;
            const touch = e.touches[0];
            seekToPosition(touch.clientX);
            showTooltip(touch.clientX);
            e.preventDefault();
        }, { passive: false });

        document.addEventListener('touchmove', function(e) {
            if (isSeeking && e.touches.length > 0) {
                const touch = e.touches[0];
                seekToPosition(touch.clientX);
                showTooltip(touch.clientX);
            }
        }, { passive: true });

        document.addEventListener('touchend', function() {
            if (isSeeking) {
                isSeeking = false;
                hideTooltip();
            }
        });

        // Video state events
        video.addEventListener('play', updatePlayPauseButton);
        video.addEventListener('pause', updatePlayPauseButton);
        video.addEventListener('timeupdate', updateProgress);

        // Fullscreen change
        document.addEventListener('fullscreenchange', updateFullscreenButton);
        document.addEventListener('webkitfullscreenchange', updateFullscreenButton);

        // Show/hide controls
        videoWrapper.addEventListener('mousemove', showControls);
        videoWrapper.addEventListener('mouseenter', showControls);
        videoWrapper.addEventListener('mouseleave', function() {
            if (!isSeeking) hideControls();
        });

        // Mobile: tap to toggle controls
        let lastTap = 0;
        videoWrapper.addEventListener('touchstart', function(e) {
            const now = Date.now();
            const timeSinceLastTap = now - lastTap;
            lastTap = now;

            // Ignore if tapping on controls
            if (e.target.closest('.player-controls')) return;

            // Double tap for fullscreen
            if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
                toggleFullscreen();
                return;
            }

            // Single tap to toggle controls
            if (playerControls.classList.contains('visible')) {
                hideControls();
            } else {
                showControls();
            }
        }, { passive: true });

        // Keyboard controls
        document.addEventListener('keydown', function(e) {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            switch (e.key) {
                case ' ':
                case 'k':
                    e.preventDefault();
                    togglePlayPause();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    if (playlistDuration > 0) {
                        let newTime = video.currentTime - 5;
                        newTime = Math.max(playlistStart, newTime);
                        video.currentTime = newTime;
                    }
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    if (playlistDuration > 0) {
                        let newTime = video.currentTime + 5;
                        newTime = Math.min(playlistEnd, newTime);
                        video.currentTime = newTime;
                    }
                    break;
                case 'f':
                    toggleFullscreen();
                    break;
            }
            showControls();
        });

        // Initial states
        updatePlayPauseButton();
        showControls();
    }

    // Initialize HLS player
    function initPlayer() {
        const streamUrl = BASE_PATH + '/api/stream/playlist.m3u8';

        if (Hls.isSupported()) {
            if (hls) hls.destroy();

            hls = new Hls({
                enableWorker: true,
                lowLatencyMode: true,
                backBufferLength: 90,
                liveSyncDurationCount: 3,
                liveMaxLatencyDurationCount: 99999  // Effectively disable auto-seek to live edge
            });

            hls.loadSource(streamUrl);
            hls.attachMedia(video);

            hls.on(Hls.Events.MANIFEST_PARSED, function() {
                hideOverlay();
                setStreamStatus(true);
                isPlaying = true;
                video.play().catch(function() {});
            });

            hls.on(Hls.Events.ERROR, function(event, data) {
                if (data.fatal) {
                    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                        handleNetworkError();
                    } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                        hls.recoverMediaError();
                    } else {
                        scheduleRetry();
                    }
                }
            });

            hls.on(Hls.Events.LEVEL_LOADED, function(event, data) {
                const level = hls.levels[data.level];
                if (level && level.width && level.height) {
                    qualityInfo.textContent = level.width + 'x' + level.height;
                }

                // Extract playlist fragment info
                const details = data.details;
                if (details && details.fragments && details.fragments.length > 0) {
                    const fragments = details.fragments;
                    const firstFrag = fragments[0];
                    const lastFrag = fragments[fragments.length - 1];

                    playlistStart = firstFrag.start;
                    playlistEnd = lastFrag.start + lastFrag.duration;
                    playlistDuration = playlistEnd - playlistStart;
                    lastSegmentStart = lastFrag.start;
                    segmentDuration = lastFrag.duration;
                }
            });

        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = streamUrl;
            video.addEventListener('loadedmetadata', function() {
                hideOverlay();
                setStreamStatus(true);
                isPlaying = true;
                video.play().catch(function() {});
            });
            video.addEventListener('error', handleNetworkError);
        } else {
            showOverlay('HLS is not supported in your browser');
            setStreamStatus(false, 'Unsupported');
        }
    }

    function handleNetworkError() {
        isPlaying = false;
        setStreamStatus(false, 'Waiting for stream');
        showOverlay('Waiting for stream to start...');
        scheduleRetry();
    }

    function scheduleRetry() {
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = setTimeout(function() {
            initPlayer();
        }, RETRY_INTERVAL);
    }

    function handleVisibilityChange() {
        if (document.hidden) {
            if (heartbeatTimer) {
                clearInterval(heartbeatTimer);
                heartbeatTimer = null;
            }
        } else {
            startHeartbeat();
            if (!isPlaying) initPlayer();
        }
    }

    function cleanup() {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (retryTimer) clearTimeout(retryTimer);
        if (hls) hls.destroy();
    }

    // Initialize
    document.addEventListener('DOMContentLoaded', function() {
        loadUserInfo();
        startHeartbeat();
        initControls();
        initPlayer();

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('beforeunload', cleanup);
    });
})();
