function escapeAttr(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ── Site Intro (처음 방문 시에만 표시, 팝업 닫힌 후 시작) ── */
(function () {
    const intro = document.querySelector('.site-intro');
    if (!intro) return;

    // 이미 본 적 있으면 즉시 제거
    if (sessionStorage.getItem('introSeen')) {
        intro.remove();
        return;
    }

    startIntroAnimation();

    function startIntroAnimation() {
        sessionStorage.setItem('introSeen', '1');

        var isMobile = window.innerWidth <= 400 && window.innerHeight <= 900;

        if (isMobile) {
            // 모바일: 15초 후 3초간 fade out
            setTimeout(function () {
                intro.style.transition = 'opacity 3s ease';
                intro.style.opacity = '0';
                setTimeout(function () { intro.remove(); }, 3000);
            }, 15000);
        } else {
            // 태블릿/데스크탑: 5초 후 슬라이드업
            setTimeout(function () {
                var inner = intro.querySelector('.site-intro-inner');
                var totalH = intro.offsetHeight;

                intro.style.height = totalH + 'px';
                requestAnimationFrame(function () {
                    inner.style.transform = 'translateY(-' + totalH + 'px)';
                });

                setTimeout(function () {
                    inner.classList.add('fade');
                }, 24000);
            }, 5000);
        }
    }
})();

/* ── State ──────────────────────────────────── */
let currentCompanyId = null;
let currentCompanyCode = null;
let currentCompanyPhone = null;
let sessionId = generateSessionId();
sessionStorage.setItem('chatSessionId', sessionId);
let selectedCategory = null;
let quotaRemaining = null;

/* ── DOM refs (chat section — may not exist until shown) ── */
const chatSection     = document.getElementById('chatSection');
const companySelection = document.getElementById('companySelection');
const companyGrid     = document.getElementById('companyGrid');
const companyLoading  = document.getElementById('companyLoading');
const companyError    = document.getElementById('companyError');
const companyErrorMsg = document.getElementById('companyErrorMsg');
const companyLabel    = document.getElementById('companyLabel');

/* ── Toast notification ────────────────────── */
function showToast(message, duration) {
    if (duration === undefined) duration = 3000;
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);
    // Trigger animation
    requestAnimationFrame(function () {
        toast.classList.add('show');
    });
    setTimeout(function () {
        toast.classList.remove('show');
        setTimeout(function () { toast.remove(); }, 300);
    }, duration);
}

/* ── 1:1 톡 가용성(영업시간) 조회 — 공통 사용 ── */
function getChatTalkAvailability() {
    return apiGet('/chat-talk/availability').catch(function () {
        return { available: false, reason: 'error', message: '' };
    });
}

/* ── 1:1 톡 바로가기 (프롬프트 입력창 하단) ── */
function setupChatTalkQuickLink(companyId) {
    var wrap = document.getElementById('chatTalkQuickLink');
    var anchor = document.getElementById('chatTalkQuickLinkAnchor');
    var textEl = anchor ? anchor.querySelector('.ctql-text') : null;
    var note = document.getElementById('chatTalkQuickLinkNote');
    if (!wrap || !anchor || !textEl || !note) return;

    wrap.style.display = '';

    getChatTalkAvailability().then(function (avail) {
        var hasMarketToken = !!sessionStorage.getItem('market_token');
        var talkUrl = '/chat-talk.html?company=' + companyId;

        if (avail && avail.available) {
            anchor.classList.remove('ctql-disabled');
            anchor.href = hasMarketToken ? talkUrl : ('/market-login.html?return=' + encodeURIComponent(talkUrl));
            anchor.onclick = null;
            textEl.textContent = '관리실에 톡으로 직접 문의하기';
            note.style.display = 'none';
        } else {
            anchor.classList.add('ctql-disabled');
            anchor.href = '#';
            anchor.onclick = function (e) { e.preventDefault(); };
            textEl.textContent = '1:1 톡 (현재 상담 시간 아님)';
            note.textContent = (avail && avail.message) || '현재 상담 가능 시간이 아닙니다.';
            note.style.display = '';
        }
    });
}

/* ── Initialization ────────────────────────── */
document.addEventListener('DOMContentLoaded', function () {
    // 로그인 상태면 헤더 버튼 텍스트 변경
    var sess = AuthSession.get();
    var urlParams = new URLSearchParams(window.location.search);
    var hasCompanyParam = urlParams.get('company');
    if (sess && sess.isLoggedIn) {
        var adminLoginLink = document.getElementById('adminLoginLink');
        if (adminLoginLink) adminLoginLink.style.display = 'none';
        var headerLoginLink = document.getElementById('headerLoginLink');
        if (headerLoginLink) headerLoginLink.style.display = 'none';
        var adminLink = document.getElementById('adminLink');
        if (adminLink) {
            var label = sess.fullName || sess.username || '';
            adminLink.textContent = '관리자 (' + label + ')';
            // 회사 파라미터가 있으면 샘플회사 여부 확인 후 표시 (validateAndStartChat에서 처리)
            if (!hasCompanyParam) {
                adminLink.style.display = '';
            }
        }
    }

    var params = new URLSearchParams(window.location.search);
    var code = params.get('company');

    // 로고/AI챗봇 버튼 클릭 동작 설정
    function handleChatNavClick(e) {
        e.preventDefault();
        if (sess && sess.isLoggedIn && sess.role === 'super_admin') {
            window.location.href = '/';
        } else if (sess && sess.isLoggedIn && sess.companyId) {
            window.location.href = '/?company=' + sess.companyId;
        } else if (code) {
            window.location.reload();
        } else {
            window.location.href = '/';
        }
    }

    // href 자체도 우리 회사 챗봇으로 설정 (새 탭으로 열거나 클릭 이벤트가 못 붙는 경우 대비)
    var homeHref = (sess && sess.isLoggedIn && sess.role === 'super_admin') ? '/'
        : (sess && sess.isLoggedIn && sess.companyId) ? '/app.html?company=' + sess.companyId
        : code ? '/app.html?company=' + code
        : '/';

    var headerLogo = document.getElementById('headerLogo');
    if (headerLogo) {
        headerLogo.href = homeHref;
        headerLogo.addEventListener('click', handleChatNavClick);
    }

    var chatBotNavLink = document.getElementById('chatBotNavLink');
    if (chatBotNavLink) {
        chatBotNavLink.href = homeHref;
        chatBotNavLink.addEventListener('click', handleChatNavClick);
    }

    if (code) {
        sessionStorage.setItem('last_company', code);
        validateAndStartChat(code);
    } else {
        showCompanySelection();
    }
});

/* ── Company Selection ─────────────────────── */
function showCompanySelection() {
    companySelection.style.display = '';
    chatSection.style.display = 'none';
    loadCompanies();
}

async function loadCompanies() {
    companyLoading.style.display = '';
    companyError.style.display = 'none';
    companyGrid.innerHTML = '';

    try {
        const result = await apiGet('/companies/public');
        const companies = result.companies || result;

        companyLoading.style.display = 'none';

        if (!companies || companies.length === 0) {
            companyErrorMsg.textContent = '등록된 회사가 없습니다.';
            companyError.style.display = '';
            return;
        }

        // 로그인 상태 확인
        const sess = AuthSession.get();
        const isLoggedIn = sess && sess.isLoggedIn;
        const isSuperAdmin = isLoggedIn && sess.role === 'super_admin';
        const myCompanyId = isLoggedIn ? sess.companyId : null;

        companies.forEach(c => {
            const card = document.createElement('button');
            card.setAttribute('type', 'button');

            // 활성화 조건: 승인된 업체는 누구나, 미승인 업체는 super_admin 또는 해당 업체 관리자만
            const isApproved = c.approval_status === 'approved';
            const canAccess = c.is_active && (isApproved || isSuperAdmin || (isLoggedIn && c.company_id === myCompanyId));
            card.className = 'company-card' + (canAccess ? '' : ' company-card-disabled');

            const icon = document.createElement('div');
            icon.className = 'company-card-icon';
            icon.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>';

            const info = document.createElement('div');
            info.className = 'company-card-info';

            const name = document.createElement('h3');
            name.textContent = c.company_name;

            const code = document.createElement('span');
            code.className = 'company-card-code';
            code.textContent = c.address || '';

            info.appendChild(name);
            info.appendChild(code);
            card.appendChild(icon);
            card.appendChild(info);

            if (!canAccess) {
                card.addEventListener('click', () => {
                    alert('해당업체 관리자만 들어가실 수 있습니다.');
                });
            } else {
                card.addEventListener('click', () => {
                    window.location.href = `/?company=${c.company_id}`;
                });
            }

            companyGrid.appendChild(card);
        });
    } catch (err) {
        companyLoading.style.display = 'none';
        companyErrorMsg.textContent = err.message || '회사 목록을 불러올 수 없습니다.';
        companyError.style.display = '';
    }
}

/* ── Validate company & start chat ─────────── */
async function validateAndStartChat(code) {
    companySelection.style.display = 'none';
    chatSection.style.display = 'none';

    try {
        const company = await apiGet(`/companies/public/${encodeURIComponent(code)}`);
        currentCompanyId = company.company_id;
        currentCompanyCode = code;
        currentCompanyPhone = company.phone || null;

        // Show company name in header
        companyLabel.textContent = company.company_name;
        companyLabel.style.display = '';

        // Hide admin buttons for sample companies (company_id >= 1000)
        // Show admin link for non-sample companies if logged in
        if (currentCompanyId >= 1000) {
            var loginLink = document.getElementById('headerLoginLink');
            if (loginLink) loginLink.style.display = 'none';
            var admLink = document.getElementById('adminLink');
            if (admLink) admLink.style.display = 'none';
        } else {
            var sess = AuthSession.get();
            if (sess && sess.isLoggedIn) {
                var admLink2 = document.getElementById('adminLink');
                if (admLink2) admLink2.style.display = '';
            }
        }

        // 관리비 조회 (관리비 데이터가 연동 안 된 회사도 메뉴는 노출하고,
        // 실제 조회 시도 시 fee.html에서 안내 메시지로 막음)
        var feeNavLink = document.getElementById('feeNavLink');
        if (feeNavLink) {
            feeNavLink.style.display = '';
            feeNavLink.href = '/fee.html?company=' + company.company_id;
        }

        // 우리아파트 당근 (아파트·오피스텔 모두 표시)
        var daangnNavLink = document.getElementById('daangnNavLink');
        if (daangnNavLink) {
            if (company.building_type === '아파트' || company.building_type === '오피스텔') {
                daangnNavLink.style.display = '';
                // 회사 정보를 세션에 저장 (market-login에서 동 기본값 결정에 사용)
                sessionStorage.setItem('market_company_name', company.company_name);
                sessionStorage.setItem('market_company_id', company.company_id);
            } else {
                daangnNavLink.style.display = 'none';
            }
        }

        // 민원게시판 (아파트·오피스텔 모두 표시)
        var complaintNavLink = document.getElementById('complaintNavLink');
        if (complaintNavLink) {
            complaintNavLink.style.display = '';
            complaintNavLink.href = '/complaint.html?company=' + company.company_id;
            sessionStorage.setItem('complaint_company_id', company.company_id);
        }

        // 1:1 톡 바로가기 (활성/비활성 조건은 챗봇 미답변 안내와 동일)
        setupChatTalkQuickLink(company.company_id);

        // Show chat (로그인 없이 누구나 이용 가능)
        showChat(company);
    } catch (err) {
        if (err instanceof ApiError && err.status === 403) {
            // 미승인 업체 접근 시 안내 메시지 표시
            companySelection.style.display = '';
            chatSection.style.display = 'none';
            companyLoading.style.display = 'none';
            companyGrid.innerHTML = '';
            companyErrorMsg.textContent = '이 업체는 현재 서비스 준비 중입니다. 잠시 후 다시 시도해 주세요.';
            companyError.style.display = '';
            return;
        }
        // Invalid company code — show selection with error
        showCompanySelection();
        companyLoading.style.display = 'none';
        companyErrorMsg.textContent = `회사 코드 "${code}"를 찾을 수 없습니다.`;
        companyError.style.display = '';
    }
}

/* ── Image Lightbox ────────────────────────── */
function openLightbox(src) {
    var overlay = document.getElementById('lightboxOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'lightboxOverlay';
        overlay.className = 'lightbox-overlay';
        overlay.addEventListener('click', function () { overlay.classList.remove('show'); });
        var img = document.createElement('img');
        overlay.appendChild(img);
        document.body.appendChild(overlay);
    }
    overlay.querySelector('img').src = src;
    overlay.classList.add('show');
}

/* ── Show Chat ─────────────────────────────── */
function showChat(companyData) {
    var companyName = typeof companyData === 'string' ? companyData : (companyData && companyData.company_name);
    chatSection.style.display = '';
    companySelection.style.display = 'none';

    // 업체명 반영
    if (companyName) {
        const hero = document.getElementById('heroCompanyName');
        const greeting = document.getElementById('greetingCompanyName');
        if (hero) hero.textContent = companyName;
        if (greeting) greeting.textContent = companyName;

        // 공지사항 표시
        var noticeActive = companyData && companyData.notice_active;
        var heroDefault = document.getElementById('heroDefault');
        var noticeArea = document.getElementById('noticeArea');
        if (noticeActive && companyData.notice_text) {
            if (heroDefault) heroDefault.style.display = 'none';
            if (noticeArea) {
                var noticeContent = document.getElementById('noticeContent');
                var html = '';
                // 텍스트 (링크 포함 가능)
                // 마크다운 이미지 ![alt](url) → <img> 변환 후 나머지 텍스트 escape
                var rawText = companyData.notice_text;
                var rendered = '';
                var imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
                var lastIndex = 0, m;
                var collectedImgs = [];
                while ((m = imgRegex.exec(rawText)) !== null) {
                    var before = rawText.slice(lastIndex, m.index)
                        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
                    if (before.trim()) rendered += before;
                    collectedImgs.push('<img src="' + escapeAttr(m[2]) + '" alt="' + escapeAttr(m[1]) + '" class="notice-img">');
                    lastIndex = m.index + m[0].length;
                }
                if (collectedImgs.length > 0) {
                    rendered += '<div class="notice-img-row">' + collectedImgs.join('') + '</div>';
                }
                var tail = rawText.slice(lastIndex)
                    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
                if (tail.trim()) rendered += tail;

                if (companyData.notice_text_link) {
                    html += '<button type="button" class="notice-text-link" data-question="' + escapeAttr(companyData.notice_text_link) + '">' + rendered + '</button>';
                } else {
                    html += '<div class="notice-text">' + rendered + '</div>';
                }
                noticeContent.innerHTML = html;
                noticeArea.style.display = '';
            }
        } else {
            if (heroDefault) heroDefault.style.display = '';
            if (noticeArea) noticeArea.style.display = 'none';
        }

        // 업체별 커스텀 설정: 회사 설정(API)에 등록된 값을 그대로 사용
        var apiGreeting = companyData && companyData.greeting_text;
        var apiCategories = companyData && companyData.categories;

        // 인사말 적용 (회사 설정에 인사말이 없으면 기본 히어로 문구 유지)
        if (apiGreeting) {
            var bubbleEl = document.querySelector('.message.bot .message-bubble');
            if (bubbleEl) bubbleEl.innerHTML = apiGreeting;
        }

        // 카테고리 적용 (회사 설정에 등록된 빠른 질문 버튼)
        var categories = (apiCategories && apiCategories.length > 0) ? apiCategories : null;
        if (categories && categories.length > 0) {
            var filterEl = document.querySelector('.category-filters');
            if (filterEl) {
                filterEl.innerHTML = categories.map(function (c) {
                    return '<button class="quick-btn" data-question="' + c.question + '">' + c.label + '</button>';
                }).join('');
            }
        }
    }

    const chatMessages   = document.getElementById('chatMessages');
    const chatInput      = document.getElementById('chatInput');
    const sendBtn        = document.getElementById('sendBtn');
    const typingIndicator = document.getElementById('typingIndicator');
    const quickQuestions  = null; // removed from DOM

    // 봇 답변 가독성 포맷팅: 문장 끝(마침표/물음표/느낌표) 뒤에 줄바꿈 삽입
    function formatBotText(text) {
        if (!text) return text;
        // 한글 문장 끝(다. 요. 세요. 등) 또는 닫는 괄호) 뒤 줄바꿈
        text = text.replace(/([가-힣\)])([.]) +/g, '$1$2\n\n');
        text = text.replace(/([가-힣\)])([?]) +/g, '$1$2\n\n');
        text = text.replace(/([가-힣\)])([!]) +/g, '$1$2\n\n');
        // *로 시작하는 항목이 줄 시작이 아니면 줄바꿈 추가
        text = text.replace(/([^\n])\s*\*([가-힣a-zA-Z])/g, '$1\n\n*$2');
        return text;
    }

    // Category filter removed — quick-btn handles questions directly

    // Quick question buttons
    document.querySelectorAll('.quick-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            sendMessage(btn.dataset.question);
        });
    });

    // 공지사항 텍스트 클릭 → 질문 전송
    var noticeBtn = document.querySelector('.notice-text-link');
    if (noticeBtn && noticeBtn.dataset.question) {
        noticeBtn.addEventListener('click', () => {
            sendMessage(noticeBtn.dataset.question);
        });
    }

    function validateAndSend(text) {
        if (!text) return;
        if (text.length < 7) {
            chatInput.classList.add('input-warn');
            const warnMsg = document.getElementById('inputWarnMsg');
            if (warnMsg) { warnMsg.style.display = 'block'; }
            chatInput.focus();
            setTimeout(() => {
                chatInput.classList.remove('input-warn');
                if (warnMsg) warnMsg.style.display = 'none';
            }, 2000);
            return;
        }
        sendMessage(text);
    }

    // Send button
    sendBtn.addEventListener('click', () => {
        validateAndSend(chatInput.value.trim());
    });

    // Enter key
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.isComposing) {
            e.preventDefault();
            validateAndSend(chatInput.value.trim());
        }
    });

    // Track last question for feedback
    let lastQuestion = null;

    async function sendMessage(text) {
        appendMessage('user', text);
        chatInput.value = '';
        chatInput.disabled = true;
        sendBtn.disabled = true;
        lastQuestion = text;

        // Hide quick questions after first message
        if (quickQuestions) quickQuestions.style.display = 'none';

        typingIndicator.classList.add('show');
        scrollToBottom();

        try {
            const body = {
                question: text,
                session_id: sessionId,
                category: null,
            };
            if (currentCompanyId) {
                body.company_id = currentCompanyId;
            }

            const result = await apiPost('/chat', body);
            typingIndicator.classList.remove('show');

            // Store quota if provided
            if (result.quota_remaining !== undefined) {
                quotaRemaining = result.quota_remaining;
            }

            // Render bot answer with RAG data
            appendBotMessage(result, text);
        } catch (err) {
            typingIndicator.classList.remove('show');

            if (err instanceof ApiError) {
                if (err.status === 429) {
                    appendSystemMessage(
                        '이번 달 질문 횟수를 모두 사용했습니다.',
                        { label: '요금제 업그레이드', href: '/billing.html' }
                    );
                } else if (err.status === 403) {
                    var detail = (err.data && err.data.reason) || '';
                    if (detail === 'trial_expired') {
                        appendSystemMessage(
                            '무료체험이 종료되었습니다.',
                            { label: '요금제 확인', href: '/billing.html' }
                        );
                    } else {
                        appendSystemMessage(
                            '서비스가 일시 정지되었습니다. 관리자에게 문의해 주세요.'
                        );
                    }
                } else if (err.status >= 500) {
                    appendSystemMessage(
                        '일시적 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
                        null,
                        function () { sendMessage(text); }
                    );
                } else {
                    appendMessage('bot', '죄송합니다. 오류가 발생했습니다: ' + err.message);
                }
            } else {
                appendSystemMessage(
                    '일시적 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
                    null,
                    function () { sendMessage(text); }
                );
            }
        }

        chatInput.disabled = false;
        sendBtn.disabled = false;
    }

    /* ── Render bot message with RAG response ── */
    function appendBotMessage(result, question) {
        var msg = document.createElement('div');
        msg.className = 'message bot';
        msg.setAttribute('role', 'article');

        var avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.setAttribute('aria-hidden', 'true');
        avatar.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

        var bubble = document.createElement('div');
        bubble.className = 'message-bubble';

        // Category badge (from legacy format or evidences)
        if (result.category) {
            var catBadge = document.createElement('div');
            catBadge.className = 'message-category';
            catBadge.textContent = result.category;
            bubble.appendChild(catBadge);
        }

        // RAG warning disabled

        // Markdown-rendered answer
        var answerDiv = document.createElement('div');
        answerDiv.className = 'message-answer';
        var formattedAnswer = formatBotText(result.answer || '');
        if (typeof marked !== 'undefined' && marked.parse) {
            answerDiv.innerHTML = marked.parse(formattedAnswer);
        } else {
            answerDiv.textContent = formattedAnswer;
        }
        // 링크: 새 탭에서 열기
        answerDiv.querySelectorAll('a').forEach(function (a) {
            a.setAttribute('target', '_blank');
            a.setAttribute('rel', 'noopener noreferrer');
        });
        // 이미지: 클릭 시 라이트박스
        answerDiv.querySelectorAll('img').forEach(function (img) {
            img.addEventListener('click', function () { openLightbox(img.src); });
        });
        bubble.appendChild(answerDiv);

        // Evidence section (if evidences exist in response)
        var hasEvidences = result.evidences && result.evidences.length > 0;
        if (hasEvidences) {
            bubble.appendChild(buildEvidenceSection(result.evidences));
        }

        // Feedback buttons 용 qa_ids 수집
        var qaIds = [];
        if (result.evidences) {
            result.evidences.forEach(function (e) {
                if (e.qa_id) qaIds.push(e.qa_id);
            });
        }

        // 미답변 판정: 답변이 미답변 패턴이면 저장 (evidences가 있어도 LLM이 "모른다"고
        // 답했을 수 있으므로 hasEvidences/qaIds 여부와 무관하게 문구로만 판정)
        var answerText = result.answer || '';
        var looksUnanswered = /죄송|찾지 못|찾을 수 없|등록된 (정보|답변).*없|답변.*없/.test(answerText);
        var isUnanswered = looksUnanswered;
        if (isUnanswered) {
            apiPost('/unanswered-questions', {
                question: question,
                company_id: currentCompanyId,
                session_id: sessionId,
            }).catch(function () { /* 저장 실패해도 무시 */ });
            bubble.appendChild(buildUnansweredOptions(question, result.evidences || []));
        }
        bubble.appendChild(buildFeedbackButtons(question, result.answer, qaIds));

        msg.appendChild(avatar);
        msg.appendChild(bubble);
        chatMessages.appendChild(msg);
        scrollToBottom();
    }

    /* ── Build evidence collapse section ── */
    function buildEvidenceSection(evidences) {
        var section = document.createElement('div');
        section.className = 'evidence-section';

        var toggle = document.createElement('button');
        toggle.className = 'evidence-toggle';
        toggle.type = 'button';
        toggle.innerHTML = '\uD83D\uDCCB 참고한 답변 (' + evidences.length + '건) \u25BC';

        var list = document.createElement('div');
        list.className = 'evidence-list';
        list.style.display = 'none';

        evidences.forEach(function (ev) {
            var item = document.createElement('div');
            item.className = 'evidence-item';

            if (ev.category) {
                var badge = document.createElement('span');
                badge.className = 'badge-category';
                badge.textContent = ev.category;
                item.appendChild(badge);
            }

            if (ev.question) {
                var q = document.createElement('strong');
                q.textContent = ev.question;
                item.appendChild(q);
            }

            if (ev.answer) {
                var a = document.createElement('p');
                // Show first 200 chars as summary
                a.textContent = ev.answer.length > 200 ? ev.answer.substring(0, 200) + '...' : ev.answer;
                item.appendChild(a);
            }

            list.appendChild(item);
        });

        toggle.addEventListener('click', function () {
            var isHidden = list.style.display === 'none';
            list.style.display = isHidden ? '' : 'none';
            toggle.innerHTML = '\uD83D\uDCCB 참고한 답변 (' + evidences.length + '건) ' + (isHidden ? '\u25B2' : '\u25BC');
        });

        section.appendChild(toggle);
        section.appendChild(list);
        return section;
    }

    /* ── 미답변 시 대안 안내: 유사 QA 5개 + 1:1톡/문자문의(영업시간 내) 또는 답변예약(영업시간 외) ── */
    function buildUnansweredOptions(question, evidences) {
        var wrapper = document.createElement('div');
        wrapper.className = 'unanswered-options';

        if (evidences && evidences.length > 0) {
            var qaHeading = document.createElement('div');
            qaHeading.className = 'unanswered-qa-heading';
            qaHeading.textContent = '혹시 이런 질문을 찾으셨나요?';
            wrapper.appendChild(qaHeading);

            var qaList = document.createElement('div');
            qaList.className = 'unanswered-qa-list';
            evidences.slice(0, 5).forEach(function (ev) {
                var item = document.createElement('div');
                item.className = 'unanswered-qa-item';

                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'unanswered-qa-link';
                btn.textContent = ev.question;

                var answerDiv = document.createElement('div');
                answerDiv.className = 'unanswered-qa-answer';
                answerDiv.style.display = 'none';
                answerDiv.textContent = ev.answer;

                btn.addEventListener('click', function () {
                    var isHidden = answerDiv.style.display === 'none';
                    answerDiv.style.display = isHidden ? '' : 'none';
                });

                item.appendChild(btn);
                item.appendChild(answerDiv);
                qaList.appendChild(item);
            });
            wrapper.appendChild(qaList);
        }

        var actionArea = document.createElement('div');
        actionArea.className = 'unanswered-action-area';
        wrapper.appendChild(actionArea);

        getChatTalkAvailability().then(function (avail) {
            actionArea.innerHTML = '';
            if (avail && avail.available) {
                var hasMarketToken = !!sessionStorage.getItem('market_token');
                var talkUrl = '/chat-talk.html?company=' + currentCompanyId;

                var talkLink = document.createElement('a');
                talkLink.className = 'unanswered-action-link';
                talkLink.href = hasMarketToken ? talkUrl : ('/market-login.html?return=' + encodeURIComponent(talkUrl));
                talkLink.textContent = '💬 1:1 톡으로 문의하기';
                actionArea.appendChild(talkLink);

                if (currentCompanyPhone) {
                    var smsWrap = document.createElement('div');
                    smsWrap.className = 'unanswered-sms-wrap';

                    var smsLink = document.createElement('a');
                    smsLink.className = 'unanswered-action-link';
                    smsLink.href = 'sms:' + currentCompanyPhone;
                    smsLink.textContent = '📱 문자로 문의하기';
                    smsWrap.appendChild(smsLink);

                    var smsNote = document.createElement('p');
                    smsNote.className = 'unanswered-sms-note';
                    smsNote.textContent = '이 번호는 문자 가능한 번호입니다. 문자로 문의해 주세요: ' + currentCompanyPhone;
                    smsWrap.appendChild(smsNote);

                    actionArea.appendChild(smsWrap);
                }
            } else {
                var reserveMsg = document.createElement('p');
                reserveMsg.className = 'unanswered-reserve-msg';
                reserveMsg.textContent = '질문하신 내용에 대한 답변을 예약하시겠습니까?';
                actionArea.appendChild(reserveMsg);

                var reserveBtn = document.createElement('button');
                reserveBtn.type = 'button';
                reserveBtn.className = 'btn btn-primary btn-sm';
                reserveBtn.textContent = '답변예약';
                reserveBtn.addEventListener('click', function () {
                    sessionStorage.setItem('cp_prefill_content', question);
                    window.location.href = '/complaint-write.html?company=' + currentCompanyId;
                });
                actionArea.appendChild(reserveBtn);
            }
        });

        return wrapper;
    }

    /* ── Build feedback buttons ── */
    function buildFeedbackButtons(question, answer, qaIds) {
        var wrapper = document.createElement('div');
        wrapper.className = 'feedback-buttons';

        var likeBtn = document.createElement('button');
        likeBtn.className = 'feedback-btn';
        likeBtn.type = 'button';
        likeBtn.setAttribute('data-rating', 'like');
        likeBtn.textContent = '\uD83D\uDC4D';

        var dislikeBtn = document.createElement('button');
        dislikeBtn.className = 'feedback-btn';
        dislikeBtn.type = 'button';
        dislikeBtn.setAttribute('data-rating', 'dislike');
        dislikeBtn.textContent = '\uD83D\uDC4E';

        function handleFeedback(rating) {
            likeBtn.disabled = true;
            dislikeBtn.disabled = true;

            if (rating === 'like') {
                likeBtn.classList.add('selected');
            } else {
                dislikeBtn.classList.add('selected');
            }

            apiPost('/feedback', {
                question: question,
                answer: answer,
                qa_ids: qaIds,
                rating: rating,
                session_id: sessionId,
                company_id: currentCompanyId,
            }).then(function () {
                showToast('피드백 감사합니다');
            }).catch(function () {
                showToast('피드백 전송에 실패했습니다');
                likeBtn.disabled = false;
                dislikeBtn.disabled = false;
                likeBtn.classList.remove('selected');
                dislikeBtn.classList.remove('selected');
            });
        }

        likeBtn.addEventListener('click', function () { handleFeedback('like'); });
        dislikeBtn.addEventListener('click', function () { handleFeedback('dislike'); });

        wrapper.appendChild(likeBtn);
        wrapper.appendChild(dislikeBtn);
        return wrapper;
    }

    /* ── System message (errors, quota, etc.) ── */
    function appendSystemMessage(text, cta, retryFn) {
        var msg = document.createElement('div');
        msg.className = 'message system';
        msg.setAttribute('role', 'alert');

        var bubble = document.createElement('div');
        bubble.className = 'system-message';

        var textEl = document.createElement('p');
        textEl.textContent = text;
        bubble.appendChild(textEl);

        if (cta) {
            var ctaBtn = document.createElement('a');
            ctaBtn.className = 'btn btn-primary btn-sm';
            ctaBtn.href = cta.href;
            ctaBtn.textContent = cta.label;
            bubble.appendChild(ctaBtn);
        }

        if (retryFn) {
            var retryBtn = document.createElement('button');
            retryBtn.className = 'btn btn-outline btn-sm';
            retryBtn.type = 'button';
            retryBtn.textContent = '다시 시도';
            retryBtn.addEventListener('click', function () {
                msg.remove();
                retryFn();
            });
            bubble.appendChild(retryBtn);
        }

        msg.appendChild(bubble);
        chatMessages.appendChild(msg);
        scrollToBottom();
    }

    /* ── Plain text message (user / simple bot) ── */
    function appendMessage(type, text, category) {
        var msg = document.createElement('div');
        msg.className = 'message ' + type;
        msg.setAttribute('role', 'article');

        var avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.setAttribute('aria-hidden', 'true');

        if (type === 'bot') {
            avatar.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
        } else {
            avatar.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
        }

        var bubble = document.createElement('div');
        bubble.className = 'message-bubble';

        if (type === 'bot' && category) {
            var catBadge = document.createElement('div');
            catBadge.className = 'message-category';
            catBadge.textContent = category;
            bubble.appendChild(catBadge);
        }

        var textNode = document.createElement('div');
        var displayText = type === 'bot' ? formatBotText(text) : text;
        if (type === 'bot' && typeof marked !== 'undefined' && marked.parse) {
            textNode.innerHTML = marked.parse(displayText);
        } else {
            textNode.textContent = displayText;
        }
        bubble.appendChild(textNode);

        msg.appendChild(avatar);
        msg.appendChild(bubble);
        chatMessages.appendChild(msg);

        scrollToBottom();
    }

    function scrollToBottom() {
        setTimeout(function () {
            // Scroll the last message into view so the answer is visible
            var lastMsg = chatMessages.lastElementChild;
            if (lastMsg) {
                lastMsg.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
        }, 50);
    }

    // Load chat history
    async function loadHistory() {
        try {
            var url = `/chat/history/${sessionId}`;
            if (currentCompanyId) {
                url += `?company_id=${currentCompanyId}`;
            }
            var history = await apiGet(url);
            history.forEach(function (item) {
                appendMessage('user', item.user_question);
                if (item.evidences !== undefined) {
                    appendBotMessage({
                        answer: item.bot_answer,
                        category: item.category,
                        evidences: item.evidences || [],
                        used_rag: item.used_rag,
                    }, item.user_question);
                } else {
                    appendMessage('bot', item.bot_answer, item.category);
                }
            });
            if (history.length > 0) {
                quickQuestions.style.display = 'none';
            }
        } catch (e) {
            // ignore history load errors
        }
    }

    // Check admin status
    async function checkAdmin() {
        try {
            var auth = await apiGet('/auth/check');
            if (auth.authenticated && auth.session) {
                var adminLoginLink2 = document.getElementById('adminLoginLink');
                if (adminLoginLink2) adminLoginLink2.style.display = 'none';
                var headerLoginLink2 = document.getElementById('headerLoginLink');
                if (headerLoginLink2) headerLoginLink2.style.display = 'none';
                var adminLink2 = document.getElementById('adminLink');
                if (adminLink2 && currentCompanyId < 1000) {
                    adminLink2.style.display = '';
                    var label = auth.session.full_name || auth.session.username || '';
                    adminLink2.textContent = '관리자 (' + label + ')';
                }
                if (auth.session.role === 'super_admin') {
                    var saLink = document.getElementById('superAdminLink');
                    if (saLink) saLink.style.display = '';
                }
            }
        } catch (e) { /* not logged in */ }
    }

    if (AuthSession.isValid()) {
        loadHistory();
    }
    checkAdmin();

    // ── QA 직접 링크: ?qa=ID 파라미터 처리 ─────────────────────────────────
    (async function () {
        var qaId = new URLSearchParams(window.location.search).get('qa');
        if (!qaId) return;
        try {
            var companyParam = currentCompanyId ? '?company_id=' + currentCompanyId : '';
            var qa = await apiGet('/qa/' + qaId + companyParam);
            if (!qa || !qa.question) return;
            // 히스토리 로드 대신 해당 Q&A를 바로 표시
            appendMessage('user', qa.question);
            appendMessage('bot', qa.answer, qa.category);
            // URL에서 qa 파라미터 제거 (뒤로가기 UX 개선)
            var newUrl = window.location.pathname + '?company=' + (currentCompanyCode || currentCompanyId);
            window.history.replaceState({}, '', newUrl);
        } catch (e) { /* QA 없으면 무시 */ }
    })();
    // ─────────────────────────────────────────────────────────────────────────
}
