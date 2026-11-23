import { formatMoney } from './money.js';

export function renderBalances(balances, container) {
  container.replaceChildren();

  if (!balances || !balances.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const h3 = document.createElement('h3');
    h3.textContent = 'No balances yet';
    const p = document.createElement('p');
    p.textContent = 'Balances are calculated automatically when expenses and payments are recorded.';
    empty.appendChild(h3);
    empty.appendChild(p);
    container.appendChild(empty);
    return;
  }

  // PRD requirement: Balances must be ordered by member ID
  const sorted = [...balances].sort((a, b) => a.memberId - b.memberId);

  for (const b of sorted) {
    const row = document.createElement('div');
    row.className = 'balance-row';

    const avatar = document.createElement('span');
    avatar.className = `avatar avatar-${(b.memberId - 1) % 6}`;
    avatar.textContent = b.name.slice(0, 2).toUpperCase();

    const person = document.createElement('div');
    person.className = 'balance-person';

    const name = document.createElement('strong');
    name.textContent = b.name;

    const sub = document.createElement('span');
    if (b.balance > 0) {
      sub.textContent = 'gets back money';
    } else if (b.balance < 0) {
      sub.textContent = 'owes money to the group';
    } else {
      sub.textContent = 'fully settled up';
    }

    person.appendChild(name);
    person.appendChild(sub);

    const amount = document.createElement('div');
    amount.className = 'balance-amount';
    if (b.balance > 0) {
      amount.classList.add('positive');
      amount.textContent = `+${formatMoney(b.balance)}`;
    } else if (b.balance < 0) {
      amount.classList.add('negative');
      amount.textContent = formatMoney(b.balance);
    } else {
      amount.classList.add('neutral');
      amount.textContent = '₹0.00';
    }

    row.appendChild(avatar);
    row.appendChild(person);
    row.appendChild(amount);

    container.appendChild(row);
  }
}
