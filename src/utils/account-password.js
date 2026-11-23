import { scryptSync } from 'node:crypto';
// The managed Auth user UUID is generated randomly per account and serves as its
// public, stable per-user salt. The provider additionally salts/hashes this value.
// Neither the input password nor this derived credential is stored by the app.
export function deriveAccountPassword(password, authId) {
  return scryptSync(password, `fairshare-account-v1:${authId}`, 32, { N: 16384, r: 8, p: 1 }).toString('hex');
}
