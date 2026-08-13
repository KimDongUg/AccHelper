/* 1:1 톡 — 입주민 화면 */

const CT_API = '/api/chat-talk';

// ── 인증 확인: market_token 없으면 로그인 페이지로 (돌아올 URL 보존) ──────────
(function () {
  if (MarketAuth.getToken()) return;
  var back = location.pathname + location.search;
  location.href = '/chat-talk-login.html?return=' + encodeURIComponent(back);
})();

// ── fetch helper ─────────────────────────────────────────────────────────────
async function ctFetch(path, opts) {
  opts = opts || {};
  var token = MarketAuth.getToken();
  var headers = Object.assign({}, opts.headers || {});
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (opts.body && typeof opts.body === 'object') {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  var res = await fetch(CT_API + path, Object.assign({}, opts, { headers: headers }));
  if (res.status === 401) {
    MarketAuth.clear();
    location.href = '/chat-talk-login.html?return=' + encodeURIComponent(location.pathname + location.search);
    throw new Error('401');
  }
  if (!res.ok) {
    var err = await res.json().catch(function () { return { detail: '오류가 발생했습니다.' }; });
    var e = new Error(err.detail || '오류가 발생했습니다.');
    e.status = res.status;
    throw e;
  }
  return res.json();
}

// 헤더(회사 라벨/메뉴/관리자 버튼)는 js/complaint.js의 initCpHeader()가 처리 (chat-talk.html에서 호출)

// ── DOM refs ──────────────────────────────────────────────────────────────────
var ctMessagesEl = document.getElementById('ctMessages');
var ctEmptyEl = document.getElementById('ctEmpty');
var ctBannerEl = document.getElementById('ctBanner');
var ctInputEl = document.getElementById('ctInput');
var ctSendBtnEl = document.getElementById('ctSendBtn');

var ctAvailable = false;
var ctPollTimer = null;

function ctFormatTime(iso) {
  try {
    var d = new Date(iso);
    return d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch (e) { return ''; }
}

function ctRenderMessages(messages) {
  ctMessagesEl.innerHTML = '';
  if (!messages || messages.length === 0) {
    ctMessagesEl.appendChild(ctEmptyEl);
    return;
  }
  messages.forEach(function (m) {
    var bubble = document.createElement('div');
    bubble.className = 'ct-msg ' + (m.sender_type === 'resident' ? 'ct-msg-resident' : 'ct-msg-admin');
    bubble.textContent = m.content;

    var time = document.createElement('div');
    time.className = 'ct-msg-time';
    time.textContent = ctFormatTime(m.created_at);

    ctMessagesEl.appendChild(bubble);
    ctMessagesEl.appendChild(time);

    if (m.alimtalk_sent) {
      var notice = document.createElement('div');
      notice.className = 'ct-msg-alimtalk';
      notice.textContent = m.sender_type === 'resident'
        ? '🔔 관리사무소에 카카오 알림톡이 전달되었습니다'
        : '🔔 입주민에게 카카오 알림톡이 전달되었습니다';
      ctMessagesEl.appendChild(notice);
    }
  });
  ctMessagesEl.scrollTop = ctMessagesEl.scrollHeight;
}

async function ctLoadThread() {
  try {
    var thread = await ctFetch('/thread');
    ctRenderMessages(thread.messages);
  } catch (e) {
    if (e.status === 404) {
      ctRenderMessages([]);
    }
    // 그 외 오류는 폴링 중 조용히 무시 (다음 폴링에서 재시도)
  }
}

async function ctCheckAvailability() {
  try {
    var avail = await ctFetch('/availability');
    ctAvailable = !!avail.available;
    if (ctAvailable) {
      ctBannerEl.style.display = 'none';
      ctInputEl.disabled = false;
      ctSendBtnEl.disabled = false;
    } else {
      ctBannerEl.textContent = avail.message || '현재 상담 가능 시간이 아닙니다.';
      ctBannerEl.style.display = '';
      ctInputEl.disabled = true;
      ctSendBtnEl.disabled = true;
    }
  } catch (e) {
    // 가용성 조회 실패 시 안전하게 전송 비활성화
    ctAvailable = false;
    ctInputEl.disabled = true;
    ctSendBtnEl.disabled = true;
  }
}

async function ctSendMessage() {
  var content = ctInputEl.value.trim();
  if (!content) return;

  ctSendBtnEl.disabled = true;
  try {
    await ctFetch('/thread/messages', { method: 'POST', body: { content: content } });
    ctInputEl.value = '';
    await ctLoadThread();
  } catch (e) {
    ctBannerEl.textContent = e.message || '메시지 전송에 실패했습니다.';
    ctBannerEl.style.display = '';
  } finally {
    if (ctAvailable) ctSendBtnEl.disabled = false;
  }
}

ctSendBtnEl.addEventListener('click', ctSendMessage);
ctInputEl.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') ctSendMessage();
});

function ctStartPolling() {
  if (ctPollTimer) return;
  ctPollTimer = setInterval(function () {
    ctLoadThread();
    ctCheckAvailability();
  }, 3500);
}

function ctStopPolling() {
  if (ctPollTimer) { clearInterval(ctPollTimer); ctPollTimer = null; }
}

document.addEventListener('visibilitychange', function () {
  if (document.hidden) { ctStopPolling(); } else { ctStartPolling(); }
});

// ── 초기 로드 ──────────────────────────────────────────────────────────────────
ctLoadThread();
ctCheckAvailability();
ctStartPolling();
