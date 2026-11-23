import { formatMoney } from './money.js';

export function renderExpenses(expenses, members, searchFilter, payerFilter, onSelectExpense, onDeleteExpense, container) {
  container.replaceChildren();

  const memberMap = new Map(members.map(m => [m.id, m.name]));

  const query = (searchFilter || '').trim().toLowerCase();
  const filterPayerId = payerFilter === 'all' || !payerFilter ? null : Number(payerFilter);

  const filtered = expenses.filter(e => {
    const matchesSearch = !query || e.description.toLowerCase().includes(query);
    const matchesPayer = filterPayerId === null || e.paidBy === filterPayerId;
    return matchesSearch && matchesPayer;
  });

  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const h3 = document.createElement('h3');
    h3.textContent = expenses.length ? 'No matching expenses' : 'No expenses recorded yet';
    const p = document.createElement('p');
    p.textContent = expenses.length
      ? 'Try adjusting your search query or payer filter.'
      : 'Click "+ Add expense" above to record your group’s first shared cost.';
    empty.appendChild(h3);
    empty.appendChild(p);
    container.appendChild(empty);
    return;
  }

  // PRD requirement: oldest first
  const sorted = [...filtered].sort((a, b) => (a.id || 0) - (b.id || 0));

  for (const exp of sorted) {
    const row = document.createElement('div');
    row.className = 'expense-row';

    const icon = document.createElement('div');
    icon.className = 'expense-icon';
    icon.textContent = '🧾';

    const info = document.createElement('div');
    info.className = 'expense-info';

    const desc = document.createElement('strong');
    desc.textContent = exp.description;

    const meta = document.createElement('span');
    const payerName = memberMap.get(exp.paidBy) || `Member #${exp.paidBy}`;
    meta.textContent = `Paid by ${payerName} • ${Object.keys(exp.splits || {}).length} people sharing`;

    info.appendChild(desc);
    info.appendChild(meta);

    const amountCol = document.createElement('div');
    amountCol.className = 'expense-amount';

    const amt = document.createElement('strong');
    amt.textContent = formatMoney(exp.amount);

    const date = document.createElement('time');
    if (exp.createdAt) {
      const d = new Date(exp.createdAt);
      date.textContent = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    }

    amountCol.appendChild(amt);
    amountCol.appendChild(date);

    const delBtn = document.createElement('button');
    delBtn.className = 'expense-delete-btn';
    delBtn.setAttribute('aria-label', `Delete expense ${exp.description}`);
    delBtn.title = 'Delete expense';
    delBtn.textContent = '🗑️';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onDeleteExpense(exp);
    });

    row.appendChild(icon);
    row.appendChild(info);
    row.appendChild(amountCol);
    row.appendChild(delBtn);

    if (typeof onSelectExpense === 'function') {
      row.addEventListener('click', () => onSelectExpense(exp));
    }

    container.appendChild(row);
  }
}
