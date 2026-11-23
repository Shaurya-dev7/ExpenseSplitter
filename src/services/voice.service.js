/**
 * FairShare Voice Service — NVIDIA Riva Parakeet 1.1B Multilingual ASR Pipeline
 *
 * Enforces strict security bounds:
 * - Temporary WAV audio written only to os.tmpdir() with cryptographic random UUID.
 * - Invokes Python worker via child_process.execFile (NEVER exec).
 * - Passes API keys strictly via child-process env (never in command-line arguments).
 * - Temp file is always removed in a finally block.
 * - Strict 25s timeout and 5MB payload ceiling.
 */

import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { HttpError } from '../utils/errors.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRANSCRIBE_SCRIPT = path.resolve(__dirname, '../../tools/transcribe.py');

export const MAX_AUDIO_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_RECORDING_SECONDS = 25;
export const TRANSCRIBE_TIMEOUT_MS = 25000; // 25 seconds

/**
 * Check if Voice ASR transcription is enabled and configured.
 * @returns {boolean}
 */
export function isVoiceEnabled() {
  const apiKey = (process.env.NVIDIA_API_KEY || '').trim();
  return Boolean(apiKey && !apiKey.startsWith('__'));
}

/**
 * Validate that an audio buffer is a valid RIFF/WAVE file within byte limits.
 * Checks the first 12 bytes:
 * - Bytes 0..3: "RIFF" (0x52, 0x49, 0x46, 0x46)
 * - Bytes 8..11: "WAVE" (0x57, 0x41, 0x56, 0x45)
 *
 * @param {Buffer|Uint8Array} buffer
 * @throws {HttpError}
 */
export function validateWavBuffer(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new HttpError(400, 'Audio payload must be a non-empty binary Buffer.');
  }

  if (buffer.length === 0) {
    throw new HttpError(400, 'Audio payload is empty.');
  }

  if (buffer.length > MAX_AUDIO_BYTES) {
    throw new HttpError(413, `Audio payload exceeds maximum limit of 5MB (${(buffer.length / (1024 * 1024)).toFixed(2)}MB received).`);
  }

  if (buffer.length < 44) {
    throw new HttpError(400, 'Audio payload is too small to be a valid WAV file.');
  }

  const isRiff = buffer.subarray(0, 4).toString('ascii') === 'RIFF';
  const isWave = buffer.subarray(8, 12).toString('ascii') === 'WAVE';

  if (!isRiff || !isWave) {
    throw new HttpError(400, 'Invalid audio format: payload must be a valid RIFF/WAVE audio file.');
  }
}

/**
 * Transcribe raw WAV audio buffer via NVIDIA Riva ASR.
 *
 * @param {Buffer} wavBuffer
 * @param {Object} [options]
 * @param {string} [options.language]
 * @returns {Promise<{ transcript: string }>}
 */
export async function transcribeAudio(wavBuffer, options = {}) {
  if (!isVoiceEnabled()) {
    throw new HttpError(503, 'Voice transcription service is not configured. Set NVIDIA_API_KEY to enable.');
  }

  validateWavBuffer(wavBuffer);

  const pythonBin = process.env.PYTHON_BIN || 'python';
  const tempWavPath = path.join(os.tmpdir(), `fairshare_voice_${crypto.randomUUID()}.wav`);

  // Write temporary audio file to disk
  await fs.promises.writeFile(tempWavPath, wavBuffer);

  try {
    const env = {
      ...process.env,
      NVIDIA_API_KEY: process.env.NVIDIA_API_KEY,
      NVIDIA_RIVA_SERVER: process.env.NVIDIA_RIVA_SERVER || 'grpc.nvcf.nvidia.com:443',
      NVIDIA_RIVA_FUNCTION_ID: process.env.NVIDIA_RIVA_FUNCTION_ID || '71203149-d3b7-4460-8231-1be2543a1fca',
      NVIDIA_RIVA_LANGUAGE: options.language || process.env.NVIDIA_RIVA_LANGUAGE || 'multi',
      NVIDIA_RIVA_MODEL: process.env.NVIDIA_RIVA_MODEL || ''
    };

    // Execute python worker strictly via execFile (no shell interpolation)
    const { stdout, stderr } = await execFileAsync(
      pythonBin,
      [TRANSCRIBE_SCRIPT, tempWavPath],
      {
        env,
        timeout: TRANSCRIBE_TIMEOUT_MS,
        maxBuffer: 1024 * 1024
      }
    );

    let parsed;
    try {
      parsed = JSON.parse(stdout.trim());
    } catch {
      throw new HttpError(502, `Failed to parse transcription worker response: ${stderr || stdout}`);
    }

    if (parsed.error) {
      throw new HttpError(502, `Voice transcription failed: ${parsed.error}`);
    }

    return {
      transcript: typeof parsed.transcript === 'string' ? parsed.transcript : ''
    };
  } catch (err) {
    if (err instanceof HttpError) throw err;

    if (err.killed || err.signal === 'SIGTERM') {
      throw new HttpError(504, 'Voice transcription timed out after 25 seconds.');
    }

    const msg = (err.stderr || err.message || '').toString();
    throw new HttpError(502, `Transcription worker error: ${msg}`);
  } finally {
    // ALWAYS remove temporary audio file
    try {
      if (fs.existsSync(tempWavPath)) {
        await fs.promises.unlink(tempWavPath);
      }
    } catch (cleanupErr) {
      console.warn('[VoiceService] Failed to clean up temp WAV file:', cleanupErr.message);
    }
  }
}
