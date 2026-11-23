import { HttpError } from '../utils/errors.js';

/**
 * Authentication middleware that extracts Bearer token and verifies session.
 * Rejects with 401 { error: 'Authentication required' } if token is missing, invalid, or expired.
 *
 * @param {Object} authRepo
 * @param {{ alwaysRequire?: boolean }} [options]
 */
export function requireAuth(authRepo, { alwaysRequire = false } = {}) {
  return async (req, res, next) => {
    const AUTH_REQUIRED = process.env.AUTH_REQUIRED !== 'false';

    // If global auth is not strictly required and this route does not strictly enforce it:
    if (!AUTH_REQUIRED && !alwaysRequire) {
      // Decode user if Bearer token is provided, but don't reject if missing
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7).trim();
        if (token && authRepo) {
          try {
            const result = await authRepo.validateSession(token);
            if (result && result.user) {
              req.user = result.user;
              req.token = token;
              req.tokenHash = result.tokenHash;
            }
          } catch {
            // ignore for optional route
          }
        }
      }
      return next();
    }

    // Strict authentication required
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const token = authHeader.slice(7).trim();
      if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!authRepo) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const result = await authRepo.validateSession(token);
      if (!result || !result.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      req.user = result.user;
      req.token = token;
      req.tokenHash = result.tokenHash;
      next();
    } catch (err) {
      return res.status(401).json({ error: 'Authentication required' });
    }
  };
}
