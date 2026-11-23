import { invalid, integer } from '../utils/errors.js';
export function calculateSplit(amount, split, members) {
  integer(amount, 'amount', 1, 1000000000);
  if (!split || typeof split !== 'object' || Array.isArray(split)) invalid('split', 'Choose equal, shares, or exact.');
  const ids = new Set(members.map(m => typeof m === 'number' ? m : m.id));
  let entries;
  if (split.type === 'equal') {
    const participants = split.participants === undefined ? [...ids] : split.participants;
    if (!Array.isArray(participants) || !participants.length || new Set(participants).size !== participants.length || participants.some(id => !Number.isInteger(id) || !ids.has(id))) invalid('split.participants', 'Select at least one unique group member.');
    entries = participants.map(id => [id, 1]);
  } else if (split.type === 'shares' || split.type === 'exact') {
    const field = split.type === 'shares' ? 'shares' : 'amounts';
    const values = split[field];
    if (!values || typeof values !== 'object' || Array.isArray(values) || !Object.keys(values).length) invalid(`split.${field}`, 'Select at least one member.');
    entries = Object.entries(values).map(([key, weight]) => {
      const id = Number(key);
      if (String(id) !== key || !ids.has(id)) invalid(`split.${field}`, 'Every member must belong to the group.');
      integer(weight, `split.${field}`, field === 'shares' ? 1 : 0, field === 'shares' ? 1000 : 1000000000);
      return [id, weight];
    });
    if (split.type === 'exact') {
      if (entries.reduce((sum, [, value]) => sum + value, 0) !== amount) invalid('split.amounts', 'Exact amounts must add up to the expense total.');
      return Object.fromEntries(entries.sort((a, b) => a[0] - b[0]));
    }
  } else invalid('split.type', 'Choose equal, shares, or exact.');
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  const shares = entries.map(([id, weight]) => ({ id, base: Math.floor(amount * weight / total), remainder: amount * weight % total }));
  let left = amount - shares.reduce((sum, item) => sum + item.base, 0);
  shares.sort((a, b) => b.remainder - a.remainder || a.id - b.id);
  for (const share of shares) { if (left > 0) { share.base++; left--; } }
  return Object.fromEntries(shares.sort((a, b) => a.id - b.id).map(s => [s.id, s.base]));
}
