/* ═══════════════════════════════════════════════
 *  Super Admin Dashboard
 * ═══════════════════════════════════════════════ */

let sessionCheckTimer = null;
let subscriberCache = {}; // company_id → SubscriberItem

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
        document.getElementById('statActiveSubscribers').textContent = data.active_subscribers ?? 0;
        document.getElementById('statTrialSubscribers').textContent = data.trial_subscribers ?? 0;
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
        const list = Array.isArray(items) ? items : [];

        // Build cache for modal lookup
        subscriberCache = {};
        list.forEach(s => { subscriberCache[s.company_id] = s; });

        renderSubscribers(list);

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
            <td>${s.company_id ?? '-'}</td>
            <td><a href="#" class="cell-link" onclick="openCompanyModal(${s.company_id});return false">${escapeHtml(s.company_name || '-')}</a></td>
            <td>${escapeHtml(s.plan || s.subscription_plan || '-')}</td>
            <td>${renderStatusBadge(s.subscription_status || s.status || (s.subscription_plan === 'trial' && s.billing_active ? 'trial' : (s.billing_active ? 'active' : 'free')), s.trial_ends_at)}</td>
            <td class="col-card">${escapeHtml(s.card_number ? (s.card_company ? s.card_company + ' ' : '') + s.card_number : (s.has_billing_key ? '카드 등록됨' : '-'))}</td>
            <td>${s.total_paid != null ? formatMoney(s.total_paid) : '-'}</td>
            <td class="col-date" style="white-space:nowrap">${s.last_paid_at || s.last_payment_date ? formatDate(s.last_paid_at || s.last_payment_date) : '-'}</td>
        </tr>
    `).join('');
}

/* ═══════════════════════════════════════════════
 *  COMPANY DETAIL MODAL
 * ═══════════════════════════════════════════════ */
async function openCompanyModal(companyId) {
    const s = subscriberCache[companyId];
    if (!s) return;

    document.getElementById('companyModalTitle').textContent = s.company_name;

    const planLabel = { enterprise: '유료(Enterprise)', trial: '체험(Trial)', free: '무료' }[s.subscription_plan] || s.subscription_plan;
    let statusLabel = s.billing_active
        ? (s.subscription_plan === 'trial' ? '체험중' : '활성')
        : '비활성';
    if (s.subscription_plan === 'trial' && s.trial_ends_at) {
        const diff = Math.ceil((new Date(s.trial_ends_at) - new Date()) / 86400000);
        statusLabel += ` (${diff > 0 ? diff : 0}일)`;
    }

    let cardInfo = '-';
    if (s.card_number) {
        cardInfo = (s.card_company || '') + ' ' + s.card_number;
    } else if (s.has_billing_key) {
        cardInfo = '카드 등록됨';
    }

    const body = document.getElementById('companyModalBody');
    body.innerHTML = `
        <div class="detail-grid">
            <div class="detail-row"><span class="detail-label">회사번호</span><span class="detail-value">${s.company_id}</span></div>
            <div class="detail-row"><span class="detail-label">회사코드</span><span class="detail-value">${escapeHtml(s.company_code || '-')}</span></div>
            <div class="detail-row"><span class="detail-label">사업자등록번호</span><span class="detail-value">${escapeHtml(s.business_number || '-')}</span></div>
            <div class="detail-row"><span class="detail-label">플랜</span><span class="detail-value">${escapeHtml(planLabel)}</span></div>
            <div class="detail-row"><span class="detail-label">구독 상태</span><span class="detail-value">${statusLabel}</span></div>
            <div class="detail-row"><span class="detail-label">카드 정보</span><span class="detail-value">${escapeHtml(cardInfo)}</span></div>
            <div class="detail-row"><span class="detail-label">결제 합계</span><span class="detail-value">${formatMoney(s.total_paid)}</span></div>
            <div class="detail-row"><span class="detail-label">결제 건수</span><span class="detail-value">${s.payment_count ?? 0}건</span></div>
            <div class="detail-row"><span class="detail-label">최종 결제일</span><span class="detail-value">${s.last_paid_at ? formatDate(s.last_paid_at) : '-'}</span></div>
            <div class="detail-row"><span class="detail-label">체험 종료일</span><span class="detail-value">${s.trial_ends_at ? formatDate(s.trial_ends_at) : '-'}</span></div>
            <div class="detail-row"><span class="detail-label">등록일</span><span class="detail-value">${s.created_at ? formatDate(s.created_at) : '-'}</span></div>
        </div>
        <h4 class="admin-list-title">관리자 목록</h4>
        <div id="adminListArea" class="admin-list-area"><span class="stat-loading"></span> 로딩 중...</div>
    `;

    document.getElementById('companyModal').classList.add('show');

    // Fetch admin list
    try {
        const data = await apiGet('/admin-dashboard/companies/' + companyId + '/admins');
        const admins = data.items || [];
        const area = document.getElementById('adminListArea');
        if (admins.length === 0) {
            area.innerHTML = '<p style="color:var(--gray-500);font-size:var(--text-sm)">등록된 관리자가 없습니다.</p>';
        } else {
            const roleLabels = { super_admin: '최고관리자', admin: '관리자', viewer: '뷰어' };
            area.innerHTML = `<table class="admin-list-table">
                <thead><tr><th>이메일</th><th>이름</th><th>역할</th><th>상태</th><th>최근 로그인</th></tr></thead>
                <tbody>${admins.map(a => `<tr>
                    <td>${escapeHtml(a.email)}</td>
                    <td>${escapeHtml(a.full_name || '-')}</td>
                    <td>${escapeHtml(roleLabels[a.role] || a.role)}</td>
                    <td>${a.is_active ? '<span style="color:var(--success)">활성</span>' : '<span style="color:var(--gray-400)">비활성</span>'}</td>
                    <td style="white-space:nowrap">${a.last_login ? formatDate(a.last_login) : '-'}</td>
                </tr>`).join('')}</tbody>
            </table>`;
        }
    } catch (e) {
        const area = document.getElementById('adminListArea');
        if (area) area.innerHTML = '<p style="color:var(--danger);font-size:var(--text-sm)">관리자 목록을 불러올 수 없습니다.</p>';
    }
}

function closeCompanyModal() {
    document.getElementById('companyModal').classList.remove('show');
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
            <td>${p.company_id ?? '-'}</td>
            <td>${escapeHtml(p.company_name || '-')}</td>
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
function renderStatusBadge(status, trialEndsAt) {
    if (!status) return '<span class="badge-inactive">-</span>';
    const s = status.toLowerCase();
    if (s === 'active' || s === 'paid')       return `<span class="badge-active">활성</span>`;
    if (s === 'trial') {
        let daysLeft = '';
        if (trialEndsAt) {
            const diff = Math.ceil((new Date(trialEndsAt) - new Date()) / 86400000);
            daysLeft = ` (${diff > 0 ? diff : 0}일)`;
        }
        return `<span class="badge-trial">체험중${daysLeft}</span>`;
    }
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
