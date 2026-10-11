/* ═══════════════════════════════════════════════
 *  페이지 접속 기록 — 슈퍼관리자 "접속자 현황" 집계용
 *  (랜딩페이지 / 샘플아파트·샘플오피스텔 체험하기)
 * ═══════════════════════════════════════════════ */
(function () {
    var VISITOR_KEY = 'acc_visitor_id';
    var SAMPLE_PAGES = { '1002': 'sample_apt', '1000': 'sample_office' };

    function getVisitorId() {
        var id = null;
        try { id = localStorage.getItem(VISITOR_KEY); } catch (e) {}
        if (!id) {
            id = 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
            try { localStorage.setItem(VISITOR_KEY, id); } catch (e) {}
        }
        return id;
    }

    function getDeviceType() {
        var ua = navigator.userAgent || '';
        if (/iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return 'tablet';
        if (/Mobi|iPhone|Android/i.test(ua)) return 'mobile';
        return 'desktop';
    }

    function resolvePage() {
        var params = new URLSearchParams(location.search);
        var company = params.get('company');
        var path = location.pathname;
        if (path === '/' || path === '/index.html') {
            return company ? null : 'landing'; // ?company= 는 챗봇 화면으로 넘어가 거기서 기록
        }
        if (path === '/app.html' || path === '/app') {
            return SAMPLE_PAGES[company] || null;
        }
        return null;
    }

    var page = resolvePage();
    if (!page) return;
    try {
        fetch('/api/visits', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ page: page, visitor_id: getVisitorId(), device_type: getDeviceType() }),
            keepalive: true,
        }).catch(function () {});
    } catch (e) {}
})();
