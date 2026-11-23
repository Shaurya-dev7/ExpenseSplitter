import { Router } from 'express';
import { createController } from '../controllers/group.controller.js';
export function groupRoutes(repository) {
  const router = Router();
  const dispatch = createController(repository);
  router.use(async (req, res, next) => {
    try {
      if (req.method === 'OPTIONS') return res.status(204).end();
      const path = req.path.split('/').filter(Boolean).map(decodeURIComponent);
      const [status, data] = await dispatch(req.method, path, req.body || {}, req.user);
      if (status === 204) return res.status(204).end();
      res.status(status).json(data);
    } catch (err) { next(err); }
  });
  return router;
}
