(function() {
    'use strict';

    const BASE_PATH = '/birdwatch';
    const HEARTBEAT_INTERVAL = 10000;
    const RETRY_INTERVAL = 5000;

    let player = null;
    let ui = null;
    let heartbeatTimer = null;
    let retryTimer = null;

    // DOM Elements
    const video = document.getElementById('video');
    const videoContainer = document.getElementById('video-container');
    const userInfo = document.getElementById('user-info');
    const streamWaiting = document.getElementById('stream-waiting');

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

    // Show/hide waiting indicator
    function showWaiting() {
        console.log('[DEBUG] showWaiting() called');
        if (streamWaiting) {
            streamWaiting.classList.remove('hidden');
            console.log('[DEBUG] Waiting indicator shown');
        }
    }

    function hideWaiting() {
        console.log('[DEBUG] hideWaiting() called');
        if (streamWaiting) {
            streamWaiting.classList.add('hidden');
            console.log('[DEBUG] Waiting indicator hidden');
        }
    }

    // Initialize Shaka Player with UI
    function initPlayer() {
        console.log('[DEBUG] initPlayer() called');
        const streamUrl = BASE_PATH + '/api/stream/playlist.m3u8';

        // Show waiting indicator
        showWaiting();

        // Install Shaka polyfills
        shaka.polyfill.installAll();

        // Check if browser is supported
        if (!shaka.Player.isBrowserSupported()) {
            console.error('Browser not supported');
            return;
        }

        // Create new Shaka Player and attach to video element
        player = new shaka.Player(video);

        // Create UI with default controls
        ui = new shaka.ui.Overlay(player, videoContainer, video);

        // Configure UI
        const uiConfig = {
            addSeekBar: true,
            addBigPlayButton: true,
            controlPanelElements: [
                'play_pause',
                'time_and_duration',
                'spacer',
								'picture_in_picture',
                'fullscreen',
            ],
            fadeDelay: 3,
        };
        ui.configure(uiConfig);

        // Configure player with retry parameters for both manifest and segments
        player.configure({
            manifest: {
                retryParameters: {
                    timeout: 30000,
                    baseDelay: 1000,
                    maxAttempts: Infinity,
                }
            },
            streaming: {
                bufferingGoal: 30,
                rebufferingGoal: 2,
                bufferBehind: 90,
                lowLatencyMode: true,
                retryParameters: {
                    timeout: 30000,
                    baseDelay: 500,
                    maxAttempts: Infinity,
                }
            }
        });

        // Hide waiting indicator when stream loads
        video.addEventListener('loadeddata', function() {
            console.log('[DEBUG] Stream loaded successfully');
            hideWaiting();
        }, { once: true });

        // Load the stream - Shaka will handle retries automatically
        player.load(streamUrl).catch(function(error) {
            console.log('[DEBUG] Load failed after all retries:', error);
        });
    }

    function handleVisibilityChange() {
        if (document.hidden) {
            if (heartbeatTimer) {
                clearInterval(heartbeatTimer);
                heartbeatTimer = null;
            }
        } else {
            startHeartbeat();
        }
    }

    function cleanup() {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (player) player.destroy();
    }

    // Initialize
    document.addEventListener('DOMContentLoaded', function() {
        loadUserInfo();
        startHeartbeat();
        initPlayer();

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('beforeunload', cleanup);
    });
})();
