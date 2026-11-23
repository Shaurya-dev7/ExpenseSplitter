export function errorMiddleware(err, req, res, next) {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON.' });
  if (err.type === 'entity.too.large') return res.status(400).json({ error: 'Request body is too large.' });
  const status = err.status && err.status < 500 ? err.status : 500;
  if (status === 500) console.error('Request failed:', err.message);
  return res.status(status).json(err.errors ? { errors: err.errors } : { error: status === 500 ? 'Something went wrong. Please try again.' : err.message });
}
