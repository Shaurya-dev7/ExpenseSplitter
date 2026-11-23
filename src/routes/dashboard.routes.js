import { Router } from 'express';
import { computeDashboard } from '../services/dashboard.service.js';

export function dashboardRoutes(repository) {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const data = await computeDashboard(repository, req.user);
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
