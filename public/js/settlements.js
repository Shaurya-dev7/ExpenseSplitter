/**
 * SplitFair — Settlements Module (Walkthrough-Ready).
 * Manages greedy debt simplification settlements, payment confirmation, and copy reminders.
 * ZERO floating-point arithmetic. Safe DOM manipulation via textContent only.
 */

(function () {
  "use strict";

  let el = {};
  let appState = null;
  let onDataChanged = null;

  function init(stateRef, onUpdateCallback) {
    appState = stateRef;
    onDataChanged = onUpdateCallback;

    el = {
      settlementsList: document.getElementById("settlements-list"),
      tabBadgeSettlements: document.getElementById("tab-badge-settlements"),

      // Payment Confirm Modal
      modalPayment: document.getElementById("modal-payment"),
      btnClosePaymentModal: document.getElementById("btn-close-payment-modal"),
      btnCancelPayment: document.getElementById("btn-cancel-payment"),
      paymentFromName: document.getElementById("payment-from-name"),
      paymentToName: document.getElementById("payment-to-name"),
      paymentAmountDisplay: document.getElementById("payment-amount-display"),
      btnConfirmPayment: document.getElementById("btn-confirm-payment"),
    };

    bindEvents();
  }

  function bindEvents() {
    el.btnClosePaymentModal.addEventListener("click", closePaymentModal);
    el.btnCancelPayment.addEventListener("click", closePaymentModal);
    el.modalPayment.addEventListener("click", (e) => {
      if (e.target === el.modalPayment) closePaymentModal();
    });

    el.btnConfirmPayment.addEventListener("click", handleConfirmPayment);
  }

  function renderSettlements() {
    el.tabBadgeSettlements.textContent = String(appState.settlements.length);
    el.settlementsList.innerHTML = "";

    if (appState.settlements.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.innerHTML = `
        <span class="empty-icon" aria-hidden="true">🎉</span>
        <h4 class="empty-title">All settled up!</h4>
        <p class="empty-desc">No outstanding balances. Everyone has paid their fair share.</p>
      `;
      el.settlementsList.appendChild(empty);
      return;
    }

    // Render suggested transfers
    appState.settlements.forEach((transfer) => {
      const fromMember = appState.membersMap.get(transfer.from) || { name: `Member #${transfer.from}` };
      const toMember = appState.membersMap.get(transfer.to) || { name: `Member #${transfer.to}` };

      const card = document.createElement("div");
      card.className = "settlement-card";

      // Header row: From -> To and Amount
      const header = document.createElement("div");
      header.className = "settlement-card-header";

      const route = document.createElement("div");
      route.className = "settlement-route";

      const fromName = document.createElement("span");
      fromName.className = "name-pill from-pill";
      fromName.textContent = fromMember.name;

      const arrow = document.createElement("span");
      arrow.className = "settlement-arrow";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "➔";

      const toName = document.createElement("span");
      toName.className = "name-pill to-pill";
      toName.textContent = toMember.name;

      route.appendChild(fromName);
      route.appendChild(arrow);
      route.appendChild(toName);

      const amt = document.createElement("div");
      amt.className = "settlement-amount";
      amt.textContent = MoneyUtils.formatPaiseToRupees(transfer.amount);

      header.appendChild(route);
      header.appendChild(amt);
      card.appendChild(header);

      // Actions: Mark as Paid, Copy Reminder (Primary), WhatsApp (Secondary)
      const actions = document.createElement("div");
      actions.className = "settlement-actions";

      // 1. Mark as Paid button
      const btnPay = document.createElement("button");
      btnPay.type = "button";
      btnPay.className = "btn btn-success btn-md";
      btnPay.innerHTML = `<span aria-hidden="true">✓</span> Mark as Paid`;
      btnPay.setAttribute("aria-label", `Mark payment of ${MoneyUtils.formatPaiseToRupees(transfer.amount)} from ${fromMember.name} to ${toMember.name} as paid`);
      btnPay.addEventListener("click", () => openPaymentConfirmModal(transfer, fromMember, toMember));

      // 2. Copy Reminder button (Primary Extra D)
      const btnCopyRemind = document.createElement("button");
      btnCopyRemind.type = "button";
      btnCopyRemind.className = "btn btn-secondary btn-md";
      btnCopyRemind.innerHTML = `<span aria-hidden="true">📋</span> Copy Reminder`;
      btnCopyRemind.setAttribute("aria-label", `Copy payment reminder for ${fromMember.name}`);
      btnCopyRemind.addEventListener("click", () => copyReminderText(transfer, fromMember, toMember));

      // 3. WhatsApp Direct Link button (Secondary Extra D)
      const btnWa = document.createElement("button");
      btnWa.type = "button";
      btnWa.className = "btn btn-whatsapp btn-md";
      btnWa.innerHTML = `<span aria-hidden="true">💬</span> WhatsApp`;
      btnWa.setAttribute("aria-label", `Share payment reminder via WhatsApp`);
      btnWa.addEventListener("click", () => sendWhatsAppReminder(transfer, fromMember, toMember));

      actions.appendChild(btnPay);
      actions.appendChild(btnCopyRemind);
      actions.appendChild(btnWa);
      card.appendChild(actions);

      el.settlementsList.appendChild(card);
    });
  }

  function getReminderText(transfer, fromMember, toMember) {
    const formattedAmt = MoneyUtils.formatPaiseToRupees(transfer.amount);
    const groupName = (appState.group && appState.group.name) || "our group";
    const groupUrl = window.location.href;
    return `Hi ${fromMember.name}! 👋\nPlease settle ${formattedAmt} with ${toMember.name} for '${groupName}'.\nView details: ${groupUrl}`;
  }

  function copyReminderText(transfer, fromMember, toMember) {
    const text = getReminderText(transfer, fromMember, toMember);
    window.SplitFairApp.copyToClipboard(text, {
      successMsg: "Reminder copied to clipboard! (Note: copying does not record payment)",
      fallbackPrompt: "Copy this settlement reminder:",
    });
  }

  function sendWhatsAppReminder(transfer, fromMember, toMember) {
    const text = getReminderText(transfer, fromMember, toMember);
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  }

  function openPaymentConfirmModal(transfer, fromMember, toMember) {
    appState.isModalOpen = true;
    appState.pendingPayment = transfer;

    el.paymentFromName.textContent = fromMember.name;
    el.paymentToName.textContent = toMember.name;
    el.paymentAmountDisplay.textContent = MoneyUtils.formatPaiseToRupees(transfer.amount);

    el.modalPayment.classList.remove("hidden");
    el.modalPayment.setAttribute("aria-hidden", "false");
    el.btnConfirmPayment.focus();
  }

  function closePaymentModal() {
    appState.isModalOpen = false;
    appState.pendingPayment = null;
    el.modalPayment.classList.add("hidden");
    el.modalPayment.setAttribute("aria-hidden", "true");
  }

  async function handleConfirmPayment() {
    if (!appState.pendingPayment) return;
    if (appState.isOffline) {
      window.SplitFairApp.showToast("Cannot record payments while offline", "error");
      return;
    }

    window.SplitFairApp.setBtnLoading(el.btnConfirmPayment, true);
    try {
      await API.recordPayment(appState.currentGroupId, {
        from: appState.pendingPayment.from,
        to: appState.pendingPayment.to,
        amount: appState.pendingPayment.amount,
      });

      window.SplitFairApp.showToast("Payment recorded! Balances updated.", "success");
      closePaymentModal();
      await onDataChanged();
    } catch (err) {
      window.SplitFairApp.showToast(err.message || "Failed to record payment", "error");
    } finally {
      window.SplitFairApp.setBtnLoading(el.btnConfirmPayment, false);
    }
  }

  window.SettlementsModule = {
    init,
    renderSettlements,
    closePaymentModal,
  };
})();
