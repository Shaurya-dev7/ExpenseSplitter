import { HttpError } from '../utils/errors.js';
export function validateRegistration(body) {
  /** @type {Record<string, string>} */
  const errors = {};
  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!/^[A-Za-z0-9_]{3,30}$/.test(username)) errors.username = 'Use 3–30 letters, numbers, or underscores.';
  if (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address, at most 120 characters.';
  if (password.length < 8 || password.length > 128 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) errors.password = 'Use 8–128 characters, including a letter and a number.';
  return { username, email, password, errors };
}
export function createAccountService(repository) {
  return {
    async register(body) { const { errors, ...fields } = validateRegistration(body); if (Object.keys(errors).length) throw new HttpError(400, 'Invalid fields', errors); return repository.register(fields); },
    async login(body) {
      const errors = {};
      if (typeof body?.identifier !== 'string' || !body.identifier.trim()) errors.identifier = 'Enter your username or email.';
      if (typeof body?.password !== 'string' || !body.password) errors.password = 'Enter your password.';
      if (Object.keys(errors).length) throw new HttpError(400, 'Invalid fields', errors);
      if (body.identifier.length > 120 || body.password.length > 128) throw new HttpError(401, 'Invalid credentials');
      return repository.login(body.identifier.trim(), body.password);
    },
    async authorize(header) {
      const match = typeof header === 'string' && /^Bearer ([^\s]+)$/i.exec(header);
      if (!match) throw new HttpError(401, 'Authentication required');
      return repository.authorize(match[1]);
    },
    async google(body) {
      if (typeof body?.accessToken !== 'string' || body.accessToken.length > 10000 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(body.accessToken)) throw new HttpError(400, 'Invalid fields', { accessToken: 'A valid provider token is required.' });
      return repository.exchange(body.accessToken);
    },
    me(context) { return context.user; },
    logout(context) { return repository.logout(context); },
    listFriends(context) { return repository.listFriends(context); },
    async addFriend(context, body) {
      const username = typeof body?.username === 'string' ? body.username.trim().replace(/^@/, '') : '';
      if (!/^[A-Za-z0-9_]{3,30}$/.test(username)) throw new HttpError(400, 'Invalid fields', { username: 'Enter an exact username, with or without @.' });
      return repository.addFriend(context, username);
    },
    async removeFriend(context, id) {
      if (!/^\d+$/.test(String(id)) || !Number.isSafeInteger(Number(id)) || Number(id) < 1) throw new HttpError(404, 'Friend not found');
      return repository.removeFriend(context, Number(id));
    }
  };
}
