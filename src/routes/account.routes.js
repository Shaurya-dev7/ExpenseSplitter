import { Router } from 'express';
export function authRoutes(accounts) {
  const router = Router();
  router.post('/register', async (req, res, next) => { try { res.status(201).json(await accounts.register(req.body || {})); } catch (error) { next(error); } });
  router.post('/login', async (req, res, next) => { try { res.json(await accounts.login(req.body || {})); } catch (error) { next(error); } });
  router.post('/google', async (req, res, next) => { try { res.json(await accounts.google(req.body || {})); } catch (error) { next(error); } });
  router.get('/me', async (req, res, next) => { try { const context = await accounts.authorize(req.headers.authorization); res.json(accounts.me(context)); } catch (error) { next(error); } });
  router.post('/logout', async (req, res, next) => { try { const context = await accounts.authorize(req.headers.authorization); await accounts.logout(context); res.status(204).end(); } catch (error) { next(error); } });
  router.options('/{*path}', (req, res) => res.status(204).end());
  return router;
}
export function friendRoutes(accounts) {
  const router = Router();
  router.use(async (req, res, next) => { try { if (req.method === 'OPTIONS') return res.status(204).end(); req.account = await accounts.authorize(req.headers.authorization); next(); } catch (error) { next(error); } });
  router.get('/', async (req, res, next) => { try { res.json(await accounts.listFriends(req.account)); } catch (error) { next(error); } });
  router.post('/', async (req, res, next) => { try { res.status(201).json(await accounts.addFriend(req.account, req.body || {})); } catch (error) { next(error); } });
  router.delete('/:friendId', async (req, res, next) => { try { await accounts.removeFriend(req.account, req.params.friendId); res.status(204).end(); } catch (error) { next(error); } });
  return router;
}
