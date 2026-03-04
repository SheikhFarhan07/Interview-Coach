import { initEmotionBars, addMessage, addTranscript, clearTranscript,
         setStatus, showToast }             from './ui.js';
import { loadModels, startDetection, stopDetection,
         getCurrentMetrics, getAverageEmotions } from './emotion.js';
import { startSpeech, stopSpeech, getCurrentWPM } from './speech.js';
import { sendMessage, generateFeedback, resetConversation,
         getConversationHistory, getOpeningQuestion }   from './gemini.js';

const state = {
  active:      false,
  stream:      null,
  transcriptLog: [],  
};

document.addEventListener('DOMContentLoaded', () => {
  initEmotionBars();

  document.getElementById('startBtn')       .addEventListener('click', startSession);
  document.getElementById('stopBtn')        .addEventListener('click', stopSession);
  document.getElementById('feedbackBtn')    .addEventListener('click', requestFeedback);
  document.getElementById('clearTranscriptBtn').addEventListener('click', clearTranscript);
});

async function startSession() {
  const apiKey = document.getElementById('apiKey')?.value?.trim();
  if (!apiKey) {
    showToast('Please enter your Gemini API Key first', 'error');
    return;
  }

  try {
    showToast('Requesting camera & microphone...', 'info', 2000);
    state.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

    const video = document.getElementById('webcam');
    video.srcObject = state.stream;
    await new Promise(res => video.onloadedmetadata = res);

    loadModels().then(() => startDetection());

    const speechOk = await startSpeech(state.stream, handleUserSpeech);
    if (!speechOk) {
      showToast('Speech recognition unavailable — use Chrome/Edge', 'error');
    }

    resetConversation();
    state.transcriptLog = [];

    state.active = true;
    document.getElementById('startBtn')   .disabled = true;
    document.getElementById('stopBtn')    .disabled = false;
    document.getElementById('feedbackBtn').disabled = false;
    document.getElementById('recBadge')   .style.display = 'flex';
    setStatus('cam', true, 'Camera On');
    setStatus('ai',  true, 'AI Active');

    const interviewType = document.getElementById('interviewType')?.value || 'behavioral';
    const firstQ = getOpeningQuestion(interviewType);

    addMessage('ai', firstQ);
    addTranscript('ai', firstQ);
    state.transcriptLog.push({ role: 'ai', text: firstQ, timestamp: Date.now() });

    setTimeout(() => {
      import('./speech.js').then(({ speak }) => speak(firstQ));
    }, 500);

    addTranscript('system', '— Session started ' + new Date().toLocaleTimeString() + ' —');
    showToast('Session started! Good luck 🎯', 'success');

  } catch (err) {
    showToast('Could not start: ' + err.message, 'error');
    console.error('[Main] startSession error:', err);
  }
}

async function stopSession() {
  if (!state.active) return;
  state.active = false;

  if (state.stream) {
    state.stream.getTracks().forEach(t => t.stop());
    state.stream = null;
  }

  stopSpeech();
  stopDetection();

  document.getElementById('startBtn')   .disabled = false;
  document.getElementById('stopBtn')    .disabled = true;
  document.getElementById('recBadge')   .style.display = 'none';
  setStatus('cam', false, 'Camera Off');
  setStatus('mic', false, 'Mic Off');
  setStatus('ai',  false, 'AI Idle');

  addTranscript('system', '— Session ended ' + new Date().toLocaleTimeString() + ' —');
  showToast('Session ended. Generating feedback...', 'info');

  await requestFeedback();
}

async function requestFeedback() {
  const avgEmotions = getAverageEmotions();
  await generateFeedback(state.transcriptLog, avgEmotions);
}

async function handleUserSpeech(text) {
  if (!state.active) return;

  state.transcriptLog.push({ role: 'user', text, timestamp: Date.now() });

  addMessage('user', text);

  const emotionCtx = getCurrentMetrics();
  const wpm        = getCurrentWPM();
  const speechCtx  = wpm ? { wpm } : {};

  await sendMessage(text, emotionCtx, speechCtx);

  const history = getConversationHistory();
  const lastAI  = history.filter(h => h.role === 'model').at(-1);
  if (lastAI) {
    const aiText = lastAI.parts?.[0]?.text || '';
    state.transcriptLog.push({ role: 'ai', text: aiText, timestamp: Date.now() });
  }
}