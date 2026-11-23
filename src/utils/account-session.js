import { randomBytes, createHash, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';
import { HttpError } from './errors.js';
export const sessionHash = token => createHash('sha256').update(token).digest('hex');
export function sealAccountSession(nativeToken, userId, expiresAt) {
  const secret = randomBytes(32), token = secret.toString('base64url'), iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secret, iv);
  const ciphertext = Buffer.concat([cipher.update(nativeToken, 'utf8'), cipher.final()]);
  return { token, row: { token_hash: sessionHash(token), user_id: userId, encrypted_token: Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url'), expires_at: new Date(Math.min(Date.parse(expiresAt), Date.now() + 86400000)).toISOString(), created_at: new Date().toISOString() } };
}
export function openAccountSession(token, row) {
  const invalid = () => new HttpError(401, 'Invalid or expired session');
  try {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token) || !row || !Number.isFinite(Date.parse(row.expires_at)) || Date.parse(row.expires_at) <= Date.now()) throw invalid();
    const actual = Buffer.from(sessionHash(token), 'hex'), expected = Buffer.from(row.token_hash || '', 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(actual, expected)) throw invalid();
    const key = Buffer.from(token, 'base64url'), sealed = Buffer.from(row.encrypted_token, 'base64url');
    if (key.length !== 32 || key.toString('base64url') !== token || sealed.length <= 28) throw invalid();
    const decipher = createDecipheriv('aes-256-gcm', key, sealed.subarray(0, 12));
    decipher.setAuthTag(sealed.subarray(12, 28));
    return Buffer.concat([decipher.update(sealed.subarray(28)), decipher.final()]).toString('utf8');
  } catch { throw invalid(); }
}
