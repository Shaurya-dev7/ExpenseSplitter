export function validateGroup(input) {
  /** @type {Record<string, string>} */
  const errors = {};
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 60) errors.name = 'Use 1–60 characters for the group name.';
  const members = Array.isArray(input?.members) ? input.members.map(value => typeof value === 'string' ? value.trim() : '') : [];
  if (!Array.isArray(input?.members) || members.length < 2 || members.length > 20) errors.members = 'Create a group with 2–20 members.';
  const seen = new Map();
  members.forEach((name, index) => {
    if (!name || name.length > 40) errors[`members.${index}`] = 'Use 1–40 characters for this member.';
    if (name) {
      const key = name.toLowerCase();
      if (seen.has(key)) errors[`members.${index}`] = 'Each friend needs a different name (ignoring case).';
      else seen.set(key, index);
    }
  });
  return { name, members, errors };
}
