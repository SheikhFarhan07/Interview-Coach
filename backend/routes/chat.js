import { Router } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';

const router = Router();

router.post('/', async (req, res) => {
  const {
    apiKey,
    message,
    history      = [],
    interviewType = 'behavioral',
    difficulty    = 'senior',
    emotion       = {},
    speechMetrics = {},
  } = req.body;

  if (!apiKey)   return res.status(400).json({ error: 'apiKey is required' });
  if (!message)  return res.status(400).json({ error: 'message is required' });

  try {
    const genAI = new GoogleGenerativeAI(apiKey);

    const model = genAI.getGenerativeModel({
      model: 'gemini-flash-latest',
      systemInstruction: buildSystemPrompt(interviewType, difficulty),
      generationConfig: {
        temperature:     0.85,
        maxOutputTokens: 400,
        topP:            0.95,
      },
    });

    const geminiHistory = history.map(h => ({
      role:  h.role === 'ai' ? 'model' : 'user',
      parts: [{ text: h.text }],
    }));

    const chat = model.startChat({ history: geminiHistory });

    const enriched = buildEnrichedMessage(message, emotion, speechMetrics);
    const result   = await chat.sendMessage(enriched);
    const aiText   = result.response.text();

    return res.json({ response: aiText });

  } catch (err) {
    console.error('[/api/chat] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── Helpers ───────────────────────────────────────────────────
function buildSystemPrompt(type, difficulty) {
  const typeMap = {
    technical:     'a technical software engineering',
    behavioral:    'a behavioral (STAR method)',
    product:       'a product manager',
    system_design: 'a system design',
    hr:            'an HR and culture fit',
  };

  return `You are an expert ${typeMap[type] || 'job'} interviewer for a ${difficulty}-level candidate.
Ask ONE question at a time. Acknowledge the candidate's answer in 1 sentence before asking the next.
Adapt your tone and complexity based on the emotion data provided.
If CONFIDENCE < 40% or STRESS > 70%, be gentler and more encouraging.
Keep responses under 3 sentences + 1 question.`;
}

function buildEnrichedMessage(text, emotion, speech) {
  const parts = [];
  if (emotion.dominant)              parts.push(`EMOTION: ${emotion.dominant}`);
  if (emotion.confidence != null)    parts.push(`CONFIDENCE: ${emotion.confidence}%`);
  if (emotion.stress     != null)    parts.push(`STRESS: ${emotion.stress}%`);
  if (speech.wpm)                    parts.push(`SPEECH PACE: ${speech.wpm} WPM`);
  const ctx = parts.length ? '[' + parts.join(' | ') + ']' : '';
  return ctx ? `${ctx}\nCandidate: ${text}` : text;
}

export default router;