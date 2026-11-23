import { generateGroupId } from '../utils/group-id.js';
import { validateGroup } from '../utils/group-validation.js';
import { HttpError, text, integer, invalid } from '../utils/errors.js';
import { calculateSplit } from '../services/split.service.js';
import { calculateBalances } from '../services/balance.service.js';
import { calculateSettlements } from '../services/settlement.service.js';
import { isUserAuthorizedForGroup } from '../database/repository.js';

const publicGroup = g => ({
  id: g.id,
  name: g.name,
  members: [...g.members].sort((a, b) => a.id - b.id),
  ...(process.env.AUTH_REQUIRED !== 'false' ? { isActive: g.isActive !== false } : {})
});

function uniqueMember(members, name) { if (members.some(m => m.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new HttpError(409, 'A member with this name already exists.'); }
function member(group, id, field) { if (!Number.isInteger(id) || !group.members.some(m => m.id === id)) invalid(field, 'Choose an existing group member.'); }
function checkActiveGroup(g) {
  if (g.isActive === false) {
    throw new HttpError(409, 'This group is inactive. Switch it back to Active to make changes.');
  }
}

export function createController(repository) {
  return async function dispatch(method, segments, body, user) {
    if (!segments.length && method === 'GET') {
      const AUTH_REQUIRED = process.env.AUTH_REQUIRED !== 'false';
      let groups = [];
      if (AUTH_REQUIRED && user) {
        const listFn = repository.listGroupsForUser || repository.listForUser;
        groups = listFn ? await listFn.call(repository, user) : [];
      } else if (!AUTH_REQUIRED) {
        groups = await (repository.listAll ? repository.listAll() : []);
      }
      return [200, groups.map(publicGroup)];
    }
    if (!segments.length && method === 'POST') {
      const { name, members: names, errors } = validateGroup(body);
      if (Object.keys(errors).length) throw new HttpError(400, 'Invalid fields', errors);
      const members = names.map((mName, index) => {
        const m = { id: index + 1, name: mName };
        if (user && user.id != null) {
          const uName = user.name?.trim().toLowerCase();
          const uUsername = user.username?.trim().toLowerCase();
          const lower = mName.trim().toLowerCase();
          if (lower === uName || lower === uUsername || index === 0) {
            m.userId = user.id;
          }
        }
        return m;
      });
      const group = await repository.create({
        id: generateGroupId(),
        name,
        members,
        expenses: [],
        payments: [],
        version: 0,
        createdByUserId: user ? user.id : null,
        createdAt: new Date().toISOString(),
        isActive: body.isActive !== false
      });
      return [201, publicGroup(group)];
    }
    if (!segments.length) throw new HttpError(404, 'Endpoint not found.');
    const [gid, resource, eid] = segments;
    if (segments.length > 3) throw new HttpError(404, 'Endpoint not found.');
    if (!resource && method === 'GET') return [200, publicGroup(await repository.get(gid))];
    if (resource === 'status' && method === 'PATCH' && !eid) {
      const existingGroup = await repository.get(gid);
      if (process.env.AUTH_REQUIRED !== 'false' && user && !isUserAuthorizedForGroup(existingGroup, user)) {
        throw new HttpError(404, 'Group not found');
      }
      if (typeof body.isActive !== 'boolean') {
        throw new HttpError(400, 'Invalid fields', { isActive: 'Must be a boolean' });
      }
      const updated = await repository.change(gid, g => {
        g.isActive = body.isActive;
        return { id: g.id, name: g.name, isActive: g.isActive };
      });
      return [200, updated];
    }
    if (resource === 'members' && method === 'POST' && !eid) {
      const result = await repository.change(gid, g => {
        checkActiveGroup(g);
        const name = text(body.name, 'name', 40); uniqueMember(g.members, name);
        if (g.members.length >= 20) invalid('members', 'A group can have at most 20 members.');
        const m = { id: g.members.length + 1, name };
        if (user && user.id != null) {
          const uName = user.name?.trim().toLowerCase();
          const uUsername = user.username?.trim().toLowerCase();
          const lower = name.trim().toLowerCase();
          if (lower === uName || lower === uUsername) {
            m.userId = user.id;
          }
        }
        g.members.push(m);
        return m;
      });
      return [201, result];
    }
    if (resource === 'members' && method === 'DELETE' && eid) {
      const mid = Number(eid);
      await repository.change(gid, g => {
        checkActiveGroup(g);
        const memberIndex = g.members.findIndex(m => m.id === mid);
        if (memberIndex < 0) throw new HttpError(404, 'Member not found.');
        if (g.members.length <= 2) throw new HttpError(400, 'Group must have at least 2 members.');
        const balances = calculateBalances(g.members, g.expenses, g.payments);
        const memBal = balances.find(b => b.memberId === mid);
        if (memBal && memBal.balance !== 0) throw new HttpError(400, 'Cannot remove member with non-zero balance.');
        const hasExpenses = g.expenses.some(e => e.paidBy === mid || (e.splits && e.splits[mid]));
        if (hasExpenses) throw new HttpError(400, 'Cannot remove member with recorded expenses.');
        const hasPayments = g.payments.some(p => p.from === mid || p.to === mid);
        if (hasPayments) throw new HttpError(400, 'Cannot remove member with recorded payments.');
        g.members.splice(memberIndex, 1);
      });
      return [204];
    }
    if (resource === 'expenses' && method === 'POST' && !eid) {
      return [201, await repository.change(gid, g => {
        checkActiveGroup(g);
        const errors = {};
        let description;
        if (typeof body.description !== 'string' || !body.description.trim() || body.description.trim().length > 100) {
          errors.description = 'Use 1–100 characters for description.';
        } else {
          description = body.description.trim();
        }
        if (!Number.isSafeInteger(body.amount) || body.amount < 1 || body.amount > 1000000000) {
          errors.amount = 'Must be a whole number from 1 to 1000000000.';
        }
        if (!Number.isInteger(body.paidBy) || !g.members.some(m => m.id === body.paidBy)) {
          errors.paidBy = 'Choose an existing group member.';
        }
        let splits;
        try {
          splits = calculateSplit(body.amount, body.split, g.members);
        } catch (err) {
          if (err.errors) Object.assign(errors, err.errors);
          else errors.split = err.message || 'Invalid split specification.';
        }
        if (Object.keys(errors).length) throw new HttpError(400, 'Invalid fields', errors);
        const expense = { id: (g.next_expense || 1), description, amount: body.amount, paidBy: body.paidBy, splits, createdAt: new Date().toISOString() };
        calculateBalances(g.members, [...g.expenses, expense], g.payments);
        g.next_expense = expense.id + 1; g.expenses.push(expense); return expense;
      })];
    }
    if (resource === 'expenses' && method === 'GET' && !eid) return [200, (await repository.get(gid)).expenses];
    if (resource === 'expenses' && method === 'DELETE' && eid) {
      await repository.change(gid, g => {
        checkActiveGroup(g);
        const index = g.expenses.findIndex(e => String(e.id) === eid);
        if (index < 0) throw new HttpError(404, 'Expense not found.');
        g.expenses.splice(index, 1);
        calculateBalances(g.members, g.expenses, g.payments);
      });
      return [204];
    }
    if (resource === 'payments' && method === 'POST' && !eid) {
      return [201, await repository.change(gid, g => {
        checkActiveGroup(g);
        const errors = {};
        if (!Number.isInteger(body.from) || !g.members.some(m => m.id === body.from)) {
          errors.from = 'Choose an existing group member.';
        }
        if (!Number.isInteger(body.to) || !g.members.some(m => m.id === body.to)) {
          errors.to = 'Choose an existing group member.';
        }
        if (body.from === body.to && !errors.from && !errors.to) {
          errors.to = 'Sender and receiver must be different.';
        }
        if (!Number.isSafeInteger(body.amount) || body.amount < 1) {
          errors.amount = 'Must be a positive integer.';
        }
        if (Object.keys(errors).length) throw new HttpError(400, 'Invalid fields', errors);
        const payment = { id: (g.next_payment || 1), from: body.from, to: body.to, amount: body.amount, createdAt: new Date().toISOString() };
        const balances = calculateBalances(g.members, g.expenses, [...g.payments, payment]);
        if (balances.some(b => !Number.isSafeInteger(b.balance))) throw new HttpError(400, 'Invalid fields', { amount: 'Payment is too large.' });
        g.next_payment = payment.id + 1; g.payments.push(payment); return payment;
      })];
    }
    if ((resource === 'balances' || resource === 'settlements') && method === 'GET' && !eid) {
      const g = await repository.get(gid);
      const balances = calculateBalances(g.members, g.expenses, g.payments);
      return resource === 'balances' ? [200, { balances }] : [200, { transfers: calculateSettlements(balances) }];
    }
    throw new HttpError(404, 'Endpoint not found.');
  };
}
