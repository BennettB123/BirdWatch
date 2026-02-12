/**
 * BirdWatch Player Module
 * Handles video player functionality using Shaka Player
 */
(function () {
    'use strict';

    const BASE_PATH = '/birdwatch';

    let player = null;
    let ui = null;

    // DOM Elements
    const video = document.getElementById('video');
    const videoContainer = document.getElementById('video-container');
    const streamWaiting = document.getElementById('stream-waiting');
    const streamDowntime = document.getElementById('stream-downtime');
    const downtimeEndTime = document.getElementById('downtime-end-time');

    let isDowntime = false;

    // Show/hide waiting indicator
    function showWaiting() {
        if (streamWaiting) {
            streamWaiting.classList.remove('hidden');
            streamWaiting.classList.add('flex');
        }
    }

    function hideWaiting() {
        if (streamWaiting) {
            streamWaiting.classList.add('hidden');
            streamWaiting.classList.remove('flex');
        }
    }

    function showDowntime(endTime) {
        isDowntime = true;
        if (downtimeEndTime && endTime) {
            downtimeEndTime.textContent = endTime;
        }
        if (streamDowntime) {
            streamDowntime.classList.remove('hidden');
            streamDowntime.classList.add('flex');
        }
        // Hide the spinner since we're showing the downtime banner instead
        if (streamWaiting) {
            streamWaiting.classList.add('hidden');
            streamWaiting.classList.remove('flex');
        }
    }

    function hideDowntime() {
        isDowntime = false;
        if (streamDowntime) {
            streamDowntime.classList.add('hidden');
            streamDowntime.classList.remove('flex');
        }
    }

    // Custom Rewind Button
    class RewindButton extends shaka.ui.Element {
        constructor(parent, controls) {
            super(parent, controls);

            this.button_ = document.createElement('button');
            this.button_.classList.add('shaka-rewind-button');
            this.button_.classList.add('material-icons-round');
            this.button_.textContent = 'replay_5';
            this.button_.ariaLabel = 'Rewind 5 seconds';
            this.parent.appendChild(this.button_);

            this.eventManager.listen(this.button_, 'click', () => {
                this.video.currentTime = Math.max(0, this.video.currentTime - 5);
            });
        }
    }

    RewindButton.Factory = class {
        create(rootElement, controls) {
            return new RewindButton(rootElement, controls);
        }
    };

    // Custom Fast Forward Button
    class FastForwardButton extends shaka.ui.Element {
        constructor(parent, controls) {
            super(parent, controls);

            this.button_ = document.createElement('button');
            this.button_.classList.add('shaka-fast-forward-button');
            this.button_.classList.add('material-icons-round');
            this.button_.textContent = 'forward_5';
            this.button_.ariaLabel = 'Fast forward 5 seconds';
            this.parent.appendChild(this.button_);

            this.eventManager.listen(this.button_, 'click', () => {
                this.video.currentTime = Math.min(this.video.duration || Infinity, this.video.currentTime + 5);
            });
        }
    }

    FastForwardButton.Factory = class {
        create(rootElement, controls) {
            return new FastForwardButton(rootElement, controls);
        }
    };

    // Initialize Shaka Player with UI
    function initPlayer() {
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

        // Register custom UI elements
        shaka.ui.Controls.registerElement('rewind', new RewindButton.Factory());
        shaka.ui.Controls.registerElement('fast_forward', new FastForwardButton.Factory());

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
                'rewind',
                'fast_forward',
                'time_and_duration',
                'spacer',
                'picture_in_picture',
                'fullscreen',
            ],
        };

        ui.configure(uiConfig);

        if (ui.isMobile()) {
            ui.configure({ fadeDelay: 2 });
        }

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

        // Hide waiting indicator when video plays
        video.addEventListener('playing', function () {
            hideWaiting();
        });

        // Show waiting indicator when video is waiting/stalled
        video.addEventListener('waiting', function () {
            showWaiting();
        });

        // Handle errors - reload the player after a delay
        player.addEventListener('error', function (event) {
            const error = event.detail;
            console.error('Shaka error:', error);

            // If we get a critical error, try to reload after a delay
            if (error.severity === shaka.util.Error.Severity.CRITICAL) {
                console.log('Critical error, will attempt reload in 5 seconds...');
                showWaiting();
                setTimeout(function () {
                    reloadPlayer();
                }, 5000);
            }
        });

        // Check for downtime before loading
        checkDowntimeAndLoad(streamUrl);
    }

    // Check if stream is in downtime, and only load when it's not
    async function checkDowntimeAndLoad(streamUrl) {
        try {
            const response = await fetch(streamUrl);
            if (response.status === 503) {
                const data = await response.json();
                if (data.error === 'stream_downtime') {
                    showDowntime(data.downtime_end);
                    setTimeout(() => checkDowntimeAndLoad(streamUrl), 30000);
                    return;
                }
            }
        } catch (e) {
            // Network error or non-JSON response, fall through to normal load
        }

        hideDowntime();
        player.load(streamUrl).catch(function (error) {
            console.error('Load failed:', error);
            showWaiting();
        });
    }

    // Reload the player (destroys and recreates)
    async function reloadPlayer() {
        console.log('Reloading player...');
        if (player) {
            try {
                await player.unload();
            } catch (e) {
                console.error('Error unloading player:', e);
            }
        }

        const streamUrl = BASE_PATH + '/api/stream/playlist.m3u8';
        await checkDowntimeAndLoad(streamUrl);
    }

    function cleanup() {
        if (player) player.destroy();
    }

    // Initialize
    document.addEventListener('DOMContentLoaded', function () {
        initPlayer();
        window.addEventListener('beforeunload', cleanup);
    });
})();
