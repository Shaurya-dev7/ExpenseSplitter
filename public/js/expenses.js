/**
 * SplitFair — Expenses Module (Walkthrough-Ready).
 * Manages expense listing, deletion, quick item calculator, and Add Expense modal logic.
 * ZERO floating-point arithmetic. Safe DOM manipulation via textContent only.
 */

(function () {
  "use strict";

  // Elements cache for expense-related UI
  let el = {};
  let appState = null;
  let onDataChanged = null;

  function init(stateRef, onUpdateCallback) {
    appState = stateRef;
    onDataChanged = onUpdateCallback;

    el = {
      expensesList: document.getElementById("expenses-list"),
      totalGroupSpend: document.getElementById("total-group-spend"),
      tabBadgeExpenses: document.getElementById("tab-badge-expenses"),

      // Modal
      modalExpense: document.getElementById("modal-expense"),
      btnCloseExpenseModal: document.getElementById("btn-close-expense-modal"),
      btnCancelExpense: document.getElementById("btn-cancel-expense"),
      formAddExpense: document.getElementById("form-add-expense"),
      inputExpenseDesc: document.getElementById("input-expense-desc"),
      inputExpenseAmount: document.getElementById("input-expense-amount"),
      selectExpensePayer: document.getElementById("select-expense-payer"),
      errorExpenseDesc: document.getElementById("error-expense-desc"),
      errorExpenseAmount: document.getElementById("error-expense-amount"),
      errorExpensePayer: document.getElementById("error-expense-payer"),
      segmentBtns: document.querySelectorAll(".segment-btn"),
      splitParticipantsContainer: document.getElementById("split-participants-container"),
      btnToggleAllParticipants: document.getElementById("btn-toggle-all-participants"),
      previewStatusPill: document.getElementById("preview-status-pill"),
      previewBreakdownList: document.getElementById("preview-breakdown-list"),
      previewNote: document.getElementById("preview-remainder-note"),
      btnSaveExpense: document.getElementById("btn-save-expense"),

      // Quick Calculator
      quickCalcDetails: document.getElementById("quick-calc-details"),
      quickCalcItemsList: document.getElementById("quick-calc-items-list"),
      btnAddCalcItem: document.getElementById("btn-add-calc-item"),
      btnApplyCalcTotal: document.getElementById("btn-apply-calc-total"),
      calcRunningTotal: document.getElementById("calc-running-total"),
      errorCalc: document.getElementById("error-calc"),
    };

    bindEvents();
  }

  function bindEvents() {
    el.btnCloseExpenseModal.addEventListener("click", closeModal);
    el.btnCancelExpense.addEventListener("click", closeModal);
    el.modalExpense.addEventListener("click", (e) => {
      if (e.target === el.modalExpense) closeModal();
    });

    // Split segment toggle
    el.segmentBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        el.segmentBtns.forEach((b) => {
          b.classList.remove("active");
          b.setAttribute("aria-checked", "false");
        });
        btn.classList.add("active");
        btn.setAttribute("aria-checked", "true");
        appState.activeSplitType = btn.dataset.type;
        renderSplitConfiguration();
        updateLivePreview();
      });
    });

    // Toggle All Participants
    el.btnToggleAllParticipants.addEventListener("click", () => {
      if (appState.activeSplitType === "equal") {
        const checkboxes = el.splitParticipantsContainer.querySelectorAll("input[type='checkbox']");
        const allChecked = Array.from(checkboxes).every((cb) => cb.checked);
        checkboxes.forEach((cb) => (cb.checked = !allChecked));
        el.btnToggleAllParticipants.textContent = allChecked ? "Select All" : "Deselect All";
        updateLivePreview();
      }
    });

    // Amount & Payer inputs
    el.inputExpenseAmount.addEventListener("input", updateLivePreview);
    el.selectExpensePayer.addEventListener("change", updateLivePreview);

    // Form submit
    el.formAddExpense.addEventListener("submit", handleSaveExpense);

    // Quick Item Calculator
    if (el.btnAddCalcItem) {
      el.btnAddCalcItem.addEventListener("click", () => addCalcItemRow());
    }
    if (el.btnApplyCalcTotal) {
      el.btnApplyCalcTotal.addEventListener("click", handleApplyCalcTotal);
    }
  }

  // =========================================================================
  // Render Expenses List (Strictly Oldest First)
  // =========================================================================
  function renderExpenses() {
    // Total spend
    const totalSpendPaise = appState.expenses.reduce((acc, exp) => acc + exp.amount, 0);
    el.totalGroupSpend.textContent = MoneyUtils.formatPaiseToRupees(totalSpendPaise);
    el.tabBadgeExpenses.textContent = String(appState.expenses.length);

    el.expensesList.innerHTML = "";

    if (appState.expenses.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.innerHTML = `
        <span class="empty-icon" aria-hidden="true">🧾</span>
        <h4 class="empty-title">No expenses yet</h4>
        <p class="empty-desc">Tap '+ Add Expense' to record the first shared bill.</p>
      `;
      el.expensesList.appendChild(empty);
      return;
    }

    // Preserve oldest-first ordering as returned from server
    appState.expenses.forEach((expense) => {
      const card = document.createElement("div");
      card.className = "expense-card";
      card.dataset.id = String(expense.id);

      // Top row
      const topRow = document.createElement("div");
      topRow.className = "expense-card-top";

      const mainInfo = document.createElement("div");
      mainInfo.className = "expense-main-info";

      const title = document.createElement("h4");
      title.className = "expense-title";
      title.textContent = expense.description;

      const meta = document.createElement("div");
      meta.className = "expense-meta";

      const payerName = (appState.membersMap.get(expense.paidBy) || {}).name || `Member #${expense.paidBy}`;
      const payerSpan = document.createElement("span");
      payerSpan.className = "expense-payer-name";
      payerSpan.textContent = `Paid by ${payerName}`;

      const dateStr = new Date(expense.createdAt).toLocaleDateString("en-IN", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const dateSpan = document.createElement("span");
      dateSpan.className = "expense-date-stamp";
      dateSpan.textContent = `• ${dateStr}`;

      meta.appendChild(payerSpan);
      meta.appendChild(dateSpan);
      mainInfo.appendChild(title);
      mainInfo.appendChild(meta);

      const amtBox = document.createElement("div");
      amtBox.className = "expense-amount-box";

      const amt = document.createElement("div");
      amt.className = "expense-amount";
      amt.textContent = MoneyUtils.formatPaiseToRupees(expense.amount);

      amtBox.appendChild(amt);
      topRow.appendChild(mainInfo);
      topRow.appendChild(amtBox);
      card.appendChild(topRow);

      // Splits details breakdown
      if (expense.splits && typeof expense.splits === "object") {
        const splitsBox = document.createElement("div");
        splitsBox.className = "expense-splits-detail";

        const splitKeys = Object.keys(expense.splits).map(Number).sort((a, b) => a - b);
        splitKeys.forEach((mId) => {
          const mName = (appState.membersMap.get(mId) || {}).name || `#${mId}`;
          const sharePaise = expense.splits[String(mId)] || 0;

          const pill = document.createElement("span");
          pill.className = "split-pill";
          pill.textContent = `${mName}: ${MoneyUtils.formatPaiseToRupees(sharePaise)}`;
          splitsBox.appendChild(pill);
        });

        card.appendChild(splitsBox);
      }

      // Actions (Delete button)
      const actions = document.createElement("div");
      actions.className = "expense-actions";

      const btnDelete = document.createElement("button");
      btnDelete.type = "button";
      btnDelete.className = "btn btn-danger-outline btn-sm";
      btnDelete.textContent = "Delete";
      btnDelete.setAttribute("aria-label", `Delete expense ${expense.description}`);
      btnDelete.addEventListener("click", () => confirmDeleteExpense(expense, btnDelete));

      actions.appendChild(btnDelete);
      card.appendChild(actions);

      el.expensesList.appendChild(card);
    });
  }

  async function confirmDeleteExpense(expense, btnRef) {
    if (appState.isOffline) {
      window.SplitFairApp.showToast("Cannot delete expense while offline", "error");
      return;
    }

    const ok = window.confirm(
      `Delete expense "${expense.description}" of ${MoneyUtils.formatPaiseToRupees(expense.amount)}?\nThis will recalculate all group balances.`
    );
    if (!ok) return;

    btnRef.disabled = true;
    btnRef.textContent = "Deleting...";

    try {
      await API.deleteExpense(appState.currentGroupId, expense.id);
      window.SplitFairApp.showToast("Expense deleted", "success");
      await onDataChanged();
    } catch (err) {
      btnRef.disabled = false;
      btnRef.textContent = "Delete";
      window.SplitFairApp.showToast(err.message || "Failed to delete expense", "error");
    }
  }

  // =========================================================================
  // Modal Lifecycle & Form Handling
  // =========================================================================
  function openModal() {
    appState.isModalOpen = true;
    el.formAddExpense.reset();
    el.errorExpenseDesc.textContent = "";
    el.errorExpenseAmount.textContent = "";
    el.errorExpensePayer.textContent = "";
    if (el.errorCalc) el.errorCalc.textContent = "";

    // Reset split type to equal
    appState.activeSplitType = "equal";
    el.segmentBtns.forEach((b) => {
      const isEq = b.dataset.type === "equal";
      b.classList.toggle("active", isEq);
      b.setAttribute("aria-checked", String(isEq));
    });

    // Populate Paid By dropdown
    el.selectExpensePayer.innerHTML = "";
    appState.members.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = String(m.id);
      opt.textContent = `${m.name} (#${m.id})`;
      el.selectExpensePayer.appendChild(opt);
    });

    resetQuickCalc();
    renderSplitConfiguration();
    updateLivePreview();

    el.modalExpense.classList.remove("hidden");
    el.modalExpense.setAttribute("aria-hidden", "false");
    el.inputExpenseDesc.focus();
  }

  function closeModal() {
    appState.isModalOpen = false;
    el.modalExpense.classList.add("hidden");
    el.modalExpense.setAttribute("aria-hidden", "true");
  }

  function renderSplitConfiguration() {
    el.splitParticipantsContainer.innerHTML = "";

    if (appState.activeSplitType === "equal") {
      el.btnToggleAllParticipants.classList.remove("hidden");
      el.btnToggleAllParticipants.textContent = "Deselect All";

      appState.members.forEach((m) => {
        const row = document.createElement("div");
        row.className = "split-participant-row";

        const label = document.createElement("label");
        label.className = "split-participant-label";
        label.htmlFor = `cb-participant-${m.id}`;

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.id = `cb-participant-${m.id}`;
        cb.checked = true;
        cb.value = String(m.id);
        cb.addEventListener("change", () => {
          const checkboxes = el.splitParticipantsContainer.querySelectorAll("input[type='checkbox']");
          const allChecked = Array.from(checkboxes).every((c) => c.checked);
          el.btnToggleAllParticipants.textContent = allChecked ? "Deselect All" : "Select All";
          updateLivePreview();
        });

        const nameSpan = document.createElement("span");
        nameSpan.textContent = `${m.name} (#${m.id})`;

        label.appendChild(cb);
        label.appendChild(nameSpan);
        row.appendChild(label);
        el.splitParticipantsContainer.appendChild(row);
      });
    } else if (appState.activeSplitType === "shares") {
      el.btnToggleAllParticipants.classList.add("hidden");

      appState.members.forEach((m) => {
        const row = document.createElement("div");
        row.className = "split-participant-row";

        const label = document.createElement("label");
        label.className = "split-participant-label";
        label.htmlFor = `input-share-${m.id}`;
        label.textContent = `${m.name} (#${m.id})`;

        const input = document.createElement("input");
        input.type = "number";
        input.id = `input-share-${m.id}`;
        input.className = "split-input-field share-input";
        input.min = "1";
        input.max = "1000";
        input.value = "1";
        input.dataset.memberId = String(m.id);
        input.setAttribute("aria-label", `Share weight for ${m.name}`);
        input.addEventListener("input", updateLivePreview);

        row.appendChild(label);
        row.appendChild(input);
        el.splitParticipantsContainer.appendChild(row);
      });
    } else if (appState.activeSplitType === "exact") {
      el.btnToggleAllParticipants.classList.add("hidden");

      appState.members.forEach((m) => {
        const row = document.createElement("div");
        row.className = "split-participant-row";

        const label = document.createElement("label");
        label.className = "split-participant-label";
        label.htmlFor = `input-exact-${m.id}`;
        label.textContent = `${m.name} (#${m.id})`;

        const input = document.createElement("input");
        input.type = "text";
        input.inputMode = "decimal";
        input.id = `input-exact-${m.id}`;
        input.className = "split-input-field exact-input";
        input.placeholder = "0.00";
        input.dataset.memberId = String(m.id);
        input.setAttribute("aria-label", `Exact amount in rupees for ${m.name}`);
        input.addEventListener("input", updateLivePreview);

        row.appendChild(label);
        row.appendChild(input);
        el.splitParticipantsContainer.appendChild(row);
      });
    }
  }

  function getSplitConfigFromDOM() {
    if (appState.activeSplitType === "equal") {
      const checkboxes = el.splitParticipantsContainer.querySelectorAll("input[type='checkbox']");
      const participants = Array.from(checkboxes)
        .filter((cb) => cb.checked)
        .map((cb) => Number(cb.value));
      return { type: "equal", participants };
    }

    if (appState.activeSplitType === "shares") {
      const inputs = el.splitParticipantsContainer.querySelectorAll(".share-input");
      const shares = {};
      inputs.forEach((inp) => {
        const w = parseInt(inp.value, 10);
        if (!isNaN(w) && w > 0) {
          shares[inp.dataset.memberId] = w;
        }
      });
      return { type: "shares", shares };
    }

    if (appState.activeSplitType === "exact") {
      const inputs = el.splitParticipantsContainer.querySelectorAll(".exact-input");
      const amounts = {};
      inputs.forEach((inp) => {
        try {
          const paise = MoneyUtils.parseRupeesToPaise(inp.value.trim() || "0");
          if (paise > 0) {
            amounts[inp.dataset.memberId] = paise;
          }
        } catch {
          // ignore intermediate invalid typing
        }
      });
      return { type: "exact", amounts };
    }

    return { type: "equal" };
  }

  function updateLivePreview() {
    el.previewBreakdownList.innerHTML = "";
    if (el.previewNote) el.previewNote.textContent = "";

    let amountPaise = 0;
    try {
      amountPaise = MoneyUtils.parseRupeesToPaise(el.inputExpenseAmount.value);
    } catch {
      el.previewStatusPill.className = "badge badge-neutral";
      el.previewStatusPill.textContent = "Enter amount";
      return;
    }

    const splitConfig = getSplitConfigFromDOM();
    const result = MoneyUtils.calculatePreviewSplits(
      amountPaise,
      appState.activeSplitType,
      splitConfig,
      appState.members
    );

    if (!result.isValid) {
      el.previewStatusPill.className = "badge badge-warning";
      el.previewStatusPill.textContent = result.message || "Invalid split";
      return;
    }

    el.previewStatusPill.className = "badge badge-success";
    el.previewStatusPill.textContent = result.message || "Valid split";

    // Extra A: Show explanation if remainder distributed
    if (result.remainder && result.remainder > 0 && el.previewNote) {
      el.previewNote.textContent = `ℹ️ ${result.remainder} remainder paise allocated to the highest remainder / lowest member ID.`;
    }

    const keys = Object.keys(result.splits).map(Number).sort((a, b) => a - b);
    keys.forEach((mId) => {
      const row = document.createElement("div");
      row.className = "preview-breakdown-row";

      const name = document.createElement("span");
      name.className = "preview-member-name";
      name.textContent = (appState.membersMap.get(mId) || {}).name || `#${mId}`;

      const shareAmt = document.createElement("span");
      shareAmt.className = "preview-member-amount";
      shareAmt.textContent = MoneyUtils.formatPaiseToRupees(result.splits[mId]);

      row.appendChild(name);
      row.appendChild(shareAmt);
      el.previewBreakdownList.appendChild(row);
    });
  }

  async function handleSaveExpense(e) {
    e.preventDefault();
    if (appState.isOffline) {
      window.SplitFairApp.showToast("Cannot add expense while offline", "error");
      return;
    }

    el.errorExpenseDesc.textContent = "";
    el.errorExpenseAmount.textContent = "";
    el.errorExpensePayer.textContent = "";

    const description = el.inputExpenseDesc.value.trim();
    const rawAmount = el.inputExpenseAmount.value.trim();
    const paidBy = Number(el.selectExpensePayer.value);

    let hasError = false;

    if (!description) {
      el.errorExpenseDesc.textContent = "Description is required";
      hasError = true;
    } else if (description.length > 100) {
      el.errorExpenseDesc.textContent = "Description cannot exceed 100 characters";
      hasError = true;
    }

    let amountPaise;
    try {
      amountPaise = MoneyUtils.parseRupeesToPaise(rawAmount);
      if (amountPaise < 1 || amountPaise > MoneyUtils.MAX_EXPENSE_PAISE) {
        el.errorExpenseAmount.textContent = "Amount must be between ₹0.01 and ₹1,00,00,000.00";
        hasError = true;
      }
    } catch (err) {
      el.errorExpenseAmount.textContent = err.message;
      hasError = true;
    }

    if (!paidBy || !appState.membersMap.has(paidBy)) {
      el.errorExpensePayer.textContent = "Please select a valid payer";
      hasError = true;
    }

    const split = getSplitConfigFromDOM();

    if (split.type === "equal" && (!split.participants || split.participants.length === 0)) {
      window.SplitFairApp.showToast("Select at least one participant", "error");
      hasError = true;
    }

    if (hasError) return;

    window.SplitFairApp.setBtnLoading(el.btnSaveExpense, true);
    try {
      await API.addExpense(appState.currentGroupId, {
        description,
        amount: amountPaise,
        paidBy,
        split,
      });

      window.SplitFairApp.showToast("Expense added successfully!", "success");
      closeModal();
      await onDataChanged();
    } catch (err) {
      if (err.errors) {
        if (err.errors.description) el.errorExpenseDesc.textContent = err.errors.description;
        if (err.errors.amount) el.errorExpenseAmount.textContent = err.errors.amount;
        if (err.errors.paidBy) el.errorExpensePayer.textContent = err.errors.paidBy;
        if (err.errors["split.participants"]) window.SplitFairApp.showToast(err.errors["split.participants"], "error");
        if (err.errors["split.shares"]) window.SplitFairApp.showToast(err.errors["split.shares"], "error");
        if (err.errors["split.amounts"]) window.SplitFairApp.showToast(err.errors["split.amounts"], "error");
      } else {
        window.SplitFairApp.showToast(err.message || "Failed to add expense", "error");
      }
    } finally {
      window.SplitFairApp.setBtnLoading(el.btnSaveExpense, false);
    }
  }

  // =========================================================================
  // Quick Item Calculator (Approved Extra C)
  // =========================================================================
  function resetQuickCalc() {
    if (!el.quickCalcItemsList) return;
    el.quickCalcItemsList.innerHTML = "";
    addCalcItemRow();
    addCalcItemRow();
    updateCalcTotal();
  }

  function addCalcItemRow() {
    if (!el.quickCalcItemsList) return;
    const row = document.createElement("div");
    row.className = "calc-item-row";

    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.className = "form-input calc-item-desc";
    labelInput.placeholder = "Item name (e.g. Starter)";
    labelInput.maxLength = 50;
    labelInput.setAttribute("aria-label", "Item description");

    const amtInput = document.createElement("input");
    amtInput.type = "text";
    amtInput.inputMode = "decimal";
    amtInput.className = "form-input calc-item-amt";
    amtInput.placeholder = "₹ 0.00";
    amtInput.setAttribute("aria-label", "Item rupee amount");
    amtInput.addEventListener("input", updateCalcTotal);

    const btnRemove = document.createElement("button");
    btnRemove.type = "button";
    btnRemove.className = "btn-remove-member";
    btnRemove.innerHTML = "&times;";
    btnRemove.title = "Remove item";
    btnRemove.setAttribute("aria-label", "Remove item");
    btnRemove.addEventListener("click", () => {
      row.remove();
      updateCalcTotal();
    });

    row.appendChild(labelInput);
    row.appendChild(amtInput);
    row.appendChild(btnRemove);
    el.quickCalcItemsList.appendChild(row);
  }

  function updateCalcTotal() {
    if (!el.calcRunningTotal) return;
    let sumPaise = 0;
    let hasError = false;

    const amtInputs = el.quickCalcItemsList.querySelectorAll(".calc-item-amt");
    amtInputs.forEach((inp) => {
      const val = inp.value.trim();
      if (val) {
        try {
          const paise = MoneyUtils.parseRupeesToPaise(val);
          sumPaise += paise;
        } catch {
          hasError = true;
        }
      }
    });

    if (hasError && el.errorCalc) {
      el.errorCalc.textContent = "Check decimal format in item amounts";
    } else if (el.errorCalc) {
      el.errorCalc.textContent = "";
    }

    el.calcRunningTotal.textContent = MoneyUtils.formatPaiseToRupees(sumPaise);
    return sumPaise;
  }

  function handleApplyCalcTotal() {
    const totalPaise = updateCalcTotal();
    if (!totalPaise || totalPaise <= 0) {
      if (el.errorCalc) el.errorCalc.textContent = "Add at least one valid item amount";
      return;
    }
    const formattedRupees = MoneyUtils.formatPaiseToRupees(totalPaise, { withSymbol: false });
    el.inputExpenseAmount.value = formattedRupees;
    updateLivePreview();
    if (el.quickCalcDetails) {
      el.quickCalcDetails.open = false; // collapse
    }
    window.SplitFairApp.showToast(`Applied ${MoneyUtils.formatPaiseToRupees(totalPaise)} to expense amount`, "info");
  }

  window.ExpensesModule = {
    init,
    renderExpenses,
    openModal,
    closeModal,
  };
})();
