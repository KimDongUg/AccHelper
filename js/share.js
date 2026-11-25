/**
 * share.js — 단지 링크 공유 팝업
 *
 * 사용법:
 *   <button id="shareBtn" ...></button>
 *   <script src="/js/share.js"></script>
 *   initSharePopup({ button: 'shareBtn', getTitle: () => '단지명 AI Helper' });
 *
 * 카카오톡 공유: SHARE_CONFIG.kakaoJsKey 에 Kakao Developers JavaScript 키를 넣으면 자동 활성화
 * (키가 비어 있으면 카카오톡 아이콘은 표시되지 않음)
 */
var SHARE_CONFIG = {
    kakaoJsKey: '112324dbb4427809437436680fc7c2d3'
};

(function () {
    var ICONS = {
        kakao: '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="#3A1D1D" d="M12 4C7.03 4 3 7.13 3 11c0 2.5 1.68 4.69 4.2 5.93l-.86 3.13c-.08.28.24.5.48.34l3.73-2.47c.48.05.96.07 1.45.07 4.97 0 9-3.13 9-7s-4.03-7-9-7z"/></svg>',
        band: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><text x="12" y="17" text-anchor="middle" font-size="15" font-weight="800" font-family="Arial, sans-serif" fill="#fff">b</text></svg>',
        facebook: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="#fff" d="M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.87.25-1.46 1.5-1.46H16.6V4.46A21 21 0 0 0 14.4 4.35c-2.2 0-3.7 1.34-3.7 3.8V10.5H8.2v3h2.5V21h2.8z"/></svg>',
        x: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="#fff" d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.77L17.75 3zm-1.08 16.2h1.7L7.4 4.73H5.58l11.09 14.47z"/></svg>',
        sms: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
        more: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>'
    };

    var isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    var kakaoReady = false;

    function getShareUrl() {
        var params = new URLSearchParams(window.location.search);
        var company = params.get('company');
        if (company) {
            return window.location.origin + window.location.pathname + '?company=' + encodeURIComponent(company);
        }
        // company 없는 페이지(메인 등)는 쿼리·해시 제거한 깔끔한 주소
        return window.location.origin + window.location.pathname;
    }

    function loadKakao() {
        if (!SHARE_CONFIG.kakaoJsKey) return;
        var s = document.createElement('script');
        s.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js';
        s.crossOrigin = 'anonymous';
        s.onload = function () {
            try {
                if (!window.Kakao.isInitialized()) window.Kakao.init(SHARE_CONFIG.kakaoJsKey);
                kakaoReady = true;
                var item = document.querySelector('.share-item[data-target="kakao"]');
                if (item) item.style.display = '';
            } catch (e) { console.warn('[share] Kakao init 실패', e); }
        };
        document.head.appendChild(s);
    }

    function toast(msg) {
        var t = document.createElement('div');
        t.className = 'share-toast';
        t.textContent = msg;
        document.body.appendChild(t);
        requestAnimationFrame(function () { t.classList.add('show'); });
        setTimeout(function () {
            t.classList.remove('show');
            setTimeout(function () { t.remove(); }, 300);
        }, 1800);
    }

    function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) {
            // 권한 대기 등으로 응답이 없을 때를 대비해 1.5초 타임아웃
            return Promise.race([
                navigator.clipboard.writeText(text),
                new Promise(function (_, reject) { setTimeout(reject, 1500); })
            ]);
        }
        return new Promise(function (resolve, reject) {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy') ? resolve() : reject(); } catch (e) { reject(e); }
            ta.remove();
        });
    }

    function buildPopup() {
        var items = [
            { key: 'kakao', label: '카카오톡', hidden: !kakaoReady },
            { key: 'band', label: '네이버밴드' },
            { key: 'facebook', label: '페이스북' },
            { key: 'x', label: 'X' }
        ];
        if (isMobile) items.push({ key: 'sms', label: '문자' });
        if (navigator.share) items.push({ key: 'more', label: '다른 앱' });

        var grid = items.map(function (it) {
            return '<button type="button" class="share-item" data-target="' + it.key + '"' +
                (it.hidden ? ' style="display:none"' : '') + '>' +
                '<span class="share-icon share-icon-' + it.key + '">' + ICONS[it.key] + '</span>' +
                '<span class="share-label">' + it.label + '</span></button>';
        }).join('');

        var wrap = document.createElement('div');
        wrap.className = 'share-popup';
        wrap.id = 'sharePopup';
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-modal', 'false');
        wrap.setAttribute('aria-labelledby', 'sharePopupTitle');
        wrap.hidden = true;
        wrap.innerHTML =
            '<div class="share-popup-head">' +
                '<strong id="sharePopupTitle">공유하기</strong>' +
                '<button type="button" class="share-close" aria-label="닫기">&times;</button>' +
            '</div>' +
            '<div class="share-grid">' + grid + '</div>' +
            '<div class="share-copy">' +
                '<input type="text" class="share-url" readonly aria-label="공유 링크">' +
                '<button type="button" class="share-copy-btn">복사</button>' +
            '</div>';

        var backdrop = document.createElement('div');
        backdrop.className = 'share-backdrop';
        backdrop.hidden = true;

        document.body.appendChild(backdrop);
        document.body.appendChild(wrap);
        return { popup: wrap, backdrop: backdrop };
    }

    window.initSharePopup = function (opts) {
        var btn = typeof opts.button === 'string' ? document.getElementById(opts.button) : opts.button;
        if (!btn) return;
        var getTitle = opts.getTitle || function () { return document.title; };

        loadKakao();
        var els = buildPopup();
        var popup = els.popup, backdrop = els.backdrop;
        var urlInput = popup.querySelector('.share-url');

        function position() {
            if (window.innerWidth <= 767) {
                popup.style.top = popup.style.left = '';
                return;
            }
            var r = btn.getBoundingClientRect();
            var w = popup.offsetWidth;
            var left = Math.min(r.right - w, window.innerWidth - w - 16);
            popup.style.top = (r.bottom + window.scrollY + 8) + 'px';
            popup.style.left = Math.max(16, left) + 'px';
        }

        function open() {
            urlInput.value = getShareUrl();
            popup.hidden = false;
            backdrop.hidden = false;
            position();
            btn.setAttribute('aria-expanded', 'true');
            popup.querySelector('.share-close').focus();
        }
        function close() {
            popup.hidden = true;
            backdrop.hidden = true;
            btn.setAttribute('aria-expanded', 'false');
        }

        btn.setAttribute('aria-haspopup', 'dialog');
        btn.setAttribute('aria-expanded', 'false');
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            popup.hidden ? open() : close();
        });
        popup.querySelector('.share-close').addEventListener('click', close);
        backdrop.addEventListener('click', close);
        document.addEventListener('click', function (e) {
            if (!popup.hidden && !popup.contains(e.target) && e.target !== btn) close();
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !popup.hidden) { close(); btn.focus(); }
        });
        window.addEventListener('resize', function () { if (!popup.hidden) position(); });

        popup.querySelector('.share-copy-btn').addEventListener('click', function () {
            // 1차: 입력칸 선택 후 execCommand (사용자 클릭 직후라 가장 확실함)
            urlInput.focus();
            urlInput.select();
            urlInput.setSelectionRange(0, urlInput.value.length);
            var ok = false;
            try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
            if (ok) { toast('링크가 복사되었습니다.'); return; }
            // 2차: Clipboard API
            copyText(urlInput.value).then(function () {
                toast('링크가 복사되었습니다.');
            }, function () {
                urlInput.focus();
                urlInput.select();
                toast('링크를 선택했습니다. Ctrl+C(모바일은 길게 눌러) 복사해 주세요.');
            });
        });
        urlInput.addEventListener('focus', function () { urlInput.select(); });

        popup.querySelector('.share-grid').addEventListener('click', function (e) {
            var item = e.target.closest('.share-item');
            if (!item) return;
            var url = getShareUrl();
            var title = getTitle();
            var u = encodeURIComponent(url);
            var t = encodeURIComponent(title);
            switch (item.dataset.target) {
                case 'kakao':
                    if (!kakaoReady) return;
                    window.Kakao.Share.sendDefault({
                        objectType: 'text',
                        text: title,
                        link: { mobileWebUrl: url, webUrl: url },
                        buttonTitle: '바로가기'
                    });
                    break;
                case 'band':
                    window.open('https://band.us/plugin/share?body=' + encodeURIComponent(title + '\n' + url) +
                        '&route=' + encodeURIComponent(window.location.host), '_blank', 'noopener,width=420,height=600');
                    break;
                case 'facebook':
                    window.open('https://www.facebook.com/sharer/sharer.php?u=' + u, '_blank', 'noopener,width=600,height=500');
                    break;
                case 'x':
                    window.open('https://twitter.com/intent/tweet?text=' + t + '&url=' + u, '_blank', 'noopener,width=600,height=500');
                    break;
                case 'sms':
                    var sep = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? '&' : '?';
                    window.location.href = 'sms:' + sep + 'body=' + encodeURIComponent(title + '\n' + url);
                    break;
                case 'more':
                    navigator.share({ title: title, url: url }).catch(function () {});
                    break;
            }
        });
    };
})();
