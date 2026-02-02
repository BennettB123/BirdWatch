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
    let selectMode = false;
    let selectedSightings = new Set();

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
            card.dataset.sightingId = sighting.id;

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
                <div class="sighting-checkbox ${selectMode ? 'visible' : ''}" onclick="toggleSightingSelection(event, ${sighting.id})">
                    <input type="checkbox" ${selectedSightings.has(sighting.id) ? 'checked' : ''}>
                </div>
                <div class="sighting-menu">
                    <button class="sighting-menu-btn" onclick="toggleCardMenu(event, ${sighting.id})">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="12" cy="5" r="2"/>
                            <circle cx="12" cy="12" r="2"/>
                            <circle cx="12" cy="19" r="2"/>
                        </svg>
                    </button>
                    <div class="sighting-menu-dropdown" id="menu-${sighting.id}">
                        <button class="menu-item menu-item-delete" onclick="confirmDeleteSingle(${sighting.id})">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 6h18"/>
                                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                            </svg>
                            Delete
                        </button>
                    </div>
                </div>
                <div class="sighting-image-container" onclick="handleCardClick(event, '${imageUrl}', '${timeStr}', '${dateStr}', ${sighting.id})">
                    <img class="sighting-image" src="${imageUrl}" alt="Bird sighting" loading="lazy">
                </div>
                <div class="sighting-info">
                    <div class="sighting-timestamp">${timeStr}</div>
                    <div class="sighting-date">${dateStr}</div>
                </div>
            `;

            if (selectedSightings.has(sighting.id)) {
                card.classList.add('selected');
            }

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

    // Handle card click - either select or open lightbox
    window.handleCardClick = function (event, imageUrl, time, date, sightingId) {
        if (selectMode) {
            event.preventDefault();
            toggleSightingSelection(event, sightingId);
        } else {
            openLightbox(imageUrl, time, date);
        }
    };

    // Toggle select mode
    window.toggleSelectMode = function () {
        selectMode = !selectMode;
        selectedSightings.clear();
        updateSelectModeUI();
    };

    function updateSelectModeUI() {
        const selectBtn = document.getElementById('select-mode-btn');
        const bulkActions = document.getElementById('bulk-actions');
        const checkboxes = document.querySelectorAll('.sighting-checkbox');
        const cards = document.querySelectorAll('.sighting-card');

        if (selectBtn) {
            selectBtn.textContent = selectMode ? 'Cancel' : 'Select';
            selectBtn.classList.toggle('active', selectMode);
        }

        if (bulkActions) {
            bulkActions.classList.toggle('visible', selectMode && selectedSightings.size > 0);
        }

        checkboxes.forEach(cb => cb.classList.toggle('visible', selectMode));
        cards.forEach(card => card.classList.remove('selected'));

        updateSelectedCount();
    }

    function updateSelectedCount() {
        const countEl = document.getElementById('selected-count');
        const bulkActions = document.getElementById('bulk-actions');

        if (countEl) {
            countEl.textContent = `${selectedSightings.size} selected`;
        }

        if (bulkActions) {
            bulkActions.classList.toggle('visible', selectMode && selectedSightings.size > 0);
        }
    }

    // Toggle sighting selection
    window.toggleSightingSelection = function (event, sightingId) {
        event.stopPropagation();

        if (selectedSightings.has(sightingId)) {
            selectedSightings.delete(sightingId);
        } else {
            selectedSightings.add(sightingId);
        }

        const card = document.querySelector(`.sighting-card[data-sighting-id="${sightingId}"]`);
        if (card) {
            card.classList.toggle('selected', selectedSightings.has(sightingId));
            const checkbox = card.querySelector('.sighting-checkbox input');
            if (checkbox) checkbox.checked = selectedSightings.has(sightingId);
        }

        updateSelectedCount();
    };

    // Toggle card menu
    window.toggleCardMenu = function (event, sightingId) {
        event.stopPropagation();
        closeAllMenus();

        const menu = document.getElementById(`menu-${sightingId}`);
        if (menu) {
            menu.classList.add('visible');
        }
    };

    function closeAllMenus() {
        document.querySelectorAll('.sighting-menu-dropdown').forEach(menu => {
            menu.classList.remove('visible');
        });
    }

    // Delete single sighting
    window.confirmDeleteSingle = function (sightingId) {
        closeAllMenus();
        showDeleteConfirmation([sightingId]);
    };

    // Confirm bulk delete
    window.confirmBulkDelete = function () {
        if (selectedSightings.size === 0) return;
        showDeleteConfirmation(Array.from(selectedSightings));
    };

    function showDeleteConfirmation(ids) {
        const modal = document.getElementById('delete-modal');
        const countEl = document.getElementById('delete-count');

        if (countEl) {
            countEl.textContent = ids.length === 1
                ? 'this sighting'
                : `${ids.length} sightings`;
        }

        if (modal) {
            modal.dataset.deleteIds = JSON.stringify(ids);
            modal.classList.add('visible');
        }
    }

    window.closeDeleteModal = function () {
        const modal = document.getElementById('delete-modal');
        if (modal) {
            modal.classList.remove('visible');
            modal.dataset.deleteIds = '';
        }
    };

    window.executeDelete = async function () {
        const modal = document.getElementById('delete-modal');
        if (!modal) return;

        const ids = JSON.parse(modal.dataset.deleteIds || '[]');
        if (ids.length === 0) return;

        const deleteBtn = modal.querySelector('.delete-confirm-btn');
        if (deleteBtn) {
            deleteBtn.disabled = true;
            deleteBtn.textContent = 'Deleting...';
        }

        let successCount = 0;
        let failCount = 0;

        for (const id of ids) {
            try {
                const response = await fetch(`${BASE_PATH}/api/sightings/${id}`, {
                    method: 'DELETE',
                    credentials: 'same-origin'
                });

                if (response.ok) {
                    successCount++;
                    const card = document.querySelector(`.sighting-card[data-sighting-id="${id}"]`);
                    if (card) card.remove();
                    selectedSightings.delete(id);
                } else {
                    failCount++;
                    console.error(`Failed to delete sighting ${id}: ${response.status}`);
                }
            } catch (error) {
                failCount++;
                console.error(`Error deleting sighting ${id}:`, error);
            }
        }

        closeDeleteModal();

        if (deleteBtn) {
            deleteBtn.disabled = false;
            deleteBtn.textContent = 'Delete';
        }

        // Update total count
        totalSightings -= successCount;
        const countEl = document.getElementById('sightings-count');
        if (countEl) {
            countEl.textContent = `${totalSightings} sighting${totalSightings !== 1 ? 's' : ''} captured`;
        }

        // Exit select mode if we were in it
        if (selectMode) {
            selectMode = false;
            updateSelectModeUI();
        }

        // Show empty state if no sightings left
        if (totalSightings === 0) {
            const grid = document.getElementById('sightings-grid');
            if (grid) {
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
            }
        }
    };

    // Initialize on DOM ready
    document.addEventListener('DOMContentLoaded', function () {
        // Close lightbox and menus on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeLightbox();
                closeAllMenus();
                closeDeleteModal();
            }
        });

        // Close menus when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.sighting-menu')) {
                closeAllMenus();
            }
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
