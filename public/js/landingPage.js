// FairShare — Modular Landing Page Controller (ES2020+ Vanilla)
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

function initLanding() {
  // Deep-link bypass: if ?group= or ?code= is present, redirect to group page immediately
  const params = new URLSearchParams(window.location.search);
  const deepGroupId = params.get('group') || params.get('code') || params.get('id');
  if (deepGroupId) {
    window.location.replace(`/group?id=${encodeURIComponent(deepGroupId)}`);
    return;
  }

  // Initialize retro 8-bit SFX toggle
  initRetroSFX();

  // Quick Group Jump Form
  const jumpForm = document.getElementById('landing-jump-form');
  const jumpInput = document.getElementById('landing-jump-input');
  if (jumpForm && jumpInput) {
    jumpForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const raw = jumpInput.value.trim();
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

  // How It Works Modal
  const howBtn = document.getElementById('landing-how-btn');
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

  // Floating AI Assistant
  try {
    initAiChat({
      getGroupId: () => null,
      onOpenAuth: () => {
        window.location.href = '/login';
      }
    });
  } catch (err) {
    console.warn('AI Chat init warning:', err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLanding);
} else {
  initLanding();
}
