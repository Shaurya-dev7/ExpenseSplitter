import { HttpError } from '../utils/errors.js';
import {
  validateRegisterInput,
  validateLoginInput,
  verifyPassword
} from '../services/auth.service.js';

export function createAuthController(authRepo) {
  return {
    async checkUsername(req, res, next) {
      try {
        const raw = req.query.username;
        if (typeof raw !== 'string' || !raw.trim()) {
          return res.status(200).json({ available: false, error: 'Username is required' });
        }
        const clean = raw.trim().toLowerCase().replace(/^@/, '');
        if (clean.length < 3 || clean.length > 30) {
          return res.status(200).json({ available: false, error: 'Must be 3–30 characters' });
        }
        if (!/^[a-z0-9_]+$/.test(clean)) {
          return res.status(200).json({ available: false, error: 'Only letters, numbers, and underscores allowed' });
        }
        const exists = authRepo.existsUsername(clean);
        if (exists) {
          return res.status(200).json({ available: false, username: clean, error: 'Username is already taken' });
        }
        return res.status(200).json({ available: true, username: clean });
      } catch (err) {
        next(err);
      }
    },

    async register(req, res, next) {
      try {
        const validated = validateRegisterInput(req.body);
        const user = await authRepo.createUser(validated);
        // 201 Created: { id, email, username, name } - never password or password_hash
        return res.status(201).json({
          id: user.id,
          email: user.email,
          username: user.username,
          name: user.name
        });
      } catch (err) {
        next(err);
      }
    },

    async login(req, res, next) {
      try {
        const { identifier, password } = validateLoginInput(req.body);
        const user = authRepo.findUserByIdentifier(identifier);

        // Constant-time anti-enumeration: same error and time for missing user or wrong password
        if (!user) {
          verifyPassword(password, null);
          return res.status(401).json({ error: 'Invalid email/username or password' });
        }

        const valid = verifyPassword(password, user.password_hash);
        if (!valid) {
          return res.status(401).json({ error: 'Invalid email/username or password' });
        }

        const session = await authRepo.createSession(user.id);
        return res.status(200).json({
          token: session.token,
          expiresIn: session.expiresIn,
          user: {
            id: user.id,
            email: user.email,
            username: user.username,
            name: user.name
          }
        });
      } catch (err) {
        next(err);
      }
    },

    async logout(req, res, next) {
      try {
        await authRepo.deleteSession(req.token);
        return res.status(204).end();
      } catch (err) {
        next(err);
      }
    },

    async me(req, res, next) {
      try {
        return res.status(200).json({
          id: req.user.id,
          email: req.user.email,
          username: req.user.username,
          name: req.user.name
        });
      } catch (err) {
        next(err);
      }
    }
  };
}
