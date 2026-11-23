// FairShare Authentication Module
// Strict compliance: Plain ES2020+, XSS-safe (textContent only), 44px+ touch targets, sessionStorage.

const TOKEN_KEY = 'fs_auth_token';
const USER_KEY = 'fs_auth_user';

export function getToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

export function getUser() {
  try {
    const raw = sessionStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setSession(token, user) {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {}
}

export function clearSession() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  } catch {}
}

export async function authFetch(url, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return fetch(url, { ...options, headers });
}

/**
 * Initialize client-side authentication.
 * @param {Object} [callbacks]
 * @param {(user: Object | null) => void} [callbacks.onAuthChange]
 * @param {(msg: string) => void} [callbacks.showToast]
 */
export function initAuth({ onAuthChange, showToast } = {}) {
  const safeToast = typeof showToast === 'function' ? showToast : (msg) => {
    const t = document.getElementById('toast');
    if (t) {
      t.textContent = msg;
      t.hidden = false;
      t.classList.add('visible');
      setTimeout(() => { t.classList.remove('visible'); t.hidden = true; }, 2600);
    } else {
      console.log('[FairShare]', msg);
    }
  };
  showToast = safeToast;
  const openAuthBtn = document.getElementById('open-auth-btn');
  const authUserBar = document.getElementById('auth-user-bar');
  const authUsernameBadge = document.getElementById('auth-username-badge');
  const authUsernameText = document.getElementById('auth-username-text');
  const authLogoutBtn = document.getElementById('auth-logout-btn');

  const modal = document.getElementById('auth-modal');
  const closeModalBtn = document.getElementById('close-auth-modal-btn');
  const modalTitle = document.getElementById('auth-modal-title');

  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const loginForm = document.getElementById('auth-login-form');
  const regForm = document.getElementById('auth-register-form');

  const errorBox = document.getElementById('auth-error-box');
  const successBox = document.getElementById('auth-success-box');

  const loginIdInput = document.getElementById('login-identifier');
  const loginPassInput = document.getElementById('login-password');

  const regNameInput = document.getElementById('reg-name');
  const regUsernameInput = document.getElementById('reg-username');
  const regUsernameStatus = document.getElementById('reg-username-status');
  const regUsernameHint = document.getElementById('reg-username-hint');
  const regEmailInput = document.getElementById('reg-email');
  const regPassInput = document.getElementById('reg-password');

  function updateHeaderUI(user) {
    if (user && user.username) {
      if (openAuthBtn) openAuthBtn.hidden = true;
      if (authUserBar) authUserBar.hidden = false;
      if (authUsernameText) authUsernameText.textContent = user.username;
    } else {
      if (openAuthBtn) openAuthBtn.hidden = false;
      if (authUserBar) authUserBar.hidden = true;
      if (authUsernameText) authUsernameText.textContent = '';
    }
  }

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

  function showGlobalError(msg) {
    if (errorBox) {
      errorBox.textContent = msg;
      errorBox.hidden = false;
    }
  }

  function showFieldErrors(errors) {
    clearErrors();
    if (!errors) return;
    let first = '';
    Object.entries(errors).forEach(([field, msg]) => {
      if (!first) first = msg;
      const target = document.getElementById(`err-reg-${field}`) || document.getElementById(`err-login-${field}`);
      if (target) {
        target.textContent = msg;
        target.hidden = false;
      }
    });
    if (first && errorBox) {
      errorBox.textContent = first;
      errorBox.hidden = false;
    }
  }

  function switchTab(mode) {
    clearErrors();
    if (mode === 'register') {
      if (tabLogin) {
        tabLogin.classList.remove('active');
        tabLogin.setAttribute('aria-selected', 'false');
      }
      if (tabRegister) {
        tabRegister.classList.add('active');
        tabRegister.setAttribute('aria-selected', 'true');
      }
      if (loginForm) loginForm.style.display = 'none';
      if (regForm) regForm.style.display = 'block';
      if (modalTitle) modalTitle.textContent = 'Create FairShare Account';
      if (regNameInput) regNameInput.focus();
    } else {
      if (tabRegister) {
        tabRegister.classList.remove('active');
        tabRegister.setAttribute('aria-selected', 'false');
      }
      if (tabLogin) {
        tabLogin.classList.add('active');
        tabLogin.setAttribute('aria-selected', 'true');
      }
      if (regForm) regForm.style.display = 'none';
      if (loginForm) loginForm.style.display = 'block';
      if (modalTitle) modalTitle.textContent = 'Sign in to FairShare';
      if (loginIdInput) loginIdInput.focus();
    }
  }

  // Check existing session on load
  const token = getToken();
  if (token) {
    authFetch('/api/auth/me')
      .then(async (res) => {
        if (res.ok) {
          const user = await res.json();
          setSession(token, user);
          updateHeaderUI(user);
          if (typeof onAuthChange === 'function') onAuthChange(user);
        } else {
          clearSession();
          updateHeaderUI(null);
          if (typeof onAuthChange === 'function') onAuthChange(null);
          showToast('Session expired. Please log in again.');
        }
      })
      .catch(() => {
        // Offline / network issue: preserve cached user if available
        const user = getUser();
        updateHeaderUI(user);
      });
  } else {
    updateHeaderUI(null);
  }

  // Password visibility toggles
  const toggleLoginPassBtn = document.getElementById('toggle-login-pass-btn');
  if (toggleLoginPassBtn && loginPassInput) {
    toggleLoginPassBtn.onclick = (e) => {
      e.preventDefault();
      const isPass = loginPassInput.type === 'password';
      loginPassInput.type = isPass ? 'text' : 'password';
      toggleLoginPassBtn.textContent = isPass ? '🔒 Hide' : '👁 Show';
    };
  }

  const toggleRegPassBtn = document.getElementById('toggle-reg-pass-btn');
  if (toggleRegPassBtn && regPassInput) {
    toggleRegPassBtn.onclick = (e) => {
      e.preventDefault();
      const isPass = regPassInput.type === 'password';
      regPassInput.type = isPass ? 'text' : 'password';
      toggleRegPassBtn.textContent = isPass ? '🔒 Hide' : '👁 Show';
    };
  }

  // Modal open/close listeners (fallback if modal exists)
  if (openAuthBtn && modal) {
    openAuthBtn.onclick = () => {
      clearErrors();
      switchTab('login');
      if (typeof modal.showModal === 'function') modal.showModal();
    };
  }

  if (closeModalBtn && modal) {
    closeModalBtn.onclick = () => {
      modal.close();
    };
  }

  // Tab switching
  if (tabLogin) tabLogin.onclick = () => switchTab('login');
  if (tabRegister) tabRegister.onclick = () => switchTab('register');

  // Copy username badge tap
  if (authUsernameBadge) {
    authUsernameBadge.onclick = async () => {
      const user = getUser();
      const username = user?.username;
      if (!username) return;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(`@${username}`);
        }
        showToast(`Copied @${username} to clipboard!`);
      } catch {
        showToast(`Your username is @${username}`);
      }
    };
  }

  // Logout action
  if (authLogoutBtn) {
    authLogoutBtn.onclick = async () => {
      const activeToken = getToken();
      if (activeToken) {
        try {
          await fetch('/api/auth/logout', {
            method: 'POST',
            headers: { Authorization: `Bearer ${activeToken}` }
          });
        } catch {}
      }
      clearSession();
      updateHeaderUI(null);
      if (typeof onAuthChange === 'function') onAuthChange(null);
      showToast('Logged out successfully.');
    };
  }

  // Log In Form Submission
  if (loginForm) {
    loginForm.onsubmit = async (e) => {
      e.preventDefault();
      clearErrors();
      const identifier = (loginIdInput?.value || '').trim();
      const password = loginPassInput?.value || '';

      if (!identifier || !password) {
        showGlobalError('Email and password are required.');
        return;
      }

      const submitBtn = document.getElementById('auth-login-submit-btn');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: identifier, password })
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          showGlobalError(data.error || 'Failed to log in.');
          return;
        }

        setSession(data.token, data.user);
        updateHeaderUI(data.user);
        if (modal) modal.close();
        if (loginPassInput) loginPassInput.value = '';
        showToast(`Welcome back, @${data.user.username}!`);
        if (typeof onAuthChange === 'function') onAuthChange(data.user);
      } catch (err) {
        showGlobalError('Unable to connect to server. Check your connection.');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    };
  }

  // Real-time Username Availability Checker
  let usernameCheckTimeout = null;
  let isUsernameAvailable = false;

  async function checkUsernameAvailability(immediate = false) {
    if (!regUsernameInput || !regUsernameStatus) return;
    const raw = regUsernameInput.value.trim().replace(/^@/, '');

    if (!raw) {
      regUsernameStatus.hidden = true;
      regUsernameStatus.textContent = '';
      regUsernameStatus.className = 'username-status-indicator';
      isUsernameAvailable = false;
      const errEl = document.getElementById('err-reg-username');
      if (errEl) errEl.hidden = true;
      return;
    }

    if (raw.length < 3) {
      regUsernameStatus.hidden = false;
      regUsernameStatus.className = 'username-status-indicator warn';
      regUsernameStatus.textContent = 'Min 3 chars';
      isUsernameAvailable = false;
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(raw)) {
      regUsernameStatus.hidden = false;
      regUsernameStatus.className = 'username-status-indicator error';
      regUsernameStatus.textContent = 'Letters, nums, _';
      isUsernameAvailable = false;
      return;
    }

    if (raw.length > 30) {
      regUsernameStatus.hidden = false;
      regUsernameStatus.className = 'username-status-indicator error';
      regUsernameStatus.textContent = 'Max 30 chars';
      isUsernameAvailable = false;
      return;
    }

    regUsernameStatus.hidden = false;
    regUsernameStatus.className = 'username-status-indicator checking';
    regUsernameStatus.textContent = 'Checking...';

    try {
      const res = await fetch(`/api/auth/check-username?username=${encodeURIComponent(raw)}`);
      const data = await res.json().catch(() => ({}));

      const currentRaw = regUsernameInput.value.trim().replace(/^@/, '');
      if (currentRaw.toLowerCase() !== raw.toLowerCase()) return;

      const errEl = document.getElementById('err-reg-username');
      if (data.available) {
        regUsernameStatus.className = 'username-status-indicator success';
        regUsernameStatus.textContent = '✓ Available';
        isUsernameAvailable = true;
        if (errEl) errEl.hidden = true;
      } else {
        regUsernameStatus.className = 'username-status-indicator error';
        regUsernameStatus.textContent = '✗ Taken';
        isUsernameAvailable = false;
        if (errEl) {
          errEl.textContent = data.error || 'Username is already taken';
          errEl.hidden = false;
        }
      }
    } catch {
      regUsernameStatus.hidden = true;
    }
  }

  if (regUsernameInput) {
    regUsernameInput.addEventListener('input', () => {
      isUsernameAvailable = false;
      clearTimeout(usernameCheckTimeout);
      usernameCheckTimeout = setTimeout(() => {
        checkUsernameAvailability();
      }, 250);
    });

    regUsernameInput.addEventListener('blur', () => {
      clearTimeout(usernameCheckTimeout);
      checkUsernameAvailability(true);
    });
  }

  // Sign Up Form Submission
  if (regForm) {
    regForm.onsubmit = async (e) => {
      e.preventDefault();
      clearErrors();

      const name = (regNameInput?.value || '').trim();
      const username = (regUsernameInput?.value || '').trim().replace(/^@/, '');
      const email = (regEmailInput?.value || '').trim();
      const password = regPassInput?.value || '';

      // Compulsory name check
      if (!name) {
        showFieldErrors({ name: 'Full name is required' });
        regNameInput?.focus();
        return;
      }

      // Compulsory username check
      if (!username) {
        showFieldErrors({ username: 'Username is required' });
        regUsernameInput?.focus();
        return;
      }
      if (username.length < 3 || username.length > 30) {
        showFieldErrors({ username: 'Username must be between 3 and 30 characters' });
        regUsernameInput?.focus();
        return;
      }
      if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        showFieldErrors({ username: 'Username can only contain letters, numbers, and underscores' });
        regUsernameInput?.focus();
        return;
      }

      // Email & Password checks
      if (!email) {
        showFieldErrors({ email: 'Email is required' });
        regEmailInput?.focus();
        return;
      }
      if (!password || password.length < 8) {
        showFieldErrors({ password: 'Password must be between 8 and 128 characters' });
        regPassInput?.focus();
        return;
      }
      if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
        showFieldErrors({ password: 'Password must contain at least one letter and one number' });
        regPassInput?.focus();
        return;
      }

      const submitBtn = document.getElementById('auth-register-submit-btn');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const regRes = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, username, email, password })
        });

        const regData = await regRes.json().catch(() => ({}));

        if (!regRes.ok) {
          if (regRes.status === 400 && regData.errors) {
            showFieldErrors(regData.errors);
          } else if (regRes.status === 409) {
            if (regData.errors) {
              showFieldErrors(regData.errors);
            } else {
              showGlobalError(regData.error || 'Registration conflict occurred.');
            }
          } else {
            showGlobalError(regData.error || 'Registration failed.');
          }
          return;
        }

        // Auto-login after successful registration
        const loginRes = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });

        const loginData = await loginRes.json().catch(() => ({}));
        if (loginRes.ok && loginData.token) {
          setSession(loginData.token, loginData.user);
          updateHeaderUI(loginData.user);
          if (modal) modal.close();
          if (regPassInput) regPassInput.value = '';
          showToast(`Account created! Welcome, @${loginData.user.username}`);
          if (typeof onAuthChange === 'function') onAuthChange(loginData.user);
        } else {
          // If auto-login fails for any reason, switch to login tab with notice
          switchTab('login');
          if (loginIdInput) loginIdInput.value = regData.username || email;
          showToast(`Account created! Your username is @${regData.username}. Please log in.`);
        }
      } catch (err) {
        showGlobalError('Unable to connect to server. Check your connection.');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    };
  }

  return {
    getUser,
    getToken,
    switchTab,
    openModal: () => {
      clearErrors();
      switchTab('login');
      if (modal) modal.showModal();
    }
  };
}
