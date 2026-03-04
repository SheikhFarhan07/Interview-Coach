export const EMOTION_COLORS = {
  happy:     '#00f5c4',
  neutral:   '#8b9bb4',
  surprised: '#f6c90e',
  fearful:   '#ff6b6b',
  disgusted: '#ff9f9f',
  angry:     '#ff4444',
  sad:       '#7c6aff',
  confident: '#00d4ff',
};

export function initEmotionBars() {
  const container = document.getElementById('emotionBars');
  const emotions = ['happy', 'neutral', 'surprised', 'fearful', 'disgusted', 'angry', 'sad', 'confident'];

  container.innerHTML = emotions.map(e => `
    <div class="emotion-bar-item">
      <div class="emotion-bar-label">${e}</div>
      <div class="emotion-bar-track">
        <div class="emotion-bar-fill" id="bar_${e}"
             style="width:0%;background:${EMOTION_COLORS[e] || '#8b9bb4'}">
        </div>
      </div>
    </div>
  `).join('');
}

export function addMessage(role, text) {
  const container = document.getElementById('chatMessages');
  const div = document.createElement('div');

  if (role === 'ai') {
    div.className = 'msg msg-ai';
    div.innerHTML = `<div class="msg-label">◆ AI INTERVIEWER</div>${escapeHtml(text)}`;
  } else if (role === 'user') {
    div.className = 'msg msg-user';
    div.innerHTML = `<div class="msg-label">▶ YOU</div>${escapeHtml(text)}`;
  } else {
    div.className = 'msg msg-system';
    div.textContent = text;
  }

  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

export function addTypingIndicator() {
  const container = document.getElementById('chatMessages');
  const id = 'typing-' + Date.now();
  const div = document.createElement('div');
  div.id = id;
  div.className = 'msg msg-ai';
  div.innerHTML = `
    <div class="msg-label">◆ AI INTERVIEWER</div>
    <div class="typing-indicator">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return id;
}

export function removeTypingIndicator(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

export function addTranscript(type, text) {
  const container = document.getElementById('transcript');
  const div = document.createElement('div');
  div.className = 'transcript-' + type;   
  div.textContent = text;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

export function clearTranscript() {
  document.getElementById('transcript').innerHTML = '';
}

export function setStatus(type, active, text) {
  const dot  = document.getElementById(type + 'Status');
  const span = document.getElementById(type + 'StatusTxt');
  if (dot)  dot.className  = 'status-dot' + (active ? ' active' : '');
  if (span) span.textContent = text;
}

export function updateMetricBar(id, barId, value) {
  const valEl = document.getElementById(id);
  const barEl = document.getElementById(barId);
  if (valEl) valEl.textContent = value + '%';
  if (barEl) barEl.style.width = value + '%';
}

export function updatePaceDisplay(wpm) {
  const el = document.getElementById('paceVal');
  if (!el) return;
  if (!wpm) { el.textContent = '—'; return; }
  let label = wpm + ' WPM';
  if (wpm < 100)      label += ' (slow)';
  else if (wpm > 160) label += ' (fast)';
  else                label += ' ✓';
  el.textContent = label;
}

export function updateQuestionCount(n) {
  const el = document.getElementById('questionCount');
  if (el) el.textContent = 'Q: ' + n;
}

export function setDominantEmotion(name) {
  const el = document.getElementById('dominantEmotion');
  if (el) el.textContent = name.charAt(0).toUpperCase() + name.slice(1);
}

export function setFeedback(htmlOrText) {
  const el = document.getElementById('feedbackContent');
  if (!el) return;
  const html = htmlOrText
    .replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--accent)">$1</strong>')
    .replace(/\n/g, '<br>');
  el.innerHTML = html;
}

export function setFeedbackLoading() {
  const el = document.getElementById('feedbackContent');
  if (el) el.innerHTML = `
    <div class="typing-indicator">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>`;
}

export function showToast(msg, type = 'info', duration = 3500) {
  const container = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transition = 'opacity 0.3s';
    setTimeout(() => t.remove(), 300);
  }, duration);
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}