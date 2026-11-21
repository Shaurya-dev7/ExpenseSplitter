/**
 * SplitFair — Balances Module (Walkthrough-Ready).
 * Renders member net balances and verifies conservation of money invariant (sum = 0).
 * Safe DOM manipulation via textContent only.
 */

(function () {
  "use strict";

  let el = {};
  let appState = null;

  function init(stateRef) {
    appState = stateRef;
    el = {
      balancesList: document.getElementById("balances-list"),
      balanceChecksumBadge: document.getElementById("balance-checksum-badge"),
      tabBadgeBalances: document.getElementById("tab-badge-balances"),
    };
  }

  function renderBalances() {
    el.tabBadgeBalances.textContent = String(appState.members.length);
    el.balancesList.innerHTML = "";

    if (appState.balances.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.innerHTML = `
        <span class="empty-icon" aria-hidden="true">⚖️</span>
        <h4 class="empty-title">No balances to display</h4>
        <p class="empty-desc">Add members and record expenses to view net balances.</p>
      `;
      el.balancesList.appendChild(empty);
      return;
    }

    // Conservation of money: sum of balances must strictly equal 0
    const sumBalances = appState.balances.reduce((acc, b) => acc + b.balance, 0);
    if (sumBalances === 0) {
      el.balanceChecksumBadge.className = "badge badge-success";
      el.balanceChecksumBadge.textContent = "Balanced (Σ = ₹0.00)";
      el.balanceChecksumBadge.setAttribute("title", "Conservation of money invariant satisfied: sum of net balances is zero.");
    } else {
      el.balanceChecksumBadge.className = "badge badge-danger";
      el.balanceChecksumBadge.textContent = `Imbalanced (Σ = ${MoneyUtils.formatPaiseToRupees(sumBalances)})`;
      el.balanceChecksumBadge.setAttribute("title", "Warning: Net ledger is out of balance!");
    }

    // Render each member balance (sorted by memberId ASC from server)
    appState.balances.forEach((b) => {
      const card = document.createElement("div");
      card.className = "balance-card";

      // Member Avatar & Name
      const memberInfo = document.createElement("div");
      memberInfo.className = "balance-member-info";

      const avatar = document.createElement("div");
      avatar.className = "balance-member-avatar";
      avatar.textContent = b.name.charAt(0).toUpperCase();

      const textWrap = document.createElement("div");
      const name = document.createElement("div");
      name.className = "balance-member-name";
      name.textContent = b.name;

      const sub = document.createElement("div");
      sub.className = "balance-member-sub";
      sub.textContent = `Member #${b.memberId}`;

      textWrap.appendChild(name);
      textWrap.appendChild(sub);
      memberInfo.appendChild(avatar);
      memberInfo.appendChild(textWrap);

      // Amount & Status Text
      const valBox = document.createElement("div");
      valBox.className = "balance-val-box";

      const amount = document.createElement("div");
      const status = document.createElement("div");

      if (b.balance > 0) {
        amount.className = "balance-val-amount positive";
        amount.textContent = `+${MoneyUtils.formatPaiseToRupees(b.balance)}`;
        status.className = "balance-status-text positive";
        status.textContent = "gets back";
      } else if (b.balance < 0) {
        amount.className = "balance-val-amount negative";
        amount.textContent = `-${MoneyUtils.formatPaiseToRupees(Math.abs(b.balance))}`;
        status.className = "balance-status-text negative";
        status.textContent = "owes";
      } else {
        amount.className = "balance-val-amount neutral";
        amount.textContent = MoneyUtils.formatPaiseToRupees(0);
        status.className = "balance-status-text neutral";
        status.textContent = "settled up";
      }

      valBox.appendChild(amount);
      valBox.appendChild(status);

      card.appendChild(memberInfo);
      card.appendChild(valBox);

      el.balancesList.appendChild(card);
    });
  }

  window.BalancesModule = {
    init,
    renderBalances,
  };
})();
