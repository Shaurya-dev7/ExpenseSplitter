// Security middleware: defensive HTTP headers and sliding-window rate limiting

const failedAttempts = new Map(); // ip -> Array<timestamp>
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILED = 10;

/**
 * Defensive HTTP security headers
 */
export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self';"
  );
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  next();
}

/**
 * In-memory sliding-window rate limiter for sensitive authentication endpoints.
 * Limits failed attempts to max 10 per IP per 15-minute window.
 */
export function authRateLimiter(req, res, next) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown-ip';
  const now = Date.now();

  const attempts = (failedAttempts.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  failedAttempts.set(ip, attempts);

  if (attempts.length >= MAX_FAILED) {
    return res.status(429).json({ error: 'Too many attempts. Please wait and try again.' });
  }

  // Intercept response to track failures
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode === 400 || res.statusCode === 401 || res.statusCode === 409) {
      const current = failedAttempts.get(ip) || [];
      current.push(Date.now());
      failedAttempts.set(ip, current);
    } else if (res.statusCode === 200 || res.statusCode === 201) {
      // Clear failure history on successful login/registration
      failedAttempts.delete(ip);
    }
    return originalJson(body);
  };

  next();
}

/**
 * Reset rate limiter (used in test setup)
 */
export function resetRateLimiter() {
  failedAttempts.clear();
}
