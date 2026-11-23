// FairShare — Modular Dashboard Page Controller (ES2020+ Vanilla)
import { createGroup } from './api.js';
import { initAuth, getUser } from './auth.js';
import { initRetroSFX, playRetroSound } from './retroEffects.js';
import { initAiChat } from './aiChat.js';

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

function getSavedGroups() {
  try {
    const raw = localStorage.getItem('fairshare_saved_groups');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveGroupToHistory(group) {
  try {
    const list = getSavedGroups();
    const existingIdx = list.findIndex((g) => g.id === group.id);
    const item = {
      id: group.id,
      name: group.name,
      memberCount: group.members ? group.members.length : 2,
      lastVisited: Date.now()
    };
    if (existingIdx >= 0) {
      list[existingIdx] = { ...list[existingIdx], ...item };
    } else {
      list.unshift(item);
    }
    // Keep up to 50 recent groups
    localStorage.setItem('fairshare_saved_groups', JSON.stringify(list.slice(0, 50)));
  } catch (err) {
    console.warn('Failed to save group history:', err);
  }
}

function renderSavedGroups() {
  const container = document.getElementById('saved-groups-grid');
  const countBadge = document.getElementById('saved-groups-count');
  if (!container) return;

  const groups = getSavedGroups();
  if (countBadge) {
    countBadge.textContent = `${groups.length} ${groups.length === 1 ? 'group' : 'groups'}`;
  }

  container.innerHTML = '';

  if (groups.length === 0) {
    const emptyNotice = document.createElement('div');
    emptyNotice.className = 'empty-groups-notice';
    emptyNotice.style.cssText = 'grid-column: 1 / -1; padding: 24px; background: var(--surface-card); border: 3px solid #000000; box-shadow: 2px 2px 0 1px #000000; font-family: var(--font-retro); font-size: 12px; text-align: center; color: var(--text-muted);';
    emptyNotice.textContent = 'No groups recorded yet. Create a group above or join one with a code!';
    container.appendChild(emptyNotice);
    return;
  }

  groups.forEach((g) => {
    const card = document.createElement('div');
    card.className = 'home-card';
    card.style.cssText = 'display: flex; flex-direction: column; justify-content: space-between; min-height: 140px; margin: 0;';

    const header = document.createElement('div');
    const title = document.createElement('h3');
    title.style.cssText = 'font-size: 1.1rem; color: var(--text-primary); margin: 0 0 6px; word-break: break-word;';
    title.textContent = g.name || 'Untitled Trip';

    const meta = document.createElement('div');
    meta.style.cssText = 'font-size: 0.82rem; color: var(--text-muted); display: flex; gap: 12px; align-items: center;';
    meta.textContent = `👥 ${g.memberCount || 2} members • Code: ${g.id.slice(0, 8)}…`;

    header.appendChild(title);
    header.appendChild(meta);
    card.appendChild(header);

    const actionRow = document.createElement('div');
    actionRow.style.cssText = 'display: flex; gap: 8px; margin-top: 14px; align-items: center;';

    const openLink = document.createElement('a');
    openLink.href = `/group?id=${encodeURIComponent(g.id)}`;
    openLink.className = 'button primary';
    openLink.style.cssText = 'flex: 1; text-align: center; text-decoration: none; padding: 8px 12px; min-height: 40px;';
    openLink.textContent = 'Open Group ➔';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'button secondary';
    copyBtn.style.cssText = 'min-height: 40px; padding: 8px 12px;';
    copyBtn.title = 'Copy invite link';
    copyBtn.textContent = '📋';
    copyBtn.addEventListener('click', async () => {
      playRetroSound('click');
      const shareUrl = `${window.location.origin}/group?id=${encodeURIComponent(g.id)}`;
      try {
        await navigator.clipboard.writeText(shareUrl);
        showToast('Group link copied to clipboard!');
      } catch {
        prompt('Copy group link:', shareUrl);
      }
    });

    actionRow.appendChild(openLink);
    actionRow.appendChild(copyBtn);
    card.appendChild(actionRow);

    container.appendChild(card);
  });
}

function initDashboard() {
  initRetroSFX();
  initAuth({
    showToast,
    onAuthChange: (user) => {
      // If user logs in, ensure their name is prefilled as creator
      if (user) {
        initHomeMembers();
      }
    }
  });

  // Render recent groups
  renderSavedGroups();

  // Initialize Home Create Member inputs
  initHomeMembers();

  // Create Group Submit (Main Page)
  const homeCreateForm = document.getElementById('home-create-form');
  const homeCreateError = document.getElementById('home-create-error');
  if (homeCreateForm) {
    homeCreateForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (homeCreateError) homeCreateError.hidden = true;

      const nameInput = document.getElementById('home-group-name');
      const name = nameInput ? nameInput.value.trim() : '';

      const memberInputs = document.querySelectorAll('#home-members-container input');
      const members = Array.from(memberInputs)
        .map((inp) => inp.value.trim())
        .filter((val) => val.length > 0);

      if (!name) {
        if (homeCreateError) {
          homeCreateError.textContent = 'Group name is required.';
          homeCreateError.hidden = false;
        }
        playRetroSound('error');
        return;
      }

      if (members.length < 2) {
        if (homeCreateError) {
          homeCreateError.textContent = 'At least 2 members are required.';
          homeCreateError.hidden = false;
        }
        playRetroSound('error');
        return;
      }

      try {
        const group = await createGroup({ name, members });
        saveGroupToHistory(group);
        playRetroSound('coin');
        showToast('Group created successfully!');
        window.location.href = `/group?id=${encodeURIComponent(group.id)}`;
      } catch (err) {
        playRetroSound('error');
        if (homeCreateError) {
          homeCreateError.textContent = err.message || 'Failed to create group.';
          homeCreateError.hidden = false;
        }
      }
    });
  }

  // Open Group Submit (Main Page)
  const homeJoinForm = document.getElementById('home-join-form');
  const homeJoinInput = document.getElementById('home-join-input');
  const homeJoinError = document.getElementById('home-join-error');
  if (homeJoinForm && homeJoinInput) {
    homeJoinForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (homeJoinError) homeJoinError.hidden = true;
      const raw = homeJoinInput.value.trim();
      if (!raw) return;

      playRetroSound('click');
      let code = raw;
      try {
        const url = new URL(raw);
        code = url.searchParams.get('group') || url.searchParams.get('code') || url.searchParams.get('id') || raw;
      } catch {
        const match = raw.match(/[?&](?:group|code|id)=([a-zA-Z0-9_-]+)/);
        if (match) code = match[1];
      }

      window.location.href = `/group?id=${encodeURIComponent(code)}`;
    });
  }

  // Header Modal Triggers: New Group modal
  const openCreateModalBtn = document.getElementById('open-create-modal-btn');
  const createGroupModal = document.getElementById('create-group-modal');
  if (openCreateModalBtn && createGroupModal) {
    openCreateModalBtn.addEventListener('click', () => {
      playRetroSound('blip');
      initModalMembers();
      if (typeof createGroupModal.showModal === 'function') {
        createGroupModal.showModal();
      } else {
        createGroupModal.setAttribute('open', '');
      }
    });
  }

  // Header Modal Triggers: How It Works modal
  const howBtn = document.getElementById('how-it-works-btn');
  const howModal = document.getElementById('how-it-works-modal');
  if (howBtn && howModal) {
    howBtn.addEventListener('click', () => {
      playRetroSound('blip');
      if (typeof howModal.showModal === 'function') {
        howModal.showModal();
      } else {
        howModal.setAttribute('open', '');
      }
    });
  }

  // Close Modals
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

  // Modal: Create Group Form Submit
  const modalCreateForm = document.getElementById('create-group-form');
  const modalCreateError = document.getElementById('create-group-error');
  if (modalCreateForm) {
    modalCreateForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (modalCreateError) modalCreateError.hidden = true;

      const nameInput = document.getElementById('create-group-name');
      const name = nameInput ? nameInput.value.trim() : '';

      const memberInputs = document.querySelectorAll('#create-members-container input');
      const members = Array.from(memberInputs)
        .map((inp) => inp.value.trim())
        .filter((val) => val.length > 0);

      if (!name) {
        if (modalCreateError) {
          modalCreateError.textContent = 'Group name is required.';
          modalCreateError.hidden = false;
        }
        playRetroSound('error');
        return;
      }

      if (members.length < 2) {
        if (modalCreateError) {
          modalCreateError.textContent = 'At least 2 members are required.';
          modalCreateError.hidden = false;
        }
        playRetroSound('error');
        return;
      }

      try {
        const group = await createGroup({ name, members });
        saveGroupToHistory(group);
        playRetroSound('coin');
        showToast('Group created!');
        window.location.href = `/group?id=${encodeURIComponent(group.id)}`;
      } catch (err) {
        playRetroSound('error');
        if (modalCreateError) {
          modalCreateError.textContent = err.message || 'Failed to create group.';
          modalCreateError.hidden = false;
        }
      }
    });
  }

  // Modal: Join Group Form Submit
  const modalJoinForm = document.getElementById('join-group-form');
  const modalJoinInput = document.getElementById('join-group-input');
  if (modalJoinForm && modalJoinInput) {
    modalJoinForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const raw = modalJoinInput.value.trim();
      if (!raw) return;

      playRetroSound('click');
      let code = raw;
      try {
        const url = new URL(raw);
        code = url.searchParams.get('group') || url.searchParams.get('code') || url.searchParams.get('id') || raw;
      } catch {
        const match = raw.match(/[?&](?:group|code|id)=([a-zA-Z0-9_-]+)/);
        if (match) code = match[1];
      }

      window.location.href = `/group?id=${encodeURIComponent(code)}`;
    });
  }

  // Floating AI Assistant
  try {
    initAiChat({
      getGroupId: () => null,
      showToast,
      onRefreshGroup: async () => {
        renderSavedGroups();
      },
      onDataMutated: async (res) => {
        if (res && res.createdGroupId && res.createdGroupName) {
          saveGroupToHistory({ id: res.createdGroupId, name: res.createdGroupName, memberCount: 2 });
        }
        renderSavedGroups();
      },
      onNavigateGroup: (groupId) => {
        if (groupId) {
          window.location.href = `/group?id=${encodeURIComponent(groupId)}`;
        }
      },
      onOpenAuth: () => {
        window.location.href = '/login';
      }
    });
  } catch (err) {
    console.warn('AI Chat init warning:', err);
  }

  // Listen for realtime data mutation events
  window.addEventListener('fairshare:datachanged', (e) => {
    const res = e.detail;
    if (res && res.createdGroupId && res.createdGroupName) {
      saveGroupToHistory({ id: res.createdGroupId, name: res.createdGroupName, memberCount: 2 });
    }
    renderSavedGroups();
  });
}

function getCreatorMemberName() {
  const user = getUser();
  if (user) {
    return user.name?.trim() || user.username?.trim() || 'Me';
  }
  return '';
}

function initHomeMembers() {
  const container = document.getElementById('home-members-container');
  if (!container) return;
  container.innerHTML = '';

  const creatorName = getCreatorMemberName();
  addHomeMemberField(creatorName || '', creatorName ? 'You (Creator)' : 'Member 1 (e.g. Alice)');
  addHomeMemberField('', 'Member 2 (e.g. Bob)');
  addHomeMemberField('', 'Member 3 (optional)');

  const addBtn = document.getElementById('home-add-member-btn');
  if (addBtn) {
    addBtn.onclick = () => {
      playRetroSound('blip');
      const count = container.querySelectorAll('.member-row').length;
      if (count >= 20) {
        showToast('Maximum 20 members per group.');
        return;
      }
      addHomeMemberField('', `Member ${count + 1}`);
    };
  }
}

function addHomeMemberField(defaultValue = '', placeholder = 'Member name') {
  const container = document.getElementById('home-members-container');
  if (!container) return;

  const count = container.querySelectorAll('.member-row').length;
  if (count >= 20) return;

  const row = document.createElement('div');
  row.className = 'member-row';
  row.style.cssText = 'display: flex; gap: 6px; margin-bottom: 6px;';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = placeholder;
  input.value = defaultValue;
  input.maxLength = 40;
  input.required = count < 2;
  input.style.cssText = 'flex: 1;';

  row.appendChild(input);

  // If beyond 2 members, allow removing
  if (count >= 2) {
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'button secondary remove-member-btn';
    removeBtn.style.cssText = 'padding: 0 10px; min-height: 40px;';
    removeBtn.textContent = '✕';
    removeBtn.onclick = () => {
      playRetroSound('click');
      row.remove();
    };
    row.appendChild(removeBtn);
  }

  container.appendChild(row);
}

function initModalMembers() {
  const container = document.getElementById('create-members-container');
  if (!container) return;
  container.innerHTML = '';

  const creatorName = getCreatorMemberName();
  addModalMemberField(creatorName || '', creatorName ? 'You (Creator)' : 'Member 1');
  addModalMemberField('', 'Member 2');
  addModalMemberField('', 'Member 3 (optional)');

  const addBtn = document.getElementById('add-more-members-btn');
  if (addBtn) {
    addBtn.onclick = () => {
      playRetroSound('blip');
      const count = container.querySelectorAll('.member-row').length;
      if (count >= 20) {
        showToast('Maximum 20 members per group.');
        return;
      }
      addModalMemberField('', `Member ${count + 1}`);
    };
  }
}

function addModalMemberField(defaultValue = '', placeholder = 'Member name') {
  const container = document.getElementById('create-members-container');
  if (!container) return;

  const count = container.querySelectorAll('.member-row').length;
  if (count >= 20) return;

  const row = document.createElement('div');
  row.className = 'member-row';
  row.style.cssText = 'display: flex; gap: 6px; margin-bottom: 6px;';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = placeholder;
  input.value = defaultValue;
  input.maxLength = 40;
  input.required = count < 2;
  input.style.cssText = 'flex: 1;';

  row.appendChild(input);

  if (count >= 2) {
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'button secondary remove-member-btn';
    removeBtn.style.cssText = 'padding: 0 10px; min-height: 40px;';
    removeBtn.textContent = '✕';
    removeBtn.onclick = () => {
      playRetroSound('click');
      row.remove();
    };
    row.appendChild(removeBtn);
  }

  container.appendChild(row);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDashboard);
} else {
  initDashboard();
}
