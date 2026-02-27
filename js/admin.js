let currentPage = 1;
const PAGE_SIZE = 10;
let deleteTargetId = null;
let deleteTargetType = null; // 'qa' or 'admin'
let sessionCheckTimer = null;
let currentSearchTerm = '';
let currentRole = 'viewer';
let logPage = 1;
let unansweredPage = 1;
let feedbackPage = 1;
let companiesList = [];
let companyMap = {};  // id → name

/* ═══════════════════════════════════════════════
 *  INIT
 * ═══════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
    // Auth guard
    if (!AuthSession.isValid()) { AuthSession.redirectToLogin(); return; }

    // Keep local session as fallback if server auth check fails
    const localSess = AuthSession.get();
    let sess = null;

    try {
        const auth = await apiGet('/auth/check');
        if (!auth.authenticated) { AuthSession.redirectToLogin(); return; }
        if (auth.session) {
            sess = auth.session;
            const persist = !!localStorage.getItem('acc_auth_session');
            AuthSession.save(auth.session, persist, AuthSession.getToken());
        }
    } catch (err) {
        // 401/403 → token invalid, must re-login
        if (err.status === 401 || err.status === 403) {
            AuthSession.redirectToLogin();
            return;
        }
        // Other errors (500, network) → use local session as fallback
        console.warn('[ADMIN] auth check failed:', err.message, '— using local session');
    }

    // Build session — prefer server data, fallback to local storage
    if (!sess && localSess) {
        sess = {
            role: localSess.role,
            company_name: localSess.companyName,
            full_name: localSess.fullName,
            email: localSess.email,
            username: localSess.username,
        };
    }
    if (!sess) { AuthSession.redirectToLogin(); return; }

    currentRole = sess.role || 'viewer';

    // Header display
    document.getElementById('headerCompanyName').textContent = sess.company_name || '';
    const displayName = sess.full_name || sess.email || sess.username || '';
    document.getElementById('adminUsername').textContent = displayName + '님';

    // 챗봇 버튼 → 해당 업체 챗봇으로 이동
    var chatBotLink = document.getElementById('chatBotLink');
    if (chatBotLink && sess.company_id) {
        chatBotLink.href = '/?company=' + sess.company_id;
    }

    // Role badge
    const roleBadge = document.getElementById('roleBadge');
    const roleLabels = { super_admin: '최고관리자', admin: '관리자', viewer: '뷰어' };
    roleBadge.textContent = roleLabels[currentRole] || currentRole;
    roleBadge.className = 'role-badge role-' + currentRole;
    roleBadge.style.display = 'inline-block';

    // Show admin tab for admin/super_admin
    if (currentRole === 'admin' || currentRole === 'super_admin') {
        document.getElementById('tabAdmins').style.display = '';
    }

    // Show super admin link for super_admin
    if (currentRole === 'super_admin') {
        const saLink = document.getElementById('superAdminLink');
        if (saLink) saLink.style.display = '';
    }

    // super_admin: load companies for filter & modal
    if (currentRole === 'super_admin') {
        try {
            const companies = await apiGet('/companies/public');
            companiesList = companies;
            companyMap = {};
            companies.forEach(c => { companyMap[c.company_id] = c.company_name; });

            // Show company column header
            document.getElementById('companyColHeader').style.display = '';

            // Populate company filter dropdown
            const companyFilter = document.getElementById('companyFilter');
            companyFilter.style.display = '';
            companies.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.company_id;
                opt.textContent = c.company_name;
                companyFilter.appendChild(opt);
            });

            // Populate modal company select
            const modalCompany = document.getElementById('modalCompany');
            companies.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.company_id;
                opt.textContent = c.company_name;
                modalCompany.appendChild(opt);
            });

            // Auto-select company if ?company= query parameter is present
            const urlParams = new URLSearchParams(window.location.search);
            const targetCompanyId = urlParams.get('company');
            if (targetCompanyId) {
                companyFilter.value = targetCompanyId;
                // Update header to show the selected company name
                const targetCompany = companies.find(c => String(c.company_id) === String(targetCompanyId));
                if (targetCompany) {
                    document.getElementById('headerCompanyName').textContent = targetCompany.company_name;
                    document.title = targetCompany.company_name + ' 관리자 - 보태미 경리도우미';
                }
                // Also pre-select in modal company select
                modalCompany.value = targetCompanyId;
            }

        } catch (e) {
            console.error('Companies load error:', e);
        }
    }

    // Hide edit buttons for viewer
    if (currentRole === 'viewer') {
        const addQaBtn = document.getElementById('addQaBtn');
        if (addQaBtn) addQaBtn.style.display = 'none';
        const csSection = document.getElementById('companySettingsSection');
        if (csSection) csSection.style.display = 'none';
    }

    // super_admin viewing another company → hide company settings
    if (currentRole === 'super_admin') {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('company')) {
            const csSection = document.getElementById('companySettingsSection');
            if (csSection) csSection.style.display = 'none';
        }
    }

    // Session watcher
    sessionCheckTimer = setInterval(() => {
        if (!AuthSession.isValid()) {
            clearInterval(sessionCheckTimer);
            showToast('세션이 만료되었습니다.', 'warning');
            setTimeout(() => AuthSession.redirectToLogin(), 1500);
        }
    }, 60_000);

    // Load data
    loadCompanySettings();
    loadStats();
    loadQaList().then(checkTemplateData);

    // Search debounce
    let searchTimer;
    document.getElementById('searchInput').addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => { currentPage = 1; loadQaList(); }, 300);
    });

    document.getElementById('categoryFilter').addEventListener('change', () => { currentPage = 1; loadQaList(); });
    document.getElementById('statusFilter').addEventListener('change', () => { currentPage = 1; loadQaList(); });
    document.getElementById('companyFilter').addEventListener('change', () => { currentPage = 1; loadQaList(); });

    // Profile button
    document.getElementById('profileBtn').addEventListener('click', () => openProfileModal());

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', async () => {
        clearInterval(sessionCheckTimer);
        try { await apiPost('/auth/logout', {}); } catch {}
        AuthSession.clear();
        window.location.href = '/login.html';
    });

    // Modal field validation
    document.getElementById('modalQuestion').addEventListener('input', onQuestionInput);
    document.getElementById('modalAnswer').addEventListener('input', onAnswerInput);

    // Feedback filters
    document.getElementById('feedbackRatingFilter').addEventListener('change', () => { feedbackPage = 1; loadFeedbackList(); });
    document.getElementById('feedbackStatusFilter').addEventListener('change', () => { feedbackPage = 1; loadFeedbackList(); });

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
});

/* ═══════════════════════════════════════════════
 *  TABS
 * ═══════════════════════════════════════════════ */
function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
    });
    document.querySelectorAll('.tab-content').forEach(c => {
        c.classList.remove('active');
        c.style.display = 'none';
    });

    const btn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
    if (btn) {
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
    }

    const content = document.getElementById('tabContent' + tab.charAt(0).toUpperCase() + tab.slice(1));
    if (content) {
        content.classList.add('active');
        content.style.display = '';
    }

    if (tab === 'admins') loadAdminList();
    if (tab === 'feedback') { feedbackPage = 1; loadFeedbackList(); }
    if (tab === 'unanswered') { unansweredPage = 1; loadUnansweredList(); }
    if (tab === 'logs') { logPage = 1; loadActivityLogs(); }
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
 *  STATS
 * ═══════════════════════════════════════════════ */
async function loadStats() {
    try {
        const s = await apiGet('/stats');
        document.getElementById('statTotal').textContent = s.total_qa;
        document.getElementById('statActive').textContent = s.active_qa;
        document.getElementById('statToday').textContent = s.today_chats;
    } catch (e) {
        console.error('Stats load error:', e);
    }
    // 불만족 피드백 건수 로드
    try {
        const fc = await apiGet('/feedback/count');
        document.getElementById('statFeedback').textContent = fc.count ?? 0;
    } catch (e) {
        document.getElementById('statFeedback').textContent = '-';
    }
    // 미답변 질문 건수 로드
    try {
        const uc = await apiGet('/unanswered-questions/count');
        document.getElementById('statUnanswered').textContent = uc.count ?? 0;
    } catch (e) {
        document.getElementById('statUnanswered').textContent = '-';
    }
    // 구독 상태 로드
    try {
        const sess = AuthSession.get();
        const data = await apiGet('/billing/status?company_id=' + sess.companyId);
        const el = document.getElementById('statSubscription');
        const plan = data.subscription_plan;
        if (plan === 'enterprise' && data.active) {
            el.innerHTML = '<span style="color:var(--success)">유료 구독중</span>';
        } else if (plan === 'trial' && data.active) {
            let daysText = '';
            if (data.trial_ends_at) {
                const diff = Math.ceil((new Date(data.trial_ends_at) - new Date()) / 86400000);
                daysText = ' (' + (diff > 0 ? diff : 0) + '일)';
            }
            el.innerHTML = '<span style="color:#FF9800">체험중' + daysText + '</span><br><a href="/billing.html" class="btn btn-primary btn-sm" style="margin-top:0.25rem;font-size:0.75rem;padding:0.2rem 0.6rem">구독하기</a>';
        } else {
            el.innerHTML = '<a href="/billing.html" class="btn btn-primary btn-sm" style="font-size:0.75rem;padding:0.2rem 0.6rem">구독하기</a>';
        }
    } catch (e) {
        document.getElementById('statSubscription').innerHTML = '<a href="/billing.html" style="color:var(--primary);font-weight:600;text-decoration:underline">구독하기</a>';
    }
}

/* ═══════════════════════════════════════════════
 *  QA LIST
 * ═══════════════════════════════════════════════ */
let lastQaTotal = 0;

async function loadQaList() {
    const search = document.getElementById('searchInput').value.trim();
    const category = document.getElementById('categoryFilter').value;
    const status = document.getElementById('statusFilter').value;
    currentSearchTerm = search;

    const companyFilterVal = document.getElementById('companyFilter').value;

    const params = new URLSearchParams({ page: currentPage, size: PAGE_SIZE });
    if (search) params.append('search', search);
    if (category) params.append('category', category);
    if (status) params.append('status', status);
    if (companyFilterVal) params.append('company_id', companyFilterVal);

    document.getElementById('tableLoading').classList.add('show');
    try {
        const data = await apiGet(`/qa?${params}`);
        lastQaTotal = data.total || 0;
        renderTable(data.items);
        renderPagination(data.page, data.pages, data.total);
    } catch (e) {
        console.error('QA list error:', e);
    } finally {
        document.getElementById('tableLoading').classList.remove('show');
    }
}

/* ── 템플릿 데이터 안내 팝업 ── */
function checkTemplateData() {
    if (currentRole === 'super_admin') return;
    const sess = AuthSession.get();
    if (!sess) return;
    const key = 'qa_modified_' + sess.companyId;
    if (localStorage.getItem(key)) return;
    if (lastQaTotal === 0) return;

    // Q&A가 있지만 관리자가 아직 수정한 적 없으면 안내
    showTemplatePopup();
}

function markQaModified() {
    const sess = AuthSession.get();
    if (sess) localStorage.setItem('qa_modified_' + sess.companyId, '1');
}

function showTemplatePopup() {
    const overlay = document.getElementById('templatePopup');
    if (overlay) { overlay.classList.add('show'); return; }

    const popup = document.createElement('div');
    popup.id = 'templatePopup';
    popup.className = 'confirm-overlay show';
    popup.innerHTML = `
        <div class="confirm-dialog">
            <div class="confirm-icon" style="background:#FFF3E0;color:#FF9800">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <h3>Q&A 데이터 안내</h3>
            <p>현재 데이터는 최근 등록한 회사의 데이터입니다.<br>우리 회사에 맞게 수정이 필요합니다.</p>
            <div class="actions">
                <button class="btn btn-outline" onclick="closeTemplatePopup()">나중에</button>
                <button class="btn btn-primary" onclick="closeTemplatePopup(); openCreateModal();">+ 새 Q&A 추가</button>
            </div>
        </div>
    `;
    document.body.appendChild(popup);
}

function closeTemplatePopup() {
    const popup = document.getElementById('templatePopup');
    if (popup) popup.classList.remove('show');
}

function highlightText(text, maxLen) {
    let safe = escapeHtml(text);
    if (maxLen && text.length > maxLen) {
        safe = escapeHtml(text.substring(0, maxLen)) + '&hellip;';
    }
    if (!currentSearchTerm) return safe;
    const escaped = escapeHtml(currentSearchTerm).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return safe.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
}

function renderTable(items) {
    const tbody = document.getElementById('qaTableBody');
    const empty = document.getElementById('emptyState');
    const isViewer = currentRole === 'viewer';
    const isSuperAdmin = currentRole === 'super_admin';

    if (items.length === 0) {
        tbody.innerHTML = '';
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';
    tbody.innerHTML = items.map(qa => `
        <tr>
            <td>${qa.qa_id}</td>
            <td><span class="badge badge-category">${qa.category}</span></td>
            ${isSuperAdmin ? `<td>${escapeHtml(qa.company_name || '-')}</td>` : ''}
            <td class="question-cell" title="${escapeHtml(qa.question)}"><a href="#" class="cell-link" onclick="openEditModal(${qa.qa_id});return false">${highlightText(qa.question, 100)}</a></td>
            <td class="answer-cell" title="${escapeHtml(qa.answer)}"><a href="#" class="cell-link" onclick="openEditModal(${qa.qa_id});return false">${highlightText(qa.answer, 150)}</a></td>
            <td>
                <button class="toggle-btn ${qa.is_active ? 'active' : ''}" onclick="toggleActive(${qa.qa_id})" role="switch" aria-checked="${qa.is_active}" ${isViewer ? 'disabled' : ''} title="${qa.is_active ? '활성' : '비활성'}"></button>
            </td>
            <td style="font-size:var(--text-xs);color:var(--gray-500)">${escapeHtml(qa.created_by || '-')}</td>
            <td>${formatDate(qa.updated_at)}</td>
            <td>
                <div class="actions">
                    ${isViewer ? '' : `<button class="btn btn-outline btn-sm" onclick="openEditModal(${qa.qa_id})">수정</button>
                    <button class="btn btn-danger btn-sm" onclick="openDeleteConfirm(${qa.qa_id}, 'qa')">삭제</button>`}
                </div>
            </td>
        </tr>
    `).join('');
}

function renderPagination(page, pages, total) {
    const container = document.getElementById('pagination');
    if (pages <= 1) { container.innerHTML = ''; return; }

    let html = `<button ${page <= 1 ? 'disabled' : ''} onclick="goToPage(${page - 1})">&laquo;</button>`;
    const start = Math.max(1, page - 2);
    const end = Math.min(pages, page + 2);

    if (start > 1) {
        html += `<button onclick="goToPage(1)">1</button>`;
        if (start > 2) html += `<button disabled>...</button>`;
    }
    for (let i = start; i <= end; i++) {
        html += `<button class="${i === page ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
    }
    if (end < pages) {
        if (end < pages - 1) html += `<button disabled>...</button>`;
        html += `<button onclick="goToPage(${pages})">${pages}</button>`;
    }
    html += `<button ${page >= pages ? 'disabled' : ''} onclick="goToPage(${page + 1})">&raquo;</button>`;
    container.innerHTML = html;
}

function goToPage(page) { currentPage = page; loadQaList(); }

async function toggleActive(qaId) {
    if (currentRole === 'viewer') return;
    try {
        const qa = await apiPatch(`/qa/${qaId}/toggle`);
        showToast(qa.is_active ? 'Q&A가 활성화되었습니다.' : 'Q&A가 비활성화되었습니다.', 'success');
        markQaModified();
        loadQaList();
        loadStats();
    } catch (e) {
        showToast('상태 변경에 실패했습니다: ' + e.message, 'error');
    }
}

/* ═══════════════════════════════════════════════
 *  QA MODAL
 * ═══════════════════════════════════════════════ */
function onQuestionInput() {
    const val = document.getElementById('modalQuestion').value.trim();
    const hint = document.getElementById('questionHint');
    if (val.length === 0) { hint.textContent = ''; hint.className = 'field-hint'; }
    else if (val.length < 5) { hint.textContent = `${val.length}/5자 (최소 5자)`; hint.className = 'field-hint error'; }
    else { hint.textContent = `${val.length}자`; hint.className = 'field-hint ok'; checkDuplicate(val); }
}

function onAnswerInput() {
    const val = document.getElementById('modalAnswer').value.trim();
    const hint = document.getElementById('answerHint');
    if (val.length === 0) { hint.textContent = ''; hint.className = 'field-hint'; }
    else if (val.length < 10) { hint.textContent = `${val.length}/10자 (최소 10자)`; hint.className = 'field-hint error'; }
    else { hint.textContent = `${val.length}자`; hint.className = 'field-hint ok'; }
}

let dupTimer = null;
async function checkDuplicate(question) {
    clearTimeout(dupTimer);
    dupTimer = setTimeout(async () => {
        const warn = document.getElementById('duplicateWarn');
        try {
            const excludeId = document.getElementById('editQaId').value || '';
            const params = new URLSearchParams({ question });
            if (excludeId) params.append('exclude_id', excludeId);
            const res = await apiGet(`/qa/check-duplicate?${params}`);
            if (res.duplicates && res.duplicates.length > 0) {
                const items = res.duplicates.map(d =>
                    `• [ID ${d.qa_id}] ${escapeHtml(d.question.substring(0, 60))} (유사도 ${d.similarity}%)`
                ).join('<br>');
                warn.innerHTML = `<strong>유사한 질문이 있습니다:</strong><br>${items}`;
                warn.style.display = 'block';
            } else {
                warn.style.display = 'none';
            }
        } catch { warn.style.display = 'none'; }
    }, 500);
}

function validateModal() {
    const question = document.getElementById('modalQuestion').value.trim();
    const answer = document.getElementById('modalAnswer').value.trim();
    const errors = [];
    if (question.length < 5) errors.push('질문은 최소 5자 이상 입력해 주세요.');
    if (answer.length < 10) errors.push('답변은 최소 10자 이상 입력해 주세요.');
    if (errors.length > 0) { showToast(errors[0], 'error'); onQuestionInput(); onAnswerInput(); return false; }
    return true;
}

function resetModalHints() {
    document.getElementById('questionHint').textContent = '';
    document.getElementById('questionHint').className = 'field-hint';
    document.getElementById('answerHint').textContent = '';
    document.getElementById('answerHint').className = 'field-hint';
    document.getElementById('duplicateWarn').style.display = 'none';
}

function openCreateModal() {
    document.getElementById('modalTitle').textContent = '새 Q&A 추가';
    document.getElementById('editQaId').value = '';
    document.getElementById('modalCategory').value = '이주정산';
    document.getElementById('modalQuestion').value = '';
    document.getElementById('modalAnswer').value = '';
    document.getElementById('modalKeywords').value = '';
    document.getElementById('modalActive').checked = true;
    resetModalHints();

    // super_admin: show company selector
    const companyGroup = document.getElementById('modalCompanyGroup');
    if (currentRole === 'super_admin' && companiesList.length > 0) {
        companyGroup.style.display = '';
        document.getElementById('modalCompany').value = companiesList[0].company_id;
    } else {
        companyGroup.style.display = 'none';
    }

    document.getElementById('qaModal').classList.add('show');
}

async function openEditModal(qaId) {
    try {
        const qa = await apiGet(`/qa/${qaId}`);
        document.getElementById('modalTitle').textContent = 'Q&A 수정';
        document.getElementById('editQaId').value = qa.qa_id;
        document.getElementById('modalCategory').value = qa.category;
        document.getElementById('modalQuestion').value = qa.question;
        document.getElementById('modalAnswer').value = qa.answer;
        document.getElementById('modalKeywords').value = qa.keywords;
        document.getElementById('modalActive').checked = qa.is_active;
        resetModalHints();

        // super_admin: show company selector with current value
        const companyGroup = document.getElementById('modalCompanyGroup');
        if (currentRole === 'super_admin' && companiesList.length > 0) {
            companyGroup.style.display = '';
            document.getElementById('modalCompany').value = qa.company_id;
        } else {
            companyGroup.style.display = 'none';
        }

        document.getElementById('qaModal').classList.add('show');
    } catch (e) { showToast('Q&A를 불러올 수 없습니다.', 'error'); }
}

function closeModal() {
    document.getElementById('qaModal').classList.remove('show');
    document.getElementById('modalSaveBtn').classList.remove('loading');
    document.getElementById('modalSaveBtn').disabled = false;
    // Reset preview state
    document.getElementById('answerPreview').style.display = 'none';
    document.getElementById('modalAnswer').style.display = '';
    document.getElementById('previewToggleBtn').classList.remove('active');
}

async function saveQa() {
    if (!validateModal()) return;
    const saveBtn = document.getElementById('modalSaveBtn');
    saveBtn.classList.add('loading');
    saveBtn.disabled = true;

    const qaId = document.getElementById('editQaId').value;
    // Get current user name from session
    const sess = AuthSession.get();
    const creatorName = sess?.fullName || sess?.email || sess?.username || '';

    const data = {
        category: document.getElementById('modalCategory').value,
        question: document.getElementById('modalQuestion').value.trim(),
        answer: document.getElementById('modalAnswer').value.trim(),
        keywords: document.getElementById('modalKeywords').value.trim(),
        is_active: document.getElementById('modalActive').checked,
        created_by: creatorName,
    };

    // super_admin: include selected company_id
    if (currentRole === 'super_admin' && companiesList.length > 0) {
        data.company_id = parseInt(document.getElementById('modalCompany').value, 10);
    }

    try {
        if (qaId) {
            await apiPut(`/qa/${qaId}`, data);
            showToast('Q&A가 수정되었습니다.', 'success');
            markQaModified();
        } else {
            await apiPost('/qa', data);
            showToast('새 Q&A가 등록되었습니다.', 'success');
            markQaModified();
        }
        closeModal();
        loadQaList();
        loadStats();
    } catch (e) {
        saveBtn.classList.remove('loading');
        saveBtn.disabled = false;
        showToast('저장에 실패했습니다: ' + e.message, 'error');
    }
}

/* ═══════════════════════════════════════════════
 *  ADMIN MANAGEMENT
 * ═══════════════════════════════════════════════ */
async function loadAdminList() {
    try {
        const data = await apiGet('/admins');
        const tbody = document.getElementById('adminTableBody');
        const roleLabels = { super_admin: '최고관리자', admin: '관리자', viewer: '뷰어' };

        tbody.innerHTML = data.items.map(admin => `
            <tr>
                <td>${admin.user_id}</td>
                <td>${escapeHtml(admin.email)}</td>
                <td>${escapeHtml(admin.full_name || '-')}</td>
                <td><span class="role-badge role-${admin.role}">${roleLabels[admin.role] || admin.role}</span></td>
                <td>${admin.is_active ? '<span style="color:var(--success)">활성</span>' : '<span style="color:var(--gray-400)">비활성</span>'}</td>
                <td>
                    <div class="actions">
                        <button class="btn btn-outline btn-sm" onclick="openEditAdminModal(${admin.user_id})">수정</button>
                        <button class="btn btn-danger btn-sm" onclick="openDeleteConfirm(${admin.user_id}, 'admin')">삭제</button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (e) {
        console.error('Admin list error:', e);
    }
}

function openAdminModal() {
    document.getElementById('adminModalTitle').textContent = '관리자 추가';
    document.getElementById('editAdminId').value = '';
    document.getElementById('adminEmail').value = '';
    document.getElementById('adminPassword').value = '';
    document.getElementById('adminFullName').value = '';
    document.getElementById('adminPhone').value = '';
    document.getElementById('adminDepartment').value = '';
    document.getElementById('adminPosition').value = '';
    document.getElementById('adminPasswordGroup').style.display = '';
    document.getElementById('adminModal').classList.add('show');
}

async function openEditAdminModal(userId) {
    try {
        const admin = await apiGet(`/admins/${userId}`);
        document.getElementById('adminModalTitle').textContent = '관리자 수정';
        document.getElementById('editAdminId').value = admin.user_id;
        document.getElementById('adminEmail').value = admin.email;
        document.getElementById('adminPassword').value = '';
        document.getElementById('adminFullName').value = admin.full_name || '';
        document.getElementById('adminPhone').value = admin.phone || '';
        document.getElementById('adminDepartment').value = admin.department || '';
        document.getElementById('adminPosition').value = admin.position || '';
        document.getElementById('adminPasswordGroup').style.display = 'none';
        document.getElementById('adminModal').classList.add('show');
    } catch (e) {
        showToast('관리자 정보를 불러올 수 없습니다.', 'error');
    }
}

function closeAdminModal() {
    document.getElementById('adminModal').classList.remove('show');
}

async function saveAdmin() {
    const adminId = document.getElementById('editAdminId').value;
    const email = document.getElementById('adminEmail').value.trim();
    if (!email) { showToast('이메일을 입력해 주세요.', 'error'); return; }

    try {
        if (adminId) {
            // Update
            const data = {
                email,
                full_name: document.getElementById('adminFullName').value.trim() || null,
                phone: document.getElementById('adminPhone').value.trim() || null,
                department: document.getElementById('adminDepartment').value.trim() || null,
                position: document.getElementById('adminPosition').value.trim() || null,
                role: 'admin',
            };
            await apiPut(`/admins/${adminId}`, data);
            showToast('관리자가 수정되었습니다.', 'success');
        } else {
            // Create
            const password = document.getElementById('adminPassword').value;
            if (!password) { showToast('비밀번호를 입력해 주세요.', 'error'); return; }
            const data = {
                email,
                password,
                full_name: document.getElementById('adminFullName').value.trim() || null,
                phone: document.getElementById('adminPhone').value.trim() || null,
                department: document.getElementById('adminDepartment').value.trim() || null,
                position: document.getElementById('adminPosition').value.trim() || null,
                role: 'admin',
            };
            await apiPost('/admins', data);
            showToast('관리자가 추가되었습니다.', 'success');
        }
        closeAdminModal();
        loadAdminList();
    } catch (e) {
        showToast('저장에 실패했습니다: ' + e.message, 'error');
    }
}

/* ═══════════════════════════════════════════════
 *  FEEDBACK MANAGEMENT
 * ═══════════════════════════════════════════════ */
let feedbackItems = [];

async function loadFeedbackList() {
    const rating = document.getElementById('feedbackRatingFilter').value;
    const status = document.getElementById('feedbackStatusFilter').value;
    const params = new URLSearchParams({ page: feedbackPage, size: PAGE_SIZE });
    if (rating) params.append('rating', rating);
    if (status) params.append('status', status);

    const loading = document.getElementById('feedbackTableLoading');
    loading.classList.add('show');
    try {
        const data = await apiGet(`/feedback?${params}`);
        feedbackItems = data.items || [];
        renderFeedbackTable(feedbackItems);
        renderFeedbackPagination(data.page, data.pages);
    } catch (e) {
        console.error('Feedback list error:', e);
    } finally {
        loading.classList.remove('show');
    }
}

function renderFeedbackTable(items) {
    const tbody = document.getElementById('feedbackTableBody');
    const empty = document.getElementById('feedbackEmptyState');

    if (!items || items.length === 0) {
        tbody.innerHTML = '';
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';
    tbody.innerHTML = items.map((item, idx) => {
        const ratingIcon = item.rating === 'like'
            ? '<span style="color:var(--success);font-size:1.2rem" title="만족">&#x1F44D;</span>'
            : '<span style="color:var(--danger);font-size:1.2rem" title="불만족">&#x1F44E;</span>';
        const statusLabel = item.status === 'pending'
            ? '<span style="color:#FF9800">미처리</span>'
            : '<span style="color:var(--success)">처리완료</span>';
        const feedbackId = item.feedback_id || item.id;
        return `
        <tr>
            <td style="text-align:center">${ratingIcon}</td>
            <td class="question-cell" title="${escapeHtml(item.question)}">${escapeHtml(item.question)}</td>
            <td class="answer-cell" title="${escapeHtml(item.answer || '')}">${escapeHtml((item.answer || '').substring(0, 100))}</td>
            <td>${statusLabel}</td>
            <td>${item.created_at ? formatDateTime(item.created_at) : '-'}</td>
            <td>
                <div class="actions">
                    ${item.status === 'pending' ? `
                        <button class="btn btn-primary btn-sm" onclick="onFeedbackEdit(${idx})">Q&A 수정</button>
                        <button class="btn btn-outline btn-sm" onclick="resolveFeedback(${feedbackId})">처리완료</button>
                    ` : ''}
                </div>
            </td>
        </tr>`;
    }).join('');
}

function renderFeedbackPagination(page, pages) {
    const container = document.getElementById('feedbackPagination');
    if (pages <= 1) { container.innerHTML = ''; return; }

    let html = `<button ${page <= 1 ? 'disabled' : ''} onclick="goToFeedbackPage(${page - 1})">&laquo;</button>`;
    const start = Math.max(1, page - 2);
    const end = Math.min(pages, page + 2);
    if (start > 1) {
        html += `<button onclick="goToFeedbackPage(1)">1</button>`;
        if (start > 2) html += `<button disabled>...</button>`;
    }
    for (let i = start; i <= end; i++) {
        html += `<button class="${i === page ? 'active' : ''}" onclick="goToFeedbackPage(${i})">${i}</button>`;
    }
    if (end < pages) {
        if (end < pages - 1) html += `<button disabled>...</button>`;
        html += `<button onclick="goToFeedbackPage(${pages})">${pages}</button>`;
    }
    html += `<button ${page >= pages ? 'disabled' : ''} onclick="goToFeedbackPage(${page + 1})">&raquo;</button>`;
    container.innerHTML = html;
}

function goToFeedbackPage(page) { feedbackPage = page; loadFeedbackList(); }

function onFeedbackEdit(idx) {
    const item = feedbackItems[idx];
    if (!item) return;
    const feedbackId = item.feedback_id || item.id;
    const qaId = (item.qa_ids && item.qa_ids.length > 0) ? item.qa_ids[0] : null;
    editQaFromFeedback(qaId, feedbackId, item.question || '');
}

async function editQaFromFeedback(qaId, feedbackId, question) {
    try {
        if (qaId) {
            await openEditModal(qaId);
        } else {
            openCreateModal();
            if (question) {
                document.getElementById('modalQuestion').value = question;
                onQuestionInput();
            }
        }
    } catch (e) {
        // openEditModal 실패 시 새 Q&A 생성으로 전환
        openCreateModal();
        if (question) {
            document.getElementById('modalQuestion').value = question;
            onQuestionInput();
        }
    }

    // 저장 후 피드백도 resolved 처리하도록 오버라이드
    const origSave = window._origSaveQaFb || saveQa;
    if (!window._origSaveQaFb) window._origSaveQaFb = saveQa;

    window.saveQa = async function () {
        if (!validateModal()) return;
        const saveBtn = document.getElementById('modalSaveBtn');
        saveBtn.classList.add('loading');
        saveBtn.disabled = true;

        const editId = document.getElementById('editQaId').value;
        const data = {
            category: document.getElementById('modalCategory').value,
            question: document.getElementById('modalQuestion').value.trim(),
            answer: document.getElementById('modalAnswer').value.trim(),
            keywords: document.getElementById('modalKeywords').value.trim(),
            is_active: document.getElementById('modalActive').checked,
        };
        if (currentRole === 'super_admin' && companiesList.length > 0) {
            data.company_id = parseInt(document.getElementById('modalCompany').value, 10);
        }

        try {
            if (editId) {
                await apiPut(`/qa/${editId}`, data);
            } else {
                await apiPost('/qa', data);
            }
            await apiPatch(`/feedback/${feedbackId}`, { status: 'resolved' });
            showToast('Q&A가 저장되고 피드백이 처리되었습니다.', 'success');
            markQaModified();
            closeModal();
            loadQaList();
            loadStats();
            loadFeedbackList();
        } catch (e) {
            saveBtn.classList.remove('loading');
            saveBtn.disabled = false;
            showToast('저장에 실패했습니다: ' + e.message, 'error');
        }
        window.saveQa = origSave;
    };
}

async function resolveFeedback(id) {
    try {
        await apiPatch(`/feedback/${id}`, { status: 'resolved' });
        showToast('피드백이 처리완료되었습니다.', 'success');
        loadFeedbackList();
        loadStats();
    } catch (e) {
        showToast('처리에 실패했습니다: ' + e.message, 'error');
    }
}

/* ═══════════════════════════════════════════════
 *  UNANSWERED QUESTIONS
 * ═══════════════════════════════════════════════ */
async function loadUnansweredList() {
    const params = new URLSearchParams({ page: unansweredPage, size: PAGE_SIZE });
    const loading = document.getElementById('unansweredTableLoading');
    loading.classList.add('show');
    try {
        const data = await apiGet(`/unanswered-questions?${params}`);
        renderUnansweredTable(data.items);
        renderUnansweredPagination(data.page, data.pages);
    } catch (e) {
        console.error('Unanswered list error:', e);
    } finally {
        loading.classList.remove('show');
    }
}

function renderUnansweredTable(items) {
    const tbody = document.getElementById('unansweredTableBody');
    const empty = document.getElementById('unansweredEmptyState');

    if (!items || items.length === 0) {
        tbody.innerHTML = '';
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';
    tbody.innerHTML = items.map(item => {
        const statusLabel = item.status === 'pending' ? '<span style="color:#FF9800">대기</span>'
            : item.status === 'resolved' ? '<span style="color:var(--success)">등록됨</span>'
            : '<span style="color:var(--gray-400)">무시</span>';
        return `
        <tr>
            <td title="${escapeHtml(item.question)}">${escapeHtml(item.question)}</td>
            <td>${item.created_at ? formatDateTime(item.created_at) : '-'}</td>
            <td>${statusLabel}</td>
            <td>
                <div class="actions">
                    ${item.status === 'pending' ? `
                        <button class="btn btn-primary btn-sm" onclick="resolveUnanswered(${item.id}, '${escapeHtml(item.question).replace(/'/g, "\\'")}')">Q&A 등록</button>
                        <button class="btn btn-outline btn-sm" onclick="dismissUnanswered(${item.id})">무시</button>
                    ` : ''}
                </div>
            </td>
        </tr>`;
    }).join('');
}

function renderUnansweredPagination(page, pages) {
    const container = document.getElementById('unansweredPagination');
    if (pages <= 1) { container.innerHTML = ''; return; }

    let html = `<button ${page <= 1 ? 'disabled' : ''} onclick="goToUnansweredPage(${page - 1})">&laquo;</button>`;
    const start = Math.max(1, page - 2);
    const end = Math.min(pages, page + 2);
    if (start > 1) {
        html += `<button onclick="goToUnansweredPage(1)">1</button>`;
        if (start > 2) html += `<button disabled>...</button>`;
    }
    for (let i = start; i <= end; i++) {
        html += `<button class="${i === page ? 'active' : ''}" onclick="goToUnansweredPage(${i})">${i}</button>`;
    }
    if (end < pages) {
        if (end < pages - 1) html += `<button disabled>...</button>`;
        html += `<button onclick="goToUnansweredPage(${pages})">${pages}</button>`;
    }
    html += `<button ${page >= pages ? 'disabled' : ''} onclick="goToUnansweredPage(${page + 1})">&raquo;</button>`;
    container.innerHTML = html;
}

function goToUnansweredPage(page) { unansweredPage = page; loadUnansweredList(); }

function resolveUnanswered(id, question) {
    // Open Q&A create modal with question pre-filled
    openCreateModal();
    document.getElementById('modalQuestion').value = question;
    onQuestionInput();

    // Override save to also resolve the unanswered question
    const origSave = window._origSaveQa || saveQa;
    if (!window._origSaveQa) window._origSaveQa = saveQa;

    window.saveQa = async function () {
        if (!validateModal()) return;
        const saveBtn = document.getElementById('modalSaveBtn');
        saveBtn.classList.add('loading');
        saveBtn.disabled = true;

        const qaId = document.getElementById('editQaId').value;
        const data = {
            category: document.getElementById('modalCategory').value,
            question: document.getElementById('modalQuestion').value.trim(),
            answer: document.getElementById('modalAnswer').value.trim(),
            keywords: document.getElementById('modalKeywords').value.trim(),
            is_active: document.getElementById('modalActive').checked,
        };
        if (currentRole === 'super_admin' && companiesList.length > 0) {
            data.company_id = parseInt(document.getElementById('modalCompany').value, 10);
        }

        try {
            if (qaId) {
                await apiPut(`/qa/${qaId}`, data);
            } else {
                await apiPost('/qa', data);
            }
            // Mark unanswered as resolved
            await apiPatch(`/unanswered-questions/${id}`, { status: 'resolved' });
            showToast('Q&A가 등록되고 미답변이 처리되었습니다.', 'success');
            markQaModified();
            closeModal();
            loadQaList();
            loadStats();
            loadUnansweredList();
        } catch (e) {
            saveBtn.classList.remove('loading');
            saveBtn.disabled = false;
            showToast('저장에 실패했습니다: ' + e.message, 'error');
        }

        // Restore original saveQa
        window.saveQa = origSave;
    };
}

async function dismissUnanswered(id) {
    try {
        await apiPatch(`/unanswered-questions/${id}`, { status: 'dismissed' });
        showToast('미답변 질문이 무시 처리되었습니다.', 'success');
        loadUnansweredList();
        loadStats();
    } catch (e) {
        showToast('처리에 실패했습니다: ' + e.message, 'error');
    }
}

/* ═══════════════════════════════════════════════
 *  ACTIVITY LOGS
 * ═══════════════════════════════════════════════ */
async function loadActivityLogs() {
    try {
        const params = new URLSearchParams({ page: logPage, size: 20 });
        const data = await apiGet(`/activity-logs?${params}`);
        const tbody = document.getElementById('logTableBody');
        const empty = document.getElementById('logEmptyState');

        if (data.items.length === 0) {
            tbody.innerHTML = '';
            empty.style.display = 'block';
            return;
        }
        empty.style.display = 'none';

        tbody.innerHTML = data.items.map(log => `
            <tr>
                <td>${log.activity_id}</td>
                <td><span class="badge badge-category">${escapeHtml(log.action_type)}</span></td>
                <td>${log.target_type ? escapeHtml(log.target_type) + (log.target_id ? ' #' + log.target_id : '') : '-'}</td>
                <td>${log.details ? escapeHtml(log.details).substring(0, 100) : '-'}</td>
                <td>${log.timestamp ? formatDateTime(log.timestamp) : '-'}</td>
            </tr>
        `).join('');

        // Log pagination
        const container = document.getElementById('logPagination');
        if (data.pages <= 1) { container.innerHTML = ''; return; }
        let html = `<button ${logPage <= 1 ? 'disabled' : ''} onclick="goToLogPage(${logPage - 1})">&laquo;</button>`;
        for (let i = Math.max(1, logPage - 2); i <= Math.min(data.pages, logPage + 2); i++) {
            html += `<button class="${i === logPage ? 'active' : ''}" onclick="goToLogPage(${i})">${i}</button>`;
        }
        html += `<button ${logPage >= data.pages ? 'disabled' : ''} onclick="goToLogPage(${logPage + 1})">&raquo;</button>`;
        container.innerHTML = html;
    } catch (e) {
        console.error('Activity logs error:', e);
    }
}

function goToLogPage(page) { logPage = page; loadActivityLogs(); }

/* ═══════════════════════════════════════════════
 *  DELETE (shared for QA and Admin)
 * ═══════════════════════════════════════════════ */
function openDeleteConfirm(id, type) {
    deleteTargetId = id;
    deleteTargetType = type;
    const title = type === 'admin' ? '관리자 삭제' : 'Q&A 삭제';
    document.getElementById('deleteConfirmTitle').textContent = title;
    document.getElementById('deleteConfirm').classList.add('show');
    document.getElementById('confirmDeleteBtn').onclick = confirmDelete;
}

function closeDeleteConfirm() {
    document.getElementById('deleteConfirm').classList.remove('show');
    deleteTargetId = null;
    deleteTargetType = null;
}

async function confirmDelete() {
    if (!deleteTargetId) return;
    try {
        if (deleteTargetType === 'admin') {
            await apiDelete(`/admins/${deleteTargetId}`);
            closeDeleteConfirm();
            showToast('관리자가 삭제되었습니다.', 'success');
            loadAdminList();
        } else {
            await apiDelete(`/qa/${deleteTargetId}`);
            closeDeleteConfirm();
            showToast('Q&A가 삭제되었습니다.', 'success');
            markQaModified();
            loadQaList();
            loadStats();
        }
    } catch (e) {
        closeDeleteConfirm();
        showToast('삭제에 실패했습니다: ' + e.message, 'error');
    }
}

/* ═══════════════════════════════════════════════
 *  PROFILE MODAL
 * ═══════════════════════════════════════════════ */
async function openProfileModal() {
    try {
        const me = await apiGet('/admins/me');
        document.getElementById('profileEmail').value = me.email || '';
        document.getElementById('profileFullName').value = me.full_name || '';
        document.getElementById('profilePhone').value = me.phone || '';
        document.getElementById('profileCurrentPw').value = '';
        document.getElementById('profileNewPw').value = '';
        document.getElementById('profileNewPwConfirm').value = '';

        document.getElementById('profileModal').classList.add('show');
    } catch (e) {
        showToast('내 정보를 불러올 수 없습니다.', 'error');
    }
}

function closeProfileModal() {
    document.getElementById('profileModal').classList.remove('show');
}

async function saveProfile() {
    const fullName = document.getElementById('profileFullName').value.trim();
    const phone = document.getElementById('profilePhone').value.trim();
    const currentPw = document.getElementById('profileCurrentPw').value;
    const newPw = document.getElementById('profileNewPw').value;
    const newPwConfirm = document.getElementById('profileNewPwConfirm').value;

    const saveBtn = document.getElementById('profileSaveBtn');
    saveBtn.disabled = true;

    try {
        // Update profile info (name, phone)
        await apiPatch('/admins/me', {
            full_name: fullName || null,
            phone: phone || null,
        });

        // Change password if fields are filled
        if (currentPw || newPw || newPwConfirm) {
            if (!currentPw) {
                showToast('현재 비밀번호를 입력해 주세요.', 'error');
                saveBtn.disabled = false;
                return;
            }
            if (!newPw) {
                showToast('새 비밀번호를 입력해 주세요.', 'error');
                saveBtn.disabled = false;
                return;
            }
            if (newPw.length < 8) {
                showToast('새 비밀번호는 8자 이상이어야 합니다.', 'error');
                saveBtn.disabled = false;
                return;
            }
            if (newPw !== newPwConfirm) {
                showToast('새 비밀번호가 일치하지 않습니다.', 'error');
                saveBtn.disabled = false;
                return;
            }
            await apiPatch('/admins/me/password', {
                current_password: currentPw,
                new_password: newPw,
            });
        }

        // Update header display name
        if (fullName) {
            document.getElementById('adminUsername').textContent = fullName + '님';
        }

        showToast('내 정보가 수정되었습니다.', 'success');
        closeProfileModal();
    } catch (e) {
        showToast(e.message || '저장에 실패했습니다.', 'error');
    } finally {
        saveBtn.disabled = false;
    }
}

/* ═══════════════════════════════════════════════
 *  COMPANY SETTINGS (Dashboard)
 * ═══════════════════════════════════════════════ */
async function loadCompanySettings() {
    try {
        const company = await apiGet('/companies/me');
        document.getElementById('dashCompanyName').value = company.company_name || '';
        document.getElementById('dashCompanyAddress').value = company.address || '';
        document.getElementById('dashGreeting').value = company.greeting_text || '';

        // Load categories
        const wrap = document.getElementById('categoryItemsWrap');
        wrap.innerHTML = '';
        const categories = company.categories || [];
        categories.forEach(cat => addCategoryItem(cat.label, cat.question));

        // Sync category dropdowns
        syncCategoryDropdowns(categories);
    } catch (e) {
        const sess = AuthSession.get();
        document.getElementById('dashCompanyName').value = sess?.companyName || '';
    }
}

function syncCategoryDropdowns(categories) {
    if (!categories || categories.length === 0) return;
    const labels = categories.map(c => c.label);

    const filterEl = document.getElementById('categoryFilter');
    const filterVal = filterEl.value;
    filterEl.innerHTML = '<option value="">전체 카테고리</option>';
    labels.forEach(label => {
        const opt = document.createElement('option');
        opt.value = label;
        opt.textContent = label;
        filterEl.appendChild(opt);
    });
    filterEl.value = filterVal;

    const modalEl = document.getElementById('modalCategory');
    const modalVal = modalEl.value;
    modalEl.innerHTML = '';
    labels.forEach(label => {
        const opt = document.createElement('option');
        opt.value = label;
        opt.textContent = label;
        modalEl.appendChild(opt);
    });
    if (modalVal && labels.includes(modalVal)) modalEl.value = modalVal;
}

async function saveCompanySettings() {
    const companyName = document.getElementById('dashCompanyName').value.trim();
    const companyAddress = document.getElementById('dashCompanyAddress').value.trim();
    const greetingText = document.getElementById('dashGreeting').value.trim();
    const categories = getCategoryItems();

    const saveBtn = document.getElementById('companySettingsSaveBtn');
    saveBtn.disabled = true;

    try {
        await apiPut('/companies/me', {
            company_name: companyName || null,
            address: companyAddress || null,
            greeting_text: greetingText || null,
            categories: categories.length > 0 ? categories : null,
        });

        if (companyName) {
            document.getElementById('headerCompanyName').textContent = companyName;
        }

        showToast('회사 설정이 저장되었습니다.', 'success');
        syncCategoryDropdowns(categories);
    } catch (e) {
        showToast(e.message || '저장에 실패했습니다.', 'error');
    } finally {
        saveBtn.disabled = false;
    }
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

function formatDate(dateStr) {
    const d = new Date(dateStr);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
}

function formatDateTime(dateStr) {
    const d = new Date(dateStr);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day} ${h}:${min}`;
}

/* ═══════════════════════════════════════════════
 *  ANSWER EDITOR (Image / Link / Preview)
 * ═══════════════════════════════════════════════ */
async function handleImageUpload(input) {
    const file = input.files[0];
    if (!file) return;

    // 파일 크기 제한 (5MB)
    if (file.size > 5 * 1024 * 1024) {
        showToast('이미지는 5MB 이하만 업로드 가능합니다.', 'error');
        input.value = '';
        return;
    }

    const btn = document.getElementById('imageUploadBtn');
    const origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-spinner" style="display:inline-block;width:14px;height:14px;border:2px solid var(--gray-300);border-top-color:var(--primary);border-radius:50%;animation:tableSpin 0.6s linear infinite"></span> 업로드중...';

    try {
        const formData = new FormData();
        formData.append('file', file);

        const result = await apiFetch('/upload/image', {
            method: 'POST',
            body: formData,
        });

        const url = result.url;
        const alt = file.name.replace(/\.[^.]+$/, '');
        insertAtCursor('modalAnswer', `![${alt}](${url})`);
        showToast('이미지가 업로드되었습니다.', 'success');
    } catch (e) {
        showToast('이미지 업로드에 실패했습니다: ' + e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = origHtml;
        input.value = '';
    }
}

function insertLinkToAnswer() {
    const url = prompt('웹사이트 URL을 입력하세요:', 'https://');
    if (!url || url === 'https://') return;
    const text = prompt('링크 텍스트를 입력하세요:', '') || url;
    const markdown = `[${text}](${url})`;
    insertAtCursor('modalAnswer', markdown);
}

function insertAtCursor(textareaId, text) {
    const ta = document.getElementById(textareaId);
    ta.focus();
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = ta.value.substring(0, start);
    const after = ta.value.substring(end);
    ta.value = before + text + after;
    ta.selectionStart = ta.selectionEnd = start + text.length;
    // Trigger input event for validation
    ta.dispatchEvent(new Event('input'));
}

function toggleAnswerPreview() {
    const ta = document.getElementById('modalAnswer');
    const preview = document.getElementById('answerPreview');
    const btn = document.getElementById('previewToggleBtn');

    if (preview.style.display === 'none') {
        // Show preview
        const raw = ta.value || '';
        if (typeof marked !== 'undefined' && marked.parse) {
            preview.innerHTML = marked.parse(raw);
        } else {
            preview.textContent = raw;
        }
        // Make links open in new tab
        preview.querySelectorAll('a').forEach(a => {
            a.setAttribute('target', '_blank');
            a.setAttribute('rel', 'noopener noreferrer');
        });
        preview.style.display = '';
        ta.style.display = 'none';
        btn.classList.add('active');
    } else {
        // Show editor
        preview.style.display = 'none';
        ta.style.display = '';
        btn.classList.remove('active');
        ta.focus();
    }
}

/* ═══════════════════════════════════════════════
 *  CATEGORY ITEMS (Dashboard)
 * ═══════════════════════════════════════════════ */
function addCategoryItem(label, question) {
    const wrap = document.getElementById('categoryItemsWrap');
    const isEtc = (label || '').trim() === '기타';

    const row = document.createElement('div');
    row.className = 'category-item';
    row.innerHTML =
        '<div class="cat-order-btns">' +
            '<button type="button" class="cat-up" title="위로">&uarr;</button>' +
            '<button type="button" class="cat-down" title="아래로">&darr;</button>' +
        '</div>' +
        '<input type="text" class="form-control cat-label" placeholder="버튼 텍스트 (예: 입주신고)" value="' + escapeHtml(label || '') + '">' +
        '<input type="text" class="form-control cat-question" placeholder="질문 (예: 입주신고 시 필요한 서류는?)" value="' + escapeHtml(question || '') + '">' +
        '<button type="button" class="btn-category-remove' + (isEtc ? ' disabled' : '') + '" title="삭제">&times;</button>';

    row.querySelector('.cat-up').addEventListener('click', function () {
        const prev = row.previousElementSibling;
        if (prev) { wrap.insertBefore(row, prev); updateCategoryOrderBtns(); }
    });

    row.querySelector('.cat-down').addEventListener('click', function () {
        const next = row.nextElementSibling;
        if (next) { wrap.insertBefore(next, row); updateCategoryOrderBtns(); }
    });

    if (!isEtc) {
        row.querySelector('.btn-category-remove').addEventListener('click', function () {
            const catLabel = row.querySelector('.cat-label').value.trim();
            if (!confirm('삭제하시겠습니까?\n카테고리 이하 데이터가 보이지 않을 수 있습니다.')) return;

            // Move Q&A data from this category to "기타"
            if (catLabel) {
                apiPatch('/qa/move-category', { from_category: catLabel, to_category: '기타' })
                    .then(() => showToast('"' + catLabel + '" Q&A가 "기타"로 이동되었습니다.', 'success'))
                    .catch(() => showToast('Q&A 카테고리 이동에 실패했습니다.', 'error'));
            }

            row.remove();
            updateCategoryOrderBtns();
        });
    }

    wrap.appendChild(row);
    updateCategoryOrderBtns();
}

function updateCategoryOrderBtns() {
    const wrap = document.getElementById('categoryItemsWrap');
    const items = wrap.querySelectorAll('.category-item');
    items.forEach((item, i) => {
        item.querySelector('.cat-up').disabled = (i === 0);
        item.querySelector('.cat-down').disabled = (i === items.length - 1);
    });
}

function getCategoryItems() {
    const wrap = document.getElementById('categoryItemsWrap');
    const items = wrap.querySelectorAll('.category-item');
    const result = [];
    items.forEach(item => {
        const label = item.querySelector('.cat-label').value.trim();
        const question = item.querySelector('.cat-question').value.trim();
        if (label && question) {
            result.push({ label, question });
        }
    });
    return result;
}

/* loadCompanyCategories → replaced by loadCompanySettings + syncCategoryDropdowns */
