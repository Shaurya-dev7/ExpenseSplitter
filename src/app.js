import express from 'express';
import { groupRoutes } from './routes/group.routes.js';
import { aiRoutes } from './routes/ai.routes.js';
import { authRoutes } from './routes/auth.routes.js';
import { dashboardRoutes } from './routes/dashboard.routes.js';
import { errorMiddleware } from './middleware/error.middleware.js';
import { securityHeaders } from './middleware/security.middleware.js';
import { requireAuth } from './middleware/auth.middleware.js';

export function createApp(repository, authService) {
  const app = express();
  app.disable('x-powered-by');

  // Defensive HTTP headers & CORS
  app.use(securityHeaders);

  // Parse JSON with 100kb limit
  app.use(express.json({ limit: '100kb' }));

  // Clean JSON parse error handling
  app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }
    next(err);
  });

  const auth = authService || repository?.auth;

  if (auth) {
    app.use('/api/auth', authRoutes(auth));
  }

  // Dashboard route is strictly authenticated
  app.use('/api/dashboard', requireAuth(auth, { alwaysRequire: true }), dashboardRoutes(repository));

  // Groups endpoints gated when AUTH_REQUIRED is true (default)
  app.use('/api/groups', requireAuth(auth, { alwaysRequire: false }), groupRoutes(repository));

  // AI Assistant routes
  app.use('/api/ai', aiRoutes(repository, auth));

  app.use(errorMiddleware);
  return app;
}
