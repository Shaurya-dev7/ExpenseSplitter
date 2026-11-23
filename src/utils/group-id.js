import { randomBytes } from 'node:crypto';
export function generateGroupId() { return randomBytes(12).toString('base64url'); }
