// FairShare AI Assistant Frontend Module (Professional AI Chatbot)
// Strict compliance: Plain ES2020+, XSS-safe (textContent / createElement only), 44px+ touch targets, aria-live.

// Robust global authentication accessor for AI chat
function getAuthUser() {
  if (typeof window !== 'undefined' && window.fairShareAuth?.getUser) {
    const u = window.fairShareAuth.getUser();
    if (u) return u;
  }
  try {
    const raw = sessionStorage.getItem('fs_auth_user') || localStorage.getItem('fs_auth_user') || sessionStorage.getItem('fairshare_user') || localStorage.getItem('fairshare_user');
    if (raw) return JSON.parse(raw);
  } catch {}

  const badgeEl = document.getElementById('dash-user-badge');
  const nameEl = document.getElementById('dash-user-name');
  if (badgeEl && badgeEl.textContent && badgeEl.textContent !== '@username') {
    const username = badgeEl.textContent.replace(/^@/, '').trim();
    const name = nameEl?.textContent?.trim() || username;
    return { username, name };
  }
  return null;
}

function getAuthToken() {
  if (typeof window !== 'undefined' && window.fairShareAuth?.getToken) {
    const t = window.fairShareAuth.getToken();
    if (t) return t;
  }
  try {
    return sessionStorage.getItem('fs_auth_token') || localStorage.getItem('fs_auth_token') || sessionStorage.getItem('fairshare_token') || localStorage.getItem('fairshare_token') || null;
  } catch {
    return null;
  }
}

/**
 * Fallback offline transport adapter.
 * Used when offline or when NVIDIA_API_KEY is not configured (503).
 */
async function fallbackOfflineTransport({ groupId, messages }) {
  await new Promise((resolve) => setTimeout(resolve, 350));

  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')?.content?.toLowerCase() || '';
  const user = getAuthUser();

  if (lastUserMsg.includes('who am i') || lastUserMsg.includes('profile') || lastUserMsg.includes('my account') || lastUserMsg.includes('username')) {
    if (user) {
      return {
        reply: `You are signed in as **${user.name || user.username}** (@${user.username}) with email **${user.email}** (User ID: ${user.id}).`,
        options: [
          { label: '📊 My groups & balances', message: 'What groups am I in and what are my balances?' },
          { label: '💸 Who owes me money?', message: 'How much money am I owed across all groups?' }
        ]
      };
    } else {
      return {
        reply: 'You are currently not signed in. Please log in or create an account to view your groups and balances.',
        options: [
          { label: '🔑 Log in / Sign up', message: '__OPEN_AUTH_MODAL__' }
        ]
      };
    }
  }

  if (lastUserMsg.includes('create') && lastUserMsg.includes('group')) {
    return {
      reply: 'To create a new group, enter a trip or group name (1–60 chars), add 2 to 20 member names, and tap "Create group". A shareable link will be generated instantly!',
      options: [
        { label: '🍕 How to split an expense?', message: 'How do I split an expense?' },
        { label: '⚡ How does Settle Up work?', message: 'How does debt settlement work?' }
      ]
    };
  }

  if (lastUserMsg.includes('join') || lastUserMsg.includes('open')) {
    return {
      reply: 'To join an existing group, open the group invite link sent by your friend, or paste the 16-character group ID into the "Open existing group" field on the Home screen. No passwords or accounts are required!',
      options: [
        { label: '➕ Create a new group', message: 'How do I create a new group?' },
        { label: '🪙 Tell me about paise precision', message: 'How does FairShare handle money precision?' }
      ]
    };
  }

  if (lastUserMsg.includes('split') || lastUserMsg.includes('expense') || lastUserMsg.includes('bill')) {
    const groupNotice = groupId ? `You are currently in group "${groupId}". ` : '';
    return {
      reply: `${groupNotice}To record an expense, tap the "+ Add expense" button. FairShare supports three split modes:\n\n• Equal (even split across participants)\n• Shares (custom integer ratios 1–1000)\n• Exact (specific rupee amounts)\n\nLeftover paise are allocated deterministically via Hare-Niemeyer with zero penny loss.`,
      options: [
        { label: '🪙 How does Equal split round?', message: 'How does equal split handle rounding?' },
        { label: '⚡ Explain Settle Up', message: 'How does debt settlement work?' }
      ]
    };
  }

  if (lastUserMsg.includes('round') || lastUserMsg.includes('precision') || lastUserMsg.includes('paise')) {
    return {
      reply: 'FairShare bans floating-point numbers. All money is stored as integer paise. For odd splits (like ₹100 split 3 ways), we use the Hare-Niemeyer largest-remainder method: each person pays ₹33.33, and the leftover 1 paisa is awarded to the lowest member ID (₹33.34, ₹33.33, ₹33.33). The sum always equals the total expense!',
      options: [
        { label: '⚡ How does Settle Up work?', message: 'How does debt settlement work?' },
        { label: '📥 How to export CSV?', message: 'How do I export expenses to CSV?' }
      ]
    };
  }

  if (lastUserMsg.includes('settle') || lastUserMsg.includes('debt') || lastUserMsg.includes('transfer')) {
    return {
      reply: 'The Settle Up tab uses greedy bilateral debt simplification. It matches the biggest debtor with the biggest creditor repeatedly to resolve all group debts in at most k − 1 transfers (where k is the count of unsettled members). You can tap "Mark as paid" or send a pre-formatted WhatsApp reminder directly!',
      options: [
        { label: '🍕 How to split an expense?', message: 'How do I split an expense?' },
        { label: '📥 Export to CSV', message: 'How do I export expenses to CSV?' }
      ]
    };
  }

  if (lastUserMsg.includes('csv') || lastUserMsg.includes('export')) {
    return {
      reply: 'You can export all expenses by tapping the "📥 Export CSV" button in the Expenses tab. It generates an immediate downloadable CSV with dates, payers, amounts, and itemized participant splits for your records!',
      options: [
        { label: '⚡ How does Settle Up work?', message: 'How does debt settlement work?' },
        { label: '➕ Create a group', message: 'How do I create a new group?' }
      ]
    };
  }

  // Fallback helpful assistant response
  const contextHint = groupId
    ? `You are managing group "${groupId}". `
    : 'You are on the Home screen. ';

  return {
    reply: `${contextHint}I can help you create groups, calculate exact splits, explain net balances, and minimize settlement transfers. What would you like to do?`,
    options: [
      { label: '➕ Create a group', message: 'How do I create a new group?' },
      { label: '🍕 Split an expense', message: 'How do I split an expense?' },
      { label: '⚡ Settle up debts', message: 'How does debt settlement work?' }
    ]
  };
}

/**
 * Live AI Transport Adapter (connects to POST /api/ai/chat with offline fallback).
 */
async function liveAiTransport({ groupId, messages }) {
  try {
    const token = getAuthToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({ groupId, messages })
    });

    if (res.status === 401) {
      return {
        reply: 'Please log in to use FairShare AI Assistant. Your session may have expired.',
        options: [
          { label: '🔑 Log in / Sign up', message: '__OPEN_AUTH_MODAL__' }
        ]
      };
    }

    if (res.ok) {
      return await res.json();
    }

    if (res.status === 503 || res.status === 500) {
      return fallbackOfflineTransport({ groupId, messages });
    }

    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Server returned ${res.status}`);
  } catch (err) {
    return fallbackOfflineTransport({ groupId, messages });
  }
}

/**
 * Render formatted text into safe DOM nodes.
 * Highlights currency amounts (₹...), handles bullet points, and preserves line breaks
 * strictly using document.createElement and textContent (zero innerHTML).
 */
function renderFormattedContent(container, text) {
  if (!text) return;

  const lines = text.split('\n');
  let currentList = null;

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed) {
      currentList = null;
      return;
    }

    // Check for bullet line (starts with • or - or *)
    const isBullet = /^[•\-*]\s+/.test(trimmed);

    if (isBullet) {
      const bulletRow = document.createElement('div');
      bulletRow.className = 'ai-bullet-item';

      const bulletDot = document.createElement('span');
      bulletDot.className = 'ai-bullet-dot';
      bulletDot.textContent = '•';

      const bulletText = document.createElement('span');
      bulletText.className = 'ai-bullet-text';
      renderInlineTokens(bulletText, trimmed.replace(/^[•\-*]\s+/, ''));

      bulletRow.appendChild(bulletDot);
      bulletRow.appendChild(bulletText);
      container.appendChild(bulletRow);
      return;
    }

    // Regular paragraph
    const p = document.createElement('p');
    p.className = 'ai-bubble-paragraph';
    renderInlineTokens(p, line);
    container.appendChild(p);
  });
}

/**
 * Tokenize a line of text and render bold (**...**) and Rupee badges (₹...) safely.
 */
function renderInlineTokens(container, line) {
  // Regex to match bold **...**, positive currency +₹..., negative currency -₹..., or currency ₹...
  const regex = /(\*\*[^*]+\*\*|[+-]?₹\s*[\d,]+(?:\.\d{1,2})?)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      container.appendChild(document.createTextNode(line.slice(lastIndex, match.index)));
    }

    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      const strong = document.createElement('strong');
      strong.textContent = token.slice(2, -2);
      container.appendChild(strong);
    } else if (token.includes('₹')) {
      const badge = document.createElement('span');
      badge.className = 'ai-rupee-badge';
      if (token.startsWith('+')) {
        badge.classList.add('badge-positive');
      } else if (token.startsWith('-')) {
        badge.classList.add('badge-negative');
      }
      badge.textContent = token;
      container.appendChild(badge);
    } else {
      container.appendChild(document.createTextNode(token));
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < line.length) {
    container.appendChild(document.createTextNode(line.slice(lastIndex)));
  }
}

let aiChatInstance = null;

const SESSIONS_STORAGE_KEY = 'fairshare_ai_chat_sessions_v2';

/**
 * Retrieve saved chat sessions from localStorage.
 */
function getStoredSessions() {
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Persist sessions array to localStorage (capped at 30 most recent).
 */
function persistSessions(sessions) {
  try {
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify((sessions || []).slice(0, 30)));
  } catch (e) {
    console.warn('Failed to save chat sessions to localStorage:', e);
  }
}

/**
 * Format relative timestamp for history cards.
 */
function formatSessionDate(isoStr) {
  if (!isoStr) return 'Recently';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return 'Recently';
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  if (diffMins < 2) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24 && d.getDate() === now.getDate()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/**
 * Initialize the AI Chatbot Interface.
 * @param {Object} [options]
 * @param {() => string | null} [options.getCurrentGroupId] Returns active group code/id
 * @param {(groupId: string) => void} [options.onNavigateGroup] Callback to navigate to a group
 * @param {() => Promise<void> | void} [options.onRefreshGroup] Callback to refresh active group state
 * @param {(payload: { groupId: string | null, messages: Array<{role: string, content: string}> }) => Promise<{ reply: string, options?: Array<{label: string, message: string}>, refreshGroup?: boolean, navigateToGroupId?: string | null }>} [options.transport] Pluggable transport adapter
 */
export function initAiChat(options = {}) {
  if (aiChatInstance) {
    return aiChatInstance;
  }

  const { getCurrentGroupId, getGroupId, onNavigateGroup, onRefreshGroup, onDataMutated, onOpenAuth, transport, showToast } = options;
  const activeGetGroupId = getCurrentGroupId || getGroupId || (() => null);
  const activeTransport = transport || liveAiTransport;

  // Active conversation state & session tracking
  const conversation = [];
  let currentSessionId = 'fs_sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  let sessionTitle = 'New Chat';
  let isOpen = false;
  let isThinking = false;
  let lastFailedPrompt = null;

  // Retrieve existing static HTML elements or create dynamically
  let root = document.getElementById('ai-chat-root');
  let backdrop = document.getElementById('ai-chat-backdrop');
  let launcher = document.getElementById('ai-chat-launcher-btn');
  let drawer = document.getElementById('ai-chat-drawer');
  let historyBtn = document.getElementById('ai-chat-history-btn');
  let newChatBtn = document.getElementById('ai-chat-new-btn');
  let closeBtn = document.getElementById('ai-chat-close-btn');

  let mainView = document.getElementById('ai-chat-main-view');
  let messagesList = document.getElementById('ai-chat-messages');
  let form = document.getElementById('ai-chat-form');
  let input = document.getElementById('ai-chat-input');
  let sendBtn = document.getElementById('ai-chat-send-btn');

  let historyView = document.getElementById('ai-chat-history-view');
  let historyBackBtn = document.getElementById('ai-history-back-btn');
  let historyClearBtn = document.getElementById('ai-history-clear-btn');
  let historyList = document.getElementById('ai-chat-history-list');

  // Self-healing DOM fallback: ensure all required sidebar components exist
  if (!root) {
    root = document.createElement('div');
    root.id = 'ai-chat-root';
    root.className = 'ai-chat-root';
    document.body.appendChild(root);
  }

  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'ai-chat-backdrop';
    backdrop.className = 'ai-chat-backdrop';
    backdrop.style.display = 'none';
    root.prepend(backdrop);
  }

  if (!launcher) {
    launcher = document.createElement('button');
    launcher.type = 'button';
    launcher.id = 'ai-chat-launcher-btn';
    launcher.className = 'ai-chat-fab';
    launcher.setAttribute('aria-label', 'Open FairShare AI Assistant');
    launcher.setAttribute('aria-expanded', 'false');

    const fabIcon = document.createElement('span');
    fabIcon.className = 'ai-fab-icon';
    fabIcon.textContent = '✨';
    const fabText = document.createElement('span');
    fabText.className = 'ai-fab-text';
    fabText.textContent = 'AI Assistant';
    launcher.appendChild(fabIcon);
    launcher.appendChild(fabText);
    root.appendChild(launcher);
  }

  if (!drawer) {
    drawer = document.createElement('aside');
    drawer.id = 'ai-chat-drawer';
    drawer.className = 'ai-chat-sidebar';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-label', 'FairShare AI Assistant');
    drawer.style.display = 'none';
    root.appendChild(drawer);
  }

  // Ensure header and header actions
  let header = drawer.querySelector('.ai-chat-header');
  if (!header) {
    header = document.createElement('header');
    header.className = 'ai-chat-header';

    const headerTitleBox = document.createElement('div');
    headerTitleBox.className = 'ai-header-title-box';
    const headerAvatar = document.createElement('span');
    headerAvatar.className = 'ai-header-avatar';
    headerAvatar.textContent = '✨';
    const headerTextCol = document.createElement('div');
    const headerTitle = document.createElement('h3');
    headerTitle.textContent = 'FairShare AI';
    const headerStatus = document.createElement('span');
    headerStatus.className = 'ai-header-status';
    const statusDot = document.createElement('span');
    statusDot.className = 'ai-status-dot';
    headerStatus.appendChild(statusDot);
    headerStatus.appendChild(document.createTextNode('Online • NVIDIA Flash'));
    headerTextCol.appendChild(headerTitle);
    headerTextCol.appendChild(headerStatus);
    headerTitleBox.appendChild(headerAvatar);
    headerTitleBox.appendChild(headerTextCol);

    header.appendChild(headerTitleBox);
    drawer.prepend(header);
  }

  let headerActions = header.querySelector('.ai-header-actions');
  if (!headerActions) {
    headerActions = document.createElement('div');
    headerActions.className = 'ai-header-actions';
    header.appendChild(headerActions);
  }

  if (!historyBtn) {
    historyBtn = document.createElement('button');
    historyBtn.type = 'button';
    historyBtn.id = 'ai-chat-history-btn';
    historyBtn.className = 'ai-action-btn';
    historyBtn.setAttribute('aria-label', 'View Chat History');
    historyBtn.title = 'Chat History';
    historyBtn.textContent = '🕒';
    headerActions.appendChild(historyBtn);
  }

  if (!newChatBtn) {
    newChatBtn = document.createElement('button');
    newChatBtn.type = 'button';
    newChatBtn.id = 'ai-chat-new-btn';
    newChatBtn.className = 'ai-action-btn';
    newChatBtn.setAttribute('aria-label', 'Start new conversation');
    newChatBtn.title = 'New Chat';
    newChatBtn.textContent = '＋';
    headerActions.appendChild(newChatBtn);
  }

  if (!closeBtn) {
    closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.id = 'ai-chat-close-btn';
    closeBtn.className = 'ai-action-btn ai-close-btn';
    closeBtn.setAttribute('aria-label', 'Close AI Assistant');
    closeBtn.title = 'Close';
    closeBtn.textContent = '✕';
    headerActions.appendChild(closeBtn);
  }

  // Ensure main view container
  if (!mainView) {
    mainView = document.createElement('div');
    mainView.id = 'ai-chat-main-view';
    mainView.className = 'ai-chat-view-container';
    drawer.appendChild(mainView);
  }

  if (!messagesList) {
    messagesList = document.createElement('div');
    messagesList.id = 'ai-chat-messages';
    messagesList.className = 'ai-chat-messages';
    messagesList.setAttribute('role', 'log');
    messagesList.setAttribute('aria-live', 'polite');
    mainView.appendChild(messagesList);
  } else if (!mainView.contains(messagesList)) {
    mainView.appendChild(messagesList);
  }

  if (!form) {
    form = document.createElement('form');
    form.id = 'ai-chat-form';
    form.className = 'ai-chat-form';
    input = document.createElement('input');
    input.type = 'text';
    input.id = 'ai-chat-input';
    input.className = 'ai-chat-input';
    input.placeholder = 'Ask to split a bill or create a group…';
    input.setAttribute('aria-label', 'Message FairShare AI');
    input.maxLength = 400;
    input.autocomplete = 'off';
    input.required = true;

    sendBtn = document.createElement('button');
    sendBtn.type = 'submit';
    sendBtn.id = 'ai-chat-send-btn';
    sendBtn.className = 'ai-chat-send-btn';
    sendBtn.setAttribute('aria-label', 'Send message');
    const sendSpan = document.createElement('span');
    sendSpan.textContent = 'Send';
    const sendArrow = document.createElement('span');
    sendArrow.className = 'send-arrow';
    sendArrow.textContent = '➔';
    sendBtn.appendChild(sendSpan);
    sendBtn.appendChild(sendArrow);

    form.appendChild(input);
    form.appendChild(sendBtn);
    mainView.appendChild(form);
  } else if (!mainView.contains(form)) {
    mainView.appendChild(form);
  }

  // Ensure Voice Status Banner exists
  let voiceStatus = document.getElementById('ai-voice-status');
  let voiceStatusText = document.getElementById('ai-voice-status-text');
  let voiceCancelBtn = document.getElementById('ai-voice-cancel-btn');
  if (!voiceStatus && mainView) {
    voiceStatus = document.createElement('div');
    voiceStatus.id = 'ai-voice-status';
    voiceStatus.className = 'ai-voice-status';
    voiceStatus.style.display = 'none';
    voiceStatus.setAttribute('aria-live', 'assertive');

    const statusRow = document.createElement('div');
    statusRow.style.cssText = 'display:flex;align-items:center;';

    const pulseDot = document.createElement('span');
    pulseDot.className = 'voice-pulse-dot';

    voiceStatusText = document.createElement('span');
    voiceStatusText.id = 'ai-voice-status-text';
    voiceStatusText.textContent = 'Listening... (0s / 25s)';

    statusRow.appendChild(pulseDot);
    statusRow.appendChild(voiceStatusText);

    voiceCancelBtn = document.createElement('button');
    voiceCancelBtn.type = 'button';
    voiceCancelBtn.id = 'ai-voice-cancel-btn';
    voiceCancelBtn.className = 'ai-voice-cancel-btn';
    voiceCancelBtn.textContent = 'Cancel';
    voiceCancelBtn.setAttribute('aria-label', 'Cancel recording');

    voiceStatus.appendChild(statusRow);
    voiceStatus.appendChild(voiceCancelBtn);

    if (form) {
      mainView.insertBefore(voiceStatus, form);
    } else {
      mainView.appendChild(voiceStatus);
    }
  } else {
    voiceStatusText = voiceStatusText || document.getElementById('ai-voice-status-text');
    voiceCancelBtn = voiceCancelBtn || document.getElementById('ai-voice-cancel-btn');
  }

  // Ensure Microphone Button exists in form
  let micBtn = document.getElementById('ai-chat-mic-btn');
  if (!micBtn && form) {
    micBtn = document.createElement('button');
    micBtn.type = 'button';
    micBtn.id = 'ai-chat-mic-btn';
    micBtn.className = 'ai-chat-mic-btn';
    micBtn.setAttribute('aria-label', 'Voice input (Hold or tap to speak)');
    micBtn.title = 'Voice Input (English / Hindi / Hinglish)';

    const micIcon = document.createElement('span');
    micIcon.className = 'mic-icon';
    micIcon.textContent = '🎤';
    micBtn.appendChild(micIcon);

    if (sendBtn) {
      form.insertBefore(micBtn, sendBtn);
    } else {
      form.appendChild(micBtn);
    }
  }

  // Ensure history view container
  if (!historyView) {
    historyView = document.createElement('div');
    historyView.id = 'ai-chat-history-view';
    historyView.className = 'ai-chat-history-view';
    historyView.style.display = 'none';

    const historyToolbar = document.createElement('div');
    historyToolbar.className = 'ai-history-toolbar';

    historyBackBtn = document.createElement('button');
    historyBackBtn.type = 'button';
    historyBackBtn.id = 'ai-history-back-btn';
    historyBackBtn.className = 'ai-history-back-btn';
    historyBackBtn.textContent = '← Back to Chat';

    const histTitle = document.createElement('span');
    histTitle.className = 'ai-history-title';
    histTitle.textContent = 'Chat History';

    historyClearBtn = document.createElement('button');
    historyClearBtn.type = 'button';
    historyClearBtn.id = 'ai-history-clear-btn';
    historyClearBtn.className = 'ai-history-clear-btn';
    historyClearBtn.textContent = 'Clear';

    historyToolbar.appendChild(historyBackBtn);
    historyToolbar.appendChild(histTitle);
    historyToolbar.appendChild(historyClearBtn);

    historyList = document.createElement('div');
    historyList.id = 'ai-chat-history-list';
    historyList.className = 'ai-chat-history-list';

    historyView.appendChild(historyToolbar);
    historyView.appendChild(historyList);
    drawer.appendChild(historyView);
  } else {
    historyBackBtn = historyBackBtn || document.getElementById('ai-history-back-btn');
    historyClearBtn = historyClearBtn || document.getElementById('ai-history-clear-btn');
    historyList = historyList || document.getElementById('ai-chat-history-list');
  }

  // Ensure sidebar starts in closed state
  if (drawer) {
    drawer.style.display = 'none';
    drawer.classList.remove('open');
  }
  if (backdrop) {
    backdrop.style.display = 'none';
    backdrop.classList.remove('open');
  }

  // Helpers
  function scrollToBottom() {
    if (!messagesList) return;
    messagesList.scrollTo({
      top: messagesList.scrollHeight,
      behavior: 'smooth'
    });
  }

  function appendMessage(role, text) {
    if (!messagesList) return null;

    const row = document.createElement('div');
    row.className = `ai-message-row ai-message-row-${role}`;

    if (role === 'assistant') {
      const avatar = document.createElement('div');
      avatar.className = 'ai-msg-avatar';
      avatar.setAttribute('aria-hidden', 'true');
      avatar.textContent = '✦';
      row.appendChild(avatar);
    }

    const col = document.createElement('div');
    col.className = `ai-msg-col ai-msg-col-${role}`;

    const sender = document.createElement('div');
    sender.className = 'ai-msg-sender';
    sender.textContent = role === 'user' ? 'You' : 'FairShare AI';
    col.appendChild(sender);

    const bubble = document.createElement('div');
    bubble.className = `ai-bubble ai-bubble-${role}`;

    if (role === 'user') {
      bubble.textContent = text;
    } else {
      renderFormattedContent(bubble, text);
    }

    col.appendChild(bubble);
    row.appendChild(col);
    messagesList.appendChild(row);
    scrollToBottom();
    return row;
  }

  function renderChips(options) {
    if (!options || !options.length || !messagesList) return;

    const chipsContainer = document.createElement('div');
    chipsContainer.className = 'ai-option-chips';

    options.forEach((opt) => {
      const chipBtn = document.createElement('button');
      chipBtn.type = 'button';
      chipBtn.className = 'ai-option-chip';
      chipBtn.setAttribute('aria-label', opt.label);
      chipBtn.textContent = opt.label;

      chipBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        chipsContainer.remove();
        if (typeof opt.action === 'function') {
          opt.action();
          return;
        }
        if (opt.message === '__OPEN_AUTH_MODAL__') {
          closeDrawer();
          if (typeof onOpenAuth === 'function') {
            onOpenAuth();
          } else if (window.fairShareAuth?.openModal) {
            window.fairShareAuth.openModal();
          }
          return;
        }
        handleSendMessage(opt.message);
      };

      chipsContainer.appendChild(chipBtn);
    });

    messagesList.appendChild(chipsContainer);
    scrollToBottom();
  }

  /**
   * Persist current conversation into localStorage.
   */
  function persistActiveSession() {
    if (!conversation.length) return;
    const sessions = getStoredSessions();
    const existingIdx = sessions.findIndex((s) => s.id === currentSessionId);
    const now = new Date().toISOString();

    let title = sessionTitle;
    if (!title || title === 'New Chat') {
      const firstUser = conversation.find((m) => m.role === 'user');
      if (firstUser) {
        title = firstUser.content.trim().slice(0, 38);
        if (firstUser.content.trim().length > 38) title += '…';
        sessionTitle = title;
      } else {
        title = 'FairShare Chat';
      }
    }

    const currentGroupId = typeof getCurrentGroupId === 'function' ? getCurrentGroupId() : null;

    const sessionObj = {
      id: currentSessionId,
      title,
      groupId: currentGroupId,
      createdAt: existingIdx >= 0 ? sessions[existingIdx].createdAt : now,
      updatedAt: now,
      messages: structuredClone(conversation)
    };

    if (existingIdx >= 0) {
      sessions[existingIdx] = sessionObj;
    } else {
      sessions.unshift(sessionObj);
    }

    persistSessions(sessions);
  }

  function showWelcome() {
    if (!messagesList) return;
    messagesList.replaceChildren();
    conversation.length = 0;

    const user = getAuthUser();
    const userName = user ? (user.name || `@${user.username}`) : 'there';

    const greeting = `Hi ${userName}! I am your FairShare AI Assistant powered by NVIDIA Flash.\n\nI know who you are, all your groups, your real-time balances, and pending settlement transfers.\n\nWhat would you like to check or do today?`;
    appendMessage('assistant', greeting);
    conversation.push({ role: 'assistant', content: greeting });

    renderChips([
      { label: '📊 My groups & balances', message: 'What groups am I in and what are my balances?' },
      { label: '💸 Who owes me money?', message: 'How much money am I owed across all groups?' },
      { label: '➕ Create a group', message: 'How do I create a new group?' },
      { label: '🍕 Split an expense', message: 'How do I split an expense?' }
    ]);
  }

  function startNewChat() {
    currentSessionId = 'fs_sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    sessionTitle = 'New Chat';
    showWelcome();
    showChatView();
  }

  function loadSession(sessionId) {
    const sessions = getStoredSessions();
    const target = sessions.find((s) => s.id === sessionId);
    if (!target) return;

    currentSessionId = target.id;
    sessionTitle = target.title;
    conversation.length = 0;
    messagesList.replaceChildren();

    (target.messages || []).forEach((m) => {
      conversation.push(m);
      appendMessage(m.role, m.content);
    });

    if (conversation.length <= 1) {
      renderChips([
        { label: '➕ Create a group', message: 'How do I create a new group?' },
        { label: '🍕 Split an expense', message: 'How do I split an expense?' },
        { label: '⚡ Settle up debts', message: 'Who owes what and how do we settle?' }
      ]);
    }

    showChatView();
  }

  function deleteSession(sessionId) {
    const sessions = getStoredSessions().filter((s) => s.id !== sessionId);
    persistSessions(sessions);
    if (currentSessionId === sessionId) {
      startNewChat();
    }
    renderHistoryList();
  }

  function clearAllSessions() {
    try {
      localStorage.removeItem(SESSIONS_STORAGE_KEY);
    } catch {}
    startNewChat();
    renderHistoryList();
  }

  function showHistoryView() {
    if (mainView) mainView.style.setProperty('display', 'none', 'important');
    if (historyView) historyView.style.setProperty('display', 'flex', 'important');
    renderHistoryList();
  }

  function showChatView() {
    if (historyView) historyView.style.setProperty('display', 'none', 'important');
    if (mainView) mainView.style.setProperty('display', 'flex', 'important');
    scrollToBottom();
    setTimeout(() => {
      if (input) input.focus();
    }, 50);
  }

  function renderHistoryList() {
    if (!historyList) return;
    historyList.replaceChildren();

    const sessions = getStoredSessions();

    if (!sessions.length) {
      const emptyBox = document.createElement('div');
      emptyBox.className = 'ai-history-empty';

      const icon = document.createElement('div');
      icon.className = 'ai-history-empty-icon';
      icon.textContent = '💬';

      const heading = document.createElement('h4');
      heading.textContent = 'No saved chats yet';

      const p = document.createElement('p');
      p.textContent = 'Your conversations with FairShare AI will be automatically stored here so you can review them anytime.';

      emptyBox.appendChild(icon);
      emptyBox.appendChild(heading);
      emptyBox.appendChild(p);
      historyList.appendChild(emptyBox);
      return;
    }

    sessions.forEach((sess) => {
      const item = document.createElement('div');
      item.className = 'ai-history-item';
      if (sess.id === currentSessionId) {
        item.classList.add('active');
      }

      const left = document.createElement('div');
      left.className = 'ai-history-item-left';

      const icon = document.createElement('span');
      icon.className = 'ai-history-item-icon';
      icon.textContent = sess.groupId ? '🏷️' : '💬';

      const info = document.createElement('div');
      info.className = 'ai-history-item-info';

      const title = document.createElement('div');
      title.className = 'ai-history-item-title';
      title.textContent = sess.title || 'Chat Conversation';

      const meta = document.createElement('div');
      meta.className = 'ai-history-item-meta';

      const dateStr = formatSessionDate(sess.updatedAt || sess.createdAt);
      const userMsgs = (sess.messages || []).filter((m) => m.role === 'user').length;
      meta.textContent = `${dateStr} • ${userMsgs} ${userMsgs === 1 ? 'question' : 'questions'}`;

      info.appendChild(title);
      info.appendChild(meta);
      left.appendChild(icon);
      left.appendChild(info);

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'ai-history-item-del-btn';
      delBtn.setAttribute('aria-label', `Delete ${sess.title || 'conversation'}`);
      delBtn.title = 'Delete chat';
      delBtn.textContent = '🗑️';

      delBtn.onclick = (e) => {
        e.stopPropagation();
        deleteSession(sess.id);
      };

      item.onclick = (e) => {
        e.stopPropagation();
        loadSession(sess.id);
      };

      item.appendChild(left);
      item.appendChild(delBtn);
      historyList.appendChild(item);
    });
  }

  async function handleSendMessage(promptText) {
    const cleanText = (promptText || '').trim();
    if (!cleanText || isThinking) return;

    lastFailedPrompt = null;
    isThinking = true;
    if (input) {
      input.value = '';
      input.disabled = true;
    }
    if (sendBtn) sendBtn.disabled = true;

    // 1. Immediately append user message to feed & persist
    appendMessage('user', cleanText);
    conversation.push({ role: 'user', content: cleanText });
    persistActiveSession();

    // 2. Show premium animated typing indicator (strictly createElement DOM for C4 XSS compliance)
    const typingRow = document.createElement('div');
    typingRow.className = 'ai-message-row ai-message-row-assistant';

    const avatar = document.createElement('div');
    avatar.className = 'ai-msg-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = '✦';
    typingRow.appendChild(avatar);

    const col = document.createElement('div');
    col.className = 'ai-msg-col ai-msg-col-assistant';

    const sender = document.createElement('div');
    sender.className = 'ai-msg-sender';
    sender.textContent = 'FairShare AI';
    col.appendChild(sender);

    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'ai-typing-indicator';
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('span');
      dot.className = 'ai-typing-dot';
      typingIndicator.appendChild(dot);
    }
    col.appendChild(typingIndicator);
    typingRow.appendChild(col);
    messagesList.appendChild(typingRow);
    scrollToBottom();

    try {
      const currentGroupId = typeof getCurrentGroupId === 'function' ? getCurrentGroupId() : null;
      const res = await activeTransport({
        groupId: currentGroupId,
        messages: structuredClone(conversation)
      });

      typingRow.remove();

      if (res && typeof res.reply === 'string') {
        appendMessage('assistant', res.reply);
        conversation.push({ role: 'assistant', content: res.reply });
        persistActiveSession();

        let chips = res.options && Array.isArray(res.options) ? [...res.options] : [];
        if (res.createdGroupId) {
          chips.unshift({
            label: `🚀 Open "${res.createdGroupName || 'New Group'}"`,
            action: () => {
              if (typeof onNavigateGroup === 'function') {
                onNavigateGroup(res.createdGroupId, res);
              }
              if (typeof window.openGroup === 'function') {
                window.openGroup(res.createdGroupId);
              }
            }
          });
        }
        if (chips.length > 0) {
          renderChips(chips);
        }

        // Execute background refresh and navigation WITHOUT auto-closing the sidebar
        const shouldRefresh = Boolean(res.refreshGroup || res.navigateToGroupId || res.createdGroupId);
        if (shouldRefresh) {
          if (typeof onRefreshGroup === 'function') {
            await onRefreshGroup(res);
          }
          if (typeof onDataMutated === 'function') {
            await onDataMutated(res);
          }
          if (typeof window.refreshFairShare === 'function') {
            await window.refreshFairShare(res);
          }
          try {
            window.dispatchEvent(new CustomEvent('fairshare:datachanged', { detail: res }));
          } catch {}
        }

        if (res.createdGroupName && typeof showToast === 'function') {
          showToast(`Group "${res.createdGroupName}" created!`, 'success');
        }

        const navId = res.navigateToGroupId || res.createdGroupId;
        if (navId && typeof onNavigateGroup === 'function') {
          onNavigateGroup(navId, res);
        }
      } else {
        throw new Error('Received an unexpected response format from assistant.');
      }
    } catch (err) {
      typingRow.remove();
      lastFailedPrompt = cleanText;

      const errorRow = document.createElement('div');
      errorRow.className = 'ai-message-row ai-message-row-assistant';
      const errorBubble = document.createElement('div');
      errorBubble.className = 'ai-bubble ai-bubble-error';
      errorBubble.textContent = err.message || 'Sorry, something went wrong while processing your request.';
      errorRow.appendChild(errorBubble);
      messagesList.appendChild(errorRow);

      // Render Retry Chip
      const retryContainer = document.createElement('div');
      retryContainer.className = 'ai-option-chips';

      const retryBtn = document.createElement('button');
      retryBtn.type = 'button';
      retryBtn.className = 'ai-option-chip';
      retryBtn.textContent = '🔄 Retry message';
      retryBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        retryContainer.remove();
        if (lastFailedPrompt) handleSendMessage(lastFailedPrompt);
      };

      retryContainer.appendChild(retryBtn);
      messagesList.appendChild(retryContainer);
      scrollToBottom();
    } finally {
      isThinking = false;
      if (sendBtn) sendBtn.disabled = false;
      if (input) {
        input.disabled = false;
        input.focus();
      }
    }
  }

  function openDrawer() {
    const user = getAuthUser();
    const token = getAuthToken();
    const isDashboardOrGroup = (
      document.body.classList.contains('view-dashboard') ||
      document.body.classList.contains('view-group') ||
      document.body.classList.contains('dashboard-page-body') ||
      Boolean(document.getElementById('dash-user-badge')?.textContent?.includes('@')) ||
      Boolean(document.getElementById('dashboard-view')?.style.display !== 'none' && document.getElementById('dashboard-view')?.offsetParent !== null)
    );

    // Only block if definitely not logged in and on unauthenticated landing page
    if (!user && !token && !isDashboardOrGroup) {
      if (typeof onOpenAuth === 'function') {
        onOpenAuth();
      } else if (window.fairShareAuth?.openModal) {
        window.fairShareAuth.openModal();
      } else if (typeof showToast === 'function' && showToast !== window.alert) {
        showToast('Please log in or sign up to use FairShare AI Assistant.');
      }
      return;
    }

    isOpen = true;
    showChatView();

    if (backdrop) {
      backdrop.style.display = 'block';
      requestAnimationFrame(() => backdrop.classList.add('open'));
    }

    if (drawer) {
      drawer.style.display = 'flex';
      requestAnimationFrame(() => drawer.classList.add('open'));
    }

    if (launcher) {
      launcher.setAttribute('aria-expanded', 'true');
      launcher.classList.add('active');
    }

    const hasExistingContent = conversation.length > 0 && messagesList && messagesList.children.length > 0;
    if (!hasExistingContent) {
      // Check if previous sessions exist to restore or show welcome
      const sessions = getStoredSessions();
      if (sessions.length && (sessions[0].messages || []).length > 1) {
        loadSession(sessions[0].id);
      } else {
        showWelcome();
      }
    } else if (conversation.length === 1 && conversation[0].role === 'assistant') {
      // Refresh initial greeting to personalize for current logged-in user
      showWelcome();
    }

    setTimeout(() => {
      if (input) {
        input.disabled = false;
        input.focus();
      }
    }, 120);
  }

  function closeDrawer() {
    if (isRecording) {
      cancelRecording();
    }
    isOpen = false;

    if (drawer) {
      drawer.classList.remove('open');
      setTimeout(() => {
        if (!isOpen) drawer.style.display = 'none';
      }, 280);
    }

    if (backdrop) {
      backdrop.classList.remove('open');
      setTimeout(() => {
        if (!isOpen) backdrop.style.display = 'none';
      }, 280);
    }

    if (launcher) {
      launcher.setAttribute('aria-expanded', 'false');
      launcher.classList.remove('active');
    }
  }

  function toggleDrawer() {
    if (isOpen) closeDrawer();
    else openDrawer();
  }

  // --- Voice Input Engine (NVIDIA Riva Parakeet 1.1B Multilingual ASR) ---
  let isRecording = false;
  let audioContext = null;
  let mediaStream = null;
  let scriptProcessor = null;
  let pcmChunks = [];
  let recordTimer = null;
  let recordSeconds = 0;
  const MAX_RECORD_SECONDS = 25;

  function updateVoiceUI(state, text = '') {
    if (!micBtn) return;
    const micIcon = micBtn.querySelector('.mic-icon');
    if (state === 'recording') {
      micBtn.classList.add('recording');
      micBtn.classList.remove('transcribing');
      if (micIcon) micIcon.textContent = '⏹️';
      micBtn.setAttribute('aria-label', 'Stop recording');
      if (voiceStatus) {
        voiceStatus.style.display = 'flex';
        voiceStatus.className = 'ai-voice-status recording';
      }
      if (voiceStatusText) {
        voiceStatusText.textContent = text || `Listening... (${recordSeconds}s / 25s)`;
      }
      if (sendBtn) sendBtn.disabled = true;
    } else if (state === 'transcribing') {
      micBtn.classList.remove('recording');
      micBtn.classList.add('transcribing');
      if (micIcon) micIcon.textContent = '⏳';
      micBtn.setAttribute('aria-label', 'Transcribing audio...');
      if (voiceStatus) {
        voiceStatus.style.display = 'flex';
        voiceStatus.className = 'ai-voice-status transcribing';
      }
      if (voiceStatusText) {
        voiceStatusText.textContent = 'Transcribing with NVIDIA Riva...';
      }
      if (sendBtn) sendBtn.disabled = true;
    } else {
      // Idle - completely hidden
      micBtn.classList.remove('recording', 'transcribing');
      if (micIcon) micIcon.textContent = '🎤';
      micBtn.setAttribute('aria-label', 'Record voice message');
      if (voiceStatus) {
        voiceStatus.style.display = 'none';
        voiceStatus.className = 'ai-voice-status';
      }
      if (voiceStatusText) {
        voiceStatusText.textContent = '';
      }
      if (sendBtn) sendBtn.disabled = false;
    }
  }

  function stopMediaTracks() {
    if (scriptProcessor) {
      try { scriptProcessor.disconnect(); } catch {}
      scriptProcessor = null;
    }
    if (mediaStream) {
      try {
        mediaStream.getTracks().forEach(track => track.stop());
      } catch {}
      mediaStream = null;
    }
    if (audioContext && audioContext.state !== 'closed') {
      try { audioContext.close(); } catch {}
      audioContext = null;
    }
    if (recordTimer) {
      clearInterval(recordTimer);
      recordTimer = null;
    }
  }

  function cancelRecording() {
    if (!isRecording) return;
    isRecording = false;
    stopMediaTracks();
    pcmChunks = [];
    updateVoiceUI('idle');
  }

  function encodePcmToWav(chunks, sampleRate) {
    let totalLength = 0;
    for (const chunk of chunks) totalLength += chunk.length;
    const flatSamples = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      flatSamples.set(chunk, offset);
      offset += chunk.length;
    }

    const numChannels = 1;
    const bytesPerSample = 2; // 16-bit PCM
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = flatSamples.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // RIFF Chunk
    view.setUint8(0, 0x52); view.setUint8(1, 0x49); view.setUint8(2, 0x46); view.setUint8(3, 0x46); // "RIFF"
    view.setUint32(4, 36 + dataSize, true);
    view.setUint8(8, 0x57); view.setUint8(9, 0x41); view.setUint8(10, 0x56); view.setUint8(11, 0x45); // "WAVE"

    // fmt subchunk
    view.setUint8(12, 0x66); view.setUint8(13, 0x6d); view.setUint8(14, 0x74); view.setUint8(15, 0x20); // "fmt "
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true); // 16 bits

    // data subchunk
    view.setUint8(36, 0x64); view.setUint8(37, 0x61); view.setUint8(38, 0x74); view.setUint8(39, 0x61); // "data"
    view.setUint32(40, dataSize, true);

    // Float32 to Int16
    let writeOffset = 44;
    for (let i = 0; i < flatSamples.length; i++) {
      let s = Math.max(-1, Math.min(1, flatSamples[i]));
      view.setInt16(writeOffset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      writeOffset += 2;
    }

    return new Uint8Array(buffer);
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) {
      if (typeof showToast === 'function') {
        showToast('Microphone access is not supported in this browser.');
      }
      return;
    }

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
    } catch (err) {
      console.warn('Microphone permission denied:', err);
      if (typeof showToast === 'function') {
        showToast('Microphone permission denied. Please allow microphone access.');
      }
      return;
    }

    isRecording = true;
    pcmChunks = [];
    recordSeconds = 0;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContextClass({ sampleRate: 16000 });

    const source = audioContext.createMediaStreamSource(mediaStream);
    scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
    scriptProcessor.onaudioprocess = (e) => {
      if (!isRecording) return;
      const channelData = e.inputBuffer.getChannelData(0);
      pcmChunks.push(new Float32Array(channelData));
    };

    source.connect(scriptProcessor);
    scriptProcessor.connect(audioContext.destination);

    updateVoiceUI('recording');

    recordTimer = setInterval(() => {
      recordSeconds += 1;
      if (recordSeconds >= MAX_RECORD_SECONDS) {
        stopRecording();
      } else {
        updateVoiceUI('recording', `Listening... (${recordSeconds}s / 25s)`);
      }
    }, 1000);
  }

  async function stopRecording() {
    if (!isRecording) return;
    isRecording = false;

    if (recordTimer) {
      clearInterval(recordTimer);
      recordTimer = null;
    }

    updateVoiceUI('transcribing');

    const sampleRate = audioContext ? audioContext.sampleRate : 16000;
    const capturedChunks = [...pcmChunks];

    stopMediaTracks();

    if (!capturedChunks.length) {
      updateVoiceUI('idle');
      return;
    }

    try {
      const wavBytes = encodePcmToWav(capturedChunks, sampleRate);

      // Authenticated upload to /api/ai/transcribe
      const token = getAuthToken();
      const headers = {
        'Content-Type': 'audio/wav'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch('/api/ai/transcribe', {
        method: 'POST',
        headers,
        body: wavBytes
      });

      if (res.status === 401) {
        updateVoiceUI('idle');
        if (typeof showToast === 'function') {
          showToast('Please log in to use voice features.');
        }
        if (typeof onOpenAuth === 'function') onOpenAuth();
        return;
      }

      if (res.status === 503) {
        updateVoiceUI('idle');
        if (typeof showToast === 'function') {
          showToast('Voice transcription is currently not available.');
        }
        return;
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Server error (${res.status})`);
      }

      const data = await res.json();
      const transcript = (data.transcript || '').trim();

      updateVoiceUI('idle');

      if (transcript) {
        if (input) {
          input.value = transcript;
        }
        // Send transcribed message through AI pipeline
        await handleSendMessage(transcript);
      } else {
        if (typeof showToast === 'function') {
          showToast('No speech detected. Please speak clearly and try again.');
        }
      }
    } catch (err) {
      console.warn('Voice transcription failed:', err);
      updateVoiceUI('idle');
      if (typeof showToast === 'function') {
        showToast(err.message || 'Voice transcription failed. Please try again.');
      }
    }
  }

  if (micBtn) {
    micBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    };
  }

  if (voiceCancelBtn) {
    voiceCancelBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      cancelRecording();
    };
  }

  // Ensure initial voice state is strictly idle and hidden
  updateVoiceUI('idle');

  // Pre-populate state: if saved session exists and has content, load it; otherwise show welcome greeting
  const existingSessions = getStoredSessions();
  if (existingSessions.length && (existingSessions[0].messages || []).length > 1) {
    loadSession(existingSessions[0].id);
  } else {
    showWelcome();
  }

  // Enter key submission handler
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        handleSendMessage(input.value);
      }
    });
  }

  // Form submit
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleSendMessage(input?.value);
    });
  }

  // Bind direct click handlers to all sidebar header controls & backdrop
  if (historyBtn) {
    historyBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      showHistoryView();
    };
  }

  if (newChatBtn) {
    newChatBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      startNewChat();
    };
  }

  if (closeBtn) {
    closeBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeDrawer();
    };
  }

  if (historyBackBtn) {
    historyBackBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      showChatView();
    };
  }

  if (historyClearBtn) {
    historyClearBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (confirm('Clear all saved conversations?')) {
        clearAllSessions();
      }
    };
  }

  if (launcher) {
    launcher.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleDrawer();
    };
  }

  if (backdrop) {
    backdrop.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeDrawer();
    };
  }

  // Handle all clicks inside drawer with internal event delegation
  if (drawer) {
    drawer.addEventListener('click', (e) => {
      // 1. Close button
      if (e.target.closest('#ai-chat-close-btn, .ai-close-btn')) {
        e.preventDefault();
        e.stopPropagation();
        closeDrawer();
        return;
      }

      // 2. Chat history button
      if (e.target.closest('#ai-chat-history-btn')) {
        e.preventDefault();
        e.stopPropagation();
        showHistoryView();
        return;
      }

      // 3. New conversation button
      if (e.target.closest('#ai-chat-new-btn')) {
        e.preventDefault();
        e.stopPropagation();
        startNewChat();
        return;
      }

      // 4. History back button
      if (e.target.closest('#ai-history-back-btn')) {
        e.preventDefault();
        e.stopPropagation();
        showChatView();
        return;
      }

      // 5. History clear button
      if (e.target.closest('#ai-history-clear-btn')) {
        e.preventDefault();
        e.stopPropagation();
        if (confirm('Clear all saved conversations?')) {
          clearAllSessions();
        }
        return;
      }

      // Stop any other clicks inside drawer body from bubbling up to document
      // (prevents false outside-click closing when interacting inside drawer)
      e.stopPropagation();
    });
  }

  // Document-level handlers for external trigger buttons and outside clicks
  document.addEventListener('click', (e) => {
    // 1. Launcher FAB button fallback
    if (e.target.closest('#ai-chat-launcher-btn')) {
      e.preventDefault();
      e.stopPropagation();
      toggleDrawer();
      return;
    }

    // 2. Any trigger button across page (topbar, hero, mobile, group view)
    if (e.target.closest('.ai-trigger-btn, #topbar-ai-btn, #mobile-ai-btn, #hero-ai-btn, #group-ai-trigger')) {
      e.preventDefault();
      e.stopPropagation();
      openDrawer();
      return;
    }

    // 3. Outside click closes sidebar:
    // Only fires if sidebar is open, click is still in document body,
    // and click is truly outside drawer, backdrop, launcher, and any trigger button
    if (
      isOpen &&
      drawer &&
      document.body.contains(e.target) &&
      !drawer.contains(e.target) &&
      !launcher?.contains(e.target) &&
      !backdrop?.contains(e.target) &&
      !e.target.closest('.ai-trigger-btn, .ai-option-chip, .ai-chat-fab')
    ) {
      closeDrawer();
    }
  });

  // Accessible keyboard navigation (Escape to close)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) {
      closeDrawer();
    }
  });

  aiChatInstance = {
    open: openDrawer,
    close: closeDrawer,
    toggle: toggleDrawer,
    sendMessage: handleSendMessage,
    appendMessage: appendMessage,
    reset: showWelcome,
    newChat: startNewChat,
    showHistory: showHistoryView,
    onAuthChange: (newUser) => {
      if (!newUser) {
        showWelcome();
      } else if (conversation.length <= 1) {
        showWelcome();
      }
    }
  };

  window.fairShareAi = aiChatInstance;
  return aiChatInstance;
}

// Resilient auto-initialization fallback (guarantees AI chat works under any load timing)
if (typeof window !== 'undefined') {
  const selfBoot = () => {
    if (!window.fairShareAi) {
      window.fairShareAi = initAiChat({
        getCurrentGroupId: () => {
          const p = new URLSearchParams(window.location.search);
          return p.get('group') || p.get('code') || null;
        },
        onNavigateGroup: (id) => {
          if (typeof window.openGroup === 'function') {
            window.openGroup(id);
          } else {
            const url = new URL(window.location);
            url.searchParams.set('group', id);
            window.history.pushState({}, '', url);
          }
        },
        onRefreshGroup: () => {
          if (typeof window.refreshFairShare === 'function') {
            window.refreshFairShare();
          }
        }
      });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', selfBoot);
  } else {
    setTimeout(selfBoot, 20);
  }
}
