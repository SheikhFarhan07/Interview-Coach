import express               from 'express';
import { createServer }      from 'http';
import { WebSocketServer }   from 'ws';
import cors                  from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { fileURLToPath }     from 'url';
import { dirname, join }     from 'path';
import dotenv                from 'dotenv';
import chatRoute             from './routes/chat.js';
import feedbackRoute         from './routes/feedback.js';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const app    = express();
const server = createServer(app);

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(join(__dirname, '../frontend')));

app.use('/api/chat',     chatRoute);
app.use('/api/feedback', feedbackRoute);
app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', sessions: sessions.size, uptime: Math.round(process.uptime()) })
);

const wss      = new WebSocketServer({ server });
const sessions = new Map();

wss.on('connection', (ws) => {
  const clientId = Math.random().toString(36).slice(2, 10);
  console.log(`[WS] Connected: ${clientId}`);

  sessions.set(clientId, {
    id: clientId, ws,
    chat: null, genAI: null, config: null,
    emotionHistory: [], transcriptLog: [],
    questionCount: 0, startTime: Date.now(),
  });

  ws.send(JSON.stringify({ type: 'connected', clientId }));

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      await routeMessage(clientId, msg);
    } catch (err) {
      wsSend(clientId, { type: 'error', message: err.message });
    }
  });

  ws.on('close', () => { sessions.delete(clientId); });
});

async function routeMessage(clientId, msg) {
  const handlers = {
    init:             () => wsInitSession(clientId, msg),
    user_speech:      () => wsHandleSpeech(clientId, msg),
    emotion_update:   () => wsHandleEmotion(clientId, msg),
    request_feedback: () => wsGenerateFeedback(clientId),
    end_session:      () => wsEndSession(clientId),
  };
  await (handlers[msg.type] || (() => {}))();
}

async function wsInitSession(clientId, { apiKey, interviewType = 'behavioral', difficulty = 'senior' }) {
  const s = sessions.get(clientId);
  if (!apiKey) return wsSend(clientId, { type: 'error', message: 'API key required' });

  try {
    s.genAI  = new GoogleGenerativeAI(apiKey);
    s.config = { interviewType, difficulty };
    const model = s.genAI.getGenerativeModel({
      model: 'gemini-flash-latest',
      systemInstruction: buildSystemPrompt(interviewType, difficulty),
      generationConfig: { temperature: 0.85, maxOutputTokens: 400 },
    });
    s.chat = model.startChat({ history: [] });
    s.questionCount = 1;

    const firstQ = getFirstQuestion(interviewType);
    s.transcriptLog.push({ role: 'ai', text: firstQ, timestamp: Date.now() });
    wsSend(clientId, { type: 'session_ready', firstQuestion: firstQ });
  } catch (err) {
    wsSend(clientId, { type: 'error', message: err.message });
  }
}

async function wsHandleSpeech(clientId, { text, emotion = {}, speechMetrics = {} }) {
  const s = sessions.get(clientId);
  if (!s?.chat || !text?.trim()) return;

  s.transcriptLog.push({ role: 'user', text, emotion, timestamp: Date.now() });
  wsSend(clientId, { type: 'ai_thinking' });

  try {
    const enriched = buildEnrichedMessage(text, emotion, speechMetrics);
    const result   = await s.chat.sendMessage(enriched);
    const aiText   = result.response.text();

    s.transcriptLog.push({ role: 'ai', text: aiText, timestamp: Date.now() });
    s.questionCount++;
    wsSend(clientId, { type: 'ai_response', text: aiText, questionCount: s.questionCount });
  } catch (err) {
    wsSend(clientId, { type: 'error', message: err.message });
  }
}

function wsHandleEmotion(clientId, { emotions }) {
  const s = sessions.get(clientId);
  if (!s) return;
  s.emotionHistory.push({ ...emotions, timestamp: Date.now() });
  if (s.emotionHistory.length > 300) s.emotionHistory.shift();
}

async function wsGenerateFeedback(clientId) {
  const s = sessions.get(clientId);
  if (!s?.genAI) return;

  wsSend(clientId, { type: 'feedback_loading' });

  const transcript = s.transcriptLog.map(t => `${t.role.toUpperCase()}: ${t.text}`).join('\n');
  const avgEmotions = computeAvgEmotions(s.emotionHistory);
  const stats = { duration: Math.round((Date.now() - s.startTime) / 60000), questions: s.questionCount };

  try {
    const model = s.genAI.getGenerativeModel({ model: 'gemini-flash-latest', generationConfig: { temperature: 0.6, maxOutputTokens: 700 } });
    const result = await model.generateContent(buildFeedbackPrompt(transcript, avgEmotions, s.config, stats));
    wsSend(clientId, { type: 'feedback_ready', feedback: result.response.text(), stats });
  } catch (err) {
    wsSend(clientId, { type: 'error', message: err.message });
  }
}

async function wsEndSession(clientId) {
  await wsGenerateFeedback(clientId);
  wsSend(clientId, { type: 'session_ended' });
}

function buildSystemPrompt(type, difficulty) {
  const t = { technical:'technical SWE', behavioral:'behavioral STAR', product:'product manager', system_design:'system design', hr:'HR culture fit' };
  return `You are an expert ${t[type]||'job'} interviewer for a ${difficulty}-level candidate.
ONE question per turn. Briefly acknowledge the answer, then ask the next question.
Adapt based on emotion data: be gentler if CONFIDENCE<40% or STRESS>70%.`;
}

function buildEnrichedMessage(text, emotion, speech) {
  const parts = [];
  if (emotion.dominant)           parts.push(`EMOTION: ${emotion.dominant}`);
  if (emotion.confidence != null) parts.push(`CONFIDENCE: ${emotion.confidence}%`);
  if (emotion.stress     != null) parts.push(`STRESS: ${emotion.stress}%`);
  if (speech.wpm)                 parts.push(`SPEECH: ${speech.wpm} WPM`);
  const ctx = parts.length ? '['+parts.join(' | ')+']' : '';
  return ctx ? `${ctx}\nCandidate: ${text}` : text;
}

function buildFeedbackPrompt(transcript, emotions, config = {}, stats = {}) {
  return `Analyze this ${config.interviewType||'behavioral'} interview (${config.difficulty||'senior'} level, ${stats.duration||'?'} min, ${stats.questions||'?'} questions).

TRANSCRIPT:\n${transcript}

AVG EMOTIONS: ${JSON.stringify(emotions)}

Provide:
**Overall Score: X/10**
**Strengths:** (2 specific bullets)
**Areas to Improve:** (2 actionable bullets)
**Communication:** (1–2 sentences)
**Emotional Presence:** (1–2 sentences)
**#1 Tip:** (one sentence)`;
}

function getFirstQuestion(type) {
  const q = { technical:"Walk me through designing a URL shortener like bit.ly.", behavioral:"Tell me about yourself and a project you're proud of.", product:"How would you improve Google Maps for visually impaired users?", system_design:"Design a distributed rate limiter across multiple data centers.", hr:"Tell me about yourself and why you're excited about this role." };
  return q[type] || q.behavioral;
}

function computeAvgEmotions(history) {
  if (!history?.length) return {};
  const keys = ['happy','neutral','sad','angry','fearful','disgusted','surprised'];
  const avg = {};
  keys.forEach(k => { avg[k] = Math.round(history.reduce((a,b)=>a+(b[k]||0),0)/history.length*100); });
  return avg;
}

function wsSend(clientId, data) {
  const s = sessions.get(clientId);
  if (s?.ws?.readyState === 1) s.ws.send(JSON.stringify(data));
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`\n🎯 Emotion Interview Coach\n   HTTP: http://localhost:${PORT}\n   WS:   ws://localhost:${PORT}\n`);
});