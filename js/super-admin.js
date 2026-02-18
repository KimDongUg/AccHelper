/* ═══════════════════════════════════════════════
 *  Super Admin Dashboard
 * ═══════════════════════════════════════════════ */

let sessionCheckTimer = null;

/* ═══════════════════════════════════════════════
 *  INIT
 * ═══════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
    // Auth guard
    if (!AuthSession.isValid()) { AuthSession.redirectToLogin(); return; }

    try {
        const auth = await apiGet('/auth/check');
        if (!auth.authenticated) { AuthSession.redirectToLogin(); return; }
        if (auth.session) {
            const persist = !!localStorage.getItem('acc_auth_session');
            AuthSession.save(auth.session, persist);
        }

        const sess = auth.session;
        const role = sess.role || 'viewer';

        // Role guard — only super_admin allowed
        if (role !== 'super_admin') {
            window.location.href = '/admin.html';
            return;
        }

        // Header display
        document.getElementById('headerCompanyName').textContent = sess.company_name || '';
        const displayName = sess.full_name || sess.email || sess.username || '';
        document.getElementById('headerUsername').textContent = displayName + '님';

        // Role badge
        const roleBadge = document.getElementById('roleBadge');
        roleBadge.textContent = '최고관리자';
        roleBadge.className = 'role-badge role-super_admin';
        roleBadge.style.display = 'inline-block';

    } catch { AuthSession.redirectToLogin(); return; }

    // Session watcher
    sessionCheckTimer = setInterval(() => {
        if (!AuthSession.isValid()) {
            clearInterval(sessionCheckTimer);
            showToast('세션이 만료되었습니다.', 'warning');
            setTimeout(() => AuthSession.redirectToLogin(), 1500);
        }
    }, 60_000);

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', async () => {
        clearInterval(sessionCheckTimer);
        try { await apiPost('/auth/logout', {}); } catch {}
        AuthSession.clear();
        window.location.href = '/login.html';
    });

    // Load all data
    loadOverview();
    loadSubscribers();
    loadPayments();

    // Payment filters
    document.getElementById('paymentCompanyFilter').addEventListener('change', () => loadPayments());
    document.getElementById('paymentStatusFilter').addEventListener('change', () => loadPayments());
});

/* ═══════════════════════════════════════════════
 *  OVERVIEW — 6 stat cards
 * ═══════════════════════════════════════════════ */
async function loadOverview() {
    try {
        const data = await apiGet('/admin-dashboard/overview');
        document.getElementById('statTotalCompanies').textContent = data.total_companies ?? 0;
        document.getElementById('statPaidSubscribers').textContent = data.paid_subscribers ?? 0;
        document.getElementById('statTrialCompanies').textContent = data.trial_companies ?? 0;
        document.getElementById('statFreeCompanies').textContent = data.free_companies ?? 0;
        document.getElementById('statTotalRevenue').textContent = formatMoney(data.total_revenue ?? 0);
        document.getElementById('statTotalPayments').textContent = data.total_payments ?? 0;
    } catch (e) {
        console.error('Overview load error:', e);
        showToast('현황 데이터를 불러올 수 없습니다.', 'error');
    }
}

/* ═══════════════════════════════════════════════
 *  SUBSCRIBERS TABLE
 * ═══════════════════════════════════════════════ */
async function loadSubscribers() {
    const loading = document.getElementById('subscribersLoading');
    loading.classList.add('show');

    try {
        const data = await apiGet('/admin-dashboard/subscribers');
        const items = data.subscribers || data.items || data;
        renderSubscribers(Array.isArray(items) ? items : []);

        // Populate company filter for payments
        if (Array.isArray(items) && items.length > 0) {
            const select = document.getElementById('paymentCompanyFilter');
            items.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.company_id;
                opt.textContent = s.company_name;
                select.appendChild(opt);
            });
        }
    } catch (e) {
        console.error('Subscribers load error:', e);
        showToast('구독 현황을 불러올 수 없습니다.', 'error');
    } finally {
        loading.classList.remove('show');
    }
}

function renderSubscribers(items) {
    const tbody = document.getElementById('subscribersTableBody');
    const empty = document.getElementById('subscribersEmpty');

    if (items.length === 0) {
        tbody.innerHTML = '';
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';
    tbody.innerHTML = items.map(s => `
        <tr>
            <td><span style="color:var(--gray-400);font-size:var(--text-xs)">${s.company_id ?? ''}</span> ${escapeHtml(s.company_name || '-')}</td>
            <td>${escapeHtml(s.plan || s.subscription_plan || '-')}</td>
            <td>${renderStatusBadge(s.subscription_status || s.status || (s.billing_active ? 'active' : 'free'))}</td>
            <td class="col-card">${escapeHtml(s.card_info || (s.card_company && s.card_number ? s.card_company + ' ' + s.card_number : '-'))}</td>
            <td>${s.total_paid != null ? formatMoney(s.total_paid) : '-'}</td>
            <td class="col-date">${s.last_paid_at || s.last_payment_date ? formatDate(s.last_paid_at || s.last_payment_date) : '-'}</td>
        </tr>
    `).join('');
}

/* ═══════════════════════════════════════════════
 *  PAYMENTS TABLE
 * ═══════════════════════════════════════════════ */
async function loadPayments() {
    const loading = document.getElementById('paymentsLoading');
    loading.classList.add('show');

    const companyId = document.getElementById('paymentCompanyFilter').value;
    const status = document.getElementById('paymentStatusFilter').value;

    const params = new URLSearchParams();
    if (companyId) params.append('company_id', companyId);
    if (status) params.append('status', status);

    const qs = params.toString();
    const url = '/admin-dashboard/payments' + (qs ? '?' + qs : '');

    try {
        const data = await apiGet(url);
        const items = data.payments || data.items || data;
        renderPayments(Array.isArray(items) ? items : []);
    } catch (e) {
        console.error('Payments load error:', e);
        showToast('결제 내역을 불러올 수 없습니다.', 'error');
    } finally {
        loading.classList.remove('show');
    }
}

function renderPayments(items) {
    const tbody = document.getElementById('paymentsTableBody');
    const empty = document.getElementById('paymentsEmpty');

    if (items.length === 0) {
        tbody.innerHTML = '';
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';
    tbody.innerHTML = items.map(p => `
        <tr>
            <td><span style="color:var(--gray-400);font-size:var(--text-xs)">${p.company_id ?? ''}</span> ${escapeHtml(p.company_name || '-')}</td>
            <td>${escapeHtml(p.admin_email || '-')}</td>
            <td>${escapeHtml(p.order_id || p.order_no || '-')}</td>
            <td>${p.amount != null ? formatMoney(p.amount) : '-'}</td>
            <td>${renderPaymentBadge(p.status)}</td>
            <td>${p.paid_at || p.payment_date ? formatDate(p.paid_at || p.payment_date) : '-'}</td>
        </tr>
    `).join('');
}

/* ═══════════════════════════════════════════════
 *  BADGE RENDERERS
 * ═══════════════════════════════════════════════ */
function renderStatusBadge(status) {
    if (!status) return '<span class="badge-inactive">-</span>';
    const s = status.toLowerCase();
    if (s === 'active' || s === 'paid')       return `<span class="badge-active">활성</span>`;
    if (s === 'trial')                        return `<span class="badge-trial">체험중</span>`;
    if (s === 'expired' || s === 'cancelled') return `<span class="badge-expired">${s === 'expired' ? '만료' : '해지'}</span>`;
    if (s === 'free')                         return `<span class="badge-inactive">무료</span>`;
    return `<span class="badge-inactive">${escapeHtml(status)}</span>`;
}

function renderPaymentBadge(status) {
    if (!status) return '<span class="badge-inactive">-</span>';
    const s = status.toUpperCase();
    if (s === 'DONE' || s === 'SUCCESS' || s === 'PAID') return `<span class="badge-success">성공</span>`;
    if (s === 'FAILED')                                   return `<span class="badge-failed">실패</span>`;
    if (s === 'CANCELED' || s === 'CANCELLED')             return `<span class="badge-cancelled">취소</span>`;
    return `<span class="badge-inactive">${escapeHtml(status)}</span>`;
}

/* ═══════════════════════════════════════════════
 *  TOAST
 * ═══════════════════════════════════════════════ */
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const icons = {
        success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
        error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
        warning: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.success}</span>
        <span class="toast-msg">${escapeHtml(message)}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
    `;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 250);
    }, 3500);
}

/* ═══════════════════════════════════════════════
 *  HELPERS
 * ═══════════════════════════════════════════════ */
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatMoney(n) {
    if (n == null || isNaN(n)) return '0원';
    return Number(n).toLocaleString() + '원';
}

function formatDate(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '-';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${h}:${min}`;
}
