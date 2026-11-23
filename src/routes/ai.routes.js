/**
 * AI Agent REST Routes
 * GET  /api/ai/status  → { enabled: bool, model: string|null }
 * POST /api/ai/chat    → { mode, reply, options?, refreshGroup?, navigateToGroupId? }
 */
import express, { Router } from 'express';
import { processChat, getAiStatus } from '../services/ai-agent.service.js';
import { isVoiceEnabled, transcribeAudio, validateWavBuffer } from '../services/voice.service.js';

// Sliding window per-user rate limiter: max 20 requests per minute per user.id
const userAiAttempts = new Map(); // userId -> Array<timestamp>
const AI_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_AI_PER_MINUTE = 20;

export function resetAiRateLimiter() {
  userAiAttempts.clear();
}

export function aiRoutes(repository, authRepo) {
  const router = Router();

  // GET /api/ai/status – check if AI agent and voice transcription are configured
  router.get('/status', (req, res) => {
    const aiStatus = getAiStatus();
    res.json({
      ...aiStatus,
      voiceEnabled: isVoiceEnabled()
    });
  });

  // POST /api/ai/chat – process a chat message through the agent
  router.post('/chat', async (req, res, next) => {
    try {
      // Check authentication first if auth is configured
      let currentUser = null;
      if (authRepo) {
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({
            error: 'Authentication required',
            requireLogin: true
          });
        }
        const token = authHeader.slice(7).trim();
        const session = await authRepo.validateSession(token);
        if (!session || !session.user) {
          return res.status(401).json({
            error: 'Authentication required',
            requireLogin: true
          });
        }
        currentUser = session.user;
      }

      // Validate request body
      const { groupId, messages } = req.body || {};

      if (!Array.isArray(messages) || !messages.length) {
        return res.status(400).json({ error: 'messages must be a non-empty array.' });
      }

      // Payload bounds: Max 20 turns
      if (messages.length > 20) {
        return res.status(400).json({ error: 'Conversation history exceeds limit of 20 turns.' });
      }

      // Validate message shape & Max 1000 chars per message
      for (const msg of messages) {
        if (!msg || typeof msg.role !== 'string' || typeof msg.content !== 'string') {
          return res.status(400).json({ error: 'Each message must have role (string) and content (string).' });
        }
        if (msg.content.length > 1000) {
          return res.status(400).json({ error: 'Message exceeds maximum length of 1000 characters.' });
        }
      }

      const status = getAiStatus();
      if (!status.enabled) {
        return res.status(503).json({ error: 'AI Assistant is not configured. Set NVIDIA_API_KEY to enable.' });
      }

      // Per-user sliding-window rate limit (20 req / minute)
      if (currentUser && currentUser.id != null) {
        const now = Date.now();
        const attempts = (userAiAttempts.get(currentUser.id) || []).filter(t => now - t < AI_WINDOW_MS);
        if (attempts.length >= MAX_AI_PER_MINUTE) {
          return res.status(429).json({ error: 'Too many AI requests. Please wait a moment.' });
        }
        attempts.push(now);
        userAiAttempts.set(currentUser.id, attempts);
      }

      // Send only the last 10 messages to bounded engine
      const boundedMessages = messages.slice(-10);

      const result = await processChat({
        groupId: typeof groupId === 'string' ? groupId : null,
        messages: boundedMessages,
        repository,
        user: currentUser,
        currentUser
      });

      res.json(result);
    } catch (err) {
      // Don't leak internal errors to client
      if (err.status && err.status < 500) {
        return res.status(err.status).json({ error: err.message });
      }
      console.error('AI chat error:', err.message);
      res.status(500).json({ error: 'AI Assistant encountered an error. Please try again.' });
    }
  });

  // POST /api/ai/transcribe – transcribe raw WAV audio via NVIDIA Riva Multilingual ASR
  router.post(
    '/transcribe',
    express.raw({
      type: ['audio/wav', 'audio/x-wav', 'audio/wave', 'application/octet-stream', '*/*'],
      limit: '5mb'
    }),
    async (req, res, next) => {
      try {
        // 1. Check authentication if auth is configured
        let currentUser = null;
        if (authRepo) {
          const authHeader = req.headers['authorization'];
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
              error: 'Authentication required',
              requireLogin: true
            });
          }
          const token = authHeader.slice(7).trim();
          const session = await authRepo.validateSession(token);
          if (!session || !session.user) {
            return res.status(401).json({
              error: 'Authentication required',
              requireLogin: true
            });
          }
          currentUser = session.user;
        }

        // 2. Validate audio buffer
        const audioBuffer = req.body;
        if (!audioBuffer || !Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
          return res.status(400).json({ error: 'Missing or empty audio payload.' });
        }

        validateWavBuffer(audioBuffer);

        // 3. Check voice availability
        if (!isVoiceEnabled()) {
          return res.status(503).json({
            error: 'Voice transcription service is not configured. Set NVIDIA_API_KEY to enable.'
          });
        }

        // 4. Sliding window rate limit per user (20 req / minute)
        if (currentUser && currentUser.id != null) {
          const now = Date.now();
          const attempts = (userAiAttempts.get(currentUser.id) || []).filter(t => now - t < AI_WINDOW_MS);
          if (attempts.length >= MAX_AI_PER_MINUTE) {
            return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
          }
          attempts.push(now);
          userAiAttempts.set(currentUser.id, attempts);
        }

        // 5. Execute Riva transcription
        const result = await transcribeAudio(audioBuffer);
        res.json(result);
      } catch (err) {
        if (err.status && err.status < 500) {
          return res.status(err.status).json({ error: err.message });
        }
        console.error('ASR transcription error:', err.message);
        res.status(err.status || 500).json({
          error: err.message || 'Voice transcription failed. Please try again.'
        });
      }
    }
  );

  return router;
}
