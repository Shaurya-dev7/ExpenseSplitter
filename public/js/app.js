/**
 * SplitFair — Core Orchestrator & Router (Walkthrough-Ready).
 * Manages state, routing, live polling, offline detection, and global notifications.
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
    isFetching: false,
    isModalOpen: false,
    isOffline: !navigator.onLine,
    pendingPayment: null,
  };

  // =========================================================================
  // DOM Elements Cache
  // =========================================================================
  const el = {
    offlineBanner: document.getElementById("offline-banner"),
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
    btnOpenAddExpense: document.getElementById("btn-open-add-expense"),

    // Tabs & Panels
    tabBtnExpenses: document.getElementById("tab-btn-expenses"),
    tabBtnBalances: document.getElementById("tab-btn-balances"),
    tabBtnSettlements: document.getElementById("tab-btn-settlements"),

    panelExpenses: document.getElementById("panel-expenses"),
    panelBalances: document.getElementById("panel-balances"),
    panelSettlements: document.getElementById("panel-settlements"),

    // Add Member Modal
    modalMember: document.getElementById("modal-member"),
    btnCloseMemberModal: document.getElementById("btn-close-member-modal"),
    btnCancelMember: document.getElementById("btn-cancel-member"),
    formAddMember: document.getElementById("form-add-member"),
    inputNewMemberName: document.getElementById("input-new-member-name"),
    errorNewMember: document.getElementById("error-new-member"),
    btnSaveMember: document.getElementById("btn-save-member"),

    // Toast Container
    toastContainer: document.getElementById("toast-container"),
  };

  // =========================================================================
  // Toast Notifications & Helpers
  // =========================================================================
  function showToast(message, type = "info", duration = 3000) {
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");

    let icon = "ℹ️";
    if (type === "success") icon = "✅";
    if (type === "error") icon = "⚠️";
    if (type === "warning") icon = "🔔";

    const iconSpan = document.createElement("span");
    iconSpan.setAttribute("aria-hidden", "true");
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

  function copyToClipboard(text, { successMsg = "Copied to clipboard!", fallbackPrompt = "Copy to clipboard:" } = {}) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => showToast(successMsg, "success"))
        .catch(() => legacyCopy(text, fallbackPrompt));
    } else {
      legacyCopy(text, fallbackPrompt);
    }
  }

  function legacyCopy(text, fallbackPrompt) {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const successful = document.execCommand("copy");
      document.body.removeChild(textarea);
      if (successful) {
        showToast("Copied to clipboard!", "success");
      } else {
        window.prompt(fallbackPrompt, text);
      }
    } catch {
      window.prompt(fallbackPrompt, text);
    }
  }

  function setBtnLoading(btn, isLoading) {
    btn.disabled = isLoading;
    const text = btn.querySelector(".btn-text");
    const spinner = btn.querySelector(".btn-spinner");
    if (text) text.classList.toggle("hidden", isLoading);
    if (spinner) spinner.classList.toggle("hidden", !isLoading);
  }

  // =========================================================================
  // Online / Offline State Management
  // =========================================================================
  function updateOnlineStatus() {
    state.isOffline = !navigator.onLine;
    if (el.offlineBanner) {
      el.offlineBanner.classList.toggle("hidden", !state.isOffline);
    }
    if (state.isOffline) {
      showToast("You are currently offline. Changes cannot be saved.", "warning");
    } else {
      showToast("Back online! Resuming sync.", "info");
      if (state.currentGroupId) {
        loadGroupData(state.currentGroupId, { isBackgroundSync: true });
      }
    }
  }

  window.addEventListener("online", updateOnlineStatus);
  window.addEventListener("offline", updateOnlineStatus);

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
      list = list.slice(0, 5);
      localStorage.setItem(RECENT_KEY, JSON.stringify(list));
      renderRecentGroups();
    } catch {
      // ignore
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
  // Router Logic (Hash, Query Param, or Direct ID)
  // =========================================================================
  function getRoute() {
    // 1. Check query parameter ?group=xxx
    const urlParams = new URLSearchParams(window.location.search);
    const queryGid = urlParams.get("group");
    if (queryGid && /^[A-Za-z0-9_-]{10,}$/.test(queryGid.trim())) {
      // Canonicalize to hash
      window.location.search = "";
      window.location.hash = `#/groups/${queryGid.trim()}`;
      return { view: "group", gid: queryGid.trim() };
    }

    // 2. Check hash #/groups/:gid
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

  // =========================================================================
  // Polling Engine (4-Second Safe Sync)
  // =========================================================================
  function startPolling() {
    stopPolling();
    state.pollingInterval = setInterval(() => {
      if (state.currentGroupId && !state.isModalOpen && !state.isOffline && !state.isFetching) {
        loadGroupData(state.currentGroupId, { isBackgroundSync: true });
      }
    }, 4000);
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
    if (state.isFetching) return;
    state.isFetching = true;

    try {
      if (isInitial) {
        el.groupTitle.textContent = "Loading group...";
      }

      // Parallel fetch of group, expenses, balances, and settlements
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

      saveRecentGroup(group);

      renderGroupHeader();
      window.ExpensesModule.renderExpenses();
      window.BalancesModule.renderBalances();
      window.SettlementsModule.renderSettlements();
    } catch (err) {
      if (err.status === 404) {
        showToast("Group not found. Redirecting to home.", "error");
        window.location.hash = "#/";
      } else if (!isBackgroundSync) {
        showToast(err.message || "Failed to load group data", "error");
      }
    } finally {
      state.isFetching = false;
    }
  }

  // =========================================================================
  // Home View Logic
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
      clearHomeErrors();

      if (state.isOffline) {
        showToast("Cannot create group while offline", "error");
        return;
      }

      const name = el.inputGroupName.value.trim();
      const members = getMemberInputs();

      let hasError = false;
      if (!name) {
        el.errorGroupName.textContent = "Group name is required";
        hasError = true;
      } else if (name.length > 60) {
        el.errorGroupName.textContent = "Group name cannot exceed 60 characters";
        hasError = true;
      }

      if (members.length < 2) {
        el.errorMembers.textContent = "At least 2 member names are required";
        hasError = true;
      }

      const seen = new Set();
      for (const m of members) {
        if (m.length > 40) {
          el.errorMembers.textContent = `Member name '${m}' exceeds 40 characters limit`;
          hasError = true;
          break;
        }
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

        const shareUrl = `${window.location.origin}${window.location.pathname}#/groups/${group.id}`;
        copyToClipboard(shareUrl, { successMsg: "Group link copied to clipboard!" });

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

      // Check URL match or query param or raw ID
      let gid = val;
      const hashMatch = val.match(/#\/groups\/([A-Za-z0-9_-]+)/);
      const queryMatch = val.match(/[?&]group=([A-Za-z0-9_-]+)/);

      if (hashMatch) {
        gid = hashMatch[1];
      } else if (queryMatch) {
        gid = queryMatch[1];
      }

      if (!/^[A-Za-z0-9_-]{10,}$/.test(gid)) {
        el.errorJoin.textContent = "Invalid group ID or link format (must be at least 10 URL-safe characters)";
        return;
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
      input.id = `input-member-${idx + 1}`;
      input.className = "form-input member-name-input";
      input.placeholder = `Member ${idx + 1} name`;
      input.value = val;
      input.maxLength = 40;
      input.autocomplete = "off";
      input.setAttribute("aria-label", `Member ${idx + 1} name`);

      row.appendChild(idxBadge);
      row.appendChild(input);

      if (values.length > 2) {
        const btnRemove = document.createElement("button");
        btnRemove.type = "button";
        btnRemove.className = "btn-remove-member";
        btnRemove.innerHTML = "&times;";
        btnRemove.title = "Remove member";
        btnRemove.setAttribute("aria-label", `Remove member ${idx + 1}`);
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

  function clearHomeErrors() {
    el.errorGroupName.textContent = "";
    el.errorMembers.textContent = "";
    el.errorJoin.textContent = "";
  }

  // =========================================================================
  // Group View Header & Controls
  // =========================================================================
  function initGroupView() {
    el.btnBackHome.addEventListener("click", () => {
      window.location.hash = "#/";
    });

    // Share Group Link: navigator.share with fallback
    el.btnShareLink.addEventListener("click", () => {
      const url = window.location.href;
      const title = (state.group && state.group.name) || "SplitFair Expense Group";
      const shareData = {
        title: `Join ${title} on SplitFair`,
        text: `View and split expenses with our group on SplitFair:`,
        url,
      };

      if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
        navigator.share(shareData).catch((err) => {
          if (err.name !== "AbortError") {
            copyToClipboard(url, { successMsg: "Group link copied to clipboard!" });
          }
        });
      } else {
        copyToClipboard(url, { successMsg: "Group link copied to clipboard!" });
      }
    });

    // Share via WhatsApp direct
    el.btnShareWhatsapp.addEventListener("click", () => {
      if (!state.group) return;
      const text = `Join our expense group '${state.group.name}' on SplitFair:\n${window.location.href}`;
      const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
      window.open(waUrl, "_blank");
    });

    // Group ID badge click to copy
    el.groupIdBadge.addEventListener("click", () => {
      if (state.currentGroupId) {
        copyToClipboard(state.currentGroupId, { successMsg: `Group ID copied: ${state.currentGroupId}` });
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
      window.ExpensesModule.openModal();
    });

    // Add Member Modal Bindings
    el.btnCloseMemberModal.addEventListener("click", closeMemberModal);
    el.btnCancelMember.addEventListener("click", closeMemberModal);
    el.modalMember.addEventListener("click", (e) => {
      if (e.target === el.modalMember) closeMemberModal();
    });
    el.formAddMember.addEventListener("submit", handleSaveMember);

    // Global Keyboard: Escape key closes open modals
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && state.isModalOpen) {
        window.ExpensesModule.closeModal();
        closeMemberModal();
        window.SettlementsModule.closePaymentModal();
      }
    });
  }

  function renderGroupHeader() {
    if (!state.group) return;

    el.groupTitle.textContent = state.group.name;
    el.groupIdBadge.textContent = state.group.id;
    el.groupMemberCount.textContent = `${state.members.length} members`;

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
    if (state.isOffline) {
      showToast("Cannot add member while offline", "error");
      return;
    }

    el.errorNewMember.textContent = "";
    const name = el.inputNewMemberName.value.trim();

    if (!name) {
      el.errorNewMember.textContent = "Member name is required";
      return;
    }

    if (name.length > 40) {
      el.errorNewMember.textContent = "Member name cannot exceed 40 characters";
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
      } else if (err.errors && err.errors.name) {
        el.errorNewMember.textContent = err.errors.name;
      } else {
        el.errorNewMember.textContent = err.message || "Failed to add member";
      }
    } finally {
      setBtnLoading(el.btnSaveMember, false);
    }
  }

  // =========================================================================
  // Initialization
  // =========================================================================
  window.addEventListener("DOMContentLoaded", () => {
    initHomeView();
    initGroupView();

    // Initialize Sub-modules
    window.ExpensesModule.init(state, () => loadGroupData(state.currentGroupId));
    window.BalancesModule.init(state);
    window.SettlementsModule.init(state, () => loadGroupData(state.currentGroupId));

    updateOnlineStatus();
    handleRoute();
  });

  // Global App Expose
  window.SplitFairApp = {
    showToast,
    copyToClipboard,
    setBtnLoading,
  };
})();
