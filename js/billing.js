const TOSS_CLIENT_KEY = 'test_ck_24xLea5zVAm4l9Mo1XglVQAMYNwW';

document.addEventListener('DOMContentLoaded', () => {
    // ── Auth check ──
    if (!AuthSession.isValid()) {
        AuthSession.redirectToLogin();
        return;
    }

    const sess = AuthSession.get();
    const customerKey = `company_${sess.companyId}`;

    // Show company label
    const companyLabel = document.getElementById('companyLabel');
    if (companyLabel && sess.companyName) {
        companyLabel.textContent = sess.companyName;
        companyLabel.style.display = '';
    }

    // Update admin link
    const adminLink = document.getElementById('adminLink');
    if (adminLink && (sess.fullName || sess.username)) {
        adminLink.textContent = `관리자 (${sess.fullName || sess.username})`;
    }

    // Show super admin link
    if (sess.role === 'super_admin') {
        const saLink = document.getElementById('superAdminLink');
        if (saLink) saLink.style.display = '';
    }

    // ── Handle URL params (success/fail callback) ──
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    if (status === 'success') {
        showAlert('카드 등록 및 결제가 완료되었습니다!', 'success');
        window.history.replaceState({}, '', '/billing.html');
        // 백엔드 /api/billing/success 에서 이미 첫 결제를 처리하므로 추가 호출 불필요
        setTimeout(() => {
            window.location.href = '/admin.html';
        }, 2000);
    } else if (status === 'fail') {
        const msg = params.get('message') || '카드 등록에 실패했습니다. 다시 시도해 주세요.';
        showAlert(msg, 'error');
        window.history.replaceState({}, '', '/billing.html');
    }

    // ── Bind events (SDK 초기화는 클릭 시점에) ──
    const trialBtn = document.getElementById('trialBtn');
    if (trialBtn) {
        trialBtn.addEventListener('click', startTrial);
    }

    const subscribeBtn = document.getElementById('subscribeBtn');
    if (subscribeBtn) {
        subscribeBtn.addEventListener('click', () => requestBillingAuth(customerKey));
    }

    const changeCardBtn = document.getElementById('changeCardBtn');
    if (changeCardBtn) {
        changeCardBtn.addEventListener('click', () => requestBillingAuth(customerKey));
    }

    const cancelSubBtn = document.getElementById('cancelSubBtn');
    if (cancelSubBtn) {
        cancelSubBtn.addEventListener('click', cancelSubscription);
    }

    // ── Promo popup (팝업 닫힌 뒤 나머지 로직 실행) ──
    showPromoPopup().then(() => {
        // ── 유료 구독(enterprise) 활성이면 바로 admin 이동 ──
        if (sess.billingActive && sess.subscriptionPlan === 'enterprise') {
            window.location.href = '/admin.html';
            return;
        }

        // ── Load subscription status ──
        loadSubscriptionStatus(sess.companyId);
    });
});

/* ──────────────────────────────────────────────
 *  Promo Event Popup (오늘 안보기 지원)
 *  팝업을 즉시 표시하고, 닫힌 뒤 resolve 되는 Promise 반환
 * ────────────────────────────────────────────── */
function showPromoPopup() {
    const overlay = document.getElementById('promoPopup');
    const closeBtn = document.getElementById('promoPopupClose');
    const confirmBtn = document.getElementById('promoPopupConfirm');
    const todayCheck = document.getElementById('promoTodayCheck');
    const bannerBtn = document.getElementById('promoBannerBtn');

    const STORAGE_KEY = 'promo_hide_date';
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // 팝업 요소 없거나 "오늘 안보기" 상태면 즉시 resolve
    if (!overlay || localStorage.getItem(STORAGE_KEY) === today) {
        bindBannerReopen(overlay, bannerBtn, todayCheck, STORAGE_KEY, today);
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        function openPopup() {
            overlay.classList.add('show');
            document.body.style.overflow = 'hidden';
        }

        function closePopup() {
            if (todayCheck && todayCheck.checked) {
                localStorage.setItem(STORAGE_KEY, today);
            }
            overlay.classList.remove('show');
            document.body.style.overflow = '';
            resolve();
        }

        // 즉시 표시
        openPopup();

        // 닫기 버튼들
        if (closeBtn) closeBtn.addEventListener('click', closePopup);
        if (confirmBtn) confirmBtn.addEventListener('click', closePopup);

        // 오버레이 배경 클릭
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closePopup();
        });

        // ESC 키
        document.addEventListener('keydown', function onEsc(e) {
            if (e.key === 'Escape' && overlay.classList.contains('show')) {
                closePopup();
                document.removeEventListener('keydown', onEsc);
            }
        });

        // 배너 클릭으로 다시 열기
        bindBannerReopen(overlay, bannerBtn, todayCheck, STORAGE_KEY, today);
    });
}

/** 프로모 배너 클릭 시 팝업 수동 재오픈 바인딩 */
function bindBannerReopen(overlay, bannerBtn, todayCheck, STORAGE_KEY, today) {
    if (!overlay || !bannerBtn) return;

    function reopen() {
        overlay.classList.add('show');
        document.body.style.overflow = 'hidden';
    }

    function reclose() {
        if (todayCheck && todayCheck.checked) {
            localStorage.setItem(STORAGE_KEY, today);
        }
        overlay.classList.remove('show');
        document.body.style.overflow = '';
    }

    bannerBtn.addEventListener('click', reopen);
    bannerBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); reopen(); }
    });

    // 재오픈용 닫기 이벤트 (이미 바인딩 안 된 경우 대비)
    const closeBtn = document.getElementById('promoPopupClose');
    const confirmBtn = document.getElementById('promoPopupConfirm');
    if (closeBtn) closeBtn.addEventListener('click', reclose);
    if (confirmBtn) confirmBtn.addEventListener('click', reclose);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) reclose(); });
}


/* ──────────────────────────────────────────────
 *  Request Billing Auth (card registration)
 *  SDK를 클릭 시점에 초기화하여 로드 실패를 잡음
 * ────────────────────────────────────────────── */
function requestBillingAuth(customerKey) {
    try {
        if (typeof TossPayments === 'undefined') {
            showAlert('결제 모듈을 불러오지 못했습니다. 페이지를 새로고침해 주세요.', 'error');
            return;
        }

        var tossPayments = TossPayments(TOSS_CLIENT_KEY);

        tossPayments.requestBillingAuth('카드', {
            customerKey: customerKey,
            successUrl: window.location.origin + '/api/billing/success',
            failUrl: window.location.origin + '/billing.html?status=fail',
        }).catch(function (err) {
            showAlert('결제 요청 실패: ' + err.message, 'error');
        });
    } catch (err) {
        showAlert('결제 처리 중 오류: ' + err.message, 'error');
    }
}

/* ──────────────────────────────────────────────
 *  Load subscription status
 * ────────────────────────────────────────────── */
async function loadSubscriptionStatus(companyId) {
    const loadingEl = document.getElementById('billingLoading');
    const statusSection = document.getElementById('subscriptionStatus');
    const planSection = document.getElementById('planSection');
    const promoSection = document.getElementById('promoSection');

    function showPlanSelection(trialState) {
        statusSection.style.display = 'none';
        planSection.style.display = '';
        if (promoSection) promoSection.style.display = '';

        const trialBtn = document.getElementById('trialBtn');
        const trialExpiredBtn = document.getElementById('trialExpiredBtn');

        if (trialState === 'active') {
            // 체험 진행중 — 남은 일수 표시 + 비활성
            if (trialBtn) {
                trialBtn.disabled = true;
                trialBtn.textContent = '체험중 (' + (trialState.days || '') + ')';
                trialBtn.style.display = '';
            }
            if (trialExpiredBtn) trialExpiredBtn.style.display = 'none';
        } else if (trialState === 'expired') {
            if (trialBtn) trialBtn.style.display = 'none';
            if (trialExpiredBtn) trialExpiredBtn.style.display = '';
        } else {
            if (trialBtn) { trialBtn.style.display = ''; trialBtn.disabled = false; }
            if (trialExpiredBtn) trialExpiredBtn.style.display = 'none';
        }
    }

    try {
        const data = await apiGet('/billing/status?company_id=' + companyId);

        loadingEl.style.display = 'none';

        if (data.active && data.subscription_plan === 'enterprise') {
            window.location.href = '/admin.html';
            return;
        }

        if (data.subscription_plan === 'trial' && data.active) {
            // 체험중 — 남은 일수 계산
            let daysLeft = '';
            if (data.trial_ends_at) {
                const diff = Math.ceil((new Date(data.trial_ends_at) - new Date()) / 86400000);
                daysLeft = (diff > 0 ? diff : 0) + '일 남음';
            }
            const trialBtn = document.getElementById('trialBtn');
            const trialExpiredBtn = document.getElementById('trialExpiredBtn');
            statusSection.style.display = 'none';
            planSection.style.display = '';
            if (promoSection) promoSection.style.display = '';
            if (trialBtn) {
                trialBtn.textContent = '체험중 (' + daysLeft + ')';
                trialBtn.disabled = true;
                trialBtn.style.opacity = '0.7';
                trialBtn.style.display = '';
            }
            if (trialExpiredBtn) trialExpiredBtn.style.display = 'none';
        } else if (data.subscription_plan === 'trial' && !data.active) {
            showPlanSelection('expired');
        } else {
            showPlanSelection('none');
        }
    } catch (err) {
        loadingEl.style.display = 'none';
        showPlanSelection(false);
    }
}

/* ──────────────────────────────────────────────
 *  Execute billing payment (카드 등록 후 실제 결제)
 * ────────────────────────────────────────────── */
async function executeBillingPay() {
    try {
        const sess = AuthSession.get();
        const data = await apiPost('/billing/pay', { company_id: sess.companyId });
        showAlert('구독 결제가 완료되었습니다!', 'success');
        setTimeout(() => {
            window.location.href = '/admin.html';
        }, 2000);
    } catch (err) {
        var msg = (err && typeof err.message === 'string') ? err.message : '결제 API 연동 대기 중입니다. (백엔드 구현 필요)';
        showAlert(msg, 'error');
    }
}

/* ──────────────────────────────────────────────
 *  Start free trial
 * ────────────────────────────────────────────── */
async function startTrial() {
    const trialBtn = document.getElementById('trialBtn');
    trialBtn.disabled = true;

    try {
        const sess = AuthSession.get();
        await apiPost('/billing/trial?company_id=' + sess.companyId);
        showAlert('14일 무료체험이 시작되었습니다!', 'success');
        setTimeout(() => {
            window.location.href = '/admin.html';
        }, 1500);
    } catch (err) {
        showAlert(err.message || '무료체험 시작에 실패했습니다.', 'error');
        trialBtn.disabled = false;
    }
}

/* ──────────────────────────────────────────────
 *  Cancel subscription
 * ────────────────────────────────────────────── */
async function cancelSubscription() {
    if (!confirm('정말 구독을 해지하시겠습니까?\n남은 기간 동안은 계속 이용 가능합니다.')) {
        return;
    }

    const cancelBtn = document.getElementById('cancelSubBtn');
    cancelBtn.disabled = true;

    try {
        const sess = AuthSession.get();
        await apiPost('/billing/cancel?company_id=' + sess.companyId);
        showAlert('구독이 해지되었습니다.', 'success');
        loadSubscriptionStatus();
    } catch (err) {
        showAlert(err.message || '구독 해지에 실패했습니다.', 'error');
    } finally {
        cancelBtn.disabled = false;
    }
}

/* ──────────────────────────────────────────────
 *  Alert helper
 * ────────────────────────────────────────────── */
function showAlert(message, type) {
    const alertEl = document.getElementById('billingAlert');
    const msgEl = document.getElementById('billingAlertMsg');
    alertEl.className = `billing-alert ${type}`;
    msgEl.textContent = message;
    alertEl.style.display = '';

    if (type === 'success' || type === 'info') {
        setTimeout(() => { alertEl.style.display = 'none'; }, 5000);
    }
}
