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
  if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
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
var ctPhotoBtnEl = document.getElementById('ctPhotoBtn');
var ctImageInputEl = document.getElementById('ctImageInput');
var ctInputRowEl = document.querySelector('.ct-input-row');
var ctListEl = document.getElementById('ctList');
var ctBackBtnEl = document.getElementById('ctBackBtn');
var ctClosedNoteEl = document.getElementById('ctClosedNote');

// ── 톡 대화 확인 모드 (?view=list) ───────────────────────────────────────────
// 목록(본인 대화 전체) → 항목 클릭 시 상세. 종결된 대화는 입력창 대신 안내 문구.
var ctListMode = new URLSearchParams(location.search).get('view') === 'list';
var ctSelectedThreadId = null;
var ctSelectedStatus = null;
var ctLastAvail = null;

if (ctListMode) {
  document.title = '톡 대화 확인 — AI Helper';
  var ctTitleEl = document.querySelector('.ct-header h1');
  if (ctTitleEl) ctTitleEl.textContent = '💬 톡 대화 확인';
  var ctSubEl = document.getElementById('ctSubtitle');
  if (ctSubEl) ctSubEl.textContent = '관리사무소와 나눈 1:1 톡 대화를 확인할 수 있습니다.';
}

function ctInputVisible() {
  if (!ctListMode) return true;
  return !!ctSelectedThreadId && ctSelectedStatus !== 'closed';
}

function ctUpdateLayout() {
  var showList = ctListMode && !ctSelectedThreadId;
  var closed = ctListMode && !!ctSelectedThreadId && ctSelectedStatus === 'closed';
  ctListEl.style.display = showList ? 'flex' : 'none';
  ctMessagesEl.style.display = showList ? 'none' : '';
  ctBackBtnEl.style.display = (ctListMode && ctSelectedThreadId) ? 'inline-block' : 'none';
  ctInputRowEl.style.display = ctInputVisible() ? '' : 'none';
  ctClosedNoteEl.style.display = closed ? 'block' : 'none';
  ctApplyAvailability();
}

// ── 카카오톡 인앱 브라우저 등에서 키보드가 입력창을 가리는 문제 방지 ──────────
// 일부 웹뷰는 키보드가 올라와도 layout viewport를 안 줄여서 position:fixed 하단
// 요소가 키보드 뒤로 숨는다. visualViewport로 실제 보이는 높이를 추적해서
// 입력창을 그 위로 밀어 올린다.
function ctSyncKeyboardOffset() {
  if (!ctInputRowEl || !window.visualViewport) return;
  var vv = window.visualViewport;
  var keyboardOffset = window.innerHeight - vv.height - vv.offsetTop;
  ctInputRowEl.style.bottom = Math.max(keyboardOffset, 0) + 'px';
}

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', ctSyncKeyboardOffset);
  window.visualViewport.addEventListener('scroll', ctSyncKeyboardOffset);
  ctSyncKeyboardOffset();
}

// 포커스 직후 키보드 애니메이션이 끝난 뒤 한 번 더 보정
ctInputEl.addEventListener('focus', function () {
  setTimeout(ctSyncKeyboardOffset, 300);
});

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
    var isResident = m.sender_type === 'resident';
    if (m.image_url) {
      var link = document.createElement('a');
      link.href = m.image_url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.className = 'ct-msg-img-link ' + (isResident ? 'ct-msg-resident-img' : 'ct-msg-admin-img');
      var img = document.createElement('img');
      img.className = 'ct-msg-img';
      img.alt = '첨부 사진';
      img.src = m.image_url;
      // 사진이 늦게 로드되면 높이가 늘어나 맨 아래가 가려지므로 로드 후 다시 내림
      img.addEventListener('load', function () { ctMessagesEl.scrollTop = ctMessagesEl.scrollHeight; });
      link.appendChild(img);
      ctMessagesEl.appendChild(link);
    }

    var bubble = document.createElement('div');
    bubble.className = 'ct-msg ' + (isResident ? 'ct-msg-resident' : 'ct-msg-admin');
    bubble.textContent = m.content;
    // 사진만 보낸 메시지는 빈 말풍선 대신 시간 정렬용으로만 쓰고 숨김
    if (!m.content) bubble.style.display = 'none';

    var time = document.createElement('div');
    time.className = 'ct-msg-time';

    // 카카오톡처럼: 내가 보낸 메시지를 상대(관리자)가 아직 안 읽었으면 "1" 표시,
    // 읽으면(read_at 값이 생기면) 사라짐
    if (m.sender_type === 'resident' && !m.read_at) {
      var unread = document.createElement('span');
      unread.className = 'ct-msg-unread';
      unread.textContent = '1';
      time.appendChild(unread);
    }
    time.appendChild(document.createTextNode(ctFormatTime(m.created_at)));

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

var ctLastRenderKey = '';

function ctEscape(str) {
  var d = document.createElement('div');
  d.textContent = str == null ? '' : String(str);
  return d.innerHTML;
}

function ctFormatDate(iso) {
  try {
    var d = new Date(iso);
    return d.toLocaleString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch (e) { return ''; }
}

async function ctLoadList() {
  try {
    var items = await ctFetch('/threads');
    var key = 'list:' + JSON.stringify(items);
    if (key === ctLastRenderKey) return;
    ctLastRenderKey = key;
    if (!items.length) {
      ctListEl.innerHTML = '<div class="ct-empty">아직 관리실과 나눈 톡 대화가 없습니다.</div>';
      return;
    }
    ctListEl.innerHTML = items.map(function (t) {
      var isOpen = t.status !== 'closed';
      return '<button type="button" class="ct-list-item" data-id="' + t.id + '" data-status="' + ctEscape(t.status) + '">' +
        '<div class="ct-list-top">' +
          '<span class="ct-list-status ' + (isOpen ? 'open' : 'closed') + '">' + (isOpen ? '진행중' : '종결') + '</span>' +
          (t.unread_count ? '<span class="ct-list-unread">' + t.unread_count + '</span>' : '') +
          '<span class="ct-list-date">' + ctEscape(ctFormatDate(t.last_message_at)) + '</span>' +
        '</div>' +
        '<div class="ct-list-preview">' + (ctEscape(t.last_message_preview) || '(내용 없음)') + '</div>' +
      '</button>';
    }).join('');
  } catch (e) {
    if (!ctListEl.innerHTML) ctListEl.innerHTML = '<div class="ct-empty">대화 목록을 불러오지 못했습니다.</div>';
  }
}

ctListEl.addEventListener('click', function (e) {
  var item = e.target.closest('.ct-list-item');
  if (!item) return;
  ctOpenThread(parseInt(item.getAttribute('data-id'), 10), item.getAttribute('data-status'), true);
});

function ctOpenThread(id, status, push) {
  ctSelectedThreadId = id;
  ctSelectedStatus = status;
  ctLastRenderKey = '';
  ctMessagesEl.innerHTML = '';
  // 휴대폰 뒤로가기로 목록에 돌아올 수 있도록 히스토리 추가
  if (push) history.pushState({ ctThread: id, ctStatus: status }, '');
  ctUpdateLayout();
  ctLoadThread();
}

function ctBackToList() {
  ctSelectedThreadId = null;
  ctSelectedStatus = null;
  ctLastRenderKey = '';
  ctUpdateLayout();
  ctLoadThread();
}

ctBackBtnEl.addEventListener('click', function () {
  if (history.state && history.state.ctThread) history.back();
  else ctBackToList();
});

window.addEventListener('popstate', function (e) {
  if (!ctListMode) return;
  var st = e.state;
  if (st && st.ctThread) ctOpenThread(st.ctThread, st.ctStatus, false);
  else ctBackToList();
});

async function ctLoadThread() {
  if (ctListMode && !ctSelectedThreadId) return ctLoadList();
  var requestedId = ctSelectedThreadId;
  try {
    var thread = await ctFetch(requestedId ? '/threads/' + requestedId : '/thread');
    if (requestedId !== ctSelectedThreadId) return;  // 응답 오기 전에 다른 화면으로 이동함
    // 보고 있는 사이 관리자가 종결/재개하면 입력창 표시를 즉시 반영
    if (requestedId && thread.status !== ctSelectedStatus) {
      ctSelectedStatus = thread.status;
      ctUpdateLayout();
    }
    // 폴링마다 다시 그리면 사진이 깜빡이므로 내용(읽음 표시 포함)이 바뀐 경우에만 렌더링
    var key = JSON.stringify(thread.messages);
    if (key === ctLastRenderKey) return;
    ctLastRenderKey = key;
    ctRenderMessages(thread.messages);
  } catch (e) {
    if (e.status === 404) {
      if (requestedId) { ctBackToList(); return; }
      ctRenderMessages([]);
    }
    // 그 외 오류는 폴링 중 조용히 무시 (다음 폴링에서 재시도)
  }
}

// 업무시간 여부에 따라 입력창 활성/비활성 + 안내 배너 (입력창이 안 보이는 목록/종결 화면에선 배너 숨김)
function ctApplyAvailability() {
  var avail = ctLastAvail;
  ctAvailable = !!(avail && avail.available);
  ctInputEl.disabled = !ctAvailable;
  ctSendBtnEl.disabled = !ctAvailable;
  ctPhotoBtnEl.disabled = !ctAvailable;
  if (ctAvailable || !avail || !ctInputVisible()) {
    ctBannerEl.style.display = 'none';
  } else {
    ctBannerEl.textContent = avail.message || '현재 상담 가능 시간이 아닙니다.';
    ctBannerEl.style.display = '';
  }
}

async function ctCheckAvailability() {
  try {
    ctLastAvail = await ctFetch('/availability');
  } catch (e) {
    // 가용성 조회 실패 시 안전하게 전송 비활성화
    ctLastAvail = { available: false, message: '' };
  }
  ctApplyAvailability();
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

// ── 사진 보내기 (선택 즉시 전송) ─────────────────────────────────────────────
// 휴대폰 사진은 5MB를 쉽게 넘으므로 긴 변 1600px JPEG로 축소 후 업로드.
// GIF(애니메이션 유지)나 축소 실패 시에는 원본 그대로 사용.
function ctResizeImage(file) {
  var maxSide = 1600, quality = 0.85;
  return new Promise(function (resolve) {
    if (!file.type || file.type.indexOf('image/') !== 0 || file.type === 'image/gif') return resolve(file);
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      var scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      var canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(function (blob) { resolve(blob && blob.size < file.size ? blob : file); }, 'image/jpeg', quality);
    };
    img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

function ctShowError(msg) {
  ctBannerEl.textContent = msg;
  ctBannerEl.style.display = '';
}

async function ctSendImage(file) {
  if (!file) return;
  if (!file.type || file.type.indexOf('image/') !== 0) { ctShowError('이미지 파일만 보낼 수 있습니다.'); return; }
  ctPhotoBtnEl.disabled = true;
  var prevLabel = ctPhotoBtnEl.textContent;
  ctPhotoBtnEl.textContent = '⏳';
  try {
    var blob = await ctResizeImage(file);
    if (blob.size > 5 * 1024 * 1024) { ctShowError('사진 크기는 5MB 이하만 보낼 수 있습니다.'); return; }
    var ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' })[blob.type] || 'jpg';
    var fd = new FormData();
    fd.append('file', blob, 'photo.' + ext);
    var up = await ctFetch('/thread/images', { method: 'POST', body: fd });
    await ctFetch('/thread/messages', { method: 'POST', body: { content: '', image_url: up.url } });
    await ctLoadThread();
  } catch (e) {
    ctShowError(e.message || '사진 전송에 실패했습니다.');
  } finally {
    ctPhotoBtnEl.textContent = prevLabel;
    if (ctAvailable) ctPhotoBtnEl.disabled = false;
  }
}

ctPhotoBtnEl.addEventListener('click', function () { ctImageInputEl.click(); });
ctImageInputEl.addEventListener('change', function () {
  var file = ctImageInputEl.files && ctImageInputEl.files[0];
  ctImageInputEl.value = '';
  ctSendImage(file);
});

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
if (ctListMode) ctUpdateLayout();
ctLoadThread();
ctCheckAvailability();
ctStartPolling();
