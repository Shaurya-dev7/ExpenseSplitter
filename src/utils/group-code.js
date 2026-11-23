export function extractGroupCode(input) {
  const value = typeof input === 'string' ? input.trim() : '';
  let code = value;
  if (!/^[A-Za-z0-9_-]{10,128}$/.test(value)) {
    try {
      const url = new URL(value, 'https://fairshare.invalid');
      if (!/^https?:$/.test(url.protocol) || url.pathname !== '/') throw new Error();
      if (url.searchParams.has('group') && url.searchParams.getAll('group').length === 1) {
        code = url.searchParams.get('group');
      } else if (url.searchParams.has('code') && url.searchParams.getAll('code').length === 1) {
        code = url.searchParams.get('code');
      } else {
        throw new Error();
      }
    } catch { throw new Error('Enter a valid group code or a full /?group=… invite link.'); }
  }
  if (!code || !/^[A-Za-z0-9_-]{10,128}$/.test(code)) throw new Error('Enter a valid group code or a full /?group=… invite link.');
  return code;
}
