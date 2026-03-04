import { setDominantEmotion, updateMetricBar, EMOTION_COLORS } from './ui.js';

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model/';

let detectionInterval = null;
let modelsLoaded      = false;

const emotionHistory = [];   
const MAX_HISTORY    = 300;

export async function loadModels() {
  try {
    await waitForFaceApi();

    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);

    modelsLoaded = true;
    console.log('[Emotion] face-api models loaded ✓');
    return true;
  } catch (err) {
    console.warn('[Emotion] Models failed to load, using simulation:', err.message);
    return false;
  }
}

export function startDetection() {
  if (detectionInterval) clearInterval(detectionInterval);
  detectionInterval = setInterval(runDetectionFrame, 1200);
}

export function stopDetection() {
  if (detectionInterval) {
    clearInterval(detectionInterval);
    detectionInterval = null;
  }
}

export function getCurrentEmotion() {
  const el = document.getElementById('dominantEmotion');
  return (el?.textContent || 'Neutral').toLowerCase();
}

export function getAverageEmotions() {
  if (!emotionHistory.length) return {};
  const keys = ['happy', 'neutral', 'sad', 'angry', 'fearful', 'disgusted', 'surprised'];
  const avg = {};
  keys.forEach(k => {
    const sum = emotionHistory.reduce((a, b) => a + (b[k] || 0), 0);
    avg[k] = Math.round((sum / emotionHistory.length) * 100);
  });
  return avg;
}

export function getCurrentMetrics() {
  return {
    confidence: parseInt(document.getElementById('confVal')?.textContent) || 0,
    stress:     parseInt(document.getElementById('stressVal')?.textContent) || 0,
    engagement: parseInt(document.getElementById('engageVal')?.textContent) || 0,
    dominant:   getCurrentEmotion(),
  };
}

async function runDetectionFrame() {
  const video  = document.getElementById('webcam');
  const canvas = document.getElementById('faceCanvas');

  if (!video || !canvas || !video.videoWidth) return;

  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (modelsLoaded) {
    try {
      const detections = await faceapi
        .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 }))
        .withFaceExpressions();

      if (detections.length > 0) {
        drawFaceBox(ctx, canvas, detections[0]);
        const expr = detections[0].expressions;
        processEmotions(expr);
      } else {
        simulateEmotions(0.3);
      }
      return;
    } catch (e) {
      console.warn('[Emotion] Detection error, falling back to simulation');
    }
  }

  simulateEmotions(1.0);
}

function drawFaceBox(ctx, canvas, detection) {
  const box = detection.detection.box;
  const mx  = canvas.width - box.x - box.width;

  ctx.strokeStyle = 'rgba(0,245,196,0.55)';
  ctx.lineWidth   = 1.5;
  ctx.strokeRect(mx, box.y, box.width, box.height);

  const len = 14;
  ctx.strokeStyle = '#00f5c4';
  ctx.lineWidth   = 2.5;

  const corners = [
    [mx, box.y, mx + len, box.y, mx, box.y, mx, box.y + len],                                          // TL
    [mx + box.width - len, box.y, mx + box.width, box.y, mx + box.width, box.y, mx + box.width, box.y + len], // TR
    [mx, box.y + box.height - len, mx, box.y + box.height, mx, box.y + box.height, mx + len, box.y + box.height], // BL
    [mx + box.width - len, box.y + box.height, mx + box.width, box.y + box.height, mx + box.width, box.y + box.height, mx + box.width, box.y + box.height - len], // BR
  ];

  corners.forEach(([x1, y1, x2, y2, x3, y3, x4, y4]) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.moveTo(x3, y3); ctx.lineTo(x4, y4);
    ctx.stroke();
  });
}

function processEmotions(expr) {
  const emotions = ['happy', 'neutral', 'surprised', 'fearful', 'disgusted', 'angry', 'sad'];
  let dominant = 'neutral', maxVal = 0;

  emotions.forEach(e => {
    const val = expr[e] || 0;
    const pct = Math.round(val * 100);
    const bar = document.getElementById('bar_' + e);
    if (bar) bar.style.width = pct + '%';
    if (val > maxVal) { maxVal = val; dominant = e; }
  });

  const confidence = deriveConfidence(expr);
  const confBar = document.getElementById('bar_confident');
  if (confBar) confBar.style.width = Math.min(100, Math.round(confidence * 100)) + '%';

  setDominantEmotion(dominant);
  updateMetrics(expr, confidence);

  emotionHistory.push({ ...expr, timestamp: Date.now() });
  if (emotionHistory.length > MAX_HISTORY) emotionHistory.shift();
}

function simulateEmotions(intensity = 1.0) {
  const t = Date.now() / 1000;
  const expr = {
    happy:     Math.max(0, 0.35 + Math.sin(t * 0.3) * 0.1 * intensity),
    neutral:   Math.max(0, 0.40 + Math.cos(t * 0.2) * 0.08 * intensity),
    surprised: Math.max(0, 0.05 + Math.sin(t * 1.1) * 0.03 * intensity),
    fearful:   Math.max(0, 0.08 + Math.sin(t * 0.7) * 0.04 * intensity),
    disgusted: Math.max(0, 0.02),
    angry:     Math.max(0, 0.02 + Math.sin(t * 0.5) * 0.01 * intensity),
    sad:       Math.max(0, 0.08 + Math.cos(t * 0.4) * 0.04 * intensity),
  };
  processEmotions(expr);
}

function deriveConfidence(expr) {
  return Math.min(1,
    (expr.happy    || 0) * 0.6 +
    (expr.neutral  || 0) * 0.4 +
    (1 - (expr.fearful || 0)) * 0.3 +
    (1 - (expr.angry   || 0)) * 0.1
  );
}

function updateMetrics(expr, confidence) {
  const conf     = Math.min(100, Math.round(confidence * 100));
  const stress   = Math.min(100, Math.round(((expr.fearful || 0) * 0.8 + (expr.angry || 0) * 0.6 + (expr.disgusted || 0) * 0.3) * 100));
  const engage   = Math.min(100, Math.round(((expr.happy || 0) * 0.7 + (expr.surprised || 0) * 0.5 + (expr.neutral || 0) * 0.3 + 0.2) * 100));

  updateMetricBar('confVal',   'confBar',   conf);
  updateMetricBar('stressVal', 'stressBar', stress);
  updateMetricBar('engageVal', 'engageBar', engage);
}

function waitForFaceApi(timeout = 8000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (window.faceapi) return resolve();
      if (Date.now() - start > timeout) return reject(new Error('faceapi timeout'));
      setTimeout(check, 200);
    };
    check();
  });
}