// Hare-Niemeyer / Largest Remainder Method for deterministic integer-paise split
export function calculateSplit(amount, split, members) {
  if (!amount || amount < 1 || amount > 1000000000) {
    throw new Error('Amount must be between 1 and 1,000,000,000 paise.');
  }
  const ids = new Set(members.map(m => (typeof m === 'number' ? m : m.id)));
  let entries;

  if (split.type === 'equal') {
    const participants = split.participants === undefined ? [...ids] : split.participants;
    if (!Array.isArray(participants) || !participants.length || new Set(participants).size !== participants.length) {
      throw new Error('Select at least one unique group member.');
    }
    entries = participants.map(id => [id, 1]);
  } else if (split.type === 'shares') {
    const values = split.shares;
    if (!values || typeof values !== 'object' || !Object.keys(values).length) {
      throw new Error('Select at least one member with positive shares.');
    }
    entries = Object.entries(values).map(([k, weight]) => {
      const id = Number(k);
      const w = Number(weight);
      if (!ids.has(id)) throw new Error('Member not found in group.');
      if (!Number.isInteger(w) || w < 1 || w > 1000) throw new Error('Shares must be between 1 and 1000.');
      return [id, w];
    });
  } else if (split.type === 'exact') {
    const values = split.amounts;
    if (!values || typeof values !== 'object' || !Object.keys(values).length) {
      throw new Error('Enter exact amounts.');
    }
    entries = Object.entries(values).map(([k, amt]) => {
      const id = Number(k);
      const a = Number(amt);
      if (!ids.has(id)) throw new Error('Member not found in group.');
      if (!Number.isInteger(a) || a < 0) throw new Error('Exact amount cannot be negative.');
      return [id, a];
    });
    const sum = entries.reduce((s, [, a]) => s + a, 0);
    if (sum !== amount) {
      throw new Error(`Exact amounts sum to ${sum} paise, expected ${amount} paise.`);
    }
    return Object.fromEntries(entries.sort((a, b) => a[0] - b[0]));
  } else {
    throw new Error('Unknown split type.');
  }

  const totalWeight = entries.reduce((s, [, w]) => s + w, 0);
  const shares = entries.map(([id, weight]) => ({
    id,
    base: Math.floor((amount * weight) / totalWeight),
    remainder: (amount * weight) % totalWeight
  }));

  let unallocated = amount - shares.reduce((s, item) => s + item.base, 0);
  shares.sort((a, b) => b.remainder - a.remainder || a.id - b.id);
  for (const s of shares) {
    if (unallocated > 0) {
      s.base++;
      unallocated--;
    }
  }

  return Object.fromEntries(shares.sort((a, b) => a.id - b.id).map(s => [s.id, s.base]));
}
