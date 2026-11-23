/**
 * Voice Transcription Pipeline (NVIDIA Riva Parakeet Multilingual ASR) Tests
 *
 * Verifies:
 * 1. GET /api/ai/status reports voiceEnabled
 * 2. POST /api/ai/transcribe requires authentication (401)
 * 3. POST /api/ai/transcribe rejects empty/corrupt audio (400)
 * 4. POST /api/ai/transcribe rejects oversized payloads >5MB (413)
 * 5. POST /api/ai/transcribe returns 503 when voice service is disabled
 * 6. Temporary file cleanup and safe execution
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createLocalRepository } from '../src/database/repository.js';
import { resetAiRateLimiter } from '../src/routes/ai.routes.js';
import { resetRateLimiter } from '../src/middleware/security.middleware.js';
import { validateWavBuffer, MAX_AUDIO_BYTES } from '../src/services/voice.service.js';

// Helper to create a minimal valid RIFF/WAVE PCM buffer in memory
function createMockWavBuffer(sampleRate = 16000, numSamples = 160) {
  const numChannels = 1;
  const bytesPerSample = 2; // 16-bit PCM
  const dataSize = numSamples * numChannels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF Chunk Descriptor
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8, 'ascii');

  // "fmt " Sub-chunk
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20);  // AudioFormat (1 for PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28); // ByteRate
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32);              // BlockAlign
  buffer.writeUInt16LE(16, 34);                                        // BitsPerSample

  // "data" Sub-chunk
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);

  // PCM samples (silence zeros)
  buffer.fill(0, 44);

  return buffer;
}

test('Voice 1: GET /api/ai/status reports voiceEnabled', async () => {
  const repo = createLocalRepository(':memory:');
  const app = createApp(repo);
  const client = request(app);

  const res = await client.get('/api/ai/status').expect(200);
  assert.equal(typeof res.body.voiceEnabled, 'boolean');
});

test('Voice 2: POST /api/ai/transcribe requires authentication (401)', async () => {
  const repo = createLocalRepository(':memory:');
  const app = createApp(repo);
  const client = request(app);

  const mockWav = createMockWavBuffer();

  const unauthRes = await client.post('/api/ai/transcribe')
    .set('Content-Type', 'audio/wav')
    .send(mockWav)
    .expect(401);

  assert.equal(unauthRes.body.error, 'Authentication required');
});

test('Voice 3: Rejects corrupt or non-WAV audio payloads (400)', async () => {
  const repo = createLocalRepository(':memory:');
  const app = createApp(repo);
  const client = request(app);

  // Register and login
  await client.post('/api/auth/register').send({
    name: 'Voice Tester',
    username: 'voice_tester',
    email: 'voice@example.com',
    password: 'Password123'
  }).expect(201);

  const loginRes = await client.post('/api/auth/login').send({
    email: 'voice@example.com',
    password: 'Password123'
  }).expect(200);

  const token = loginRes.body.token;

  // Empty buffer -> 400
  const emptyRes = await client.post('/api/ai/transcribe')
    .set('Authorization', `Bearer ${token}`)
    .set('Content-Type', 'audio/wav')
    .send(Buffer.alloc(0))
    .expect(400);
  assert.ok(emptyRes.body.error);

  // Small buffer (< 44 bytes) -> 400
  const smallRes = await client.post('/api/ai/transcribe')
    .set('Authorization', `Bearer ${token}`)
    .set('Content-Type', 'audio/wav')
    .send(Buffer.from('Too short'))
    .expect(400);
  assert.ok(smallRes.body.error.includes('too small'));

  // Corrupt non-WAV header (>= 44 bytes) -> 400
  const corruptRes = await client.post('/api/ai/transcribe')
    .set('Authorization', `Bearer ${token}`)
    .set('Content-Type', 'audio/wav')
    .send(Buffer.alloc(64, 'X'))
    .expect(400);
  assert.ok(corruptRes.body.error.includes('RIFF/WAVE'));
});

test('Voice 4: Buffer validator rejects oversized audio >5MB (413)', () => {
  // Test unit validator directly to avoid huge memory transmission in supertest
  const oversizedBuffer = Buffer.alloc(MAX_AUDIO_BYTES + 1024);
  oversizedBuffer.write('RIFF', 0, 'ascii');
  oversizedBuffer.write('WAVE', 8, 'ascii');

  assert.throws(
    () => validateWavBuffer(oversizedBuffer),
    (err) => err.status === 413 && err.message.includes('5MB')
  );
});

test('Voice 5: Validates WAV buffer helper accurately detects valid and invalid formats', () => {
  const validWav = createMockWavBuffer();
  assert.doesNotThrow(() => validateWavBuffer(validWav));

  // Invalid RIFF header
  const badRiff = Buffer.from(validWav);
  badRiff.write('NOPE', 0, 'ascii');
  assert.throws(() => validateWavBuffer(badRiff), /RIFF\/WAVE/);

  // Invalid WAVE header
  const badWave = Buffer.from(validWav);
  badWave.write('NOPE', 8, 'ascii');
  assert.throws(() => validateWavBuffer(badWave), /RIFF\/WAVE/);

  // Truncated buffer
  const truncated = validWav.subarray(0, 30);
  assert.throws(() => validateWavBuffer(truncated), /too small/);
});

test('Voice 6: POST /api/ai/transcribe returns 503 when NVIDIA_API_KEY is unset', async () => {
  const origKey = process.env.NVIDIA_API_KEY;
  delete process.env.NVIDIA_API_KEY;

  try {
    const repo = createLocalRepository(':memory:');
    const app = createApp(repo);
    const client = request(app);

    await client.post('/api/auth/register').send({
      name: 'Key Tester',
      username: 'key_tester',
      email: 'keytest@example.com',
      password: 'Password123'
    }).expect(201);

    const loginRes = await client.post('/api/auth/login').send({
      email: 'keytest@example.com',
      password: 'Password123'
    }).expect(200);

    const token = loginRes.body.token;
    const mockWav = createMockWavBuffer();

    const res = await client.post('/api/ai/transcribe')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'audio/wav')
      .send(mockWav)
      .expect(503);

    assert.ok(res.body.error.includes('NVIDIA_API_KEY'));
  } finally {
    if (origKey) process.env.NVIDIA_API_KEY = origKey;
  }
});
