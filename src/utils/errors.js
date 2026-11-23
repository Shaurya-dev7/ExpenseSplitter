export class HttpError extends Error {
  constructor(status, message, errors) { super(message); this.status = status; this.errors = errors; }
}
export function invalid(field, message) { throw new HttpError(400, 'Invalid fields', { [field]: message }); }
export function text(value, field, max) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) invalid(field, `Use 1–${max} characters.`);
  return value.trim();
}
export function integer(value, field, min = 1, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) invalid(field, `Must be a whole number from ${min} to ${max}.`);
  return value;
}
