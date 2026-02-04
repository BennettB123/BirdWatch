/**
 * BirdWatch Admin Module
 * Handles admin panel functionality
 */
(function () {
    'use strict';

    const BASE_PATH = '/birdwatch';

    // Login attempts state
    let currentLoginOffset = 0;
    const loginLimit = 50;
    let totalLoginAttempts = 0;

    // Users state
    let currentEditEmail = null;
    let currentDeleteEmail = null;

    // Expose to window for onclick handlers
    window.currentLoginOffset = currentLoginOffset;
    window.loginLimit = loginLimit;

    // Tab switching
    window.switchTab = function (tab) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('border-primary', 'text-gray-100');
            btn.classList.add('border-transparent', 'text-gray-400');
        });
        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.classList.add('hidden');
        });

        const activeBtn = document.getElementById(`tab-${tab}`);
        const activePanel = document.getElementById(`panel-${tab}`);

        if (activeBtn) {
            activeBtn.classList.add('border-primary', 'text-gray-100');
            activeBtn.classList.remove('border-transparent', 'text-gray-400');
        }
        if (activePanel) {
            activePanel.classList.remove('hidden');
        }

        // Load data for the tab
        if (tab === 'logins') {
            loadLoginAttempts(0);
        } else if (tab === 'users') {
            loadUsers();
        }
    };

    // Load login attempts
    window.loadLoginAttempts = async function (offset = 0) {
        currentLoginOffset = offset;
        window.currentLoginOffset = offset;

        const emailFilter = document.getElementById('filter-email')?.value || '';
        const successFilter = document.getElementById('filter-success')?.value || '';

        let url = `${BASE_PATH}/api/admin/login-attempts?limit=${loginLimit}&offset=${offset}`;
        if (emailFilter) url += `&email=${encodeURIComponent(emailFilter)}`;
        if (successFilter) url += `&success=${successFilter}`;

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to fetch login attempts');

            const data = await response.json();
            totalLoginAttempts = data.total;

            renderLoginAttempts(data.attempts || []);
            updateLoginPagination();
        } catch (error) {
            console.error('Error loading login attempts:', error);
            const tbody = document.getElementById('login-attempts-body');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-8 text-center text-red-400">Failed to load login attempts</td></tr>';
            }
        }
    };

    function renderLoginAttempts(attempts) {
        const tbody = document.getElementById('login-attempts-body');
        if (!tbody) return;

        if (attempts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-8 text-center text-gray-400">No login attempts found</td></tr>';
            return;
        }

        tbody.innerHTML = attempts.map(attempt => {
            const timestamp = new Date(attempt.timestamp);
            const timeStr = timestamp.toLocaleString();
            const statusClass = attempt.success ? 'text-green-400' : 'text-red-400';
            const statusText = attempt.success ? 'Success' : 'Failed';

            return `
                <tr class="border-t border-border-color hover:bg-dark/50">
                    <td class="px-4 py-3">${escapeHtml(attempt.email)}</td>
                    <td class="px-4 py-3 text-gray-400">${escapeHtml(attempt.name || '-')}</td>
                    <td class="px-4 py-3 ${statusClass}">${statusText}</td>
                    <td class="px-4 py-3 text-gray-400">${escapeHtml(attempt.ip_address || '-')}</td>
                    <td class="px-4 py-3 text-gray-400">${timeStr}</td>
                </tr>
            `;
        }).join('');
    }

    function updateLoginPagination() {
        const prevBtn = document.getElementById('login-prev-btn');
        const nextBtn = document.getElementById('login-next-btn');
        const info = document.getElementById('login-pagination-info');

        if (prevBtn) prevBtn.disabled = currentLoginOffset === 0;
        if (nextBtn) nextBtn.disabled = currentLoginOffset + loginLimit >= totalLoginAttempts;

        if (info) {
            const start = totalLoginAttempts === 0 ? 0 : currentLoginOffset + 1;
            const end = Math.min(currentLoginOffset + loginLimit, totalLoginAttempts);
            info.textContent = `Showing ${start}-${end} of ${totalLoginAttempts}`;
        }
    }

    window.applyFilters = function () {
        loadLoginAttempts(0);
    };

    // Load users
    async function loadUsers() {
        try {
            const response = await fetch(`${BASE_PATH}/api/admin/users`);
            if (!response.ok) throw new Error('Failed to fetch users');

            const data = await response.json();
            renderUsers(data.users || []);
        } catch (error) {
            console.error('Error loading users:', error);
            const tbody = document.getElementById('users-body');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="3" class="px-4 py-8 text-center text-red-400">Failed to load users</td></tr>';
            }
        }
    }

    function renderUsers(users) {
        const tbody = document.getElementById('users-body');
        if (!tbody) return;

        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="px-4 py-8 text-center text-gray-400">No users found</td></tr>';
            return;
        }

        tbody.innerHTML = users.map(user => {
            const roleClass = user.role === 'admin' ? 'text-primary' : 'text-gray-400';
            const roleText = user.role === 'admin' ? 'Admin' : 'User';

            return `
                <tr class="border-t border-border-color hover:bg-dark/50">
                    <td class="px-4 py-3">${escapeHtml(user.email)}</td>
                    <td class="px-4 py-3 ${roleClass}">${roleText}</td>
                    <td class="px-4 py-3 text-right">
                        <button onclick="openEditModal('${escapeHtml(user.email)}', '${user.role}')" class="px-3 py-1 text-sm text-gray-400 hover:text-gray-100 transition-colors">Edit</button>
                        <button onclick="openDeleteModal('${escapeHtml(user.email)}')" class="px-3 py-1 text-sm text-red-400 hover:text-red-300 transition-colors">Delete</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Add user
    window.addUser = async function () {
        const emailInput = document.getElementById('new-user-email');
        const roleSelect = document.getElementById('new-user-role');
        const errorEl = document.getElementById('add-user-error');

        const email = emailInput?.value.trim();
        const role = roleSelect?.value;

        if (!email) {
            showError(errorEl, 'Email is required');
            return;
        }

        try {
            const response = await fetch(`${BASE_PATH}/api/admin/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, role })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to add user');
            }

            if (emailInput) emailInput.value = '';
            if (roleSelect) roleSelect.value = 'user';
            hideError(errorEl);
            loadUsers();
        } catch (error) {
            showError(errorEl, error.message);
        }
    };

    // Edit user modal
    window.openEditModal = function (email, currentRole) {
        currentEditEmail = email;
        const modal = document.getElementById('edit-user-modal');
        const emailEl = document.getElementById('edit-user-email');
        const roleSelect = document.getElementById('edit-user-role');
        const errorEl = document.getElementById('edit-user-error');

        if (emailEl) emailEl.textContent = email;
        if (roleSelect) roleSelect.value = currentRole;
        hideError(errorEl);

        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }
    };

    window.closeEditModal = function () {
        const modal = document.getElementById('edit-user-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
        currentEditEmail = null;
    };

    window.saveUserRole = async function () {
        if (!currentEditEmail) return;

        const roleSelect = document.getElementById('edit-user-role');
        const errorEl = document.getElementById('edit-user-error');
        const role = roleSelect?.value;

        try {
            const response = await fetch(`${BASE_PATH}/api/admin/users/${encodeURIComponent(currentEditEmail)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to update user');
            }

            closeEditModal();
            loadUsers();
        } catch (error) {
            showError(errorEl, error.message);
        }
    };

    // Delete user modal
    window.openDeleteModal = function (email) {
        currentDeleteEmail = email;
        const modal = document.getElementById('delete-user-modal');
        const emailEl = document.getElementById('delete-user-email');
        const errorEl = document.getElementById('delete-user-error');

        if (emailEl) emailEl.textContent = email;
        hideError(errorEl);

        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }
    };

    window.closeDeleteModal = function () {
        const modal = document.getElementById('delete-user-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
        currentDeleteEmail = null;
    };

    window.confirmDeleteUser = async function () {
        if (!currentDeleteEmail) return;

        const errorEl = document.getElementById('delete-user-error');

        try {
            const response = await fetch(`${BASE_PATH}/api/admin/users/${encodeURIComponent(currentDeleteEmail)}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to delete user');
            }

            closeDeleteModal();
            loadUsers();
        } catch (error) {
            showError(errorEl, error.message);
        }
    };

    // Utility functions
    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function showError(el, message) {
        if (el) {
            el.textContent = message;
            el.classList.remove('hidden');
        }
    }

    function hideError(el) {
        if (el) {
            el.textContent = '';
            el.classList.add('hidden');
        }
    }

    // Initialize on page load
    document.addEventListener('DOMContentLoaded', function () {
        // Load login attempts initially
        loadLoginAttempts(0);

        // Close modals on escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeEditModal();
                closeDeleteModal();
            }
        });

        // Close modals on backdrop click
        document.getElementById('edit-user-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'edit-user-modal') closeEditModal();
        });
        document.getElementById('delete-user-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'delete-user-modal') closeDeleteModal();
        });
    });
})();
