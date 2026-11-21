/**
 * SplitFair — Phone-First Single Page Application (SPA).
 * Pure Vanilla JavaScript (ES2020+). Zero Frameworks.
 */

(function () {
  "use strict";

  // =========================================================================
  // Application State
  // =========================================================================
  const state = {
    currentGroupId: null,
    group: null,
    members: [],
    membersMap: new Map(), // memberId -> { id, name }
    expenses: [],
    balances: [],
    settlements: [],
    currentTab: "expenses",
    activeSplitType: "equal",
    pollingInterval: null,
    isModalOpen: false,
    pendingPayment: null,
  };

  // =========================================================================
  // DOM Elements Cache
  // =========================================================================
  const el = {
    brandLink: document.getElementById("brand-link"),
    headerActions: document.getElementById("header-actions"),
    btnShareLink: document.getElementById("btn-share-link"),
    btnShareWhatsapp: document.getElementById("btn-share-whatsapp"),

    // Views
    viewHome: document.getElementById("view-home"),
    viewGroup: document.getElementById("view-group"),

    // Home View
    formCreateGroup: document.getElementById("form-create-group"),
    inputGroupName: document.getElementById("input-group-name"),
    memberCounterBadge: document.getElementById("member-counter-badge"),
    memberInputsList: document.getElementById("member-inputs-list"),
    btnAddMemberField: document.getElementById("btn-add-member-field"),
    btnCreateGroupSubmit: document.getElementById("btn-create-group-submit"),
    errorGroupName: document.getElementById("error-group-name"),
    errorMembers: document.getElementById("error-members"),

    formJoinGroup: document.getElementById("form-join-group"),
    inputJoinId: document.getElementById("input-join-id"),
    errorJoin: document.getElementById("error-join"),

    recentGroupsCard: document.getElementById("recent-groups-card"),
    recentGroupsList: document.getElementById("recent-groups-list"),

    // Group View Header
    btnBackHome: document.getElementById("btn-back-home"),
    groupTitle: document.getElementById("group-title"),
    groupIdBadge: document.getElementById("group-id-badge"),
    groupMemberCount: document.getElementById("group-member-count"),
    membersChipList: document.getElementById("members-chip-list"),
    btnOpenAddMember: document.getElementById("btn-open-add-member"),

    // Tabs & Panels
    tabBtnExpenses: document.getElementById("tab-btn-expenses"),
    tabBtnBalances: document.getElementById("tab-btn-balances"),
    tabBtnSettlements: document.getElementById("tab-btn-settlements"),
    tabBadgeExpenses: document.getElementById("tab-badge-expenses"),
    tabBadgeBalances: document.getElementById("tab-badge-balances"),
    tabBadgeSettlements: document.getElementById("tab-badge-settlements"),

    panelExpenses: document.getElementById("panel-expenses"),
    panelBalances: document.getElementById("panel-balances"),
    panelSettlements: document.getElementById("panel-settlements"),

    // Expenses Panel
    totalGroupSpend: document.getElementById("total-group-spend"),
    btnOpenAddExpense: document.getElementById("btn-open-add-expense"),
    expensesList: document.getElementById("expenses-list"),

    // Balances Panel
    balancesList: document.getElementById("balances-list"),
    balanceChecksumBadge: document.getElementById("balance-checksum-badge"),

    // Settlements Panel
    settlementsList: document.getElementById("settlements-list"),

    // Add Expense Modal
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
    btnSaveExpense: document.getElementById("btn-save-expense"),

    // Add Member Modal
    modalMember: document.getElementById("modal-member"),
    btnCloseMemberModal: document.getElementById("btn-close-member-modal"),
    btnCancelMember: document.getElementById("btn-cancel-member"),
    formAddMember: document.getElementById("form-add-member"),
    inputNewMemberName: document.getElementById("input-new-member-name"),
    errorNewMember: document.getElementById("error-new-member"),
    btnSaveMember: document.getElementById("btn-save-member"),

    // Payment Confirm Modal
    modalPayment: document.getElementById("modal-payment"),
    btnClosePaymentModal: document.getElementById("btn-close-payment-modal"),
    btnCancelPayment: document.getElementById("btn-cancel-payment"),
    paymentFromName: document.getElementById("payment-from-name"),
    paymentToName: document.getElementById("payment-to-name"),
    paymentAmountDisplay: document.getElementById("payment-amount-display"),
    btnConfirmPayment: document.getElementById("btn-confirm-payment"),

    // Toast Container
    toastContainer: document.getElementById("toast-container"),
  };

  // =========================================================================
  // Toast Notifications
  // =========================================================================
  function showToast(message, type = "info", duration = 3000) {
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;

    let icon = "ℹ️";
    if (type === "success") icon = "✅";
    if (type === "error") icon = "⚠️";

    const iconSpan = document.createElement("span");
    iconSpan.textContent = icon;

    const textSpan = document.createElement("span");
    textSpan.textContent = message;

    toast.appendChild(iconSpan);
    toast.appendChild(textSpan);
    el.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = "toastOut 0.25s forwards";
      toast.addEventListener("animationend", () => toast.remove());
    }, duration);
  }

  // =========================================================================
  // LocalStorage History
  // =========================================================================
  const RECENT_KEY = "splitfair_recent_groups";

  function getRecentGroups() {
    try {
      const data = localStorage.getItem(RECENT_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  function saveRecentGroup(group) {
    try {
      let list = getRecentGroups().filter((g) => g.id !== group.id);
      list.unshift({
        id: group.id,
        name: group.name,
        date: new Date().toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
      });
      list = list.slice(0, 5); // Keep top 5
      localStorage.setItem(RECENT_KEY, JSON.stringify(list));
      renderRecentGroups();
    } catch {
      // Storage quota or disabled
    }
  }

  function renderRecentGroups() {
    const list = getRecentGroups();
    if (list.length === 0) {
      el.recentGroupsCard.classList.add("hidden");
      return;
    }

    el.recentGroupsCard.classList.remove("hidden");
    el.recentGroupsList.innerHTML = "";

    list.forEach((item) => {
      const link = document.createElement("a");
      link.href = `#/groups/${encodeURIComponent(item.id)}`;
      link.className = "recent-group-item";

      const nameSpan = document.createElement("span");
      nameSpan.className = "recent-group-name";
      nameSpan.textContent = item.name;

      const dateSpan = document.createElement("span");
      dateSpan.className = "recent-group-date";
      dateSpan.textContent = item.date;

      link.appendChild(nameSpan);
      link.appendChild(dateSpan);
      el.recentGroupsList.appendChild(link);
    });
  }

  // =========================================================================
  // SPA Routing
  // =========================================================================
  function getRoute() {
    const hash = window.location.hash || "#/";
    const groupMatch = hash.match(/^#\/groups\/([A-Za-z0-9_-]+)/);
    if (groupMatch) {
      return { view: "group", gid: groupMatch[1] };
    }
    return { view: "home" };
  }

  function handleRoute() {
    const route = getRoute();

    if (route.view === "group") {
      state.currentGroupId = route.gid;
      el.viewHome.classList.add("hidden");
      el.viewGroup.classList.remove("hidden");
      el.headerActions.classList.remove("hidden");
      loadGroupData(route.gid, { isInitial: true });
      startPolling();
    } else {
      stopPolling();
      state.currentGroupId = null;
      state.group = null;
      el.viewHome.classList.remove("hidden");
      el.viewGroup.classList.add("hidden");
      el.headerActions.classList.add("hidden");
      renderRecentGroups();
    }
  }

  window.addEventListener("hashchange", handleRoute);
  window.addEventListener("DOMContentLoaded", () => {
    initHomeView();
    initGroupView();
    initModals();
    handleRoute();
  });

  // =========================================================================
  // Polling Engine (5-Second Sync)
  // =========================================================================
  function startPolling() {
    stopPolling();
    state.pollingInterval = setInterval(() => {
      if (state.currentGroupId && !state.isModalOpen) {
        loadGroupData(state.currentGroupId, { isBackgroundSync: true });
      }
    }, 5000);
  }

  function stopPolling() {
    if (state.pollingInterval) {
      clearInterval(state.pollingInterval);
      state.pollingInterval = null;
    }
  }

  // =========================================================================
  // Data Loading & Syncing
  // =========================================================================
  async function loadGroupData(gid, { isInitial = false, isBackgroundSync = false } = {}) {
    try {
      if (isInitial) {
        el.groupTitle.textContent = "Loading group...";
        el.expensesList.innerHTML = `<div class="empty-state"><span class="empty-icon">⏳</span><p class="empty-title">Loading expenses...</p></div>`;
      }

      // Parallel fetching for ultra-fast sync
      const [group, expenses, balancesRes, settlementsRes] = await Promise.all([
        API.getGroup(gid),
        API.listExpenses(gid),
        API.getBalances(gid),
        API.getSettlements(gid),
      ]);

      state.group = group;
      state.members = group.members || [];
      state.membersMap = new Map(state.members.map((m) => [m.id, m]));
      state.expenses = expenses || [];
      state.balances = (balancesRes && balancesRes.balances) || [];
      state.settlements = (settlementsRes && settlementsRes.transfers) || [];

      // Save to recent groups in background
      saveRecentGroup(group);

      // Render updated UI
      renderGroupHeader();
      renderExpensesTab();
      renderBalancesTab();
      renderSettlementsTab();
    } catch (err) {
      if (err.status === 404) {
        showToast("Group not found. Redirecting to home.", "error");
        window.location.hash = "#/";
      } else if (!isBackgroundSync) {
        showToast(err.message || "Failed to load group data", "error");
      }
    }
  }

  // =========================================================================
  // Screen 1: Home View Logic
  // =========================================================================
  function initHomeView() {
    renderMemberInputRows(["", ""]);

    el.btnAddMemberField.addEventListener("click", () => {
      const currentValues = getMemberInputs();
      if (currentValues.length >= 20) {
        showToast("Maximum 20 members allowed per group", "warning");
        return;
      }
      currentValues.push("");
      renderMemberInputRows(currentValues);
      const newInputs = el.memberInputsList.querySelectorAll(".member-name-input");
      if (newInputs.length > 0) {
        newInputs[newInputs.length - 1].focus();
      }
    });

    el.formCreateGroup.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearErrors();

      const name = el.inputGroupName.value.trim();
      const members = getMemberInputs();

      let hasError = false;
      if (!name) {
        el.errorGroupName.textContent = "Group name is required";
        hasError = true;
      }

      if (members.length < 2) {
        el.errorMembers.textContent = "At least 2 member names are required";
        hasError = true;
      }

      // Duplicate check (case-insensitive)
      const seen = new Set();
      for (const m of members) {
        const lower = m.toLowerCase();
        if (seen.has(lower)) {
          el.errorMembers.textContent = `Duplicate member name '${m}' is not allowed`;
          hasError = true;
          break;
        }
        seen.add(lower);
      }

      if (hasError) return;

      setBtnLoading(el.btnCreateGroupSubmit, true);
      try {
        const group = await API.createGroup({ name, members });
        showToast("Group created! Opening...", "success");

        // Copy link to clipboard
        const shareUrl = `${window.location.origin}${window.location.pathname}#/groups/${group.id}`;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(shareUrl).then(() => {
            showToast("Shareable link copied to clipboard!", "success");
          }).catch(() => {});
        }

        window.location.hash = `#/groups/${group.id}`;
      } catch (err) {
        if (err.errors) {
          if (err.errors.name) el.errorGroupName.textContent = err.errors.name;
          if (err.errors.members) el.errorMembers.textContent = err.errors.members;
        } else {
          showToast(err.message || "Failed to create group", "error");
        }
      } finally {
        setBtnLoading(el.btnCreateGroupSubmit, false);
      }
    });

    el.formJoinGroup.addEventListener("submit", (e) => {
      e.preventDefault();
      el.errorJoin.textContent = "";
      const val = el.inputJoinId.value.trim();
      if (!val) {
        el.errorJoin.textContent = "Please enter a group ID or link";
        return;
      }

      // Extract ID from full URL if pasted
      let gid = val;
      const match = val.match(/#\/groups\/([A-Za-z0-9_-]+)/);
      if (match) {
        gid = match[1];
      }

      window.location.hash = `#/groups/${encodeURIComponent(gid)}`;
      el.inputJoinId.value = "";
    });
  }

  function getMemberInputs() {
    const inputs = el.memberInputsList.querySelectorAll(".member-name-input");
    return Array.from(inputs)
      .map((input) => input.value.trim())
      .filter((v) => v.length > 0);
  }

  function renderMemberInputRows(values) {
    el.memberInputsList.innerHTML = "";
    values.forEach((val, idx) => {
      const row = document.createElement("div");
      row.className = "member-input-row";

      const idxBadge = document.createElement("span");
      idxBadge.className = "member-idx-badge";
      idxBadge.textContent = String(idx + 1);

      const input = document.createElement("input");
      input.type = "text";
      input.className = "form-input member-name-input";
      input.placeholder = `Member ${idx + 1} name`;
      input.value = val;
      input.maxLength = 50;
      input.autocomplete = "off";

      row.appendChild(idxBadge);
      row.appendChild(input);

      if (values.length > 2) {
        const btnRemove = document.createElement("button");
        btnRemove.type = "button";
        btnRemove.className = "btn-remove-member";
        btnRemove.innerHTML = "&times;";
        btnRemove.title = "Remove member";
        btnRemove.addEventListener("click", () => {
          const updated = getMemberInputs();
          updated.splice(idx, 1);
          renderMemberInputRows(updated.length >= 2 ? updated : ["", ""]);
        });
        row.appendChild(btnRemove);
      }

      el.memberInputsList.appendChild(row);
    });

    el.memberCounterBadge.textContent = `${values.length}/20 members`;
    el.btnAddMemberField.disabled = values.length >= 20;
  }

  function clearErrors() {
    el.errorGroupName.textContent = "";
    el.errorMembers.textContent = "";
    el.errorJoin.textContent = "";
  }

  // =========================================================================
  // Screen 2: Group View Logic
  // =========================================================================
  function initGroupView() {
    // Back to Home
    el.btnBackHome.addEventListener("click", () => {
      window.location.hash = "#/";
    });

    // Share link
    el.btnShareLink.addEventListener("click", () => {
      const url = window.location.href;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
          showToast("Group link copied to clipboard!", "success");
        }).catch(() => {
          prompt("Copy this shareable link:", url);
        });
      } else {
        prompt("Copy this shareable link:", url);
      }
    });

    // Share via WhatsApp
    el.btnShareWhatsapp.addEventListener("click", () => {
      if (!state.group) return;
      const text = `Join our expense group '${state.group.name}' on SplitFair:\n${window.location.href}`;
      const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
      window.open(waUrl, "_blank");
    });

    // Group ID badge click to copy
    el.groupIdBadge.addEventListener("click", () => {
      if (state.currentGroupId && navigator.clipboard) {
        navigator.clipboard.writeText(state.currentGroupId).then(() => {
          showToast(`Group ID copied: ${state.currentGroupId}`, "info");
        });
      }
    });

    // Tab Navigation
    const tabs = [
      { btn: el.tabBtnExpenses, panel: el.panelExpenses, key: "expenses" },
      { btn: el.tabBtnBalances, panel: el.panelBalances, key: "balances" },
      { btn: el.tabBtnSettlements, panel: el.panelSettlements, key: "settlements" },
    ];

    tabs.forEach(({ btn, panel, key }) => {
      btn.addEventListener("click", () => {
        state.currentTab = key;
        tabs.forEach((t) => {
          const isActive = t.key === key;
          t.btn.classList.toggle("active", isActive);
          t.btn.setAttribute("aria-selected", String(isActive));
          t.panel.classList.toggle("hidden", !isActive);
          t.panel.classList.toggle("active", isActive);
        });
      });
    });

    // Open Add Member
    el.btnOpenAddMember.addEventListener("click", () => {
      if (state.members.length >= 20) {
        showToast("Maximum group limit of 20 members reached", "warning");
        return;
      }
      openMemberModal();
    });

    // Open Add Expense
    el.btnOpenAddExpense.addEventListener("click", () => {
      openExpenseModal();
    });
  }

  function renderGroupHeader() {
    if (!state.group) return;

    // Safe assignment using textContent
    el.groupTitle.textContent = state.group.name;
    el.groupIdBadge.textContent = state.group.id;
    el.groupMemberCount.textContent = `${state.members.length} members`;

    // Member Chips
    el.membersChipList.innerHTML = "";
    state.members.forEach((m) => {
      const chip = document.createElement("div");
      chip.className = "member-chip";

      const idBadge = document.createElement("span");
      idBadge.className = "member-chip-id";
      idBadge.textContent = `#${m.id}`;

      const nameText = document.createTextNode(` ${m.name}`);

      chip.appendChild(idBadge);
      chip.appendChild(nameText);
      el.membersChipList.appendChild(chip);
    });

    // Update tab badges
    el.tabBadgeExpenses.textContent = String(state.expenses.length);
    el.tabBadgeBalances.textContent = String(state.members.length);
    el.tabBadgeSettlements.textContent = String(state.settlements.length);
  }

  // =========================================================================
  // Tab 1: Expenses Panel
  // =========================================================================
  function renderExpensesTab() {
    // Total spend
    const totalSpendPaise = state.expenses.reduce((acc, exp) => acc + exp.amount, 0);
    el.totalGroupSpend.textContent = MoneyUtils.formatPaiseToRupees(totalSpendPaise);

    el.expensesList.innerHTML = "";

    if (state.expenses.length === 0) {
      el.expensesList.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">🧾</span>
          <p class="empty-title">No expenses yet</p>
          <p class="empty-desc">Tap '+ Add Expense' to record the first shared bill.</p>
        </div>
      `;
      return;
    }

    state.expenses.forEach((expense) => {
      const card = document.createElement("div");
      card.className = "expense-card";

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

      const payerName = (state.membersMap.get(expense.paidBy) || {}).name || `Member #${expense.paidBy}`;
      const payerSpan = document.createElement("span");
      payerSpan.textContent = `Paid by ${payerName}`;

      const dateSpan = document.createElement("span");
      dateSpan.textContent = `• ${new Date(expense.createdAt).toLocaleDateString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;

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
          const mName = (state.membersMap.get(mId) || {}).name || `#${mId}`;
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
      btnDelete.className = "btn btn-danger-outline btn-sm";
      btnDelete.textContent = "Delete";
      btnDelete.addEventListener("click", () => confirmDeleteExpense(expense));

      actions.appendChild(btnDelete);
      card.appendChild(actions);

      el.expensesList.appendChild(card);
    });
  }

  async function confirmDeleteExpense(expense) {
    const ok = window.confirm(`Delete expense "${expense.description}" of ${MoneyUtils.formatPaiseToRupees(expense.amount)}?\nThis will recalculate all group balances.`);
    if (!ok) return;

    try {
      await API.deleteExpense(state.currentGroupId, expense.id);
      showToast("Expense deleted", "success");
      await loadGroupData(state.currentGroupId);
    } catch (err) {
      showToast(err.message || "Failed to delete expense", "error");
    }
  }

  // =========================================================================
  // Tab 2: Balances Panel
  // =========================================================================
  function renderBalancesTab() {
    el.balancesList.innerHTML = "";

    if (state.balances.length === 0) {
      el.balancesList.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">⚖️</span>
          <p class="empty-title">No balances to display</p>
          <p class="empty-desc">Add members and expenses to view net balances.</p>
        </div>
      `;
      return;
    }

    // Verify net balance checksum sum === 0
    const sumBalances = state.balances.reduce((acc, b) => acc + b.balance, 0);
    if (sumBalances === 0) {
      el.balanceChecksumBadge.className = "badge badge-success";
      el.balanceChecksumBadge.textContent = "Balanced (Σ = ₹0.00)";
    } else {
      el.balanceChecksumBadge.className = "badge badge-danger";
      el.balanceChecksumBadge.textContent = `Imbalanced (Σ = ${MoneyUtils.formatPaiseToRupees(sumBalances)})`;
    }

    state.balances.forEach((b) => {
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

      // Amount & Status
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

  // =========================================================================
  // Tab 3: Settle Up Panel (Fewest Payments)
  // =========================================================================
  function renderSettlementsTab() {
    el.settlementsList.innerHTML = "";

    if (state.settlements.length === 0) {
      el.settlementsList.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">🎉</span>
          <p class="empty-title">All settled up!</p>
          <p class="empty-desc">No outstanding balances. Everyone has paid their fair share.</p>
        </div>
      `;
      return;
    }

    state.settlements.forEach((transfer) => {
      const fromMember = state.membersMap.get(transfer.from) || { name: `Member #${transfer.from}` };
      const toMember = state.membersMap.get(transfer.to) || { name: `Member #${transfer.to}` };

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

      // Actions: Mark as Paid & WhatsApp Reminder
      const actions = document.createElement("div");
      actions.className = "settlement-actions";

      const btnPay = document.createElement("button");
      btnPay.className = "btn btn-success btn-md";
      btnPay.innerHTML = `<span>✓</span> Mark as Paid`;
      btnPay.addEventListener("click", () => openPaymentConfirmModal(transfer, fromMember, toMember));

      const btnRemind = document.createElement("button");
      btnRemind.className = "btn btn-whatsapp btn-md";
      btnRemind.innerHTML = `<span>💬</span> Remind`;
      btnRemind.addEventListener("click", () => sendWhatsAppReminder(transfer, fromMember, toMember));

      actions.appendChild(btnPay);
      actions.appendChild(btnRemind);
      card.appendChild(actions);

      el.settlementsList.appendChild(card);
    });
  }

  function sendWhatsAppReminder(transfer, fromMember, toMember) {
    const formattedAmt = MoneyUtils.formatPaiseToRupees(transfer.amount);
    const text = `Hi ${fromMember.name}! 👋\nPlease settle ${formattedAmt} with ${toMember.name} for group '${state.group.name}'.\nView details: ${window.location.href}`;
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  }

  // =========================================================================
  // Modals & Bottom Sheets Logic
  // =========================================================================
  function initModals() {
    // Expense Modal Close Handlers
    el.btnCloseExpenseModal.addEventListener("click", closeExpenseModal);
    el.btnCancelExpense.addEventListener("click", closeExpenseModal);
    el.modalExpense.addEventListener("click", (e) => {
      if (e.target === el.modalExpense) closeExpenseModal();
    });

    // Member Modal Close Handlers
    el.btnCloseMemberModal.addEventListener("click", closeMemberModal);
    el.btnCancelMember.addEventListener("click", closeMemberModal);
    el.modalMember.addEventListener("click", (e) => {
      if (e.target === el.modalMember) closeMemberModal();
    });

    // Payment Modal Close Handlers
    el.btnClosePaymentModal.addEventListener("click", closePaymentModal);
    el.btnCancelPayment.addEventListener("click", closePaymentModal);
    el.modalPayment.addEventListener("click", (e) => {
      if (e.target === el.modalPayment) closePaymentModal();
    });

    // Split Segment Controls
    el.segmentBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        el.segmentBtns.forEach((b) => {
          b.classList.remove("active");
          b.setAttribute("aria-checked", "false");
        });
        btn.classList.add("active");
        btn.setAttribute("aria-checked", "true");
        state.activeSplitType = btn.dataset.type;
        renderSplitConfiguration();
        updateLivePreview();
      });
    });

    // Toggle All Participants Button
    el.btnToggleAllParticipants.addEventListener("click", () => {
      if (state.activeSplitType === "equal") {
        const checkboxes = el.splitParticipantsContainer.querySelectorAll("input[type='checkbox']");
        const allChecked = Array.from(checkboxes).every((cb) => cb.checked);
        checkboxes.forEach((cb) => (cb.checked = !allChecked));
        el.btnToggleAllParticipants.textContent = allChecked ? "Select All" : "Deselect All";
        updateLivePreview();
      }
    });

    // Amount & Description Input Listeners for Instant Live Preview
    el.inputExpenseAmount.addEventListener("input", updateLivePreview);
    el.selectExpensePayer.addEventListener("change", updateLivePreview);

    // Add Expense Form Submit
    el.formAddExpense.addEventListener("submit", handleSaveExpense);

    // Add Member Form Submit
    el.formAddMember.addEventListener("submit", handleSaveMember);

    // Confirm Payment Submit
    el.btnConfirmPayment.addEventListener("click", handleConfirmPayment);
  }

  // --- ADD EXPENSE MODAL ---
  function openExpenseModal() {
    state.isModalOpen = true;
    el.formAddExpense.reset();
    el.errorExpenseDesc.textContent = "";
    el.errorExpenseAmount.textContent = "";
    el.errorExpensePayer.textContent = "";

    // Reset split type to equal
    state.activeSplitType = "equal";
    el.segmentBtns.forEach((b) => {
      const isEq = b.dataset.type === "equal";
      b.classList.toggle("active", isEq);
      b.setAttribute("aria-checked", String(isEq));
    });

    // Populate Paid By dropdown
    el.selectExpensePayer.innerHTML = "";
    state.members.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = String(m.id);
      opt.textContent = `${m.name} (#${m.id})`;
      el.selectExpensePayer.appendChild(opt);
    });

    renderSplitConfiguration();
    updateLivePreview();

    el.modalExpense.classList.remove("hidden");
    el.modalExpense.setAttribute("aria-hidden", "false");
    el.inputExpenseDesc.focus();
  }

  function closeExpenseModal() {
    state.isModalOpen = false;
    el.modalExpense.classList.add("hidden");
    el.modalExpense.setAttribute("aria-hidden", "true");
  }

  function renderSplitConfiguration() {
    el.splitParticipantsContainer.innerHTML = "";

    if (state.activeSplitType === "equal") {
      el.btnToggleAllParticipants.classList.remove("hidden");
      el.btnToggleAllParticipants.textContent = "Deselect All";

      state.members.forEach((m) => {
        const row = document.createElement("div");
        row.className = "split-participant-row";

        const label = document.createElement("label");
        label.className = "split-participant-label";

        const cb = document.createElement("input");
        cb.type = "checkbox";
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
    } else if (state.activeSplitType === "shares") {
      el.btnToggleAllParticipants.classList.add("hidden");

      state.members.forEach((m) => {
        const row = document.createElement("div");
        row.className = "split-participant-row";

        const nameSpan = document.createElement("span");
        nameSpan.className = "split-participant-label";
        nameSpan.textContent = `${m.name} (#${m.id})`;

        const input = document.createElement("input");
        input.type = "number";
        input.className = "split-input-field share-input";
        input.min = "1";
        input.max = "1000";
        input.value = "1";
        input.dataset.memberId = String(m.id);
        input.addEventListener("input", updateLivePreview);

        row.appendChild(nameSpan);
        row.appendChild(input);
        el.splitParticipantsContainer.appendChild(row);
      });
    } else if (state.activeSplitType === "exact") {
      el.btnToggleAllParticipants.classList.add("hidden");

      state.members.forEach((m) => {
        const row = document.createElement("div");
        row.className = "split-participant-row";

        const nameSpan = document.createElement("span");
        nameSpan.className = "split-participant-label";
        nameSpan.textContent = `${m.name} (#${m.id})`;

        const input = document.createElement("input");
        input.type = "text";
        input.inputMode = "decimal";
        input.className = "split-input-field exact-input";
        input.placeholder = "0.00";
        input.dataset.memberId = String(m.id);
        input.addEventListener("input", updateLivePreview);

        row.appendChild(nameSpan);
        row.appendChild(input);
        el.splitParticipantsContainer.appendChild(row);
      });
    }
  }

  function getSplitConfigFromDOM() {
    if (state.activeSplitType === "equal") {
      const checkboxes = el.splitParticipantsContainer.querySelectorAll("input[type='checkbox']");
      const participants = Array.from(checkboxes)
        .filter((cb) => cb.checked)
        .map((cb) => Number(cb.value));
      return { type: "equal", participants };
    }

    if (state.activeSplitType === "shares") {
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

    if (state.activeSplitType === "exact") {
      const inputs = el.splitParticipantsContainer.querySelectorAll(".exact-input");
      const amounts = {};
      inputs.forEach((inp) => {
        try {
          const paise = MoneyUtils.parseRupeesToPaise(inp.value.trim() || "0");
          if (paise > 0) {
            amounts[inp.dataset.memberId] = paise;
          }
        } catch {
          // Incomplete decimal or invalid
        }
      });
      return { type: "exact", amounts };
    }

    return { type: "equal" };
  }

  function updateLivePreview() {
    el.previewBreakdownList.innerHTML = "";

    let amountPaise = 0;
    try {
      amountPaise = MoneyUtils.parseRupeesToPaise(el.inputExpenseAmount.value);
    } catch {
      el.previewStatusPill.className = "badge badge-neutral";
      el.previewStatusPill.textContent = "Enter valid amount";
      return;
    }

    const splitConfig = getSplitConfigFromDOM();
    const result = MoneyUtils.calculatePreviewSplits(
      amountPaise,
      state.activeSplitType,
      splitConfig,
      state.members
    );

    if (!result.isValid) {
      el.previewStatusPill.className = "badge badge-warning";
      el.previewStatusPill.textContent = result.message || "Invalid split";
      return;
    }

    el.previewStatusPill.className = "badge badge-success";
    el.previewStatusPill.textContent = result.message || "Valid split";

    const keys = Object.keys(result.splits).map(Number).sort((a, b) => a - b);
    keys.forEach((mId) => {
      const row = document.createElement("div");
      row.className = "preview-breakdown-row";

      const name = document.createElement("span");
      name.className = "preview-member-name";
      name.textContent = (state.membersMap.get(mId) || {}).name || `#${mId}`;

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

    if (!paidBy || !state.membersMap.has(paidBy)) {
      el.errorExpensePayer.textContent = "Please select a valid payer";
      hasError = true;
    }

    const split = getSplitConfigFromDOM();

    // Validate participants for equal split
    if (split.type === "equal" && (!split.participants || split.participants.length === 0)) {
      showToast("Select at least one participant", "error");
      hasError = true;
    }

    if (hasError) return;

    setBtnLoading(el.btnSaveExpense, true);
    try {
      await API.addExpense(state.currentGroupId, {
        description,
        amount: amountPaise,
        paidBy,
        split,
      });

      showToast("Expense added successfully!", "success");
      closeExpenseModal();
      await loadGroupData(state.currentGroupId);
    } catch (err) {
      if (err.errors) {
        if (err.errors.description) el.errorExpenseDesc.textContent = err.errors.description;
        if (err.errors.amount) el.errorExpenseAmount.textContent = err.errors.amount;
        if (err.errors.paidBy) el.errorExpensePayer.textContent = err.errors.paidBy;
        if (err.errors["split.participants"]) showToast(err.errors["split.participants"], "error");
        if (err.errors["split.shares"]) showToast(err.errors["split.shares"], "error");
        if (err.errors["split.amounts"]) showToast(err.errors["split.amounts"], "error");
      } else {
        showToast(err.message || "Failed to add expense", "error");
      }
    } finally {
      setBtnLoading(el.btnSaveExpense, false);
    }
  }

  // --- ADD MEMBER MODAL ---
  function openMemberModal() {
    state.isModalOpen = true;
    el.formAddMember.reset();
    el.errorNewMember.textContent = "";
    el.modalMember.classList.remove("hidden");
    el.modalMember.setAttribute("aria-hidden", "false");
    el.inputNewMemberName.focus();
  }

  function closeMemberModal() {
    state.isModalOpen = false;
    el.modalMember.classList.add("hidden");
    el.modalMember.setAttribute("aria-hidden", "true");
  }

  async function handleSaveMember(e) {
    e.preventDefault();
    el.errorNewMember.textContent = "";
    const name = el.inputNewMemberName.value.trim();

    if (!name) {
      el.errorNewMember.textContent = "Member name is required";
      return;
    }

    setBtnLoading(el.btnSaveMember, true);
    try {
      await API.addMember(state.currentGroupId, name);
      showToast(`Added ${name} to group!`, "success");
      closeMemberModal();
      await loadGroupData(state.currentGroupId);
    } catch (err) {
      if (err.status === 409) {
        el.errorNewMember.textContent = "A member with this name already exists in the group";
      } else if (err.errors && err.errors.members) {
        el.errorNewMember.textContent = err.errors.members;
      } else {
        el.errorNewMember.textContent = err.message || "Failed to add member";
      }
    } finally {
      setBtnLoading(el.btnSaveMember, false);
    }
  }

  // --- CONFIRM PAYMENT MODAL ---
  function openPaymentConfirmModal(transfer, fromMember, toMember) {
    state.isModalOpen = true;
    state.pendingPayment = transfer;

    el.paymentFromName.textContent = fromMember.name;
    el.paymentToName.textContent = toMember.name;
    el.paymentAmountDisplay.textContent = MoneyUtils.formatPaiseToRupees(transfer.amount);

    el.modalPayment.classList.remove("hidden");
    el.modalPayment.setAttribute("aria-hidden", "false");
  }

  function closePaymentModal() {
    state.isModalOpen = false;
    state.pendingPayment = null;
    el.modalPayment.classList.add("hidden");
    el.modalPayment.setAttribute("aria-hidden", "true");
  }

  async function handleConfirmPayment() {
    if (!state.pendingPayment) return;

    setBtnLoading(el.btnConfirmPayment, true);
    try {
      await API.recordPayment(state.currentGroupId, {
        from: state.pendingPayment.from,
        to: state.pendingPayment.to,
        amount: state.pendingPayment.amount,
      });

      showToast("Payment recorded! Balances updated.", "success");
      closePaymentModal();
      await loadGroupData(state.currentGroupId);
    } catch (err) {
      showToast(err.message || "Failed to record payment", "error");
    } finally {
      setBtnLoading(el.btnConfirmPayment, false);
    }
  }

  // =========================================================================
  // UI Helpers
  // =========================================================================
  function setBtnLoading(btn, isLoading) {
    btn.disabled = isLoading;
    const text = btn.querySelector(".btn-text");
    const spinner = btn.querySelector(".btn-spinner");
    if (text) text.classList.toggle("hidden", isLoading);
    if (spinner) spinner.classList.toggle("hidden", !isLoading);
  }
})();
