import { formatMoney } from './money.js';

export function renderSettlements(transfers, members, onMarkAsPaid, onWhatsAppReminder, container) {
  container.replaceChildren();

  const memberMap = new Map(members.map(m => [m.id, m.name]));

  if (!transfers || !transfers.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const h3 = document.createElement('h3');
    h3.textContent = 'All settled up! 🎉';
    const p = document.createElement('p');
    p.textContent = 'There are no pending transfers. Everyone in the group is squared away.';
    empty.appendChild(h3);
    empty.appendChild(p);
    container.appendChild(empty);
    return;
  }

  for (const t of transfers) {
    const fromName = memberMap.get(t.from) || `Member #${t.from}`;
    const toName = memberMap.get(t.to) || `Member #${t.to}`;

    const card = document.createElement('div');
    card.className = 'transfer-card';

    const people = document.createElement('div');
    people.className = 'transfer-people';

    const fromAvatar = document.createElement('span');
    fromAvatar.className = `avatar avatar-${(t.from - 1) % 6}`;
    fromAvatar.textContent = fromName.slice(0, 2).toUpperCase();

    const fromLabel = document.createElement('strong');
    fromLabel.textContent = fromName;

    const arrow = document.createElement('span');
    arrow.textContent = ' ➔ pays ➔ ';
    arrow.style.color = '#828879';
    arrow.style.fontSize = '11px';

    const toAvatar = document.createElement('span');
    toAvatar.className = `avatar avatar-${(t.to - 1) % 6}`;
    toAvatar.textContent = toName.slice(0, 2).toUpperCase();

    const toLabel = document.createElement('strong');
    toLabel.textContent = toName;

    people.appendChild(fromAvatar);
    people.appendChild(fromLabel);
    people.appendChild(arrow);
    people.appendChild(toAvatar);
    people.appendChild(toLabel);

    const bottom = document.createElement('div');
    bottom.className = 'transfer-bottom';

    const amt = document.createElement('strong');
    amt.textContent = formatMoney(t.amount);

    const actions = document.createElement('div');
    actions.className = 'transfer-actions';

    const markPaidBtn = document.createElement('button');
    markPaidBtn.className = 'button primary';
    markPaidBtn.style.minHeight = '38px';
    markPaidBtn.style.padding = '8px 14px';
    markPaidBtn.style.fontSize = '11px';
    markPaidBtn.textContent = '✓ Mark as paid';
    markPaidBtn.addEventListener('click', () => onMarkAsPaid(t));

    const remindBtn = document.createElement('button');
    remindBtn.className = 'button secondary';
    remindBtn.style.minHeight = '38px';
    remindBtn.style.padding = '8px 12px';
    remindBtn.style.fontSize = '11px';
    remindBtn.textContent = '💬 WhatsApp reminder';
    remindBtn.addEventListener('click', () => onWhatsAppReminder(t, fromName, toName));

    actions.appendChild(remindBtn);
    actions.appendChild(markPaidBtn);

    bottom.appendChild(amt);
    bottom.appendChild(actions);

    card.appendChild(people);
    card.appendChild(bottom);

    container.appendChild(card);
  }
}
