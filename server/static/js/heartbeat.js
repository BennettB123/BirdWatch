/**
 * BirdWatch Heartbeat Module
 * Keeps the user session active across all pages
 */
(function () {
    'use strict';

    const BASE_PATH = '/birdwatch';
    const HEARTBEAT_INTERVAL = 10000;

    let heartbeatTimer = null;
    let currentUserRole = null;

    // Load user info into element with id="user-info"
    async function loadUserInfo() {
        const userInfo = document.getElementById('user-info');

        try {
            const response = await fetch(BASE_PATH + '/api/user');
            if (response.status === 401) {
                window.location.href = BASE_PATH + '/';
                return;
            }
            if (response.ok) {
                const user = await response.json();
                currentUserRole = user.role || 'user';

                // Show/hide admin link based on role
                const adminLink = document.getElementById('admin-nav-link');
                if (adminLink) {
                    if (currentUserRole === 'admin') {
                        adminLink.classList.remove('hidden');
                    } else {
                        adminLink.classList.add('hidden');
                    }
                }

                // Dispatch event so other modules can react to user info loaded
                window.dispatchEvent(new CustomEvent('birdwatch:userloaded', { detail: user }));

                if (!userInfo) return;

                if (user.picture) {
                    // Create profile picture element
                    const img = document.createElement('img');
                    img.src = user.picture;
                    img.alt = user.name || user.email || 'Profile';
                    img.title = user.name || user.email || '';
                    img.className = 'w-8 h-8 min-w-[32px] min-h-[32px] max-w-[32px] max-h-[32px] rounded-full object-cover flex-shrink-0';
                    img.width = 32;
                    img.height = 32;
                    userInfo.innerHTML = '';
                    userInfo.appendChild(img);
                } else {
                    userInfo.textContent = user.name || user.email || '';
                }
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

    // Expose user role info globally
    window.BirdWatchUser = {
        isAdmin: function () {
            return currentUserRole === 'admin';
        },
        getRole: function () {
            return currentUserRole;
        }
    };
})();
