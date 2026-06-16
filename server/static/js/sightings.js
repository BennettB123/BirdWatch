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
    let activeFilters = {
        favorites: false,
        startDate: '',
        endDate: ''
    };

    // Lightbox state for multi-image navigation
    let lightboxImages = [];
    let lightboxCurrentIndex = 0;
    let lightboxTime = '';
    let lightboxDate = '';
    let touchStartX = 0;
    let touchEndX = 0;
    let carouselPointerStartX = 0;
    let carouselPointerStartY = 0;
    let carouselPointerStartIndex = 0;

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function buildSightingsQuery(offset) {
        const params = new URLSearchParams({
            limit: String(SIGHTINGS_PER_PAGE),
            offset: String(offset)
        });

        if (activeFilters.favorites) {
            params.set('favorites', 'true');
        }
        if (activeFilters.startDate && activeFilters.endDate) {
            params.set('start_date', activeFilters.startDate);
            params.set('end_date', activeFilters.endDate);
        }

        return params.toString();
    }

    function hasActiveFilters() {
        return activeFilters.favorites || (activeFilters.startDate && activeFilters.endDate);
    }

    function setFilterError(message) {
        const errorEl = document.getElementById('filter-error');
        if (!errorEl) return;

        if (message) {
            errorEl.textContent = message;
            errorEl.classList.remove('hidden');
        } else {
            errorEl.textContent = '';
            errorEl.classList.add('hidden');
        }
    }

    function syncFilterInputs() {
        const favoritesEl = document.getElementById('favorites-filter');
        const startEl = document.getElementById('start-date-filter');
        const endEl = document.getElementById('end-date-filter');

        if (favoritesEl) favoritesEl.checked = activeFilters.favorites;
        if (startEl) startEl.value = activeFilters.startDate;
        if (endEl) endEl.value = activeFilters.endDate;
    }

    function applyFiltersFromInputs() {
        const favoritesEl = document.getElementById('favorites-filter');
        const startEl = document.getElementById('start-date-filter');
        const endEl = document.getElementById('end-date-filter');

        const favorites = Boolean(favoritesEl && favoritesEl.checked);
        const startDate = startEl ? startEl.value : '';
        const endDate = endEl ? endEl.value : '';

        if ((startDate && !endDate) || (!startDate && endDate)) {
            setFilterError('Choose both a start and end date.');
            return;
        }
        if (startDate && endDate && endDate < startDate) {
            setFilterError('End date must be on or after start date.');
            return;
        }

        setFilterError('');
        activeFilters = { favorites, startDate, endDate };
        currentOffset = 0;
        fetchSightings(0, false);
    }

    function clearFilters() {
        activeFilters = {
            favorites: false,
            startDate: '',
            endDate: ''
        };
        setFilterError('');
        syncFilterInputs();
        currentOffset = 0;
        fetchSightings(0, false);
    }

    // Fetch sightings from API
    async function fetchSightings(offset = 0, append = false) {
        try {
            const response = await fetch(`${BASE_PATH}/api/sightings?${buildSightingsQuery(offset)}`);
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
                const suffix = hasActiveFilters() ? ' found' : ' captured';
                countEl.textContent = `${totalSightings} sighting${totalSightings !== 1 ? 's' : ''}${suffix}`;
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
                    <h2 class="text-xl mb-2 text-gray-100">${hasActiveFilters() ? 'No sightings match these filters' : 'No sightings yet'}</h2>
                    <p>${hasActiveFilters() ? 'Try clearing the filters or choosing a wider date range.' : 'Sightings will appear here when birds are detected.'}</p>
                </div>
            `;
            return;
        }

        sightings.forEach(sighting => {
            const card = document.createElement('div');
            card.className = 'sighting-card group bg-card rounded-lg overflow-hidden transition-shadow duration-200 relative hover:shadow-[0_10px_30px_rgba(0,0,0,0.3)]';
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

            // Handle both old single image_path and new image_paths array
            const imagePaths = sighting.image_paths || (sighting.image_path ? [sighting.image_path] : []);
            const checkboxVisibleClass = (selectMode && isAdmin) ? 'flex' : 'hidden';
            const imageCount = imagePaths.length;
            const favorite = Boolean(sighting.favorite);

            // Only show menu button for admins
            const menuHtml = isAdmin ? `
                <div class="sighting-menu absolute top-12 right-2 z-10">
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
            const favoriteButtonHtml = `
                <button class="favorite-btn absolute top-2 right-2 z-20 bg-black/60 border-none rounded p-1.5 cursor-pointer text-white transition-colors duration-200 flex items-center justify-center hover:bg-black/80 ${favorite ? 'is-favorite' : ''}" aria-label="${favorite ? 'Remove from favorites' : 'Add to favorites'}" aria-pressed="${favorite}" onclick="toggleFavorite(event, ${sighting.id})">
                    <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="${favorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
                        <path d="M11.48 3.5c.2-.5.84-.5 1.04 0l2.08 5.04c.08.2.26.34.48.36l5.44.44c.54.04.74.72.33 1.06l-4.14 3.55c-.16.14-.23.36-.18.57l1.26 5.31c.13.53-.43.95-.89.66l-4.66-2.85a.55.55 0 0 0-.58 0L7 20.49c-.46.29-1.02-.13-.89-.66l1.26-5.31a.57.57 0 0 0-.18-.57L3.05 10.4c-.41-.34-.21-1.02.33-1.06l5.44-.44c.22-.02.4-.16.48-.36L11.48 3.5Z"/>
                    </svg>
                </button>
            `;

            const carouselId = `sighting-carousel-${sighting.id}`;
            const carouselSlidesHtml = imagePaths.map((imagePath, index) => {
                const imgUrl = `${BASE_PATH}/api/sightings/images/${encodeURIComponent(imagePath)}`;
                return `
                    <div class="sighting-carousel-slide shrink-0 w-full h-full">
                        <img class="w-full h-full object-cover" src="${imgUrl}" alt="Bird sighting ${index + 1} of ${imageCount}" loading="lazy" draggable="false">
                    </div>
                `;
            }).join('');
            const carouselDotsHtml = imageCount > 1 ? `
                <div class="sighting-carousel-dots absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex gap-1.5 bg-black/45 px-2 py-1 rounded-full">
                    ${imagePaths.map((_, index) => `
                        <span class="sighting-carousel-dot w-1.5 h-1.5 rounded-full bg-white/45 transition-colors ${index === 0 ? 'active' : ''}" aria-hidden="true"></span>
                    `).join('')}
                </div>
            ` : '';
            const imageCountBadgeHtml = imageCount > 1 ? `
                <div class="absolute top-2 left-2 z-10 bg-black/60 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1 pointer-events-none">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <polyline points="21 15 16 10 5 21"/>
                    </svg>
                    ${imageCount}
                </div>
            ` : '';
            const carouselHtml = imageCount > 0 ? `
                <div id="${carouselId}" class="sighting-carousel h-full overflow-hidden" tabindex="0" data-current-index="0" aria-label="${imageCount} photos from ${escapeHtml(timeStr)} ${escapeHtml(dateStr)}">
                    <div class="sighting-carousel-track flex h-full transition-transform duration-300 ease-out">
                        ${carouselSlidesHtml}
                    </div>
                </div>
                ${imageCountBadgeHtml}
                ${carouselDotsHtml}
            ` : '';

            card.dataset.imagePaths = JSON.stringify(imagePaths);
            card.dataset.time = timeStr;
            card.dataset.date = dateStr;

            card.innerHTML = `
                <div class="sighting-checkbox absolute top-2 left-2 z-20 w-6 h-6 ${checkboxVisibleClass} items-center justify-center bg-black/60 rounded cursor-pointer" onclick="toggleSightingSelection(event, ${sighting.id})">
                    <input type="checkbox" class="w-[18px] h-[18px] cursor-pointer" ${selectedSightings.has(sighting.id) ? 'checked' : ''}>
                </div>
                ${favoriteButtonHtml}
                ${menuHtml}
                <div class="sighting-image-area relative aspect-video overflow-hidden">
                    ${carouselHtml}
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
    window.openLightbox = function (imagePaths, time, date, initialIndex = 0) {
        const lightbox = document.getElementById('lightbox');
        const lightboxImage = document.getElementById('lightbox-image');
        const lightboxInfo = document.getElementById('lightbox-info');
        const lightboxCounter = document.getElementById('lightbox-counter');
        const prevBtn = document.getElementById('lightbox-prev');
        const nextBtn = document.getElementById('lightbox-next');

        // Ensure imagePaths is an array
        if (!Array.isArray(imagePaths)) {
            imagePaths = [imagePaths];
        }
        if (imagePaths.length === 0) return;

        // Store state for navigation
        lightboxImages = imagePaths.map(p => `${BASE_PATH}/api/sightings/images/${p}`);
        lightboxCurrentIndex = Math.min(Math.max(initialIndex, 0), lightboxImages.length - 1);
        lightboxTime = time;
        lightboxDate = date;

        // Show selected image
        if (lightboxImage && lightboxImages.length > 0) {
            lightboxImage.src = lightboxImages[lightboxCurrentIndex];
        }
        if (lightboxInfo) lightboxInfo.textContent = `${time} - ${date}`;

        // Show/hide navigation based on image count
        const hasMultiple = lightboxImages.length > 1;
        if (prevBtn) prevBtn.classList.toggle('hidden', !hasMultiple);
        if (nextBtn) nextBtn.classList.toggle('hidden', !hasMultiple);
        if (lightboxCounter) {
            lightboxCounter.classList.toggle('hidden', !hasMultiple);
            lightboxCounter.textContent = `${lightboxCurrentIndex + 1} / ${lightboxImages.length}`;
        }

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
        // Reset state
        lightboxImages = [];
        lightboxCurrentIndex = 0;
    };

    window.lightboxPrev = function () {
        if (lightboxImages.length <= 1) return;
        lightboxCurrentIndex = (lightboxCurrentIndex - 1 + lightboxImages.length) % lightboxImages.length;
        updateLightboxImage();
    };

    window.lightboxNext = function () {
        if (lightboxImages.length <= 1) return;
        lightboxCurrentIndex = (lightboxCurrentIndex + 1) % lightboxImages.length;
        updateLightboxImage();
    };

    function updateLightboxImage() {
        const lightboxImage = document.getElementById('lightbox-image');
        const lightboxCounter = document.getElementById('lightbox-counter');

        if (lightboxImage) {
            lightboxImage.src = lightboxImages[lightboxCurrentIndex];
        }
        if (lightboxCounter) {
            lightboxCounter.textContent = `${lightboxCurrentIndex + 1} / ${lightboxImages.length}`;
        }
    }

    function updateCarouselDots(carousel) {
        const card = carousel.closest('.sighting-card');
        if (!card) return;

        const dots = card.querySelectorAll('.sighting-carousel-dot');
        if (dots.length <= 1) return;

        const activeIndex = getCarouselIndex(carousel);
        dots.forEach((dot, index) => dot.classList.toggle('active', index === activeIndex));
    }

    function getCarouselIndex(carousel) {
        if (!carousel) return 0;
        const index = parseInt(carousel.dataset.currentIndex || '0', 10);
        return Number.isNaN(index) ? 0 : index;
    }

    function scrollCarouselToIndex(carousel, index) {
        if (!carousel) return;

        const track = carousel.querySelector('.sighting-carousel-track');
        if (!track) return;

        const maxIndex = Math.max(track.children.length - 1, 0);
        const nextIndex = Math.min(Math.max(index, 0), maxIndex);
        carousel.dataset.currentIndex = String(nextIndex);
        track.style.transform = `translateX(-${nextIndex * 100}%)`;
        updateCarouselDots(carousel);
    }

    function handleCarouselPointerDown(event) {
        const carousel = event.target.closest('.sighting-carousel');
        if (!carousel) return;

        event.target.setPointerCapture?.(event.pointerId);
        carouselPointerStartX = event.clientX;
        carouselPointerStartY = event.clientY;
        carouselPointerStartIndex = getCarouselIndex(carousel);
        carousel.dataset.dragged = 'false';
    }

    function handleCarouselPointerUp(event) {
        const carousel = event.target.closest('.sighting-carousel');
        if (!carousel) return;

        const movedX = Math.abs(event.clientX - carouselPointerStartX);
        const movedY = Math.abs(event.clientY - carouselPointerStartY);
        const isHorizontalSwipe = movedX > 28 && movedX > movedY;
        const isTap = movedX <= 8 && movedY <= 8;

        if (isHorizontalSwipe) {
            const direction = event.clientX < carouselPointerStartX ? 1 : -1;
            scrollCarouselToIndex(carousel, carouselPointerStartIndex + direction);
        }

        carousel.dataset.dragged = isTap ? 'false' : 'true';
    }

    function handleCarouselWheel(event) {
        const carousel = event.target.closest('.sighting-carousel');
        if (!carousel) return;

        const primaryDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
        if (Math.abs(primaryDelta) < 12) return;

        const currentIndex = getCarouselIndex(carousel);
        const track = carousel.querySelector('.sighting-carousel-track');
        const maxIndex = track ? track.children.length - 1 : 0;
        const nextIndex = currentIndex + (primaryDelta > 0 ? 1 : -1);

        if (nextIndex < 0 || nextIndex > maxIndex) return;

        event.preventDefault();
        if (carousel.dataset.wheelLocked === 'true') return;

        carousel.dataset.wheelLocked = 'true';
        scrollCarouselToIndex(carousel, nextIndex);
        window.setTimeout(() => {
            carousel.dataset.wheelLocked = 'false';
        }, 360);
    }

    // Handle card image click - select in admin mode, otherwise open the current image.
    function handleCardImageClick(event) {
        const imageArea = event.target.closest('.sighting-image-area');
        if (!imageArea) return;

        const card = imageArea.closest('.sighting-card');
        if (!card) return;

        const sightingId = parseInt(card.dataset.sightingId, 10);

        if (selectMode && isAdmin) {
            event.preventDefault();
            toggleSightingSelection(event, sightingId);
            return;
        }

        const carousel = imageArea.querySelector('.sighting-carousel');
        if (carousel && carousel.dataset.dragged === 'true') {
            carousel.dataset.dragged = 'false';
            return;
        }

        const imagePaths = JSON.parse(card.dataset.imagePaths || '[]');
        const time = card.dataset.time;
        const date = card.dataset.date;
        openLightbox(imagePaths, time, date, getCarouselIndex(carousel));
    }

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

    window.toggleFavorite = async function (event, sightingId) {
        event.stopPropagation();

        const card = event.target.closest('.sighting-card');
        const button = event.target.closest('.favorite-btn');
        if (!card || !button) return;

        const nextFavorite = button.getAttribute('aria-pressed') !== 'true';
        button.disabled = true;

        try {
            const response = await fetch(`${BASE_PATH}/api/sightings/${sightingId}/favorite`, {
                method: 'PATCH',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ favorite: nextFavorite })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            updateFavoriteButton(button, nextFavorite);

            if (activeFilters.favorites && !nextFavorite) {
                card.remove();
                totalSightings = Math.max(totalSightings - 1, 0);
                updateSightingsCount();
                if (totalSightings === 0) {
                    fetchSightings(0, false);
                }
            }
        } catch (error) {
            console.error('Failed to update favorite:', error);
        } finally {
            button.disabled = false;
        }
    };

    function updateFavoriteButton(button, favorite) {
        button.classList.toggle('is-favorite', favorite);
        button.setAttribute('aria-pressed', favorite ? 'true' : 'false');
        button.setAttribute('aria-label', favorite ? 'Remove from favorites' : 'Add to favorites');

        const icon = button.querySelector('svg');
        if (icon) {
            icon.setAttribute('fill', favorite ? 'currentColor' : 'none');
        }
    }

    function updateSightingsCount() {
        const countEl = document.getElementById('sightings-count');
        if (countEl) {
            const suffix = hasActiveFilters() ? ' found' : ' captured';
            countEl.textContent = `${totalSightings} sighting${totalSightings !== 1 ? 's' : ''}${suffix}`;
        }
    }

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
        updateSightingsCount();

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
        // Keyboard navigation for lightbox
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeLightbox();
                closeAllMenus();
                closeDeleteModal();
            } else if (e.key === 'ArrowLeft') {
                const lightbox = document.getElementById('lightbox');
                if (lightbox && !lightbox.classList.contains('hidden')) {
                    lightboxPrev();
                }
            } else if (e.key === 'ArrowRight') {
                const lightbox = document.getElementById('lightbox');
                if (lightbox && !lightbox.classList.contains('hidden')) {
                    lightboxNext();
                }
            }
        });

        // Touch/swipe support for lightbox
        const lightbox = document.getElementById('lightbox');
        if (lightbox) {
            lightbox.addEventListener('touchstart', (e) => {
                touchStartX = e.changedTouches[0].screenX;
            }, { passive: true });

            lightbox.addEventListener('touchend', (e) => {
                touchEndX = e.changedTouches[0].screenX;
                handleSwipe();
            }, { passive: true });
        }

        function handleSwipe() {
            const swipeThreshold = 50;
            const diff = touchStartX - touchEndX;

            if (Math.abs(diff) < swipeThreshold) return;

            if (diff > 0) {
                // Swipe left - next image
                lightboxNext();
            } else {
                // Swipe right - previous image
                lightboxPrev();
            }
        }

        // Close menus when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.sighting-menu')) {
                closeAllMenus();
            }
        });

        // Handle clicks on sighting card images (event delegation)
        const grid = document.getElementById('sightings-grid');
        if (grid) {
            grid.addEventListener('pointerdown', (e) => {
                if (e.target.closest('.sighting-carousel')) {
                    handleCarouselPointerDown(e);
                }
            });

            grid.addEventListener('pointerup', (e) => {
                if (e.target.closest('.sighting-carousel')) {
                    handleCarouselPointerUp(e);
                }
            });

            grid.addEventListener('pointercancel', (e) => {
                const carousel = e.target.closest('.sighting-carousel');
                if (carousel) {
                    carousel.dataset.dragged = 'true';
                }
            });

            grid.addEventListener('dragstart', (e) => {
                if (e.target.closest('.sighting-carousel')) {
                    e.preventDefault();
                }
            });

            grid.addEventListener('wheel', (e) => {
                handleCarouselWheel(e);
            }, { passive: false });

            grid.addEventListener('click', (e) => {
                if (e.target.closest('.sighting-image-area')) {
                    handleCardImageClick(e);
                }
            });

        }

        // Close lightbox on background click
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

        const applyFiltersBtn = document.getElementById('apply-filters');
        if (applyFiltersBtn) {
            applyFiltersBtn.addEventListener('click', applyFiltersFromInputs);
        }

        const clearFiltersBtn = document.getElementById('clear-filters');
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', clearFilters);
        }

        ['favorites-filter', 'start-date-filter', 'end-date-filter'].forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        applyFiltersFromInputs();
                    }
                });
            }
        });

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
