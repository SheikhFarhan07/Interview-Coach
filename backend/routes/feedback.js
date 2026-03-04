import { Router } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';

const router = Router();

router.post('/', async (req, res) => {
  const {
    apiKey,
    transcript,        
    emotionHistory = [], 
    config         = {}, 
  } = req.body;

  if (!apiKey)     return res.status(400).json({ error: 'apiKey is required' });
  if (!transcript) return res.status(400).json({ error: 'transcript is required' });

  const transcriptText = Array.isArray(transcript)
    ? transcript.map(t => `${(t.role || 'user').toUpperCase()}: ${t.text}`).join('\n')
    : String(transcript);

  if (!transcriptText.trim()) {
    return res.status(400).json({ error: 'transcript is empty' });
  }

  const avgEmotions = computeAverageEmotions(emotionHistory);

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-flash-latest',
      generationConfig: {
        temperature:     0.60,
        maxOutputTokens: 700,
      },
    });

    const prompt = buildFeedbackPrompt(transcriptText, avgEmotions, config);
    const result = await model.generateContent(prompt);
    const feedback = result.response.text();

    return res.json({ feedback, avgEmotions });

  } catch (err) {
    console.error('[/api/feedback] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

function buildFeedbackPrompt(transcript, avgEmotions, config) {
  const { interviewType = 'behavioral', difficulty = 'senior' } = config;

  return `You are an expert interview coach. Analyze this ${interviewType} interview for a ${difficulty}-level candidate.

TRANSCRIPT:
${transcript}

AVERAGE EMOTION DATA (0–100 scale):
${JSON.stringify(avgEmotions, null, 2)}

Return feedback in this exact format:

**Overall Score: X/10**

**Strengths:**
- (specific, with example from transcript)
- (another strength)

**Areas to Improve:**
- (actionable improvement)
- (another improvement)

**Communication Style:**
- (1–2 sentences: clarity, pace, structure)

**Emotional Presence:**
- (1–2 sentences based on emotion data)

**#1 Tip for Next Interview:**
(Single most important piece of advice)

Be warm, specific, and constructive.`;
}

function computeAverageEmotions(history) {
  if (!history || !history.length) return {};

  const keys = ['happy', 'neutral', 'sad', 'angry', 'fearful', 'disgusted', 'surprised'];
  const avg  = {};

  keys.forEach(k => {
    const vals = history.map(h => h[k] || 0);
    avg[k] = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100);
  });

  return avg;
}

export default router;