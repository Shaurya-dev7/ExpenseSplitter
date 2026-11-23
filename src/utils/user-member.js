/**
 * Helper to resolve which member in a group corresponds to the authenticated user.
 * 1. First matches member.userId === user.id
 * 2. Fallback: case-insensitive exact match against user.username or user.name
 *
 * @param {Object} group
 * @param {Object} user
 * @returns {Object|null} The matching member object or null
 */
export function findUserMember(group, user) {
  if (!group || !Array.isArray(group.members) || !user) return null;

  // 1. First match member.userId === user.id
  if (user.id != null) {
    const byId = group.members.find((m) => m.userId === user.id);
    if (byId) return byId;
  }

  // 2. Fallback: case-insensitive exact match against user.username or user.name or 'you'
  const username = user.username?.trim().toLowerCase();
  const name = user.name?.trim().toLowerCase();

  return (
    group.members.find((m) => {
      const mName = m.name?.trim().toLowerCase();
      return (username && mName === username) || (name && mName === name) || mName === 'you';
    }) || null
  );
}
