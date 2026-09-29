/* ═══════════════════════════════════════════════
 *  샘플회사(샘플아파트 1002 / 샘플오피스텔 1000) 관리자 화면 온보딩 말풍선
 *
 *  입주민 챗봇 화면(js/index.js: initOnboardingTour)과 동일한 "동시 표시" 방식.
 *   - 로그인 직후: 대시보드(통계 카드/회사 설정/탭 바) 안내를 한 번에 표시
 *   - 각 탭을 처음 열 때: 그 탭 전용 안내를 표시 (탭을 벗어나면 제거)
 *   - 말풍선은 X로 개별 닫기, 해당 기능을 실제로 클릭하면 자동으로 닫힘
 *   - 우측 하단 "안내 모두 닫기"를 누르면 그 세션 동안 다시 뜨지 않음
 * ═══════════════════════════════════════════════ */
(function () {
    'use strict';

    var TOUR_COMPANY_IDS = [1000, 1002];
    var DISMISS_KEY = 'admin_tour_dismissed';

    /* 그룹별 말풍선 정의
     *  target : 대상 요소 CSS 선택자
     *  place  : 데스크톱에서의 배치 방향 (right | left | bottom | top) — 공간이 없으면 자동 전환
     *  text   : 안내 문구 (간단한 태그 사용 가능)
     */
    var GROUPS = {
        dashboard: [
            {
                target: '.admin-title',
                place: 'right',
                narrow: true,
                text: '입주민이 보는 챗봇을 운영하는 <b>관리자 화면</b>입니다.<br>실제 서비스와 동일하며, 결제·ERP 수집기처럼 실사용이 필요한 일부 기능만 체험이 제한됩니다.'
            },
            {
                target: '.stats-grid .stat-card',
                place: 'bottom',
                text: '오늘의 운영 현황 요약입니다. 등록된 <b>총 Q&A</b>와 챗봇에 노출 중인 <b>활성 Q&A</b>, <b>오늘의 대화</b> 수, <b>오늘의 관리비 조회</b> 건수(괄호는 조회 실패 건수)를 한눈에 확인합니다.'
            },
            {
                target: '#feedbackCard',
                place: 'bottom',
                text: '<b>불만족 피드백</b>·<b>미답변 질문</b> 카드는 클릭하면 해당 탭으로 바로 이동합니다. 챗봇이 답하지 못한 질문을 여기서 확인해 Q&A로 등록하세요.'
            },
            {
                target: '#collectorCard',
                place: 'right',
                text: '<b>챗봇 QR코드</b>는 입주민 안내용으로 내려받고, <b>공고문</b>은 게시판에 붙일 안내문입니다. <b>ERP 수집기</b>는 관리비 데이터를 자동으로 올려 주는 크롬 확장프로그램입니다.'
            },
            {
                target: '#companySettingsSection .admin-section-title',
                place: 'right',
                narrow: true,
                text: '회사명·주소·인사말과 <b>공지사항</b>, 챗봇 첫 화면의 <b>카테고리 버튼</b>을 여기서 바꿉니다. 공지를 켜면 인사말 대신 공지가 표시됩니다.'
            },
            {
                target: '#categoryItemsWrap .category-item:first-child .cat-order-btns',
                place: 'right',
                text: '각 카테고리 옆 <b>↑ ↓</b> 버튼으로 순서를 바꿀 수 있습니다. 챗봇 첫 화면의 카테고리 버튼도 이 순서 그대로 표시됩니다.'
            },
            {
                target: '#addCategoryBtn',
                place: 'bottom',
                text: '<b>+ 카테고리 추가</b>로 새 빠른 질문 버튼을 만듭니다. 버튼에 표시할 텍스트와, 눌렀을 때 챗봇에 물어볼 질문을 입력하세요.'
            },
            {
                target: '.tab-nav',
                place: 'bottom',
                text: '기능별 탭입니다. 각 탭을 처음 열면 그 탭에 대한 안내 말풍선이 표시됩니다.'
            }
        ],

        qa: [
            {
                target: '#tabContentQa .search-wrap',
                place: 'bottom',
                text: '등록된 Q&A를 <b>검색</b>하고 카테고리·상태·작성자로 걸러 봅니다.'
            },
            {
                target: '#addQaBtn',
                place: 'bottom',
                text: '<b>+ 새 Q&A</b>로 질문·답변·카테고리·키워드를 등록하면 챗봇이 바로 그 내용으로 답변합니다.'
            },
            {
                target: '#qaTableWrap',
                place: 'right',
                text: '목록에서 바로 <b>수정·삭제</b>할 수 있고, 상태를 <b>비활성</b>으로 바꾸면 챗봇 답변에서 제외됩니다.'
            }
        ],

        chatTalk: [
            {
                target: '#tabContentChatTalk .toolbar h3',
                place: 'right',
                text: '챗봇으로 해결되지 않은 문의를 입주민이 <b>1:1 톡</b>으로 남기면 이곳에 스레드로 쌓입니다.'
            },
            {
                target: '#tabContentChatTalk .qa-table-wrap',
                place: 'right',
                text: '행을 클릭하면 대화창이 열립니다. <b>안읽음</b> 수로 먼저 처리할 상담을 확인하고, 답장을 보내면 입주민에게 알림이 전달됩니다.'
            }
        ],

        unanswered: [
            {
                target: '#tabContentUnanswered .toolbar h3',
                place: 'right',
                text: '챗봇이 답변하지 못한 질문 목록입니다. 입주민이 실제로 궁금해하는 내용을 확인할 수 있습니다.'
            },
            {
                target: '#unansweredTableWrap',
                place: 'right',
                text: '<b>Q&A 등록</b>을 누르면 그 질문이 채워진 상태로 등록창이 열립니다. 답변을 저장하면 다음부터 챗봇이 자동으로 답변합니다.'
            }
        ],

        feedback: [
            {
                target: '#tabContentFeedback .toolbar h3',
                place: 'right',
                text: '입주민이 챗봇 답변에 남긴 <b>만족/불만족 평가</b>입니다. 기본은 불만족만 보여 줍니다.'
            },
            {
                target: '#feedbackTableWrap',
                place: 'right',
                text: '불만족 답변은 <b>Q&A 수정</b>으로 내용을 바로 고치고, 정리된 건은 <b>처리완료</b>로 표시합니다.'
            }
        ],

        statistics: [
            {
                target: '#stSubBtnMarket',
                place: 'right',
                text: '<b>챗봇 / 답변예약 / 당근</b> 세 가지 통계를 서브탭으로 나눠 봅니다.'
            },
            {
                target: '#statsPeriodType',
                place: 'bottom',
                text: '일별·월별·분기별·연도별로 기간을 정해 조회합니다.'
            },
            {
                target: '#statsSummaryGrid',
                place: 'right',
                text: '총 접속자·질문 수·답변 수와 일평균을 요약하고, 아래 <b>차트와 표</b>에서 기간별 추이를 확인합니다.'
            }
        ],

        questionViews: [
            {
                target: '#qvPeriodType',
                place: 'bottom',
                text: '기간을 정해 <b>어떤 질문이 얼마나 조회됐는지</b> 확인합니다.'
            },
            {
                target: '#qvSummaryGrid',
                place: 'right',
                text: '조회된 질문 수·총 조회 수·일평균을 요약합니다. 아래 <b>차트를 클릭</b>하면 그 기간에 조회된 질문 상세 목록이 열립니다.'
            }
        ],

        fee: [
            {
                target: '#adminFeeDong',
                place: 'bottom',
                text: '동·호수를 입력하면 입주민이 보는 것과 동일한 <b>관리비 고지서</b>를 관리자가 대신 조회할 수 있습니다.'
            },
            {
                target: '#adminFeeStatsTable',
                place: 'right',
                text: '아래에서 일별·월별·년도별 <b>관리비 조회 통계</b>와 세대별 <b>조회 이력</b>(성공/실패)을 확인합니다.'
            }
        ],

        complaintPersons: [
            {
                target: '#cpSearchInput',
                place: 'bottom',
                text: '관리비 데이터에 등록된 <b>전체 세대</b> 목록입니다. 동/호수·이름·전화번호로 검색합니다.'
            },
            {
                target: '#tabContentComplaintPersons .qa-table-wrap',
                place: 'right',
                text: '세대별 <b>1:1 톡 수</b>와 <b>관리비 조회수</b>, 최근 이용 일시를 함께 보여 줍니다. 정렬 기준을 바꾸면 실제로 많이 이용하는 세대를 확인할 수 있습니다.'
            }
        ],

        market: [
            {
                target: '#mktSubBtnResidents',
                place: 'right',
                text: '입주민 전용 중고거래·나눔 게시판입니다. <b>게시글 관리</b>와 <b>당근회원 관리</b>(가입 승인)로 나뉩니다.'
            },
            {
                target: '#mktCategoryFilter',
                place: 'bottom',
                text: '카테고리·공개여부로 거르고, 신고된 게시글은 <b>관리</b> 열에서 숨기거나 삭제할 수 있습니다.'
            }
        ]
    };

    var groupBubbles = {};   // groupKey → [{ el, target, place }]
    var shownKeys = {};      // 이미 한 번 보여준 그룹
    var resizeBound = false;
    var closeAllBtn = null;

    function isDismissed() {
        try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch (e) { return false; }
    }

    function setDismissed() {
        try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch (e) { /* 무시 */ }
    }

    /* 샘플회사(체험용) 관리자 화면에서만 안내를 띄운다 */
    function isTourCompany() {
        try {
            if (typeof isSampleCompany === 'function') return isSampleCompany();
        } catch (e) { /* admin.js 미로드 시 아래 fallback */ }
        var sess = (typeof AuthSession !== 'undefined') ? AuthSession.get() : null;
        return !!sess && TOUR_COMPANY_IDS.indexOf(Number(sess.companyId)) !== -1;
    }

    function allBubbles() {
        var list = [];
        Object.keys(groupBubbles).forEach(function (k) {
            list = list.concat(groupBubbles[k]);
        });
        return list;
    }

    /* 제목처럼 가로 전체를 차지하는 블록 요소는 글자 폭만 기준으로 삼아
     * 제목 오른쪽 빈 공간에 말풍선이 들어갈 수 있게 한다(narrow: true). */
    function targetRect(b) {
        if (b.narrow) {
            try {
                var range = document.createRange();
                range.selectNodeContents(b.target);
                var r = range.getBoundingClientRect();
                if (r.width > 0) return r;
            } catch (e) { /* 아래 기본 rect 사용 */ }
        }
        return b.target.getBoundingClientRect();
    }

    function positionBubble(b) {
        if (!document.body.contains(b.el) || !document.body.contains(b.target)) return;

        var rect = targetRect(b);
        if (rect.width === 0 && rect.height === 0) { b.el.style.display = 'none'; return; }
        b.el.style.display = '';

        var vw = document.documentElement.clientWidth;

        // 절대위치 요소는 left 값에 따라 남은 폭만큼 쪼그라들므로,
        // left=0 상태에서 자연폭을 잰 뒤 width를 고정해 두고 위치를 계산한다.
        b.el.style.width = '';
        b.el.style.left = '0px';
        var bw = Math.min(b.el.offsetWidth, vw - 24);
        b.el.style.width = bw + 'px';
        var bh = b.el.offsetHeight;

        var isMobile = vw <= 767;
        var place = isMobile ? 'bottom' : b.place;

        // 데스크톱에서 좌우 공간이 부족하면 아래쪽으로 자동 전환
        if (place === 'right' && rect.right + 14 + bw > vw - 12) place = 'bottom';
        if (place === 'left' && rect.left - 14 - bw < 12) place = 'bottom';

        b.el.classList.remove('pos-right', 'pos-left', 'pos-bottom', 'pos-top');
        b.el.classList.add('pos-' + place);

        var arrow = b.el.querySelector('.admin-tour-arrow');
        var top, left;

        if (place === 'right' || place === 'left') {
            top = rect.top + window.scrollY + rect.height / 2 - bh / 2;
            left = (place === 'right')
                ? rect.right + window.scrollX + 14
                : rect.left + window.scrollX - bw - 14;
            if (left < 12) left = 12;
            arrow.style.left = '';
            arrow.style.top = '';
        } else {
            var centerX = rect.left + rect.width / 2 + window.scrollX;
            left = centerX - bw / 2;
            // 말풍선은 문서 좌표에 놓이므로 현재 스크롤 위치가 아니라 문서 기준으로 보정한다
            var maxLeft = vw - bw - 12;
            if (left > maxLeft) left = maxLeft;
            if (left < 12) left = 12;

            top = (place === 'bottom')
                ? rect.bottom + window.scrollY + 10
                : rect.top + window.scrollY - bh - 10;

            var arrowLeft = centerX - left;
            arrowLeft = Math.max(16, Math.min(bw - 16, arrowLeft));
            arrow.style.left = arrowLeft + 'px';
            arrow.style.top = '';
        }

        if (top < 8) top = 8;
        b.el.style.top = top + 'px';
        b.el.style.left = left + 'px';
    }

    function repositionAll() {
        allBubbles().forEach(positionBubble);
    }

    function syncCloseAllBtn() {
        var count = allBubbles().length;
        if (count === 0) {
            if (closeAllBtn) { closeAllBtn.remove(); closeAllBtn = null; }
            return;
        }
        if (closeAllBtn) return;
        closeAllBtn = document.createElement('button');
        closeAllBtn.type = 'button';
        closeAllBtn.className = 'admin-tour-closeall';
        closeAllBtn.textContent = '안내 말풍선 모두 닫기';
        closeAllBtn.addEventListener('click', function () {
            setDismissed();
            clearAll();
        });
        document.body.appendChild(closeAllBtn);
    }

    function removeBubble(b) {
        b.el.remove();
        Object.keys(groupBubbles).forEach(function (k) {
            groupBubbles[k] = groupBubbles[k].filter(function (x) { return x !== b; });
            if (groupBubbles[k].length === 0) delete groupBubbles[k];
        });
        syncCloseAllBtn();
    }

    function clearGroup(key) {
        if (!groupBubbles[key]) return;
        groupBubbles[key].forEach(function (b) { b.el.remove(); });
        delete groupBubbles[key];
        syncCloseAllBtn();
    }

    function clearAll() {
        Object.keys(groupBubbles).forEach(clearGroup);
    }

    function showGroup(key) {
        if (isDismissed() || !isTourCompany()) return;
        if (shownKeys[key] || groupBubbles[key]) return;
        var steps = GROUPS[key];
        if (!steps) return;

        var made = [];
        steps.forEach(function (step) {
            var target = document.querySelector(step.target);
            if (!target) return;

            var el = document.createElement('div');
            el.className = 'admin-tour-bubble';
            el.innerHTML =
                '<button type="button" class="admin-tour-close" aria-label="안내 닫기">&times;</button>' +
                '<div class="admin-tour-text">' + step.text + '</div>' +
                '<div class="admin-tour-arrow"></div>';
            document.body.appendChild(el);

            var b = { el: el, target: target, place: step.place || 'right', narrow: !!step.narrow };
            el.querySelector('.admin-tour-close').addEventListener('click', function () {
                removeBubble(b);
            });
            // 해당 기능을 실제로 사용하면 관련 말풍선은 자동으로 닫힘
            target.addEventListener('click', function () { removeBubble(b); }, { once: true });
            target.addEventListener('focusin', function () { removeBubble(b); }, { once: true });

            made.push(b);
        });

        if (made.length === 0) return;
        shownKeys[key] = true;
        groupBubbles[key] = made;
        made.forEach(positionBubble);
        syncCloseAllBtn();

        // 통계/목록이 비동기로 채워지면서 높이가 바뀌므로 잠시 후 위치 재계산
        setTimeout(repositionAll, 400);
        setTimeout(repositionAll, 1200);

        if (!resizeBound) {
            window.addEventListener('resize', repositionAll);
            resizeBound = true;
        }
    }

    /* 탭 전환 — 이전 탭 안내는 지우고, 새 탭 안내를 처음 한 번만 표시 */
    function onTabSwitch(tab) {
        Object.keys(groupBubbles).forEach(function (k) {
            if (k !== 'dashboard' && k !== tab) clearGroup(k);
        });
        showGroup(tab);
    }

    window.AdminTour = {
        start: function () { showGroup('dashboard'); },
        onTabSwitch: onTabSwitch,
        reposition: repositionAll,
        clearAll: clearAll
    };
})();
