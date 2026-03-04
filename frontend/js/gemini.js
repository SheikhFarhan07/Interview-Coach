import { addMessage, addTypingIndicator, removeTypingIndicator,
         addTranscript, updateQuestionCount, showToast,
         setFeedback, setFeedbackLoading } from './ui.js';
import { speak } from './speech.js';

const GEMINI_URL = (key, model = 'gemini-flash-latest') =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

let conversationHistory = [];
let questionCount       = 0;

export function resetConversation() {
  conversationHistory = [];
  questionCount       = 0;
  updateQuestionCount(0);
}

export function getConversationHistory() {
  return conversationHistory;
}

export async function sendMessage(userText, emotionCtx = {}, speechCtx = {}) {
  const apiKey = document.getElementById('apiKey')?.value?.trim();
  if (!apiKey) { showToast('API Key required', 'error'); return; }

  const interviewType = document.getElementById('interviewType')?.value || 'behavioral';
  const difficulty    = document.getElementById('difficulty')?.value    || 'senior';

  const enriched = buildEnrichedMessage(userText, emotionCtx, speechCtx);

  conversationHistory.push({ role: 'user', parts: [{ text: enriched }] });

  const typingId = addTypingIndicator();

  try {
    const response = await fetch(GEMINI_URL(apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: buildSystemPrompt(interviewType, difficulty) }]
        },
        contents: conversationHistory,
        generationConfig: {
          temperature:     0.85,
          maxOutputTokens: 400,
          topP:            0.95,
        },
      }),
    });

    const data = await response.json();

    if (data.error) {
      removeTypingIndicator(typingId);
      showToast('Gemini Error: ' + data.error.message, 'error');
      return;
    }

    const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text
      || "I didn't quite catch that — could you elaborate a bit more?";

    conversationHistory.push({ role: 'model', parts: [{ text: aiText }] });

    questionCount++;
    updateQuestionCount(questionCount);

    removeTypingIndicator(typingId);
    addMessage('ai', aiText);
    addTranscript('ai', aiText);
    speak(aiText);

  } catch (err) {
    removeTypingIndicator(typingId);
    showToast('Network error: ' + err.message, 'error');
    console.error('[Gemini] sendMessage error:', err);
  }
}

export async function generateFeedback(transcriptLog, avgEmotions) {
  const apiKey = document.getElementById('apiKey')?.value?.trim();
  if (!apiKey) { showToast('API Key required for feedback', 'error'); return; }

  if (!transcriptLog || transcriptLog.length === 0) {
    showToast('No conversation to analyze', 'error');
    return;
  }

  setFeedbackLoading();

  const transcriptText = transcriptLog
    .map(t => `${t.role.toUpperCase()}: ${t.text}`)
    .join('\n');

  const interviewType = document.getElementById('interviewType')?.value || 'behavioral';
  const difficulty    = document.getElementById('difficulty')?.value    || 'senior';

  const prompt = buildFeedbackPrompt(transcriptText, avgEmotions, interviewType, difficulty);

  try {
    const response = await fetch(GEMINI_URL(apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature:     0.60,
          maxOutputTokens: 700,
        },
      }),
    });

    const data = await response.json();

    if (data.error) {
      setFeedback('Error: ' + data.error.message);
      return;
    }

    const feedbackText = data.candidates?.[0]?.content?.parts?.[0]?.text
      || 'Unable to generate feedback.';

    setFeedback(feedbackText);
    showToast('Feedback ready! 📊', 'success');

  } catch (err) {
    setFeedback('Network error — could not generate feedback.');
    showToast('Feedback error: ' + err.message, 'error');
  }
}

export function getOpeningQuestion(interviewType) {
  const questions = {
    technical:     "Let's start — walk me through how you'd design a URL shortener like bit.ly. Think out loud.",
    behavioral:    "Tell me about yourself and a project you're most proud of from the last two years.",
    product:       "You're a PM at Google. How would you improve Google Maps for visually impaired users?",
    system_design: "How would you design a distributed rate limiter that works across multiple data centers?",
    hr:            "Tell me about yourself and what excites you most about this role.",
  };
  return questions[interviewType] || questions.behavioral;
}

function buildSystemPrompt(type, difficulty) {
  const typeMap = {
    technical:     'a technical software engineering',
    behavioral:    'a behavioral (STAR method)',
    product:       'a product manager',
    system_design: 'a system design',
    hr:            'an HR and culture fit',
  };

  return `You are an expert ${typeMap[type] || 'job'} interviewer coaching a ${difficulty}-level candidate.

EMOTION-ADAPTIVE RULES (hidden from candidate):
- If [CONFIDENCE < 40%]: Simplify follow-up. Add a brief encouraging note like "That's a solid start."
- If [STRESS > 70%]: Begin response with "Take your time." Ask a gentler version of the question.
- If [EMOTION = fearful or sad]: Validate their answer warmly, then reframe the question more simply.
- If [EMOTION = happy or neutral]: Maintain complexity or increase depth.
- If [SPEECH PACE > 180 WPM]: "Walk me through that again more slowly — I want to make sure I understand."
- If [SPEECH PACE < 80 WPM]: Use open-ended, exploratory questions that give them room to think.

INTERVIEW RULES:
1. Ask ONE question per response. Never ask two questions at once.
2. In 1 sentence, acknowledge or respond to what the candidate said.
3. Keep total response under 3 sentences + 1 question (unless wrapping up).
4. After 8 or more questions, naturally close: "This has been a great conversation — let me reflect on your performance overall."
5. Never tell the candidate you are reading their emotion data. Adapt naturally.
6. Reference their actual words in follow-up questions when possible.
7. Be professional, warm, and encouraging throughout.`;
}

function buildEnrichedMessage(text, emotion, speech) {
  const parts = [];
  if (emotion.dominant)  parts.push(`EMOTION: ${emotion.dominant}`);
  if (emotion.confidence !== undefined) parts.push(`CONFIDENCE: ${emotion.confidence}%`);
  if (emotion.stress     !== undefined) parts.push(`STRESS: ${emotion.stress}%`);
  if (speech.wpm)        parts.push(`SPEECH PACE: ${speech.wpm} WPM`);
  const ctx = parts.length ? '[' + parts.join(' | ') + ']' : '';
  return ctx ? `${ctx}\nCandidate: ${text}` : text;
}

function buildFeedbackPrompt(transcript, avgEmotions, type, difficulty) {
  return `You are an expert interview coach. Analyze this ${type} interview for a ${difficulty}-level candidate.

TRANSCRIPT:
${transcript}

AVERAGE EMOTION DATA (0–100 scale):
${JSON.stringify(avgEmotions, null, 2)}

Provide structured feedback in exactly this format:

**Overall Score: X/10**

**Strengths:**
- (cite a specific thing they said or did well)
- (another strength)

**Areas to Improve:**
- (specific, actionable improvement)
- (another improvement)

**Communication Style:**
- (1–2 sentences about how they communicated: pace, clarity, structure)

**Emotional Presence:**
- (1–2 sentences based on emotion data — confidence, stress handling)

**#1 Tip for Next Interview:**
(One single most important piece of advice)

Be warm, specific, and constructive. Reference actual quotes from the transcript where helpful.`;
}