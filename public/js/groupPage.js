// FairShare — Modular Group Workspace Page Controller (ES2020+ Vanilla)
import { fetchGroup, addExpense, deleteExpense, addMember, setGroupStatus } from './api.js';
import { renderBalances } from './balances.js';
import { renderExpenses } from './expenses.js';
import { renderSettlements } from './settlements.js';
import { calculateSplit } from './split.js';
import { parseRupees, formatMoney } from './money.js';
import { initAuth } from './auth.js';
import { initRetroSFX, playRetroSound } from './retroEffects.js';
import { initAiChat } from './aiChat.js';

let currentGroup = null;
let currentTab = 'expenses';
let activeSplitType = 'equal';
let expenseToDelete = null;

export function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  toast.classList.add('visible');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.classList.remove('visible');
    toast.hidden = true;
  }, 2600);
}

function saveGroupToHistory(group) {
  try {
    const raw = localStorage.getItem('fairshare_saved_groups');
    const list = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex((g) => g.id === group.id);
    const item = {
      id: group.id,
      name: group.name,
      memberCount: group.members ? group.members.length : 2,
      lastVisited: Date.now()
    };
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...item };
    } else {
      list.unshift(item);
    }
    localStorage.setItem('fairshare_saved_groups', JSON.stringify(list.slice(0, 50)));
  } catch (err) {
    console.warn('Failed to update group history:', err);
  }
}

async function copyToClipboard(text, successMsg = 'Copied to clipboard!') {
  playRetroSound('click');
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMsg);
  } catch {
    prompt('Copy to clipboard:', text);
  }
}

function setTab(tab) {
  currentTab = tab;
  playRetroSound('blip');

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    const match = btn.getAttribute('data-tab') === tab;
    btn.classList.toggle('active', match);
    btn.setAttribute('aria-selected', match ? 'true' : 'false');
  });

  const expTab = document.getElementById('expenses-tab-content');
  const balTab = document.getElementById('balances-tab-content');
  const setTabEl = document.getElementById('settlements-tab-content');

  if (expTab) expTab.hidden = tab !== 'expenses';
  if (balTab) balTab.hidden = tab !== 'balances';
  if (setTabEl) setTabEl.hidden = tab !== 'settlements';
}

async function refreshGroup(quiet = false) {
  if (!currentGroup?.id) return;
  const loading = document.getElementById('group-loading');
  if (!quiet && loading) loading.hidden = false;

  try {
    const group = await fetchGroup(currentGroup.id);
    currentGroup = group;
    saveGroupToHistory(group);
    renderGroupUI();
  } catch (err) {
    showToast(err.message || 'Failed to refresh group data.');
  } finally {
    if (loading) loading.hidden = true;
  }
}

function renderGroupUI() {
  if (!currentGroup) return;

  const isGrpActive = currentGroup.isActive !== false;

  // Header Active/Inactive Toggle & Inactive Banner Controls
  const headerToggle = document.getElementById('group-status-toggle');
  const headerToggleLabel = document.getElementById('group-status-toggle-label');
  const inactiveBanner = document.getElementById('group-inactive-banner');
  const addExpTrigger = document.getElementById('add-expense-trigger');
  const reactivateBtn = document.getElementById('banner-reactivate-btn');

  if (headerToggle) {
    headerToggle.className = `retro-switch ${isGrpActive ? 'active' : 'inactive'}`;
    headerToggle.setAttribute('aria-checked', isGrpActive ? 'true' : 'false');
    if (headerToggleLabel) headerToggleLabel.textContent = isGrpActive ? 'ACTIVE' : 'INACTIVE';
    headerToggle.onclick = async () => {
      playRetroSound('click');
      const nextState = !isGrpActive;
      try {
        headerToggle.disabled = true;
        await setGroupStatus(currentGroup.id, nextState);
        currentGroup.isActive = nextState;
        showToast(`${currentGroup.name} is now ${nextState ? 'Active' : 'Inactive'}`);
        renderGroupUI();
      } catch (err) {
        showToast(err.message || 'Failed to update group status.');
      } finally {
        headerToggle.disabled = false;
      }
    };
  }

  if (inactiveBanner) {
    inactiveBanner.style.display = isGrpActive ? 'none' : 'flex';
  }

  if (addExpTrigger) {
    addExpTrigger.disabled = !isGrpActive;
    addExpTrigger.title = isGrpActive ? 'Add a new expense' : 'This group is inactive. Reactivate to add expenses.';
    addExpTrigger.style.opacity = isGrpActive ? '1' : '0.5';
    addExpTrigger.style.cursor = isGrpActive ? 'pointer' : 'not-allowed';
  }

  if (reactivateBtn) {
    reactivateBtn.onclick = async () => {
      playRetroSound('click');
      try {
        reactivateBtn.disabled = true;
        await setGroupStatus(currentGroup.id, true);
        currentGroup.isActive = true;
        showToast(`${currentGroup.name} reactivated!`);
        renderGroupUI();
      } catch (err) {
        showToast(err.message || 'Failed to reactivate group.');
      } finally {
        reactivateBtn.disabled = false;
      }
    };
  }

  // Title and breadcrumb
  const nameEl = document.getElementById('group-name-heading');
  const breadcrumbEl = document.getElementById('breadcrumb-group-name');
  if (nameEl) nameEl.textContent = currentGroup.name;
  if (breadcrumbEl) breadcrumbEl.textContent = currentGroup.name;
  document.title = `${currentGroup.name} — FairShare`;

  // Group Code
  const codeEl = document.getElementById('group-code');
  if (codeEl) codeEl.textContent = currentGroup.id;

  // KPIs
  const totalSpend = currentGroup.expenses.reduce((sum, exp) => sum + exp.amount, 0);
  const totalSpendEl = document.getElementById('total-spend');
  if (totalSpendEl) totalSpendEl.textContent = formatMoney(totalSpend);

  const outstandingDebt = currentGroup.settlements.reduce((sum, s) => sum + s.amount, 0);
  const debtEl = document.getElementById('outstanding-debt');
  if (debtEl) debtEl.textContent = formatMoney(outstandingDebt);

  const memberCountEl = document.getElementById('member-count');
  if (memberCountEl) memberCountEl.textContent = currentGroup.members.length;

  const expenseCountEl = document.getElementById('expense-count');
  if (expenseCountEl) expenseCountEl.textContent = currentGroup.expenses.length;

  // Member list in sidebar
  const memberList = document.getElementById('member-list');
  if (memberList) {
    memberList.innerHTML = '';
    currentGroup.members.forEach((m) => {
      const item = document.createElement('div');
      item.className = 'member-item';
      item.textContent = m.name;
      memberList.appendChild(item);
    });
  }

  // Payer filter dropdown in expenses toolbar
  const payerFilter = document.getElementById('payer-filter');
  if (payerFilter) {
    const currentVal = payerFilter.value;
    payerFilter.innerHTML = '<option value="all">All payers</option>';
    currentGroup.members.forEach((m) => {
      const opt = document.createElement('option');
      opt.value = m.name;
      opt.textContent = m.name;
      payerFilter.appendChild(opt);
    });
    payerFilter.value = currentVal || 'all';
  }

  // Expenses Tab Render
  const expensesContainer = document.getElementById('expenses-list-container');
  const searchInput = document.getElementById('expense-search');
  const searchFilter = searchInput ? searchInput.value.trim() : '';
  const selectedPayer = payerFilter ? payerFilter.value : 'all';

  if (expensesContainer) {
    renderExpenses(
      currentGroup.expenses,
      currentGroup.members,
      searchFilter,
      selectedPayer,
      null,
      (exp) => confirmDeleteExpense(exp),
      expensesContainer
    );
  }

  // Balances Tab Render
  const balancesContainer = document.getElementById('balances-list-container');
  if (balancesContainer) {
    renderBalances(currentGroup.balances, balancesContainer);
  }

  // Settlements Tab Render
  const settlementsContainer = document.getElementById('settlements-list-container');
  if (settlementsContainer) {
    renderSettlements(
      currentGroup.settlements,
      currentGroup.members,
      async (transfer) => {
        playRetroSound('coin');
        showToast(`Marked ${formatMoney(transfer.amount)} payment as settled!`);
      },
      (transfer, fromName, toName) => {
        const text = `Hey ${fromName}! A gentle reminder to settle ₹${(transfer.amount / 100).toFixed(2)} with ${toName} for our trip on FairShare: ${window.location.href}`;
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
      },
      settlementsContainer
    );
  }
}

function confirmDeleteExpense(exp) {
  expenseToDelete = exp;
  playRetroSound('blip');
  const modal = document.getElementById('delete-confirm-modal');
  const descEl = document.getElementById('delete-expense-desc');
  if (descEl) descEl.textContent = `"${exp.description}" (${formatMoney(exp.amount)})`;

  if (modal) {
    if (typeof modal.showModal === 'function') modal.showModal();
    else modal.setAttribute('open', '');
  }
}

async function executeDeleteExpense() {
  if (!expenseToDelete || !currentGroup) return;
  const modal = document.getElementById('delete-confirm-modal');
  try {
    await deleteExpense(currentGroup.id, expenseToDelete.id);
    playRetroSound('laser');
    showToast('Expense deleted and balances updated.');
    if (modal) {
      if (typeof modal.close === 'function') modal.close();
      else modal.removeAttribute('open');
    }
    expenseToDelete = null;
    await refreshGroup(true);
  } catch (err) {
    playRetroSound('error');
    showToast(err.message || 'Failed to delete expense.');
  }
}

function openAddExpenseModal() {
  if (!currentGroup) return;
  playRetroSound('blip');
  const modal = document.getElementById('add-expense-modal');
  const errEl = document.getElementById('expense-form-error');
  if (errEl) errEl.hidden = true;

  // Clear inputs
  const descInp = document.getElementById('expense-desc');
  const amtInp = document.getElementById('expense-amount');
  if (descInp) descInp.value = '';
  if (amtInp) amtInp.value = '';

  // Populate Payer dropdown
  const payerSel = document.getElementById('expense-paid-by');
  if (payerSel) {
    payerSel.innerHTML = '';
    currentGroup.members.forEach((m) => {
      const opt = document.createElement('option');
      opt.value = m.name;
      opt.textContent = m.name;
      payerSel.appendChild(opt);
    });
  }

  // Set default split mode: equal
  setSplitType('equal');
  renderSplitConfigInputs();
  updateSplitPreview();

  if (modal) {
    if (typeof modal.showModal === 'function') modal.showModal();
    else modal.setAttribute('open', '');
  }
}

function setSplitType(type) {
  activeSplitType = type;
  document.querySelectorAll('.split-pill').forEach((pill) => {
    const match = pill.getAttribute('data-type') === type;
    pill.classList.toggle('selected', match);
    pill.classList.toggle('active', match);
  });
  renderSplitConfigInputs();
  updateSplitPreview();
}

function renderSplitConfigInputs() {
  const container = document.getElementById('split-config-container');
  if (!container || !currentGroup) return;
  container.innerHTML = '';

  if (activeSplitType === 'equal') {
    const hint = document.createElement('div');
    hint.className = 'split-hint';
    hint.textContent = 'Select who shares this cost (split equally with Hare-Niemeyer exact-paise math):';
    container.appendChild(hint);

    const checkList = document.createElement('div');
    checkList.className = 'equal-checklist';
    currentGroup.members.forEach((m) => {
      const label = document.createElement('label');
      label.className = 'member-check-label';
      label.style.cssText = 'display: flex; align-items: center; gap: 8px; margin: 4px 0; cursor: pointer;';

      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.name = 'equal_member';
      chk.value = m.name;
      chk.checked = true;
      chk.addEventListener('change', updateSplitPreview);

      const span = document.createElement('span');
      span.textContent = m.name;

      label.appendChild(chk);
      label.appendChild(span);
      checkList.appendChild(label);
    });
    container.appendChild(checkList);
  } else if (activeSplitType === 'shares') {
    const hint = document.createElement('div');
    hint.className = 'split-hint';
    hint.textContent = 'Enter integer share weights for each participant (e.g. 1, 2, 3):';
    container.appendChild(hint);

    const sharesList = document.createElement('div');
    sharesList.className = 'shares-input-list';
    currentGroup.members.forEach((m) => {
      const row = document.createElement('div');
      row.className = 'weight-row';
      row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin: 6px 0;';

      const label = document.createElement('span');
      label.textContent = m.name;

      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'weight-input tabular-num';
      input.dataset.member = m.name;
      input.value = '1';
      input.min = '0';
      input.max = '1000';
      input.style.cssText = 'width: 80px; text-align: right;';
      input.addEventListener('input', updateSplitPreview);

      row.appendChild(label);
      row.appendChild(input);
      sharesList.appendChild(row);
    });
    container.appendChild(sharesList);
  } else if (activeSplitType === 'exact') {
    const hint = document.createElement('div');
    hint.className = 'split-hint';
    hint.textContent = 'Enter exact rupee amounts for each participant (must sum to total):';
    container.appendChild(hint);

    const exactList = document.createElement('div');
    exactList.className = 'exact-input-list';
    currentGroup.members.forEach((m) => {
      const row = document.createElement('div');
      row.className = 'weight-row';
      row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin: 6px 0;';

      const label = document.createElement('span');
      label.textContent = m.name;

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'exact-input tabular-num';
      input.dataset.member = m.name;
      input.placeholder = '0.00';
      input.style.cssText = 'width: 110px; text-align: right;';
      input.addEventListener('input', updateSplitPreview);

      row.appendChild(label);
      row.appendChild(input);
      exactList.appendChild(row);
    });
    container.appendChild(exactList);
  }
}

function updateSplitPreview() {
  const previewList = document.getElementById('split-preview-list');
  if (!previewList || !currentGroup) return;

  const amtInput = document.getElementById('expense-amount');
  const rawAmt = amtInput ? amtInput.value.trim() : '';

  let totalPaise = 0;
  try {
    totalPaise = parseRupees(rawAmt);
  } catch {
    totalPaise = 0;
  }

  if (totalPaise <= 0) {
    previewList.innerHTML = '<span style="color:var(--text-muted); font-size:0.85rem;">Enter an amount above to preview split breakdown.</span>';
    return;
  }

  let splitPayload = { type: activeSplitType };

  if (activeSplitType === 'equal') {
    const selected = Array.from(document.querySelectorAll('input[name="equal_member"]:checked')).map((c) => c.value);
    if (selected.length === 0) {
      previewList.innerHTML = '<span style="color:var(--semantic-owes); font-size:0.85rem;">Select at least one participant.</span>';
      return;
    }
    splitPayload.participants = selected;
  } else if (activeSplitType === 'shares') {
    const weights = {};
    document.querySelectorAll('.weight-input').forEach((inp) => {
      const w = parseInt(inp.value, 10) || 0;
      if (w > 0) weights[inp.dataset.member] = w;
    });
    splitPayload.weights = weights;
  } else if (activeSplitType === 'exact') {
    const amounts = {};
    let sumExact = 0;
    document.querySelectorAll('.exact-input').forEach((inp) => {
      try {
        const p = parseRupees(inp.value.trim());
        if (p > 0) {
          amounts[inp.dataset.member] = p;
          sumExact += p;
        }
      } catch {
        // ignore
      }
    });
    splitPayload.amounts = amounts;
    if (sumExact !== totalPaise) {
      const diff = totalPaise - sumExact;
      previewList.innerHTML = `<span style="color:var(--semantic-owes); font-size:0.85rem;">Exact amounts do not sum to total (${formatMoney(sumExact)} of ${formatMoney(totalPaise)}). Difference: ${formatMoney(Math.abs(diff))}.</span>`;
      return;
    }
  }

  try {
    const breakdown = calculateSplit(totalPaise, splitPayload, currentGroup.members);
    previewList.innerHTML = '';
    Object.entries(breakdown).forEach(([name, sharePaise]) => {
      const item = document.createElement('div');
      item.className = 'preview-item';
      item.style.cssText = 'display: flex; justify-content: space-between; font-size: 0.85rem; padding: 2px 0;';

      const nameSpan = document.createElement('span');
      nameSpan.textContent = name;

      const amtSpan = document.createElement('span');
      amtSpan.className = 'tabular-num';
      amtSpan.textContent = formatMoney(sharePaise);

      item.appendChild(nameSpan);
      item.appendChild(amtSpan);
      previewList.appendChild(item);
    });
  } catch (err) {
    previewList.innerHTML = `<span style="color:var(--semantic-owes); font-size:0.85rem;">${err.message || 'Invalid split configuration.'}</span>`;
  }
}

function exportExpensesCSV() {
  if (!currentGroup || !currentGroup.expenses || currentGroup.expenses.length === 0) {
    showToast('No expenses to export.');
    return;
  }
  playRetroSound('coin');

  function sanitize(val) {
    let str = String(val ?? '').replace(/"/g, '""');
    if (/^[=+\-@\t\r]/.test(str)) str = "'" + str;
    return `"${str}"`;
  }

  const headers = ['ID', 'Date', 'Description', 'Paid By', 'Amount (₹)', 'Split Type', 'Participants'];
  const rows = currentGroup.expenses.map((exp) => {
    const dateStr = exp.created_at ? new Date(exp.created_at).toLocaleDateString() : 'N/A';
    const amtStr = (exp.amount / 100).toFixed(2);
    let participants = '';
    if (exp.split?.type === 'equal') {
      participants = exp.split.participants ? exp.split.participants.join(', ') : 'All';
    } else if (exp.split?.type === 'shares') {
      participants = Object.entries(exp.split.weights || {}).map(([k, v]) => `${k} (${v}x)`).join(', ');
    } else if (exp.split?.type === 'exact') {
      participants = Object.entries(exp.split.amounts || {}).map(([k, v]) => `${k} (₹${(v / 100).toFixed(2)})`).join(', ');
    }
    return [exp.id, dateStr, exp.description, exp.paid_by, amtStr, exp.split?.type || 'equal', participants].map(sanitize).join(',');
  });

  const csvContent = '\uFEFF' + [headers.map(sanitize).join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = currentGroup.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  a.download = `fairshare_${safeName}_expenses.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Expense CSV downloaded!');
}

async function initGroupPage() {
  initRetroSFX();
  initAuth({ showToast });

  // Get group ID from URL
  const params = new URLSearchParams(window.location.search);
  const groupId = params.get('id') || params.get('group') || params.get('code');

  if (!groupId) {
    const heading = document.getElementById('group-name-heading');
    if (heading) heading.textContent = 'No group specified';
    showToast('No group specified. Redirecting to dashboard…');
    setTimeout(() => {
      window.location.href = '/dashboard';
    }, 1200);
    return;
  }

  currentGroup = { id: groupId, name: 'Loading…', members: [], expenses: [], balances: [], settlements: [] };

  // Tab switcher
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      if (tab) setTab(tab);
    });
  });

  // Share button
  const shareBtn = document.getElementById('share-group-btn');
  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      const shareUrl = window.location.href;
      copyToClipboard(shareUrl, 'Group invite link copied to clipboard!');
    });
  }

  // Copy code button
  const copyCodeBtn = document.getElementById('copy-code-btn');
  if (copyCodeBtn) {
    copyCodeBtn.addEventListener('click', () => {
      if (currentGroup?.id) {
        copyToClipboard(currentGroup.id, 'Group code copied!');
      }
    });
  }

  // Export CSV button
  const exportBtn = document.getElementById('export-csv-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportExpensesCSV);
  }

  // Search filter
  const searchInput = document.getElementById('expense-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderGroupUI();
    });
  }

  // Payer filter
  const payerFilter = document.getElementById('payer-filter');
  if (payerFilter) {
    payerFilter.addEventListener('change', () => {
      renderGroupUI();
    });
  }

  // Trigger Add Expense modal
  const addExpTrigger = document.getElementById('add-expense-trigger');
  if (addExpTrigger) {
    addExpTrigger.addEventListener('click', openAddExpenseModal);
  }

  // Split pills in modal
  document.querySelectorAll('.split-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      const type = pill.getAttribute('data-type');
      if (type) setSplitType(type);
    });
  });

  // Amount input in modal
  const amtInput = document.getElementById('expense-amount');
  if (amtInput) {
    amtInput.addEventListener('input', updateSplitPreview);
  }

  // Add Expense form submit
  const expenseForm = document.getElementById('expense-form');
  const expenseFormErr = document.getElementById('expense-form-error');
  if (expenseForm) {
    expenseForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (expenseFormErr) expenseFormErr.hidden = true;

      const desc = document.getElementById('expense-desc')?.value.trim() || '';
      const rawAmt = document.getElementById('expense-amount')?.value.trim() || '';
      const paidBy = document.getElementById('expense-paid-by')?.value || '';

      let amountPaise = 0;
      try {
        amountPaise = parseRupees(rawAmt);
      } catch (err) {
        if (expenseFormErr) {
          expenseFormErr.textContent = err.message || 'Invalid amount.';
          expenseFormErr.hidden = false;
        }
        playRetroSound('error');
        return;
      }

      if (!desc) {
        if (expenseFormErr) {
          expenseFormErr.textContent = 'Description is required.';
          expenseFormErr.hidden = false;
        }
        playRetroSound('error');
        return;
      }

      let split = { type: activeSplitType };
      if (activeSplitType === 'equal') {
        const checked = Array.from(document.querySelectorAll('input[name="equal_member"]:checked')).map((c) => c.value);
        if (checked.length === 0) {
          if (expenseFormErr) {
            expenseFormErr.textContent = 'Select at least one participant.';
            expenseFormErr.hidden = false;
          }
          playRetroSound('error');
          return;
        }
        split.participants = checked;
      } else if (activeSplitType === 'shares') {
        const weights = {};
        document.querySelectorAll('.weight-input').forEach((inp) => {
          const w = parseInt(inp.value, 10) || 0;
          if (w > 0) weights[inp.dataset.member] = w;
        });
        if (Object.keys(weights).length === 0) {
          if (expenseFormErr) {
            expenseFormErr.textContent = 'Enter positive shares for at least one member.';
            expenseFormErr.hidden = false;
          }
          playRetroSound('error');
          return;
        }
        split.weights = weights;
      } else if (activeSplitType === 'exact') {
        const amounts = {};
        let sumExact = 0;
        document.querySelectorAll('.exact-input').forEach((inp) => {
          try {
            const p = parseRupees(inp.value.trim());
            if (p > 0) {
              amounts[inp.dataset.member] = p;
              sumExact += p;
            }
          } catch {
            // ignore
          }
        });
        if (sumExact !== amountPaise) {
          if (expenseFormErr) {
            expenseFormErr.textContent = `Exact amounts must equal ${formatMoney(amountPaise)}. Currently: ${formatMoney(sumExact)}.`;
            expenseFormErr.hidden = false;
          }
          playRetroSound('error');
          return;
        }
        split.amounts = amounts;
      }

      try {
        await addExpense(currentGroup.id, {
          description: desc,
          amount: amountPaise,
          paid_by: paidBy,
          split
        });

        playRetroSound('coin');
        showToast('Expense recorded!');

        const modal = document.getElementById('add-expense-modal');
        if (modal) {
          if (typeof modal.close === 'function') modal.close();
          else modal.removeAttribute('open');
        }

        await refreshGroup(true);
      } catch (err) {
        playRetroSound('error');
        if (expenseFormErr) {
          expenseFormErr.textContent = err.message || 'Failed to save expense.';
          expenseFormErr.hidden = false;
        }
      }
    });
  }

  // Inline Add Member Form Submit
  const inlineMemberForm = document.getElementById('inline-add-member-form');
  const newMemberInput = document.getElementById('new-member-name');
  if (inlineMemberForm && newMemberInput) {
    inlineMemberForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = newMemberInput.value.trim();
      if (!name) return;

      try {
        await addMember(currentGroup.id, name);
        playRetroSound('blip');
        showToast(`Added member ${name}!`);
        newMemberInput.value = '';
        await refreshGroup(true);
      } catch (err) {
        playRetroSound('error');
        showToast(err.message || 'Failed to add member.');
      }
    });
  }

  // Delete Confirm Modal Buttons
  const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
  const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener('click', executeDeleteExpense);
  }
  if (cancelDeleteBtn) {
    cancelDeleteBtn.addEventListener('click', () => {
      playRetroSound('click');
      const modal = document.getElementById('delete-confirm-modal');
      if (modal) {
        if (typeof modal.close === 'function') modal.close();
        else modal.removeAttribute('open');
      }
      expenseToDelete = null;
    });
  }

  // Close modals
  document.querySelectorAll('.close-modal').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const dialog = e.target.closest('dialog');
      if (dialog) {
        playRetroSound('click');
        if (typeof dialog.close === 'function') dialog.close();
        else dialog.removeAttribute('open');
      }
    });
  });

  // How It Works Modal
  const howBtn = document.getElementById('how-it-works-btn');
  const howModal = document.getElementById('how-it-works-modal');
  if (howBtn && howModal) {
    howBtn.addEventListener('click', () => {
      playRetroSound('blip');
      if (typeof howModal.showModal === 'function') howModal.showModal();
      else howModal.setAttribute('open', '');
    });
  }

  // Initial group fetch
  await refreshGroup();

  // Floating AI Assistant initialized with this group ID!
  try {
    initAiChat({
      getGroupId: () => currentGroup?.id || null,
      onDataMutated: () => refreshGroup(true),
      onOpenAuth: () => {
        window.location.href = '/login';
      }
    });
  } catch (err) {
    console.warn('AI Chat init warning:', err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGroupPage);
} else {
  initGroupPage();
}
