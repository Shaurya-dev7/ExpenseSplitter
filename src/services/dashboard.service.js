import { calculateBalances } from './balance.service.js';
import { findUserMember } from '../utils/user-member.js';

/**
 * Authoritatively compute the user's dashboard metrics and groups in integer paise.
 *
 * @param {Object} repository
 * @param {Object} user - Authenticated user { id, name, username, email }
 * @returns {Promise<Object>} The dashboard payload
 */
export async function computeDashboard(repository, user) {
  if (!user) {
    throw new Error('User is required to compute dashboard');
  }

  // Fetch only groups the user created or belongs to
  const allGroups = repository.listForUser
    ? await repository.listForUser(user)
    : (await repository.listAll()).filter((g) => {
        if (g.createdByUserId === user.id) return true;
        return findUserMember(g, user) !== null;
      });

  let totalYouPaid = 0;
  let totalYourShare = 0;
  let netBalance = 0;
  let totalToReceive = 0;
  let totalToPay = 0;
  let unsettledGroups = 0;

  const groupCards = allGroups.map((g) => {
    const myMember = findUserMember(g, user);
    const expenseCount = g.expenses?.length || 0;
    const totalGroupSpend = (g.expenses || []).reduce((sum, e) => sum + e.amount, 0);

    let mySpent = 0;
    let myShare = 0;

    if (myMember) {
      for (const e of g.expenses || []) {
        if (e.paidBy === myMember.id || e.paid_by === myMember.name) {
          mySpent += e.amount;
        }
        if (e.splits && e.splits[myMember.id]) {
          myShare += e.splits[myMember.id];
        }
      }
    }

    let myBalance = 0;
    try {
      const balances = calculateBalances(g.members || [], g.expenses || [], g.payments || []);
      if (myMember) {
        const b = balances.find((x) => x.memberId === myMember.id);
        if (b) myBalance = b.balance;
      }
    } catch {
      myBalance = 0;
    }

    let myStatus = 'settled';
    if (myBalance > 0) {
      myStatus = 'owed';
      totalToReceive += myBalance;
      unsettledGroups++;
    } else if (myBalance < 0) {
      myStatus = 'owes';
      totalToPay += Math.abs(myBalance);
      unsettledGroups++;
    }

    totalYouPaid += mySpent;
    totalYourShare += myShare;
    netBalance += myBalance;

    return {
      id: g.id,
      name: g.name,
      isActive: g.isActive !== false,
      memberCount: (g.members || []).length,
      members: (g.members || []).map((m) => ({ id: m.id, name: m.name })),
      expenseCount,
      totalGroupSpend,
      mySpent,
      myBalance,
      myStatus,
      createdAt: g.createdAt || g.created_at || new Date().toISOString()
    };
  });

  const activeGroups = groupCards.filter((g) => g.isActive).length;
  const inactiveGroups = groupCards.length - activeGroups;

  return {
    user: {
      id: user.id,
      name: user.name || '',
      username: user.username,
      email: user.email
    },
    summary: {
      totalGroups: groupCards.length,
      activeGroups,
      inactiveGroups,
      unsettledGroups,
      totalYouPaid,
      totalYourShare,
      netBalance,
      totalToReceive,
      totalToPay
    },
    groups: groupCards
  };
}
