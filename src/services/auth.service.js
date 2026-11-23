import crypto from 'node:crypto';
import { HttpError } from '../utils/errors.js';

/**
 * Hash a password using scrypt with a cryptographic salt.
 * Stored format: `${salt}:${hash}`
 * @param {string} password
 * @returns {string}
 */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Constant-time verification of password against stored scrypt hash.
 * @param {string} password - Candidate password
 * @param {string} storedHash - Stored `${salt}:${hash}`
 * @returns {boolean}
 */
export function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== 'string' || !storedHash.includes(':')) {
    // Constant-time dummy work to resist timing side-channels
    crypto.scryptSync(password || '', '00'.repeat(16), 64);
    return false;
  }
  const [salt, expectedHex] = storedHash.split(':');
  const computedHex = crypto.scryptSync(password, salt, 64).toString('hex');
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  const computedBuf = Buffer.from(computedHex, 'hex');
  if (expectedBuf.length !== computedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, computedBuf);
}

/**
 * Validate registration input fields.
 * Returns normalized object or throws 400 { errors: { ... } } naming every bad field.
 * Both `name` and `username` are compulsory.
 * @param {Object} input
 * @returns {{ email: string, password: string, name: string, username: string }}
 */
export function validateRegisterInput(input = {}) {
  const errors = {};
  const { email, password, name, username } = input;

  // 1. Name validation: compulsory, trimmed, 1–80 chars
  let cleanName = '';
  if (typeof name !== 'string' || !name.trim()) {
    errors.name = 'Name is required';
  } else {
    cleanName = name.trim();
    if (cleanName.length > 80) {
      errors.name = 'Name must be at most 80 characters';
    }
  }

  // 2. Username validation: compulsory, trimmed, 3–30 chars, alphanumeric + underscore
  let cleanUsername = '';
  if (typeof username !== 'string' || !username.trim()) {
    errors.username = 'Username is required';
  } else {
    cleanUsername = username.trim().toLowerCase().replace(/^@/, '');
    if (cleanUsername.length < 3 || cleanUsername.length > 30) {
      errors.username = 'Username must be between 3 and 30 characters';
    } else if (!/^[a-z0-9_]+$/.test(cleanUsername)) {
      errors.username = 'Username can only contain letters, numbers, and underscores';
    }
  }

  // 3. Email validation: required, trimmed, valid x@y.z format, max 120 chars, stored lowercase
  if (typeof email !== 'string' || !email.trim()) {
    errors.email = 'Email is required';
  } else {
    const trimmedEmail = email.trim();
    if (trimmedEmail.length > 120) {
      errors.email = 'Email must be at most 120 characters';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errors.email = 'Invalid email format';
    }
  }

  // 4. Password validation: required, 8–128 chars, must contain at least one letter and one number
  if (typeof password !== 'string' || !password) {
    errors.password = 'Password is required';
  } else {
    if (password.length < 8 || password.length > 128) {
      errors.password = 'Password must be between 8 and 128 characters';
    } else if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      errors.password = 'Password must contain at least one letter and one number';
    }
  }

  if (Object.keys(errors).length > 0) {
    throw new HttpError(400, 'Validation failed', errors);
  }

  return {
    name: cleanName,
    username: cleanUsername,
    email: email.trim().toLowerCase(),
    password
  };
}

/**
 * Validate login input fields.
 * Accepts either `email` or `identifier`.
 * @param {Object} input
 * @returns {{ identifier: string, password: string }}
 */
export function validateLoginInput(input = {}) {
  const rawId = input.email || input.identifier;
  const password = input.password;

  if (!rawId || typeof rawId !== 'string' || !rawId.trim() || !password || typeof password !== 'string') {
    throw new HttpError(400, 'Email and password are required');
  }

  return {
    identifier: rawId.trim(),
    password
  };
}

/**
 * Generate a new bearer session token.
 * Raw token is 32 random bytes in base64url format.
 * Stored in SQLite as SHA-256 hash with 24-hour expiration.
 * @param {number} userId
 * @returns {{ rawToken: string, tokenHash: string, expiresAt: string, createdAt: string, expiresIn: number }}
 */
export function generateSessionToken(userId) {
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 86400 * 1000).toISOString();
  const createdAt = now.toISOString();

  return {
    rawToken,
    tokenHash,
    userId,
    expiresAt,
    createdAt,
    expiresIn: 86400
  };
}

/**
 * Compute SHA-256 hash of a raw token.
 * @param {string} rawToken
 * @returns {string}
 */
export function hashToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken)).digest('hex');
}
