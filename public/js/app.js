// FairShare — Master Single Page & Multi-View Application Controller (ES2020+ Vanilla)
import {
  apiRequest,
  setUnauthorizedHandler,
  fetchDashboard,
  fetchGroup,
  createGroup,
  addExpense,
  deleteExpense,
  addMember,
  getBalances,
  getSettlements,
  recordPayment,
  setGroupStatus
} from './api.js';
import { formatMoney, parseRupees } from './money.js';
import { calculateSplit } from './split.js';
import { renderBalances } from './balances.js';
import { renderExpenses } from './expenses.js';
import { renderSettlements } from './settlements.js';
import { initRetroSFX, playRetroSound } from './retroEffects.js';
import { initAiChat } from './aiChat.js';

const TOKEN_KEY = 'fs_auth_token';
const USER_KEY = 'fs_auth_user';

let currentUser = null;
let currentGroupId = null;
let currentGroupData = null;
let cachedDashboardData = null;
let activeSplitType = 'equal';
let expenseToDelete = null;
let activeStatusFilter = 'active'; // 'active' | 'inactive' | 'all'
let activeFilter = 'all'; // 'all' | 'owes' | 'owed' | 'settled'

// DOM Element References
const landingView = document.getElementById('landing-view');
const authView = document.getElementById('auth-view');
const dashboardView = document.getElementById('dashboard-view');
const groupView = document.getElementById('group-view');
const aiChatRoot = document.getElementById('ai-chat-root');
const toastEl = document.getElementById('toast');

export function showToast(message) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.hidden = false;
  toastEl.classList.add('visible');
  clearTimeout(toastEl._timeout);
  toastEl._timeout = setTimeout(() => {
    toastEl.classList.remove('visible');
    toastEl.hidden = true;
  }, 2600);
}

// Global Auth State Management
export function getStoredUser() {
  try {
    const raw = sessionStorage.getItem(USER_KEY) || localStorage.getItem(USER_KEY) || sessionStorage.getItem('fairshare_user') || localStorage.getItem('fairshare_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Expose global auth helper interface for AI Assistant and modules
window.fairShareAuth = {
  getUser: () => {
    if (currentUser) return currentUser;
    const stored = getStoredUser();
    if (stored) {
      currentUser = stored;
      return stored;
    }
    const badgeEl = document.getElementById('dash-user-badge');
    const nameEl = document.getElementById('dash-user-name');
    if (badgeEl && badgeEl.textContent && badgeEl.textContent !== '@username') {
      const username = badgeEl.textContent.replace(/^@/, '').trim();
      const name = nameEl?.textContent?.trim() || username;
      currentUser = { username, name };
      return currentUser;
    }
    return null;
  },
  getToken: () => sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem('fairshare_token') || localStorage.getItem('fairshare_token'),
  openModal: () => showView('auth')
};

export function setSession(token, user) {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {}
  currentUser = user;
  if (window.fairShareAuth) {
    window.fairShareAuth.currentUser = user;
  }
}

export function clearSession() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {}
  currentUser = null;
  cachedDashboardData = null;
  if (window.fairShareAuth) {
    window.fairShareAuth.currentUser = null;
  }
}

// View Switching Controller
export function showView(viewName, { updateUrl = true } = {}) {
  const isLanding = viewName === 'landing';
  const isAuth = viewName === 'auth';
  const isDashboard = viewName === 'dashboard';
  const isGroup = viewName === 'group';

  document.body.classList.remove('view-landing', 'view-auth', 'view-dashboard', 'view-group');
  document.body.classList.add(`view-${viewName}`);

  document.documentElement.classList.toggle('is-landing', isLanding);
  document.body.classList.toggle('is-landing', isLanding);

  if (isLanding) {
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
  } else {
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
  }

  window.scrollTo(0, 0);

  // Hide all screens strictly
  if (landingView) {
    landingView.hidden = !isLanding;
    landingView.style.setProperty('display', isLanding ? 'flex' : 'none', 'important');
    landingView.classList.remove('fading-out');
  }
  if (authView) {
    authView.hidden = !isAuth;
    authView.style.setProperty('display', isAuth ? 'flex' : 'none', 'important');
  }
  if (dashboardView) {
    dashboardView.hidden = !isDashboard;
    dashboardView.style.setProperty('display', isDashboard ? 'block' : 'none', 'important');
  }
  if (groupView) {
    groupView.hidden = !isGroup;
    groupView.style.setProperty('display', isGroup ? 'block' : 'none', 'important');
  }

  // Mount/Show AI Assistant ONLY when authenticated AND on dashboard or group screen
  const effectiveUser = currentUser || getStoredUser();
  const token = sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem('fairshare_token') || localStorage.getItem('fairshare_token');
  const isAuthenticated = !!(effectiveUser || token);

  if (aiChatRoot) {
    if (isAuthenticated && (isDashboard || isGroup)) {
      aiChatRoot.style.display = 'block';
    } else {
      aiChatRoot.style.display = 'none';
      const drawer = document.getElementById('ai-chat-drawer');
      const backdrop = document.getElementById('ai-chat-backdrop');
      if (drawer) drawer.style.display = 'none';
      if (backdrop) backdrop.style.display = 'none';
    }
  }

  // Sync browser URL
  if (updateUrl) {
    if (isLanding) {
      window.history.pushState({ view: 'landing' }, '', '/');
    } else if (isAuth) {
      window.history.pushState({ view: 'auth' }, '', '/login');
    } else if (isDashboard) {
      window.history.pushState({ view: 'dashboard' }, '', '/dashboard');
    } else if (isGroup && currentGroupId) {
      window.history.pushState({ view: 'group', id: currentGroupId }, '', `/group?id=${encodeURIComponent(currentGroupId)}`);
    }
  }
}

// Browser Back/Forward navigation support
window.addEventListener('popstate', () => {
  const path = window.location.pathname;
  const searchParams = new URLSearchParams(window.location.search);
  const groupId = searchParams.get('id') || searchParams.get('group') || searchParams.get('code');

  if (groupId) {
    openGroup(groupId, { updateUrl: false });
  } else if (path === '/dashboard') {
    showView('dashboard', { updateUrl: false });
    loadDashboard();
  } else if (path === '/login' || path === '/signup' || path === '/auth') {
    showView('auth', { updateUrl: false });
  } else {
    showView('landing', { updateUrl: false });
  }
});

// Global 401 Interceptor Callback
setUnauthorizedHandler((msg) => {
  clearSession();
  showView('auth');
  const errBox = document.getElementById('auth-error-box');
  if (errBox) {
    errBox.textContent = msg || 'Your session expired. Please sign in again.';
    errBox.hidden = false;
  }
});

/* ==============================================================================
   SCREEN 1: ANIMATED TRIP LANDING PAGE CONTROLLER
   ============================================================================== */
function initLandingScreen() {
  const loginBtn = document.getElementById('landing-login-btn');
  const getStartedBtn = document.getElementById('landing-get-started-btn');
  const guestBtn = document.getElementById('landing-guest-btn');
  const skipBtn = document.getElementById('landing-skip-btn');
  const howBtn = document.getElementById('landing-how-btn');
  const aiBtn = document.getElementById('landing-ai-btn');
  const howModal = document.getElementById('how-it-works-modal');
  const authSplash = document.getElementById('landing-auth-splash');
  const unauthActions = document.getElementById('landing-unauth-actions');
  const welcomeUserEl = document.getElementById('landing-welcome-user');
  const progressBar = document.getElementById('splash-progress-bar');

  if (howBtn && howModal) {
    howBtn.addEventListener('click', () => {
      playRetroSound('click');
      try {
        howModal.showModal();
      } catch {
        howModal.setAttribute('open', '');
      }
    });
  }

  if (loginBtn) {
    loginBtn.addEventListener('click', () => {
      playRetroSound('click');
      showView('auth');
    });
  }

  if (getStartedBtn) {
    getStartedBtn.addEventListener('click', () => {
      playRetroSound('click');
      showView('auth');
    });
  }

  if (guestBtn) {
    guestBtn.addEventListener('click', () => {
      playRetroSound('click');
      // Continue as guest: open dashboard or prompt for group code
      if (currentUser) {
        showView('dashboard');
        loadDashboard();
      } else {
        // Allow guest to open a group directly by code/link or sign up
        const joinModal = document.getElementById('join-group-modal');
        if (joinModal) {
          try {
            joinModal.showModal();
          } catch {
            showView('auth');
          }
        } else {
          showView('auth');
        }
      }
    });
  }

  if (skipBtn) {
    skipBtn.addEventListener('click', () => {
      playRetroSound('click');
      if (currentUser) {
        showView('dashboard');
        loadDashboard();
      } else {
        showView('auth');
      }
    });
  }

  if (aiBtn) {
    aiBtn.addEventListener('click', () => {
      playRetroSound('click');
      if (currentUser) {
        const fab = document.getElementById('ai-chat-launcher-btn');
        if (fab) fab.click();
      } else {
        showView('auth');
        const errBox = document.getElementById('auth-error-box');
        if (errBox) {
          errBox.textContent = '✨ Sign in or create an account to chat with your FairShare AI Assistant.';
          errBox.hidden = false;
        }
      }
    });
  }

  return {
    startSplash: (user, dashboardPromise) => {
      if (unauthActions) unauthActions.style.display = 'none';
      if (loginBtn) loginBtn.style.display = 'none';
      if (authSplash) authSplash.style.display = 'flex';
      if (welcomeUserEl) welcomeUserEl.textContent = `Welcome back, @${user.username}`;

      // Trigger CSS transition for 2.5s progress bar
      setTimeout(() => {
        if (progressBar) progressBar.style.width = '100%';
      }, 50);

      const timerPromise = new Promise((resolve) => setTimeout(resolve, 2500));

      Promise.all([timerPromise, dashboardPromise])
        .then(([_, data]) => {
          if (landingView) {
            landingView.classList.add('fading-out');
            setTimeout(() => {
              showView('dashboard');
              if (data) renderDashboard(data);
            }, 400);
          } else {
            showView('dashboard');
            if (data) renderDashboard(data);
          }
        })
        .catch(() => {
          // Fallback to auth if preload failed
          showView('auth');
        });
    },
    showUnauth: () => {
      if (authSplash) authSplash.style.display = 'none';
      if (loginBtn) loginBtn.style.display = 'inline-flex';
      if (unauthActions) unauthActions.style.display = 'flex';
      showView('landing', { updateUrl: false });
    }
  };
}

/* ==============================================================================
   SCREEN 2: AUTH CONTROLLER (LOGIN & SIGN UP)
   ============================================================================== */
function initAuthScreen() {
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const loginForm = document.getElementById('auth-login-form');
  const regForm = document.getElementById('auth-register-form');
  const errorBox = document.getElementById('auth-error-box');
  const successBox = document.getElementById('auth-success-box');

  const loginIdInput = document.getElementById('login-identifier');
  const loginPassInput = document.getElementById('login-password');
  const toggleLoginPassBtn = document.getElementById('toggle-login-pass-btn');

  const regNameInput = document.getElementById('reg-name');
  const regUsernameInput = document.getElementById('reg-username');
  const regUsernameStatus = document.getElementById('reg-username-status');
  const regEmailInput = document.getElementById('reg-email');
  const regPassInput = document.getElementById('reg-password');
  const toggleRegPassBtn = document.getElementById('toggle-reg-pass-btn');

  function clearErrors() {
    if (errorBox) {
      errorBox.textContent = '';
      errorBox.hidden = true;
    }
    if (successBox) {
      successBox.textContent = '';
      successBox.hidden = true;
    }
    if (regUsernameStatus) {
      regUsernameStatus.hidden = true;
      regUsernameStatus.textContent = '';
      regUsernameStatus.className = 'username-status-indicator';
    }
    document.querySelectorAll('.field-error').forEach((el) => {
      el.textContent = '';
      el.hidden = true;
    });
  }

  function setMode(mode) {
    clearErrors();
    playRetroSound('blip');
    if (mode === 'register') {
      tabLogin?.classList.remove('active');
      tabLogin?.setAttribute('aria-selected', 'false');
      tabRegister?.classList.add('active');
      tabRegister?.setAttribute('aria-selected', 'true');
      if (loginForm) loginForm.style.display = 'none';
      if (regForm) regForm.style.display = 'flex';
      regNameInput?.focus();
    } else {
      tabRegister?.classList.remove('active');
      tabRegister?.setAttribute('aria-selected', 'false');
      tabLogin?.classList.add('active');
      tabLogin?.setAttribute('aria-selected', 'true');
      if (regForm) regForm.style.display = 'none';
      if (loginForm) loginForm.style.display = 'flex';
      loginIdInput?.focus();
    }
  }

  tabLogin?.addEventListener('click', () => setMode('login'));
  tabRegister?.addEventListener('click', () => setMode('register'));

  // Password Visibility Toggles
  toggleLoginPassBtn?.addEventListener('click', () => {
    const isPass = loginPassInput.type === 'password';
    loginPassInput.type = isPass ? 'text' : 'password';
    toggleLoginPassBtn.textContent = isPass ? '🔒 Hide' : '👁 Show';
  });

  toggleRegPassBtn?.addEventListener('click', () => {
    const isPass = regPassInput.type === 'password';
    regPassInput.type = isPass ? 'text' : 'password';
    toggleRegPassBtn.textContent = isPass ? '🔒 Hide' : '👁 Show';
  });

  // Auto-suggest username when user types email
  regEmailInput?.addEventListener('input', () => {
    if (regUsernameInput && !regUsernameInput.dataset.manualEdited) {
      const email = regEmailInput.value.trim().toLowerCase();
      const prefix = email.split('@')[0].replace(/[^a-z0-9_]/g, '').slice(0, 16);
      if (prefix.length >= 3) {
        regUsernameInput.value = prefix;
        checkUsernameLive(prefix);
      }
    }
  });

  regUsernameInput?.addEventListener('keydown', () => {
    if (regUsernameInput) regUsernameInput.dataset.manualEdited = 'true';
  });

  // Debounced live username checker
  let debounceTimer = null;
  function checkUsernameLive(val) {
    clearTimeout(debounceTimer);
    const raw = val.trim().toLowerCase().replace(/^@/, '');
    if (!raw) {
      if (regUsernameStatus) regUsernameStatus.hidden = true;
      return;
    }

    if (raw.length < 3 || raw.length > 30 || !/^[a-z0-9_]+$/.test(raw)) {
      if (regUsernameStatus) {
        regUsernameStatus.hidden = false;
        regUsernameStatus.className = 'username-status-indicator status-invalid';
        regUsernameStatus.textContent = raw.length < 3 ? 'Min 3 chars' : '3–30 letters/numbers/_';
      }
      return;
    }

    if (regUsernameStatus) {
      regUsernameStatus.hidden = false;
      regUsernameStatus.className = 'username-status-indicator status-checking';
      regUsernameStatus.textContent = 'Checking…';
    }

    debounceTimer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/check-username?username=${encodeURIComponent(raw)}`);
        const data = await res.json();
        if (regUsernameStatus) {
          if (data.available) {
            regUsernameStatus.className = 'username-status-indicator status-available';
            regUsernameStatus.textContent = `✓ @${data.username} is available`;
          } else {
            regUsernameStatus.className = 'username-status-indicator status-taken';
            regUsernameStatus.textContent = '✗ Username taken';
          }
        }
      } catch {
        if (regUsernameStatus) regUsernameStatus.hidden = true;
      }
    }, 300);
  }

  regUsernameInput?.addEventListener('input', () => {
    checkUsernameLive(regUsernameInput.value);
  });

  // Login Submit Handler
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();

    const email = loginIdInput?.value.trim() || '';
    const password = loginPassInput?.value || '';

    if (!email || !password) {
      if (errorBox) {
        errorBox.textContent = 'Email or @username and password are required.';
        errorBox.hidden = false;
      }
      playRetroSound('error');
      return;
    }

    const btn = document.getElementById('auth-login-submit-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Signing in…';
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();
      if (!res.ok) {
        playRetroSound('error');
        if (errorBox) {
          errorBox.textContent = data.error || 'Invalid email/username or password.';
          errorBox.hidden = false;
        }
        return;
      }

      setSession(data.token, data.user);
      playRetroSound('coin');
      showToast(`Welcome back, @${data.user.username}!`);

      // Check if user came from a pending group link
      const pendingGroupId = sessionStorage.getItem('fs_pending_group_id');
      if (pendingGroupId) {
        sessionStorage.removeItem('fs_pending_group_id');
        openGroup(pendingGroupId);
      } else {
        showView('dashboard');
        loadDashboard();
      }
    } catch {
      playRetroSound('error');
      if (errorBox) {
        errorBox.textContent = 'Network error while signing in. Please check your connection.';
        errorBox.hidden = false;
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Log in ➔';
      }
    }
  });

  // Sign Up Submit Handler
  regForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();

    const name = regNameInput?.value.trim() || '';
    let username = regUsernameInput?.value.trim().toLowerCase().replace(/^@/, '') || '';
    const email = regEmailInput?.value.trim().toLowerCase() || '';
    const password = regPassInput?.value || '';

    let hasError = false;

    if (!name) {
      const err = document.getElementById('err-reg-name');
      if (err) { err.textContent = 'Full name is required.'; err.hidden = false; }
      hasError = true;
    }

    if (!username || username.length < 3 || username.length > 30 || !/^[a-z0-9_]+$/.test(username)) {
      const err = document.getElementById('err-reg-username');
      if (err) { err.textContent = 'Username must be 3–30 letters, numbers, or underscores.'; err.hidden = false; }
      hasError = true;
    }

    if (!email || !email.includes('@')) {
      const err = document.getElementById('err-reg-email');
      if (err) { err.textContent = 'Valid email is required.'; err.hidden = false; }
      hasError = true;
    }

    if (!password || password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      const err = document.getElementById('err-reg-password');
      if (err) { err.textContent = 'Password must be 8+ chars with at least 1 letter and 1 digit.'; err.hidden = false; }
      hasError = true;
    }

    if (hasError) {
      playRetroSound('error');
      return;
    }

    const btn = document.getElementById('auth-register-submit-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Creating account…';
    }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, username, email, password })
      });

      const data = await res.json();
      if (!res.ok) {
        playRetroSound('error');
        if (data.errors) {
          Object.entries(data.errors).forEach(([field, msg]) => {
            const errEl = document.getElementById(`err-reg-${field}`);
            if (errEl) { errEl.textContent = msg; errEl.hidden = false; }
          });
        }
        if (errorBox) {
          errorBox.textContent = data.error || 'Failed to create account.';
          errorBox.hidden = false;
        }
        return;
      }

      // Auto login after sign up
      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const loginData = await loginRes.json();
      if (loginRes.ok) {
        setSession(loginData.token, loginData.user);
      }

      playRetroSound('coin');
      showToast(`Welcome! Your unique username is @${data.username}`);

      const pendingGroupId = sessionStorage.getItem('fs_pending_group_id');
      if (pendingGroupId) {
        sessionStorage.removeItem('fs_pending_group_id');
        openGroup(pendingGroupId);
      } else {
        showView('dashboard');
        loadDashboard();
      }
    } catch {
      playRetroSound('error');
      if (errorBox) {
        errorBox.textContent = 'Network error while creating account.';
        errorBox.hidden = false;
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Create account ➔';
      }
    }
  });
}

/* ==============================================================================
   SCREEN 3: AUTHENTICATED HOME DASHBOARD CONTROLLER
   ============================================================================== */
async function loadDashboard() {
  try {
    const data = await fetchDashboard();
    cachedDashboardData = data;
    renderDashboard(data);
  } catch (err) {
    if (err.status !== 401) {
      showToast(err.message || 'Failed to load personal dashboard.');
    }
  }
}

function renderDashboard(data) {
  if (!data) return;

  const { user, summary, groups } = data;
  if (user) {
    currentUser = user;
    if (window.fairShareAuth) {
      window.fairShareAuth.currentUser = user;
    }
    try {
      sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {}
    if (aiChatRoot) {
      aiChatRoot.style.display = 'block';
    }
  }

  // Header user badge & greeting
  const dashNameEl = document.getElementById('dash-user-name');
  const dashBadgeEl = document.getElementById('dash-user-badge');
  const userTextEl = document.getElementById('dashboard-username-text');

  if (dashNameEl) dashNameEl.textContent = user.name || user.username;
  if (dashBadgeEl) dashBadgeEl.textContent = `@${user.username}`;
  if (userTextEl) userTextEl.textContent = user.username;

  // 4 Executive KPI Metric Cards
  const paidEl = document.getElementById('kpi-total-paid');
  const netEl = document.getElementById('kpi-net-balance');
  const netSubEl = document.getElementById('kpi-net-sub');
  const receiveEl = document.getElementById('kpi-to-receive');
  const payEl = document.getElementById('kpi-to-pay');
  const activeCountEl = document.getElementById('kpi-active-groups');
  const unsettledBadgeEl = document.getElementById('kpi-unsettled-badge');

  if (paidEl) paidEl.textContent = formatMoney(summary.totalYouPaid);

  if (netEl) {
    netEl.textContent = formatMoney(Math.abs(summary.netBalance));
    netEl.className = 'kpi-value tabular-num';

    if (summary.netBalance > 0) {
      netEl.classList.add('positive');
      netEl.textContent = `+${formatMoney(summary.netBalance)}`;
      if (netSubEl) {
        netSubEl.textContent = 'Overall you get back';
        netSubEl.style.color = 'var(--semantic-owed, #22C55E)';
      }
    } else if (summary.netBalance < 0) {
      netEl.classList.add('negative');
      netEl.textContent = `-${formatMoney(Math.abs(summary.netBalance))}`;
      if (netSubEl) {
        netSubEl.textContent = 'Overall you owe';
        netSubEl.style.color = 'var(--semantic-owes, #F43F5E)';
      }
    } else {
      netEl.classList.add('neutral');
      if (netSubEl) {
        netSubEl.textContent = 'All settled up';
        netSubEl.style.color = 'var(--text-muted)';
      }
    }
  }

  if (receiveEl) receiveEl.textContent = formatMoney(summary.totalToReceive);
  if (payEl) payEl.textContent = formatMoney(summary.totalToPay);
  if (activeCountEl) activeCountEl.textContent = summary.totalGroups;
  if (unsettledBadgeEl) {
    unsettledBadgeEl.textContent = `${summary.unsettledGroups} unsettled`;
    unsettledBadgeEl.style.display = summary.unsettledGroups > 0 ? 'inline-block' : 'none';
  }

  renderGroupsGrid(groups);
}

function renderGroupsGrid(groups) {
  const container = document.getElementById('dashboard-groups-grid');
  if (!container) return;
  container.innerHTML = '';

  const allList = groups || [];
  const activeCount = allList.filter((g) => g.isActive !== false).length;
  const inactiveCount = allList.filter((g) => g.isActive === false).length;
  const allCount = allList.length;

  const countActiveEl = document.getElementById('filter-active-count');
  const countInactiveEl = document.getElementById('filter-inactive-count');
  const countAllEl = document.getElementById('filter-all-count');
  if (countActiveEl) countActiveEl.textContent = activeCount;
  if (countInactiveEl) countInactiveEl.textContent = inactiveCount;
  if (countAllEl) countAllEl.textContent = allCount;

  const filtered = allList.filter((g) => {
    const isGrpActive = g.isActive !== false;
    if (activeStatusFilter === 'active' && !isGrpActive) return false;
    if (activeStatusFilter === 'inactive' && isGrpActive) return false;

    if (activeFilter === 'owes') return g.myStatus === 'owes';
    if (activeFilter === 'owed') return g.myStatus === 'owed';
    if (activeFilter === 'settled') return g.myStatus === 'settled';
    return true;
  });

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-groups-notice';
    empty.style.cssText = 'grid-column: 1 / -1; padding: 36px 20px; background: var(--surface-card); border: 3px solid #000000; box-shadow: 2px 2px 0 1px #000000; font-family: var(--font-retro); font-size: 12px; text-align: center; color: var(--text-muted);';
    empty.textContent = groups.length === 0
      ? 'No groups yet — create your first trip group or join one with a code.'
      : 'No groups match the selected filter.';
    container.appendChild(empty);
    return;
  }

  filtered.forEach((g) => {
    const isGrpActive = g.isActive !== false;
    const card = document.createElement('div');
    card.className = `group-summary-card ${isGrpActive ? '' : 'inactive'}`.trim();
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `Open ${g.name}`);

    // Top Row: Name + Status Toggle + Member count
    const topRow = document.createElement('div');
    topRow.className = 'card-top-row';

    const title = document.createElement('h3');
    title.className = 'card-group-name';
    title.textContent = g.name;

    const topRight = document.createElement('div');
    topRight.style.cssText = 'display:flex;align-items:center;gap:8px;';

    const switchBtn = document.createElement('button');
    switchBtn.type = 'button';
    switchBtn.className = `retro-switch ${isGrpActive ? 'active' : 'inactive'}`;
    switchBtn.setAttribute('role', 'switch');
    switchBtn.setAttribute('aria-checked', isGrpActive ? 'true' : 'false');
    switchBtn.setAttribute('aria-label', `Toggle ${g.name} active status`);
    switchBtn.title = `Switch to ${isGrpActive ? 'Inactive' : 'Active'}`;

    const switchLabel = document.createElement('span');
    switchLabel.className = 'retro-switch-label';
    switchLabel.textContent = isGrpActive ? 'ACTIVE' : 'INACTIVE';

    const switchThumb = document.createElement('span');
    switchThumb.className = 'retro-switch-thumb';

    switchBtn.appendChild(switchLabel);
    switchBtn.appendChild(switchThumb);

    switchBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      playRetroSound('click');
      const nextState = !isGrpActive;
      try {
        switchBtn.disabled = true;
        await setGroupStatus(g.id, nextState);
        g.isActive = nextState;
        showToast(`${g.name} is now ${nextState ? 'Active' : 'Inactive'}`);
        await loadDashboard();
      } catch (err) {
        showToast(err.message || 'Failed to update group status.');
      } finally {
        switchBtn.disabled = false;
      }
    });

    const codePill = document.createElement('span');
    codePill.className = 'card-code-pill';
    codePill.textContent = `${g.memberCount} members`;

    topRight.appendChild(switchBtn);
    topRight.appendChild(codePill);

    topRow.appendChild(title);
    topRow.appendChild(topRight);
    card.appendChild(topRow);

    // Middle Row: Avatar Initials Stack
    const midRow = document.createElement('div');
    midRow.className = 'card-middle-row';

    const avatarStack = document.createElement('div');
    avatarStack.className = 'avatar-stack';

    const maxVisible = 4;
    (g.members || []).slice(0, maxVisible).forEach((m) => {
      const circle = document.createElement('span');
      circle.className = 'avatar-circle';
      circle.textContent = (m.name || '?').slice(0, 1).toUpperCase();
      circle.title = m.name;
      avatarStack.appendChild(circle);
    });

    if ((g.members || []).length > maxVisible) {
      const over = document.createElement('span');
      over.className = 'avatar-overflow';
      over.textContent = `+${g.members.length - maxVisible}`;
      avatarStack.appendChild(over);
    }

    midRow.appendChild(avatarStack);
    card.appendChild(midRow);

    // Financial Footer
    const footer = document.createElement('div');
    footer.className = 'financial-footer';

    const leftCol = document.createElement('div');
    leftCol.className = 'footer-col-left';

    const spendLabel = document.createElement('span');
    spendLabel.className = 'footer-label';
    spendLabel.textContent = 'Total Spent';

    const spendVal = document.createElement('span');
    spendVal.className = 'footer-amount';
    spendVal.textContent = formatMoney(g.totalGroupSpend);

    leftCol.appendChild(spendLabel);
    leftCol.appendChild(spendVal);
    footer.appendChild(leftCol);

    const badge = document.createElement('span');
    badge.className = `balance-status-badge ${g.myStatus}`;

    if (g.myStatus === 'owed') {
      badge.textContent = `Get ${formatMoney(g.myBalance)}`;
    } else if (g.myStatus === 'owes') {
      badge.textContent = `Pay ${formatMoney(Math.abs(g.myBalance))}`;
    } else {
      badge.textContent = 'Settled';
    }

    footer.appendChild(badge);
    card.appendChild(footer);

    // Click handler to open group
    const handleCardOpen = () => {
      playRetroSound('click');
      openGroup(g.id);
    };
    card.addEventListener('click', handleCardOpen);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleCardOpen();
      }
    });

    container.appendChild(card);
  });
}

function initDashboardEvents() {
  // Topbar Actions
  const newGroupBtn = document.getElementById('dash-new-group-btn');
  const joinGroupBtn = document.getElementById('dash-join-group-btn');
  const userPillBtn = document.getElementById('dashboard-username-pill');
  const logoutBtn = document.getElementById('dashboard-logout-btn');
  const askAiBtn = document.getElementById('ask-ai-create-btn');

  const createModal = document.getElementById('create-group-modal');
  const joinModal = document.getElementById('join-group-modal');

  newGroupBtn?.addEventListener('click', () => {
    playRetroSound('blip');
    initCreateMemberFields();
    if (typeof createModal?.showModal === 'function') createModal.showModal();
    else createModal?.setAttribute('open', '');
  });

  joinGroupBtn?.addEventListener('click', () => {
    playRetroSound('blip');
    if (typeof joinModal?.showModal === 'function') joinModal.showModal();
    else joinModal?.setAttribute('open', '');
  });

  askAiBtn?.addEventListener('click', () => {
    playRetroSound('blip');
    if (aiChatRoot) {
      aiChatRoot.style.display = 'block';
    }
    const drawer = document.getElementById('ai-chat-drawer');
    const backdrop = document.getElementById('ai-chat-backdrop');
    const launcher = document.getElementById('ai-chat-launcher-btn');
    if (drawer && !drawer.classList.contains('open')) {
      if (launcher) launcher.click();
      else {
        drawer.style.display = 'flex';
        drawer.classList.add('open');
        if (backdrop) {
          backdrop.style.display = 'block';
          backdrop.classList.add('open');
        }
      }
    }
    setTimeout(() => {
      const input = document.getElementById('ai-chat-input');
      if (input) {
        input.value = 'Create a trip group named "Goa Vacation" with Shaurya, Rohan and Priya';
        input.focus();
      }
    }, 150);
  });

  userPillBtn?.addEventListener('click', async () => {
    playRetroSound('click');
    if (currentUser?.username) {
      try {
        await navigator.clipboard.writeText(`@${currentUser.username}`);
        showToast('Username copied to clipboard!');
      } catch {
        prompt('Your username:', `@${currentUser.username}`);
      }
    }
  });

  logoutBtn?.addEventListener('click', async () => {
    playRetroSound('click');
    try {
      const token = sessionStorage.getItem(TOKEN_KEY);
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });
      }
    } catch {}
    clearSession();
    showToast('Signed out.');
    showView('auth');
  });

  // Filter Pills Handler (both status and debt filters)
  document.querySelectorAll('.filter-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      playRetroSound('blip');
      const statusVal = pill.getAttribute('data-status-filter');
      const debtVal = pill.getAttribute('data-filter');

      if (statusVal) {
        document.querySelectorAll('[data-status-filter]').forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        activeStatusFilter = statusVal;
      } else if (debtVal) {
        document.querySelectorAll('[data-filter]').forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        activeFilter = debtVal;
      }

      if (cachedDashboardData) {
        renderGroupsGrid(cachedDashboardData.groups);
      }
    });
  });

  // Create Group Form Submit
  const createForm = document.getElementById('create-group-form');
  const createErr = document.getElementById('create-group-error');
  createForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (createErr) createErr.hidden = true;

    const name = document.getElementById('create-group-name')?.value.trim() || '';
    const memberInputs = document.querySelectorAll('#create-members-container input');
    const members = Array.from(memberInputs).map((i) => i.value.trim()).filter(Boolean);

    if (!name) {
      if (createErr) { createErr.textContent = 'Group name is required.'; createErr.hidden = false; }
      playRetroSound('error');
      return;
    }

    if (members.length < 2) {
      if (createErr) { createErr.textContent = 'At least 2 members are required.'; createErr.hidden = false; }
      playRetroSound('error');
      return;
    }

    try {
      const group = await createGroup({ name, members });
      playRetroSound('coin');
      showToast('Group created!');
      if (typeof createModal?.close === 'function') createModal.close();
      else createModal?.removeAttribute('open');
      openGroup(group.id);
    } catch (err) {
      playRetroSound('error');
      if (createErr) {
        createErr.textContent = err.message || 'Failed to create group.';
        createErr.hidden = false;
      }
    }
  });

  // Join Group Form Submit
  const joinForm = document.getElementById('join-group-form');
  const joinErr = document.getElementById('join-group-error');
  joinForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (joinErr) joinErr.hidden = true;

    const raw = document.getElementById('join-group-input')?.value.trim() || '';
    if (!raw) return;

    let code = raw;
    try {
      const u = new URL(raw);
      code = u.searchParams.get('id') || u.searchParams.get('group') || u.searchParams.get('code') || raw;
    } catch {
      const m = raw.match(/[?&](?:id|group|code)=([a-zA-Z0-9_-]+)/);
      if (m) code = m[1];
    }

    if (typeof joinModal?.close === 'function') joinModal.close();
    else joinModal?.removeAttribute('open');

    openGroup(code);
  });
}

function initCreateMemberFields() {
  const container = document.getElementById('create-members-container');
  if (!container) return;
  container.innerHTML = '';

  const creatorName = currentUser?.name || currentUser?.username || 'Me';
  addCreateRow(container, creatorName, 'Member 1 (You)', true);
  addCreateRow(container, '', 'Member 2');
  addCreateRow(container, '', 'Member 3 (optional)');

  const addBtn = document.getElementById('add-more-members-btn');
  if (addBtn) {
    addBtn.onclick = () => {
      playRetroSound('blip');
      const count = container.querySelectorAll('.member-row').length;
      if (count >= 20) {
        showToast('Maximum 20 members per group.');
        return;
      }
      addCreateRow(container, '', `Member ${count + 1}`);
    };
  }
}

function addCreateRow(container, defaultValue = '', placeholder = '', isFirst = false) {
  const count = container.querySelectorAll('.member-row').length;
  if (count >= 20) return;

  const row = document.createElement('div');
  row.className = 'member-row';
  row.style.cssText = 'display: flex; gap: 6px; margin-bottom: 6px;';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = placeholder || `Member ${count + 1}`;
  input.value = defaultValue;
  input.maxLength = 40;
  input.required = count < 2;
  input.style.cssText = 'flex: 1;';

  row.appendChild(input);

  if (count >= 2 && !isFirst) {
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'button secondary';
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

/* ==============================================================================
   SCREEN 4: GROUP DETAIL WORKSPACE CONTROLLER
   ============================================================================== */
export async function openGroup(id) {
  if (!id) return;

  // Enforce auth lockdown
  if (!currentUser) {
    sessionStorage.setItem('fs_pending_group_id', id);
    showView('auth');
    const errBox = document.getElementById('auth-error-box');
    if (errBox) {
      errBox.textContent = 'Please sign in to view and manage this trip group.';
      errBox.hidden = false;
    }
    return;
  }

  currentGroupId = id;
  showView('group');
  await refreshGroup();
}

async function refreshGroup(quiet = false) {
  if (!currentGroupId) return;

  try {
    const group = await fetchGroup(currentGroupId);
    currentGroupData = group;
    renderGroupScreen(group);
  } catch (err) {
    if (err.status === 404) {
      showToast('Group not found. Redirecting to dashboard…');
      setTimeout(() => {
        showView('dashboard');
        loadDashboard();
      }, 1000);
    } else if (err.status !== 401) {
      showToast(err.message || 'Failed to load group details.');
    }
  }
}

function renderGroupScreen(group) {
  if (!group) return;

  document.title = `${group.name} — FairShare`;

  // Header Active/Inactive Toggle & Inactive Banner Controls
  const isGrpActive = group.isActive !== false;
  const headerToggle = document.getElementById('group-status-toggle');
  const headerToggleLabel = document.getElementById('group-status-toggle-label');
  const inactiveBanner = document.getElementById('group-inactive-banner');
  const addExpBtn = document.getElementById('group-add-expense-btn');
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
        await setGroupStatus(group.id, nextState);
        group.isActive = nextState;
        showToast(`${group.name} is now ${nextState ? 'Active' : 'Inactive'}`);
        renderGroupScreen(group);
        await loadDashboard();
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

  if (addExpBtn) {
    addExpBtn.disabled = !isGrpActive;
    addExpBtn.title = isGrpActive ? 'Add a new expense' : 'This group is inactive. Reactivate to add expenses.';
    addExpBtn.style.opacity = isGrpActive ? '1' : '0.5';
    addExpBtn.style.cursor = isGrpActive ? 'pointer' : 'not-allowed';
  }

  if (reactivateBtn) {
    reactivateBtn.onclick = async () => {
      playRetroSound('click');
      try {
        reactivateBtn.disabled = true;
        await setGroupStatus(group.id, true);
        group.isActive = true;
        showToast(`${group.name} reactivated!`);
        renderGroupScreen(group);
        await loadDashboard();
      } catch (err) {
        showToast(err.message || 'Failed to reactivate group.');
      } finally {
        reactivateBtn.disabled = false;
      }
    };
  }

  // Breadcrumbs & Heading
  const titleEl = document.getElementById('breadcrumb-group-title');
  const nameHeading = document.getElementById('group-name-heading');
  const codeDisplay = document.getElementById('group-code-display');

  if (titleEl) titleEl.textContent = group.name;
  if (nameHeading) nameHeading.textContent = group.name;
  if (codeDisplay) codeDisplay.textContent = group.id;

  // KPI Metrics
  const totalSpend = (group.expenses || []).reduce((sum, e) => sum + e.amount, 0);
  const totalDebt = (group.settlements || []).reduce((sum, s) => sum + s.amount, 0);

  const spendEl = document.getElementById('group-total-spend');
  const debtEl = document.getElementById('group-unsettled-debt');
  const memberCountEl = document.getElementById('group-member-count');
  const expCountEl = document.getElementById('group-expense-count');

  if (spendEl) spendEl.textContent = formatMoney(totalSpend);
  if (debtEl) debtEl.textContent = formatMoney(totalDebt);
  if (memberCountEl) memberCountEl.textContent = (group.members || []).length;
  if (expCountEl) expCountEl.textContent = (group.expenses || []).length;

  // Find user's balance in this group
  const userMember = findUserInGroup(group, currentUser);
  const userBalEl = document.getElementById('group-your-balance');
  const userBalStatusEl = document.getElementById('group-your-balance-status');

  if (userMember && group.balances) {
    const memBal = group.balances.find((b) => b.memberId === userMember.id);
    const balance = memBal ? memBal.balance : 0;

    if (userBalEl) {
      userBalEl.textContent = formatMoney(Math.abs(balance));
      userBalEl.className = 'stat-value tabular-num';

      if (balance > 0) {
        userBalEl.style.color = 'var(--semantic-owed, #22C55E)';
        userBalEl.textContent = `+${formatMoney(balance)}`;
        if (userBalStatusEl) userBalStatusEl.textContent = 'You get back';
      } else if (balance < 0) {
        userBalEl.style.color = 'var(--semantic-owes, #F43F5E)';
        userBalEl.textContent = `-${formatMoney(Math.abs(balance))}`;
        if (userBalStatusEl) userBalStatusEl.textContent = 'You owe';
      } else {
        userBalEl.style.color = 'var(--text-primary)';
        if (userBalStatusEl) userBalStatusEl.textContent = 'All settled up';
      }
    }
  }

  // Populate Payer Filter
  const payerSel = document.getElementById('payer-filter');
  if (payerSel) {
    const current = payerSel.value;
    payerSel.innerHTML = '<option value="all">All payers</option>';
    (group.members || []).forEach((m) => {
      const opt = document.createElement('option');
      opt.value = String(m.id);
      opt.textContent = m.name;
      payerSel.appendChild(opt);
    });
    payerSel.value = current || 'all';
  }

  // Render Tab Contents
  renderExpensesTab();
  renderBalancesTab();
  renderSettlementsTab();
}

function findUserInGroup(group, user) {
  if (!group?.members || !user) return null;
  if (user.id != null) {
    const byId = group.members.find((m) => m.userId === user.id);
    if (byId) return byId;
  }
  const uName = user.name?.trim().toLowerCase();
  const uUser = user.username?.trim().toLowerCase();
  return group.members.find((m) => {
    const name = m.name?.trim().toLowerCase();
    return (uUser && name === uUser) || (uName && name === uName);
  }) || null;
}

function renderExpensesTab() {
  const container = document.getElementById('expenses-list-container');
  if (!container || !currentGroupData) return;

  const searchVal = document.getElementById('expense-search')?.value.trim() || '';
  const payerVal = document.getElementById('payer-filter')?.value || 'all';

  renderExpenses(
    currentGroupData.expenses || [],
    currentGroupData.members || [],
    searchVal,
    payerVal,
    null,
    (exp) => confirmDelete(exp),
    container
  );
}

function renderBalancesTab() {
  const container = document.getElementById('balances-list-container');
  if (!container || !currentGroupData) return;
  renderBalances(currentGroupData.balances || [], container);
}

function renderSettlementsTab() {
  const container = document.getElementById('settlements-list-container');
  if (!container || !currentGroupData) return;

  renderSettlements(
    currentGroupData.settlements || [],
    currentGroupData.members || [],
    async (transfer) => {
      if (currentGroupData?.isActive === false) {
        showToast('This group is inactive. Reactivate to record settlements.');
        return;
      }
      try {
        await recordPayment(currentGroupId, {
          from: transfer.from,
          to: transfer.to,
          amount: transfer.amount
        });
        playRetroSound('coin');
        showToast(`Settled ${formatMoney(transfer.amount)} payment!`);
        await refreshGroup(true);
        await loadDashboard();
      } catch (err) {
        showToast(err.message || 'Failed to record settlement payment.');
      }
    },
    (transfer, fromName, toName) => {
      const text = `Hey ${fromName}! Gentle reminder to settle ₹${(transfer.amount / 100).toFixed(2)} with ${toName} for our trip on FairShare: ${window.location.href}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    },
    container
  );
}

function confirmDelete(exp) {
  expenseToDelete = exp;
  playRetroSound('blip');
  const modal = document.getElementById('delete-confirm-modal');
  const descEl = document.getElementById('delete-expense-desc');
  if (descEl) descEl.textContent = `"${exp.description}" (${formatMoney(exp.amount)})`;

  if (typeof modal?.showModal === 'function') modal.showModal();
  else modal?.setAttribute('open', '');
}

function initGroupWorkspaceEvents() {
  // Back to Dashboard
  const backBtn = document.getElementById('group-back-btn');
  const breadcrumbBack = document.getElementById('breadcrumb-dash-link');

  const goDash = () => {
    playRetroSound('click');
    showView('dashboard');
    loadDashboard();
  };

  backBtn?.addEventListener('click', goDash);
  breadcrumbBack?.addEventListener('click', goDash);

  // Share Group
  const shareBtn = document.getElementById('group-share-btn');
  shareBtn?.addEventListener('click', async () => {
    playRetroSound('click');
    const shareUrl = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: currentGroupData ? currentGroupData.name : 'FairShare Trip Group',
          text: 'Join our trip group expense ledger on FairShare:',
          url: shareUrl
        });
        return;
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast('Group link copied to clipboard!');
    } catch {
      prompt('Copy group link:', shareUrl);
    }
  });

  // Copy Code
  const copyCodeBtn = document.getElementById('group-copy-code-btn');
  copyCodeBtn?.addEventListener('click', async () => {
    playRetroSound('click');
    if (currentGroupId) {
      try {
        await navigator.clipboard.writeText(currentGroupId);
        showToast('Group code copied!');
      } catch {
        prompt('Group code:', currentGroupId);
      }
    }
  });

  // Export CSV
  const exportBtn = document.getElementById('export-csv-btn');
  exportBtn?.addEventListener('click', () => {
    if (!currentGroupData?.expenses || currentGroupData.expenses.length === 0) {
      showToast('No expenses to export.');
      return;
    }
    playRetroSound('coin');

    function sanitize(val) {
      let str = String(val ?? '').replace(/"/g, '""');
      if (/^[=+\-@\t\r]/.test(str)) str = "'" + str;
      return `"${str}"`;
    }

    const headers = ['ID', 'Date', 'Description', 'Paid By', 'Amount (₹)', 'Split Type'];
    const rows = currentGroupData.expenses.map((e) => {
      const dateStr = e.createdAt ? new Date(e.createdAt).toLocaleDateString() : 'N/A';
      const amtStr = (e.amount / 100).toFixed(2);
      const payerObj = currentGroupData.members.find((m) => m.id === e.paidBy);
      const payerName = payerObj ? payerObj.name : String(e.paidBy);
      return [e.id, dateStr, e.description, payerName, amtStr, 'equal'].map(sanitize).join(',');
    });

    const csvContent = '\uFEFF' + [headers.map(sanitize).join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = currentGroupData.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    a.download = `fairshare_${safeName}_expenses.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Expense CSV downloaded!');
  });

  // Tabs Switching
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      if (!tab) return;
      playRetroSound('blip');

      document.querySelectorAll('.tab-btn').forEach((b) => {
        const match = b.getAttribute('data-tab') === tab;
        b.classList.toggle('active', match);
        b.setAttribute('aria-selected', match ? 'true' : 'false');
      });

      const expTab = document.getElementById('expenses-tab-content');
      const balTab = document.getElementById('balances-tab-content');
      const setTab = document.getElementById('settlements-tab-content');

      if (expTab) expTab.hidden = tab !== 'expenses';
      if (balTab) balTab.hidden = tab !== 'balances';
      if (setTab) setTab.hidden = tab !== 'settlements';
    });
  });

  // Search & Filter Inputs
  document.getElementById('expense-search')?.addEventListener('input', renderExpensesTab);
  document.getElementById('payer-filter')?.addEventListener('change', renderExpensesTab);

  // Add Expense Modal Trigger
  const addExpBtn = document.getElementById('group-add-expense-btn');
  const addExpModal = document.getElementById('add-expense-modal');
  addExpBtn?.addEventListener('click', () => {
    if (!currentGroupData) return;
    playRetroSound('blip');

    const errBox = document.getElementById('expense-form-error');
    if (errBox) errBox.hidden = true;

    // Populate Payer dropdown
    const payerSelect = document.getElementById('expense-paid-by');
    if (payerSelect) {
      payerSelect.innerHTML = '';
      (currentGroupData.members || []).forEach((m) => {
        const opt = document.createElement('option');
        opt.value = String(m.id);
        opt.textContent = m.name;
        payerSelect.appendChild(opt);
      });
    }

    renderSplitConfig();
    updateSplitPreviewLive();

    if (typeof addExpModal?.showModal === 'function') addExpModal.showModal();
    else addExpModal?.setAttribute('open', '');
  });

  // Split Pills in Add Expense Dialog
  document.querySelectorAll('.split-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      const type = pill.getAttribute('data-type');
      if (!type) return;
      activeSplitType = type;
      document.querySelectorAll('.split-pill').forEach((p) => p.classList.remove('selected'));
      pill.classList.add('selected');
      renderSplitConfig();
      updateSplitPreviewLive();
    });
  });

  document.getElementById('expense-amount')?.addEventListener('input', updateSplitPreviewLive);

  // Add Expense Submit Handler
  const expForm = document.getElementById('expense-form');
  const expErr = document.getElementById('expense-form-error');
  expForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (expErr) expErr.hidden = true;

    const desc = document.getElementById('expense-desc')?.value.trim() || '';
    const rawAmt = document.getElementById('expense-amount')?.value.trim() || '';
    const paidById = parseInt(document.getElementById('expense-paid-by')?.value, 10);

    let amountPaise = 0;
    try {
      amountPaise = parseRupees(rawAmt);
    } catch (err) {
      if (expErr) { expErr.textContent = err.message || 'Invalid amount.'; expErr.hidden = false; }
      playRetroSound('error');
      return;
    }

    if (!desc) {
      if (expErr) { expErr.textContent = 'Description is required.'; expErr.hidden = false; }
      playRetroSound('error');
      return;
    }

    let split = { type: activeSplitType };
    if (activeSplitType === 'equal') {
      const checked = Array.from(document.querySelectorAll('input[name="equal_member"]:checked')).map((c) => parseInt(c.value, 10));
      if (checked.length === 0) {
        if (expErr) { expErr.textContent = 'Select at least one participant.'; expErr.hidden = false; }
        playRetroSound('error');
        return;
      }
      split.participants = checked;
    } else if (activeSplitType === 'shares') {
      const weights = {};
      document.querySelectorAll('.weight-input').forEach((inp) => {
        const w = parseInt(inp.value, 10) || 0;
        if (w > 0) weights[inp.dataset.id] = w;
      });
      split.weights = weights;
    } else if (activeSplitType === 'exact') {
      const amounts = {};
      let sumExact = 0;
      document.querySelectorAll('.exact-input').forEach((inp) => {
        try {
          const p = parseRupees(inp.value.trim());
          if (p > 0) {
            amounts[inp.dataset.id] = p;
            sumExact += p;
          }
        } catch {}
      });
      if (sumExact !== amountPaise) {
        if (expErr) {
          expErr.textContent = `Exact amounts must equal ${formatMoney(amountPaise)}. Currently: ${formatMoney(sumExact)}.`;
          expErr.hidden = false;
        }
        playRetroSound('error');
        return;
      }
      split.amounts = amounts;
    }

    try {
      await addExpense(currentGroupId, {
        description: desc,
        amount: amountPaise,
        paidBy: paidById,
        split
      });

      playRetroSound('coin');
      showToast('Expense recorded!');

      if (typeof addExpModal?.close === 'function') addExpModal.close();
      else addExpModal?.removeAttribute('open');

      await refreshGroup(true);
    } catch (err) {
      playRetroSound('error');
      if (expErr) {
        expErr.textContent = err.message || 'Failed to save expense.';
        expErr.hidden = false;
      }
    }
  });

  // Delete Expense Confirmation
  const confirmDelBtn = document.getElementById('confirm-delete-btn');
  const cancelDelBtn = document.getElementById('cancel-delete-btn');
  const delModal = document.getElementById('delete-confirm-modal');

  confirmDelBtn?.addEventListener('click', async () => {
    if (!expenseToDelete || !currentGroupId) return;
    try {
      await deleteExpense(currentGroupId, expenseToDelete.id);
      playRetroSound('laser');
      showToast('Expense deleted.');
      if (typeof delModal?.close === 'function') delModal.close();
      else delModal?.removeAttribute('open');
      expenseToDelete = null;
      await refreshGroup(true);
    } catch (err) {
      playRetroSound('error');
      showToast(err.message || 'Failed to delete expense.');
    }
  });

  cancelDelBtn?.addEventListener('click', () => {
    playRetroSound('click');
    if (typeof delModal?.close === 'function') delModal.close();
    else delModal?.removeAttribute('open');
    expenseToDelete = null;
  });

  // Generic Close Modal buttons
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
}

function renderSplitConfig() {
  const container = document.getElementById('split-config-container');
  if (!container || !currentGroupData) return;
  container.innerHTML = '';

  if (activeSplitType === 'equal') {
    const list = document.createElement('div');
    list.className = 'equal-checklist';
    (currentGroupData.members || []).forEach((m) => {
      const label = document.createElement('label');
      label.className = 'member-check-label';
      label.style.cssText = 'display: flex; align-items: center; gap: 8px; margin: 4px 0; cursor: pointer;';

      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.name = 'equal_member';
      chk.value = String(m.id);
      chk.checked = true;
      chk.addEventListener('change', updateSplitPreviewLive);

      const span = document.createElement('span');
      span.textContent = m.name;

      label.appendChild(chk);
      label.appendChild(span);
      list.appendChild(label);
    });
    container.appendChild(list);
  } else if (activeSplitType === 'shares') {
    const list = document.createElement('div');
    (currentGroupData.members || []).forEach((m) => {
      const row = document.createElement('div');
      row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin: 6px 0;';

      const label = document.createElement('span');
      label.textContent = m.name;

      const inp = document.createElement('input');
      inp.type = 'number';
      inp.className = 'weight-input tabular-num';
      inp.dataset.id = String(m.id);
      inp.value = '1';
      inp.min = '0';
      inp.style.cssText = 'width: 80px; text-align: right;';
      inp.addEventListener('input', updateSplitPreviewLive);

      row.appendChild(label);
      row.appendChild(inp);
      list.appendChild(row);
    });
    container.appendChild(list);
  } else if (activeSplitType === 'exact') {
    const list = document.createElement('div');
    (currentGroupData.members || []).forEach((m) => {
      const row = document.createElement('div');
      row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin: 6px 0;';

      const label = document.createElement('span');
      label.textContent = m.name;

      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'exact-input tabular-num';
      inp.dataset.id = String(m.id);
      inp.placeholder = '0.00';
      inp.style.cssText = 'width: 110px; text-align: right;';
      inp.addEventListener('input', updateSplitPreviewLive);

      row.appendChild(label);
      row.appendChild(inp);
      list.appendChild(row);
    });
    container.appendChild(list);
  }
}

function updateSplitPreviewLive() {
  const preview = document.getElementById('split-preview-list');
  if (!preview || !currentGroupData) return;

  const rawAmt = document.getElementById('expense-amount')?.value.trim() || '';
  let totalPaise = 0;
  try {
    totalPaise = parseRupees(rawAmt);
  } catch {
    totalPaise = 0;
  }

  if (totalPaise <= 0) {
    preview.innerHTML = '<span style="color:var(--text-muted); font-size:0.85rem;">Enter an amount above to preview split.</span>';
    return;
  }

  let split = { type: activeSplitType };
  if (activeSplitType === 'equal') {
    const checked = Array.from(document.querySelectorAll('input[name="equal_member"]:checked')).map((c) => parseInt(c.value, 10));
    if (checked.length === 0) {
      preview.innerHTML = '<span style="color:var(--semantic-owes); font-size:0.85rem;">Select at least one participant.</span>';
      return;
    }
    split.participants = checked;
  }

  try {
    const shares = calculateSplit(totalPaise, split, currentGroupData.members);
    preview.innerHTML = '';
    Object.entries(shares).forEach(([name, paise]) => {
      const row = document.createElement('div');
      row.style.cssText = 'display: flex; justify-content: space-between; font-size: 0.85rem; padding: 2px 0;';

      const nSpan = document.createElement('span');
      nSpan.textContent = name;

      const aSpan = document.createElement('span');
      aSpan.className = 'tabular-num';
      aSpan.textContent = formatMoney(paise);

      row.appendChild(nSpan);
      row.appendChild(aSpan);
      preview.appendChild(row);
    });
  } catch (err) {
    preview.innerHTML = `<span style="color:var(--semantic-owes); font-size:0.85rem;">${err.message || 'Invalid split.'}</span>`;
  }
}

/* ==============================================================================
   APPLICATION BOOT & AUTH-LOCKED INITIALIZATION
   ============================================================================== */
async function bootApp() {
  initRetroSFX();
  const landing = initLandingScreen();
  initAuthScreen();
  initDashboardEvents();
  initGroupWorkspaceEvents();

  // Expose global methods for seamless cross-component communication
  window.openGroup = openGroup;
  window.refreshFairShare = async (res) => {
    if (currentGroupId) await refreshGroup(true);
    await loadDashboard();
  };

  // Listen for data mutation events (e.g. from AI Assistant or background sync)
  window.addEventListener('fairshare:datachanged', async () => {
    if (currentGroupId) await refreshGroup(true);
    await loadDashboard();
  });

  // Initialize AI Assistant
  try {
    initAiChat({
      getCurrentGroupId: () => currentGroupId,
      getGroupId: () => currentGroupId,
      onRefreshGroup: async (res) => {
        if (currentGroupId) await refreshGroup(true);
        await loadDashboard();
      },
      onDataMutated: async (res) => {
        if (currentGroupId) await refreshGroup(true);
        await loadDashboard();
      },
      onNavigateGroup: async (groupId, res) => {
        if (groupId) {
          await loadDashboard();
        }
      },
      onOpenAuth: () => {
        showView('auth');
      },
      showToast
    });
  } catch (err) {
    console.warn('AI Chat init warning:', err);
  }

  const urlParams = new URLSearchParams(window.location.search);
  const deepGroupId = urlParams.get('id') || urlParams.get('group') || urlParams.get('code');
  const token = sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);

  // If a deep-linked group is requested but user is not authenticated:
  if (deepGroupId && !token) {
    sessionStorage.setItem('fs_pending_group_id', deepGroupId);
    showView('auth');
    const errBox = document.getElementById('auth-error-box');
    if (errBox) {
      errBox.textContent = 'Please sign in to view this shared trip group.';
      errBox.hidden = false;
    }
    return;
  }

  const path = window.location.pathname;

  // If token exists, verify in background
  if (token) {
    try {
      const meRes = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (meRes.ok) {
        const user = await meRes.json();
        currentUser = user;
        setSession(token, user);

        if (deepGroupId) {
          openGroup(deepGroupId);
          return;
        }

        if (path === '/dashboard' || path === '/login' || path === '/signup' || path === '/auth') {
          showView('dashboard', { updateUrl: path !== '/dashboard' });
          loadDashboard();
          return;
        }

        // Case A: On root "/" when already authenticated:
        // Preload dashboard during sleek 2.5s splash progress bar, then reveal Dashboard
        const dashPromise = fetchDashboard();
        landing.startSplash(user, dashPromise);
        return;
      }
    } catch {}
    // If token validation failed, clear expired session
    clearSession();
  }

  // If unauthenticated and trying to access dashboard or auth paths:
  if (path === '/dashboard' || path === '/login' || path === '/signup' || path === '/auth') {
    showView('auth', { updateUrl: false });
    return;
  }

  // Case B: Not logged in on root "/"
  landing.showUnauth();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootApp);
} else {
  bootApp();
}
