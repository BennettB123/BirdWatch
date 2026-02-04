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
    let isAdmin = false;

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
                grid.innerHTML = `
                    <div class="text-center py-16 px-8 text-gray-400 col-span-full">
                        <h2 class="text-xl mb-2 text-gray-100">Failed to load sightings</h2>
                        <p>Please try again later.</p>
                    </div>
                `;
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
                <div class="text-center py-16 px-8 text-gray-400 col-span-full">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-16 h-16 mx-auto mb-4 opacity-50">
                        <path d="M16 7h.01"/>
                        <path d="M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20"/>
                        <path d="m20 7 2 .5-2 .5"/>
                        <path d="M10 18v3"/>
                        <path d="M14 17.75V21"/>
                        <path d="M7 18a6 6 0 0 0 3.84-10.61"/>
                    </svg>
                    <h2 class="text-xl mb-2 text-gray-100">No sightings yet</h2>
                    <p>Sightings will appear here when birds are detected.</p>
                </div>
            `;
            return;
        }

        sightings.forEach(sighting => {
            const card = document.createElement('div');
            card.className = 'sighting-card group bg-card rounded-lg overflow-hidden transition-all duration-200 relative hover:-translate-y-1 hover:shadow-[0_10px_30px_rgba(0,0,0,0.3)]';
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
            const checkboxVisibleClass = (selectMode && isAdmin) ? 'flex' : 'hidden';

            // Only show menu button for admins
            const menuHtml = isAdmin ? `
                <div class="sighting-menu absolute top-2 right-2 z-10">
                    <button class="sighting-menu-btn bg-black/60 border-none rounded p-1 cursor-pointer text-white opacity-0 group-hover:opacity-100 md:opacity-100 transition-opacity duration-200 flex items-center justify-center hover:bg-black/80" onclick="toggleCardMenu(event, ${sighting.id})">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="12" cy="5" r="2"/>
                            <circle cx="12" cy="12" r="2"/>
                            <circle cx="12" cy="19" r="2"/>
                        </svg>
                    </button>
                    <div class="sighting-menu-dropdown absolute top-full right-0 mt-1 bg-card rounded-md shadow-[0_4px_20px_rgba(0,0,0,0.4)] min-w-[140px] hidden overflow-hidden" id="menu-${sighting.id}">
                        <button class="flex items-center gap-2 w-full py-2.5 px-3.5 bg-transparent border-none text-red-500 text-sm cursor-pointer text-left transition-colors hover:bg-red-500/10" onclick="confirmDeleteSingle(${sighting.id})">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 6h18"/>
                                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                            </svg>
                            Delete
                        </button>
                    </div>
                </div>
            ` : '';

            card.innerHTML = `
                <div class="sighting-checkbox absolute top-2 left-2 z-10 w-6 h-6 ${checkboxVisibleClass} items-center justify-center bg-black/60 rounded cursor-pointer" onclick="toggleSightingSelection(event, ${sighting.id})">
                    <input type="checkbox" class="w-[18px] h-[18px] cursor-pointer" ${selectedSightings.has(sighting.id) ? 'checked' : ''}>
                </div>
                ${menuHtml}
                <div class="relative aspect-video overflow-hidden cursor-pointer" onclick="handleCardClick(event, '${imageUrl}', '${timeStr}', '${dateStr}', ${sighting.id})">
                    <img class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" src="${imageUrl}" alt="Bird sighting" loading="lazy">
                </div>
                <div class="p-4">
                    <div class="text-gray-100 text-sm font-medium">${timeStr}</div>
                    <div class="text-gray-400 text-xs mt-1">${dateStr}</div>
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
            lightbox.classList.remove('hidden');
            lightbox.classList.add('flex');
            document.body.style.overflow = 'hidden';
        }
    };

    window.closeLightbox = function () {
        const lightbox = document.getElementById('lightbox');
        if (lightbox) {
            lightbox.classList.add('hidden');
            lightbox.classList.remove('flex');
            document.body.style.overflow = '';
        }
    };

    // Handle card click - either select or open lightbox
    window.handleCardClick = function (event, imageUrl, time, date, sightingId) {
        if (selectMode && isAdmin) {
            event.preventDefault();
            toggleSightingSelection(event, sightingId);
        } else {
            openLightbox(imageUrl, time, date);
        }
    };

    // Toggle select mode (admin only)
    window.toggleSelectMode = function () {
        if (!isAdmin) return;
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
            if (selectMode) {
                selectBtn.classList.add('bg-primary', 'border-primary', 'text-white');
                selectBtn.classList.remove('bg-card', 'hover:bg-border-color');
            } else {
                selectBtn.classList.remove('bg-primary', 'border-primary', 'text-white');
                selectBtn.classList.add('bg-card', 'hover:bg-border-color');
            }
        }

        if (bulkActions) {
            if (selectMode && selectedSightings.size > 0) {
                bulkActions.classList.remove('hidden');
                bulkActions.classList.add('flex');
            } else {
                bulkActions.classList.add('hidden');
                bulkActions.classList.remove('flex');
            }
        }

        checkboxes.forEach(cb => {
            if (selectMode) {
                cb.classList.remove('hidden');
                cb.classList.add('flex');
            } else {
                cb.classList.add('hidden');
                cb.classList.remove('flex');
            }
        });
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
            if (selectMode && selectedSightings.size > 0) {
                bulkActions.classList.remove('hidden');
                bulkActions.classList.add('flex');
            } else {
                bulkActions.classList.add('hidden');
                bulkActions.classList.remove('flex');
            }
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
            menu.classList.remove('hidden');
            menu.classList.add('block');
        }
    };

    function closeAllMenus() {
        document.querySelectorAll('.sighting-menu-dropdown').forEach(menu => {
            menu.classList.add('hidden');
            menu.classList.remove('block');
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
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }
    }

    window.closeDeleteModal = function () {
        const modal = document.getElementById('delete-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
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
                    <div class="text-center py-16 px-8 text-gray-400 col-span-full">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-16 h-16 mx-auto mb-4 opacity-50">
                            <path d="M16 7h.01"/>
                            <path d="M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20"/>
                            <path d="m20 7 2 .5-2 .5"/>
                            <path d="M10 18v3"/>
                            <path d="M14 17.75V21"/>
                            <path d="M7 18a6 6 0 0 0 3.84-10.61"/>
                        </svg>
                        <h2 class="text-xl mb-2 text-gray-100">No sightings yet</h2>
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

        // Listen for user info loaded event to get admin status
        window.addEventListener('birdwatch:userloaded', function (e) {
            isAdmin = e.detail.role === 'admin';

            // Show/hide select button based on admin status
            const selectBtn = document.getElementById('select-mode-btn');
            if (selectBtn) {
                if (isAdmin) {
                    selectBtn.classList.remove('hidden');
                } else {
                    selectBtn.classList.add('hidden');
                }
            }

            // Re-render sightings to update delete buttons visibility
            // Only if we already have sightings loaded
            if (totalSightings > 0) {
                fetchSightings(0, false);
            }
        });

        // Initial fetch
        fetchSightings();
    });
})();
