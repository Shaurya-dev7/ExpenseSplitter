import crypto from 'node:crypto';

/**
 * Generate a unique, DB-verified username from an email address.
 * Follows Problem C4 specification:
 * - Substring of email before @, lowercased, stripped of non-[a-z0-9] characters.
 * - Clamped to max 16 chars. If fewer than 3 chars remain, base = (base + 'user').slice(0, 6).
 * - Loop up to 20 attempts:
 *   - Attempts 1–10: randomInt(100, 10000)
 *   - Attempts 11–20: randomInt(10000, 1000000)
 *   - Query DB via existsInDb(candidate). If no match exists, return candidate.
 * - Fallback to timestamp suffix if all 20 attempts collide.
 *
 * @param {string} email - User's email address
 * @param {(candidate: string) => Promise<boolean> | boolean} existsInDb - Lookup function returning true if username exists
 * @returns {Promise<string>} Unique username
 */
export async function generateUniqueUsername(email, existsInDb) {
  let base = (email || '').split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  base = base.slice(0, 16);
  if (base.length < 3) {
    base = (base + 'user').slice(0, 6);
  }

  for (let attempt = 1; attempt <= 20; attempt++) {
    const suffix = attempt <= 10
      ? crypto.randomInt(100, 10000)
      : crypto.randomInt(10000, 1000000);
    const candidate = `${base}${suffix}`;
    const exists = await existsInDb(candidate);
    if (!exists) {
      return candidate;
    }
  }

  // Fallback if 20 random collisions occurred
  const fallback = `${base}${Date.now().toString().slice(-6)}`;
  return fallback;
}
