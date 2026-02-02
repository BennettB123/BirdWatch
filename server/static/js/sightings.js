/**
 * BirdWatch Sightings Module
 * Handles sightings gallery functionality
 */
(function () {
    'use strict';

    const BASE_PATH = '/birdwatch';
    const SIGHTINGS_PER_PAGE = 20;

    let currentOffset = 0;
    let totalSightings = 0;

    // Fetch sightings from API
    async function fetchSightings(offset = 0, append = false) {
        try {
            const response = await fetch(`${BASE_PATH}/api/sightings?limit=${SIGHTINGS_PER_PAGE}&offset=${offset}`);
            if (!response.ok) {
                const text = await response.text();
                throw new Error(`HTTP ${response.status}: ${text}`);
            }

            const data = await response.json();
            totalSightings = data.total;
            currentOffset = offset + (data.sightings ? data.sightings.length : 0);

            // Update count
            const countEl = document.getElementById('sightings-count');
            if (countEl) {
                countEl.textContent = `${totalSightings} sighting${totalSightings !== 1 ? 's' : ''} captured`;
            }

            // Render sightings
            renderSightings(data.sightings || [], append);

            // Show/hide load more button
            const loadMoreBtn = document.getElementById('load-more');
            if (loadMoreBtn) {
                loadMoreBtn.style.display = currentOffset < totalSightings ? 'block' : 'none';
            }
        } catch (error) {
            console.error('Failed to fetch sightings:', error);
            const grid = document.getElementById('sightings-grid');
            if (grid) {
                grid.innerHTML = '<div class="empty-state"><h2>Failed to load sightings</h2><p>Please try again later.</p></div>';
            }
        }
    }

    // Render sightings grid
    function renderSightings(sightings, append = false) {
        const grid = document.getElementById('sightings-grid');
        if (!grid) return;

        if (!append) {
            grid.innerHTML = '';
        }

        if (sightings.length === 0 && !append) {
            grid.innerHTML = `
                <div class="empty-state">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M16 7h.01"/>
                        <path d="M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20"/>
                        <path d="m20 7 2 .5-2 .5"/>
                        <path d="M10 18v3"/>
                        <path d="M14 17.75V21"/>
                        <path d="M7 18a6 6 0 0 0 3.84-10.61"/>
                    </svg>
                    <h2>No sightings yet</h2>
                    <p>Sightings will appear here when birds are detected.</p>
                </div>
            `;
            return;
        }

        sightings.forEach(sighting => {
            const card = document.createElement('div');
            card.className = 'sighting-card';

            const timestamp = new Date(sighting.timestamp);
            const timeStr = timestamp.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
            const dateStr = timestamp.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });

            const imageUrl = `${BASE_PATH}/api/sightings/images/${sighting.image_path}`;

            card.innerHTML = `
                <div class="sighting-image-container" onclick="openLightbox('${imageUrl}', '${timeStr}', '${dateStr}')">
                    <img class="sighting-image" src="${imageUrl}" alt="Bird sighting" loading="lazy">
                </div>
                <div class="sighting-info">
                    <div class="sighting-timestamp">${timeStr}</div>
                    <div class="sighting-date">${dateStr}</div>
                </div>
            `;

            grid.appendChild(card);
        });
    }

    // Lightbox functions
    window.openLightbox = function (imageUrl, time, date) {
        const lightbox = document.getElementById('lightbox');
        const lightboxImage = document.getElementById('lightbox-image');
        const lightboxInfo = document.getElementById('lightbox-info');

        if (lightboxImage) lightboxImage.src = imageUrl;
        if (lightboxInfo) lightboxInfo.textContent = `${time} - ${date}`;
        if (lightbox) {
            lightbox.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    };

    window.closeLightbox = function () {
        const lightbox = document.getElementById('lightbox');
        if (lightbox) {
            lightbox.classList.remove('active');
            document.body.style.overflow = '';
        }
    };

    // Initialize on DOM ready
    document.addEventListener('DOMContentLoaded', function () {
        // Close lightbox on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeLightbox();
        });

        // Close lightbox on background click
        const lightbox = document.getElementById('lightbox');
        if (lightbox) {
            lightbox.addEventListener('click', (e) => {
                if (e.target.id === 'lightbox') closeLightbox();
            });
        }

        // Load more button
        const loadMoreBtn = document.getElementById('load-more');
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', () => {
                fetchSightings(currentOffset, true);
            });
        }

        // Initial fetch
        fetchSightings();
    });
})();
