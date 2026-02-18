const TOSS_CLIENT_KEY = 'test_ck_24xLea5zVAm4l9Mo1XglVQAMYNwW';

document.addEventListener('DOMContentLoaded', () => {
    // ── Auth check ──
    if (!AuthSession.isValid()) {
        AuthSession.redirectToLogin();
        return;
    }

    const sess = AuthSession.get();
    const customerKey = `user_${sess.userId}_${sess.companyId}`;

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

    // ── Handle URL params (success/fail callback) ──
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    if (status === 'success') {
        showAlert('카드 등록 완료! 결제를 진행합니다...', 'success');
        window.history.replaceState({}, '', '/billing.html');
        // 카드 등록 후 즉시 결제 실행
        executeBillingPay();
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

    // ── 세션에서 이미 구독 활성이면 바로 admin 이동 ──
    if (sess.billingActive) {
        window.location.href = '/admin.html';
        return;
    }

    // ── Load subscription status ──
    loadSubscriptionStatus(sess.companyId);
});

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

    function showPlanSelection(trialExpired) {
        statusSection.style.display = 'none';
        planSection.style.display = '';
        if (promoSection) promoSection.style.display = '';

        const trialBtn = document.getElementById('trialBtn');
        const trialExpiredBtn = document.getElementById('trialExpiredBtn');

        if (trialExpired) {
            if (trialBtn) trialBtn.style.display = 'none';
            if (trialExpiredBtn) trialExpiredBtn.style.display = '';
        } else {
            if (trialBtn) trialBtn.style.display = '';
            if (trialExpiredBtn) trialExpiredBtn.style.display = 'none';
        }
    }

    try {
        const data = await apiGet('/billing/status?company_id=' + companyId);

        loadingEl.style.display = 'none';

        if (data.active) {
            window.location.href = '/admin.html';
            return;
        } else {
            showPlanSelection(data.trialExpired);
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
        const data = await apiPost('/billing/pay');
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
        await apiPost('/billing/trial');
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
        await apiPost('/billing/cancel');
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
