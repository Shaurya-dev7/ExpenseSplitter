import { Router } from 'express';
import { createAuthController } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { authRateLimiter } from '../middleware/security.middleware.js';

/**
 * Express router for authentication endpoints:
 * - GET  /api/auth/check-username
 * - POST /api/auth/register
 * - POST /api/auth/login
 * - POST /api/auth/logout
 * - GET  /api/auth/me
 * @param {Object} authRepo
 */
export function authRoutes(authRepo) {
  const router = Router();
  const controller = createAuthController(authRepo);

  router.get('/check-username', controller.checkUsername);
  router.post('/register', authRateLimiter, controller.register);
  router.post('/login', authRateLimiter, controller.login);
  router.post('/logout', requireAuth(authRepo, { alwaysRequire: true }), controller.logout);
  router.get('/me', requireAuth(authRepo, { alwaysRequire: true }), controller.me);

  return router;
}
