// FairShare — Modular Dedicated Auth Page Controller (ES2020+ Vanilla)
import { setSession, getUser, clearSession } from './auth.js';
import { initRetroSFX, playRetroSound } from './retroEffects.js';

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

function initAuthPage() {
  initRetroSFX();

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

  if (tabLogin) tabLogin.addEventListener('click', () => setMode('login'));
  if (tabRegister) tabRegister.addEventListener('click', () => setMode('register'));

  // Handle URL query ?mode=signup or ?tab=register
  const urlParams = new URLSearchParams(window.location.search);
  const requestedMode = urlParams.get('mode') || urlParams.get('tab');
  if (requestedMode === 'signup' || requestedMode === 'register') {
    setMode('register');
  } else {
    setMode('login');
  }

  // Password Visibility Toggles
  if (toggleLoginPassBtn && loginPassInput) {
    toggleLoginPassBtn.addEventListener('click', () => {
      const isPass = loginPassInput.type === 'password';
      loginPassInput.type = isPass ? 'text' : 'password';
      toggleLoginPassBtn.textContent = isPass ? '🔒 Hide' : '👁 Show';
    });
  }

  if (toggleRegPassBtn && regPassInput) {
    toggleRegPassBtn.addEventListener('click', () => {
      const isPass = regPassInput.type === 'password';
      regPassInput.type = isPass ? 'text' : 'password';
      toggleRegPassBtn.textContent = isPass ? '🔒 Hide' : '👁 Show';
    });
  }

  // Real-time debounced username checker
  let usernameDebounceTimer = null;
  if (regUsernameInput && regUsernameStatus) {
    regUsernameInput.addEventListener('input', () => {
      clearTimeout(usernameDebounceTimer);
      const raw = regUsernameInput.value.trim().toLowerCase();

      if (!raw) {
        regUsernameStatus.hidden = true;
        regUsernameStatus.textContent = '';
        regUsernameStatus.className = 'username-status-indicator';
        return;
      }

      const validChars = /^[a-z0-9_]+$/.test(raw);
      if (!validChars || raw.length < 3 || raw.length > 30) {
        regUsernameStatus.hidden = false;
        regUsernameStatus.className = 'username-status-indicator status-invalid';
        regUsernameStatus.textContent = raw.length < 3 ? 'Too short (min 3)' : '3–30 letters/numbers/_';
        return;
      }

      regUsernameStatus.hidden = false;
      regUsernameStatus.className = 'username-status-indicator status-checking';
      regUsernameStatus.textContent = 'Checking…';

      usernameDebounceTimer = setTimeout(async () => {
        try {
          const res = await fetch(`/api/auth/check-username?username=${encodeURIComponent(raw)}`);
          if (!res.ok) throw new Error();
          const data = await res.json();
          if (data.available) {
            regUsernameStatus.className = 'username-status-indicator status-available';
            regUsernameStatus.textContent = `✓ @${data.username} is available`;
          } else {
            regUsernameStatus.className = 'username-status-indicator status-taken';
            regUsernameStatus.textContent = '✗ Username taken';
          }
        } catch {
          regUsernameStatus.hidden = true;
        }
      }, 350);
    });
  }

  // Handle Login Submit
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors();

      const identifier = loginIdInput?.value.trim() || '';
      const password = loginPassInput?.value || '';

      if (!identifier || !password) {
        if (errorBox) {
          errorBox.textContent = 'Email or @username and password are required.';
          errorBox.hidden = false;
        }
        playRetroSound('error');
        return;
      }

      const submitBtn = document.getElementById('auth-login-submit-btn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Signing in…';
      }

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: identifier, password })
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

        if (successBox) {
          successBox.textContent = `Signed in as @${data.user.username}. Redirecting to dashboard…`;
          successBox.hidden = false;
        }

        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 600);
      } catch (err) {
        playRetroSound('error');
        if (errorBox) {
          errorBox.textContent = 'Network error while signing in. Please check your connection.';
          errorBox.hidden = false;
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Log in ➔';
        }
      }
    });
  }

  // Handle Sign Up Submit
  if (regForm) {
    regForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors();

      const name = regNameInput?.value.trim() || '';
      const username = regUsernameInput?.value.trim().toLowerCase() || '';
      const email = regEmailInput?.value.trim().toLowerCase() || '';
      const password = regPassInput?.value || '';

      let hasClientError = false;

      if (!name) {
        const err = document.getElementById('err-reg-name');
        if (err) {
          err.textContent = 'Full name is required.';
          err.hidden = false;
        }
        hasClientError = true;
      }

      if (!username || username.length < 3 || username.length > 30 || !/^[a-z0-9_]+$/.test(username)) {
        const err = document.getElementById('err-reg-username');
        if (err) {
          err.textContent = 'Username must be 3–30 letters, numbers, or underscores.';
          err.hidden = false;
        }
        hasClientError = true;
      }

      if (!email || !email.includes('@')) {
        const err = document.getElementById('err-reg-email');
        if (err) {
          err.textContent = 'Valid email is required.';
          err.hidden = false;
        }
        hasClientError = true;
      }

      if (!password || password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
        const err = document.getElementById('err-reg-password');
        if (err) {
          err.textContent = 'Password must be at least 8 chars and contain a letter and a digit.';
          err.hidden = false;
        }
        hasClientError = true;
      }

      if (hasClientError) {
        playRetroSound('error');
        return;
      }

      const submitBtn = document.getElementById('auth-register-submit-btn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating account…';
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
              if (errEl) {
                errEl.textContent = msg;
                errEl.hidden = false;
              }
            });
          }
          if (errorBox) {
            errorBox.textContent = data.error || 'Failed to create account. Please fix the errors.';
            errorBox.hidden = false;
          }
          return;
        }

        // Automatic login after register
        const loginRes = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const loginData = await loginRes.json();
        if (loginRes.ok) {
          setSession(loginData.token, loginData.user);
        } else {
          setSession(null, { id: data.id, email: data.email, username: data.username, name: data.name });
        }

        playRetroSound('coin');
        showToast(`Account created! Welcome, @${data.username}!`);

        if (successBox) {
          successBox.textContent = `Welcome, @${data.username}! Redirecting to dashboard…`;
          successBox.hidden = false;
        }

        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 600);
      } catch (err) {
        playRetroSound('error');
        if (errorBox) {
          errorBox.textContent = 'Network error while creating account. Please try again.';
          errorBox.hidden = false;
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Create account ➔';
        }
      }
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAuthPage);
} else {
  initAuthPage();
}
