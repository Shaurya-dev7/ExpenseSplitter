export function parseRupees(text) {
  const value = String(text).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error('Enter a rupee amount with at most 2 decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const paise = Number(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')));
  if (!Number.isSafeInteger(paise)) throw new Error('Amount is too large.');
  return paise;
}
export function formatMoney(paise) {
  const n = Math.abs(paise);
  return `${paise < 0 ? '−' : ''}₹${Math.floor(n / 100).toLocaleString('en-IN')}.${String(n % 100).padStart(2, '0')}`;
}
