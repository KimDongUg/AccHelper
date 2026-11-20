/**
 * demo-lead.js — 메인화면 "체험하기" 신청 팝업 (channel.io 데모 방식)
 *
 * 사용법: 체험 버튼에 data-demo-lead 속성을 붙이면 클릭 시 정보 입력 팝업이 먼저 뜬다.
 *   <a href="/demo-select.html" data-demo-lead="" data-demo-source="header">체험하기</a>
 *   <a href="/?company=1002" data-demo-lead="apt" data-demo-source="hero_apt">샘플아파트 체험하기</a>
 *
 * 신청 완료 후(또는 이미 신청한 브라우저) → /demo-start.html (샘플 바로 입장 + 운영중인 업체)
 * data-demo-lead 값(apt/office)은 어떤 버튼에서 신청했는지 기록용으로만 쓰인다.
 */
(function () {
    var DONE_KEY = 'acc_demo_lead_done';
    var START_URL = '/demo-start.html';

    function isDone() {
        try { return localStorage.getItem(DONE_KEY) === '1'; } catch (e) { return false; }
    }
    function markDone() {
        try { localStorage.setItem(DONE_KEY, '1'); } catch (e) {}
    }
    function getDeviceType() {
        var ua = navigator.userAgent || '';
        if (/iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return 'tablet';
        if (/Mobi|iPhone|Android/i.test(ua)) return 'mobile';
        return 'desktop';
    }
    function formatPhone(v) {
        var d = v.replace(/\D/g, '').slice(0, 11);
        if (d.length < 4) return d;
        if (d.length < 8) return d.slice(0, 3) + '-' + d.slice(3);
        if (d.length === 10) return d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
        return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
    }

    var CHECK_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
    var CHEVRON_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

    var HTML =
        '<div class="dl-overlay" id="dlOverlay" hidden>' +
        '<div class="dl-modal" role="dialog" aria-modal="true" aria-labelledby="dlTitle">' +
            '<button type="button" class="dl-close" aria-label="닫기">&times;</button>' +
            '<h2 class="dl-title" id="dlTitle">AI 헬퍼를 체험해 보세요.<br>정보를 입력하시면 바로 시작됩니다.</h2>' +
            '<form class="dl-form" novalidate>' +
                '<div class="dl-field">' +
                    '<label class="dl-label" for="dlName">이름</label>' +
                    '<input class="dl-input" id="dlName" name="name" type="text" maxlength="50" autocomplete="name" placeholder="이름을 입력해 주세요">' +
                '</div>' +
                '<div class="dl-field">' +
                    '<label class="dl-label" for="dlPhone">휴대폰 번호</label>' +
                    '<input class="dl-input" id="dlPhone" name="phone" type="tel" inputmode="numeric" maxlength="13" autocomplete="tel" placeholder="010-0000-0000">' +
                    '<p class="dl-error" id="dlPhoneErr" hidden>휴대폰 번호를 정확히 입력해 주세요.</p>' +
                '</div>' +
                '<div class="dl-field">' +
                    '<label class="dl-label" for="dlBuilding">아파트(오피스텔)명</label>' +
                    '<input class="dl-input" id="dlBuilding" name="building_name" type="text" maxlength="100" placeholder="예) 세종푸르지오시티 2차">' +
                '</div>' +
                '<div class="dl-field">' +
                    '<label class="dl-label" for="dlEmail">이메일 <span class="dl-optional">(선택)</span></label>' +
                    '<input class="dl-input" id="dlEmail" name="email" type="email" maxlength="120" autocomplete="email" placeholder="이메일을 입력해 주세요">' +
                    '<p class="dl-error" id="dlEmailErr" hidden>이메일 형식이 올바르지 않습니다.</p>' +
                '</div>' +
                '<div class="dl-agree">' +
                    '<div class="dl-agree-row">' +
                        '<label class="dl-check"><input type="checkbox" name="privacy_agreed"><span class="dl-check-box">' + CHECK_SVG + '</span><span>(필수) <u>개인정보 수집·이용</u>에 동의</span></label>' +
                        '<button type="button" class="dl-agree-toggle" aria-expanded="false" aria-controls="dlPrivacyDetail" aria-label="개인정보 수집·이용 내용 보기">' + CHEVRON_SVG + '</button>' +
                    '</div>' +
                    '<div class="dl-agree-detail" id="dlPrivacyDetail" hidden>' +
                        '<p><b>수집 항목</b> 이름, 휴대폰 번호, 아파트(오피스텔)명, 이메일(선택)</p>' +
                        '<p><b>수집 목적</b> 체험 서비스 제공, 도입 상담 및 문의 응대</p>' +
                        '<p><b>보유 기간</b> 수집일로부터 1년 (삭제 요청 시 즉시 파기)</p>' +
                        '<p>동의를 거부할 수 있으나, 거부 시 체험하기를 이용할 수 없습니다. <a href="/privacy.html" target="_blank" rel="noopener">개인정보처리방침</a></p>' +
                    '</div>' +
                    '<div class="dl-agree-row">' +
                        '<label class="dl-check"><input type="checkbox" name="marketing_agreed"><span class="dl-check-box">' + CHECK_SVG + '</span><span>(선택) <u>마케팅 정보 수신</u>에 동의</span></label>' +
                        '<button type="button" class="dl-agree-toggle" aria-expanded="false" aria-controls="dlMarketingDetail" aria-label="마케팅 정보 수신 내용 보기">' + CHEVRON_SVG + '</button>' +
                    '</div>' +
                    '<div class="dl-agree-detail" id="dlMarketingDetail" hidden>' +
                        '<p>AI 헬퍼의 신규 기능, 이벤트, 도입 혜택 안내를 문자·이메일·카카오톡으로 받아보실 수 있습니다. 동의하지 않아도 체험하기를 이용하실 수 있습니다.</p>' +
                    '</div>' +
                '</div>' +
                '<p class="dl-error dl-submit-err" id="dlSubmitErr" hidden></p>' +
                '<button type="submit" class="dl-submit" disabled>체험하기</button>' +
            '</form>' +
        '</div>' +
        '</div>';

    var overlay, form, submitBtn, lastTrigger, currentSource, currentType;

    function build() {
        var wrap = document.createElement('div');
        wrap.innerHTML = HTML;
        overlay = wrap.firstChild;
        document.body.appendChild(overlay);
        form = overlay.querySelector('.dl-form');
        submitBtn = overlay.querySelector('.dl-submit');

        overlay.querySelector('.dl-close').addEventListener('click', close);
        overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) close(); });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !overlay.hidden) close();
        });

        var phone = form.elements.phone;
        phone.addEventListener('input', function () {
            phone.value = formatPhone(phone.value);
        });
        phone.addEventListener('blur', function () {
            var d = phone.value.replace(/\D/g, '');
            overlay.querySelector('#dlPhoneErr').hidden = !d || /^01[016789]\d{7,8}$/.test(d);
        });
        form.elements.email.addEventListener('blur', function () {
            var v = form.elements.email.value.trim();
            overlay.querySelector('#dlEmailErr').hidden = !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
        });

        overlay.querySelectorAll('.dl-agree-toggle').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var detail = document.getElementById(btn.getAttribute('aria-controls'));
                var open = detail.hidden;
                detail.hidden = !open;
                btn.setAttribute('aria-expanded', open ? 'true' : 'false');
            });
        });

        form.addEventListener('input', validate);
        form.addEventListener('change', validate);
        form.addEventListener('submit', submit);
    }

    function isValid() {
        var f = form.elements;
        var phone = f.phone.value.replace(/\D/g, '');
        var email = f.email.value.trim();
        return f.name.value.trim().length > 0 &&
            /^01[016789]\d{7,8}$/.test(phone) &&
            f.building_name.value.trim().length > 0 &&
            (!email || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) &&
            f.privacy_agreed.checked;
    }

    function validate() {
        submitBtn.disabled = !isValid();
    }

    function open(type, source, trigger) {
        if (!overlay) build();
        lastTrigger = trigger;
        currentSource = source || '';
        currentType = (type === 'apt' || type === 'office') ? type : 'select';
        overlay.querySelector('#dlSubmitErr').hidden = true;
        validate();
        overlay.hidden = false;
        document.body.classList.add('dl-open');
        setTimeout(function () { form.elements.name.focus(); }, 50);
    }

    function close() {
        overlay.hidden = true;
        document.body.classList.remove('dl-open');
        if (lastTrigger && lastTrigger.focus) lastTrigger.focus();
    }

    function submit(e) {
        e.preventDefault();
        if (!isValid()) return;
        var f = form.elements;
        var errEl = overlay.querySelector('#dlSubmitErr');
        errEl.hidden = true;
        submitBtn.disabled = true;
        submitBtn.textContent = '잠시만 기다려 주세요...';

        fetch('/api/demo-leads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: f.name.value.trim(),
                phone: f.phone.value.replace(/\D/g, ''),
                email: f.email.value.trim() || null,
                building_name: f.building_name.value.trim(),
                demo_type: currentType,
                privacy_agreed: f.privacy_agreed.checked,
                marketing_agreed: f.marketing_agreed.checked,
                device_type: getDeviceType(),
                source: currentSource || null
            })
        }).then(function (res) {
            return res.json().catch(function () { return {}; }).then(function (data) {
                if (!res.ok) {
                    var msg = typeof data.detail === 'string' ? data.detail
                        : res.status === 429 ? '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'
                        : '신청 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
                    throw new Error(msg);
                }
                markDone();
                if (typeof gaEvent === 'function') { try { gaEvent('demo_lead_submit', currentSource || currentType); } catch (x) {} }
                window.location.href = START_URL;
            });
        }).catch(function (err) {
            errEl.textContent = err && err.message && err.message !== 'Failed to fetch'
                ? err.message : '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.';
            errEl.hidden = false;
            submitBtn.textContent = '체험하기';
            validate();
        });
    }

    document.addEventListener('click', function (e) {
        var el = e.target.closest('[data-demo-lead]');
        if (!el) return;
        var type = el.getAttribute('data-demo-lead') || '';
        e.preventDefault();
        if (isDone()) {
            // 이미 신청한 브라우저: 팝업 없이 체험 시작 페이지로
            window.location.href = START_URL;
            return;
        }
        open(type, el.getAttribute('data-demo-source'), el);
    });

    window.openDemoLead = open;
})();
