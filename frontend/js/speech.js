import { addTranscript, setStatus, updatePaceDisplay } from './ui.js';

let recognition   = null;
let audioCtx      = null;
let analyser      = null;
let micSource     = null;
let animFrameId   = null;
let isListening   = false;

const wordTimestamps = [];  

let onFinalSpeech = null;

export async function startSpeech(stream, onSpeech) {
  onFinalSpeech = onSpeech;

  audioCtx  = new (window.AudioContext || window.webkitAudioContext)();
  analyser  = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  micSource = audioCtx.createMediaStreamSource(stream);
  micSource.connect(analyser);
  animateMicBars();

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    console.warn('[Speech] SpeechRecognition not supported');
    return false;
  }

  recognition = new SR();
  recognition.continuous      = true;
  recognition.interimResults  = true;
  recognition.lang            = 'en-US';
  recognition.maxAlternatives = 1;

  let interimEl = null;

  recognition.onresult = (event) => {
    let interim = '';
    let final   = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) final   += transcript + ' ';
      else                           interim += transcript;
    }

    if (interimEl) interimEl.remove();
    if (interim) {
      interimEl = document.createElement('div');
      interimEl.className   = 'transcript-user';
      interimEl.style.opacity = '0.35';
      interimEl.textContent = interim;
      document.getElementById('transcript')?.appendChild(interimEl);
    }

    if (final.trim()) {
      if (interimEl) { interimEl.remove(); interimEl = null; }
      const text = final.trim();

      const wordCount = text.split(/\s+/).length;
      wordTimestamps.push({ words: wordCount, time: Date.now() });
      recalcPace();

      addTranscript('user', text);
      onFinalSpeech?.(text);
    }
  };

  recognition.onerror = (e) => {
    if (e.error !== 'no-speech' && e.error !== 'aborted') {
      console.warn('[Speech] Recognition error:', e.error);
    }
  };

  recognition.onend = () => {
    if (isListening) {
      try { recognition.start(); } catch (_) {}
    }
  };

  isListening = true;
  recognition.start();

  if (window.speechSynthesis) {
    window.speechSynthesis.getVoices(); 
  }

  return true;
}

export function stopSpeech() {
  isListening = false;

  if (recognition) {
    try { recognition.stop(); } catch (_) {}
    recognition = null;
  }

  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }

  if (audioCtx) {
    audioCtx.close();
    audioCtx = null;
  }

  window.speechSynthesis?.cancel();

  document.querySelectorAll('.mic-bar').forEach(b => {
    b.style.height = '6px';
    b.style.background = 'var(--muted)';
  });
  document.getElementById('micBars')?.classList.remove('active');
  setStatus('mic', false, 'Mic Off');
}

export function speak(text) {
  if (!window.speechSynthesis) return;

  window.speechSynthesis.cancel();

  const utter  = new SpeechSynthesisUtterance(text);
  utter.rate   = 0.93;
  utter.pitch  = 1.0;
  utter.volume = 1.0;

  const voices = window.speechSynthesis.getVoices();
  const best =
    voices.find(v => v.name.includes('Google') && v.lang === 'en-US') ||
    voices.find(v => v.lang === 'en-US') ||
    voices[0];

  if (best) utter.voice = best;

  window.speechSynthesis.speak(utter);
}

export function getCurrentWPM() {
  const now    = Date.now();
  const window30s = wordTimestamps.filter(t => now - t.time < 30_000);
  if (window30s.length < 2) return null;

  const totalWords = window30s.reduce((a, b) => a + b.words, 0);
  const minutes    = (now - window30s[0].time) / 60_000;
  return Math.round(totalWords / Math.max(0.05, minutes));
}

function animateMicBars() {
  const bars    = document.querySelectorAll('.mic-bar');
  const dataArr = new Uint8Array(analyser.frequencyBinCount);

  function draw() {
    animFrameId = requestAnimationFrame(draw);
    analyser.getByteFrequencyData(dataArr);

    const avg   = dataArr.slice(0, 12).reduce((a, b) => a + b, 0) / 12;
    const isTalking = avg > 18;

    document.getElementById('micBars')?.classList.toggle('active', isTalking);
    setStatus('mic', true, isTalking ? 'Speaking' : 'Listening');

    bars.forEach((bar, i) => {
      const freq = dataArr[i * 4] || 0;
      const h    = Math.max(3, Math.min(20, (freq / 255) * 22));
      bar.style.height = h + 'px';
    });
  }

  draw();
}

function recalcPace() {
  const wpm = getCurrentWPM();
  updatePaceDisplay(wpm);
}