/**
 * BirdWatch Heartbeat Module
 * Keeps the user session active across all pages
 */
(function () {
    'use strict';

    const BASE_PATH = '/birdwatch';
    const HEARTBEAT_INTERVAL = 10000;

    let heartbeatTimer = null;

    // Load user info into element with id="user-info"
    async function loadUserInfo() {
        const userInfo = document.getElementById('user-info');
        if (!userInfo) return;

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

    // Send heartbeat to server
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

    function stopHeartbeat() {
        if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
        }
    }

    function handleVisibilityChange() {
        if (document.hidden) {
            stopHeartbeat();
        } else {
            startHeartbeat();
        }
    }

    // Initialize heartbeat on page load
    document.addEventListener('DOMContentLoaded', function () {
        loadUserInfo();
        startHeartbeat();
        document.addEventListener('visibilitychange', handleVisibilityChange);
    });

    // Expose for external use if needed
    window.BirdWatchHeartbeat = {
        start: startHeartbeat,
        stop: stopHeartbeat
    };
})();
