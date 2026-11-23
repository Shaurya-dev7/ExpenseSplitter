// ==========================================================================
// FairShare RetroUI Effects Engine
// Pixel click sparkles, 8-bit Web Audio SFX, Floating Text & CRT Atmosphere
// Zero runtime npm dependencies — uses native Web Audio API & vanilla DOM.
// ==========================================================================

const SFX_STORAGE_KEY = 'fairshare_retro_sfx_enabled';

// Web Audio synthesizer instance (lazy-initialized upon user gesture)
let audioCtx = null;
let sfxEnabled = true;

try {
  const stored = localStorage.getItem(SFX_STORAGE_KEY);
  if (stored !== null) {
    sfxEnabled = stored === 'true';
  }
} catch {
  sfxEnabled = true;
}

function getAudioContext() {
  if (!audioCtx && typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Play authentic 8-bit sound synthesizers via native square-wave oscillators.
 */
export const retroSound = {
  // Short 8-bit UI click blip
  click() {
    if (!sfxEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.04);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } catch {}
  },

  // Iconic 8-bit coin chime (used for payments & debt settlements)
  coin() {
    if (!sfxEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      // B5 (987.77 Hz) to E6 (1318.51 Hz)
      osc.frequency.setValueAtTime(988, ctx.currentTime);
      osc.frequency.setValueAtTime(1319, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.09, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.36);
    } catch {}
  },

  // Level up / group create fanfare
  levelUp() {
    if (!sfxEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, now + i * 0.07);
        gain.gain.setValueAtTime(0.08, now + i * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.001, now + (i + 1) * 0.07 + 0.08);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.07);
        osc.stop(now + (i + 1) * 0.07 + 0.09);
      });
    } catch {}
  },

  // Retro delete / danger buzz
  buzz() {
    if (!sfxEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(90, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.07, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.13);
    } catch {}
  }
};

/**
 * Spawn a burst of 8-bit square pixel particles from the click coordinates.
 */
export function spawnPixelSparkles(x, y) {
  const colors = ['#ffd93d', '#c381b5', '#48c774', '#ff6b6b', '#4d96ff', '#ffffff'];
  const particleCount = 7;

  for (let i = 0; i < particleCount; i++) {
    const p = document.createElement('span');
    p.className = 'retro-pixel-particle';

    const color = colors[Math.floor(Math.random() * colors.length)];
    const size = Math.floor(Math.random() * 4) + 4; // 4px to 7px square
    const angle = (Math.PI * 2 * i) / particleCount + (Math.random() * 0.4 - 0.2);
    const distance = Math.floor(Math.random() * 26) + 20; // 20px to 46px distance
    const destX = Math.cos(angle) * distance;
    const destY = Math.sin(angle) * distance;

    p.style.setProperty('--dest-x', `${destX}px`);
    p.style.setProperty('--dest-y', `${destY}px`);
    p.style.setProperty('--particle-color', color);
    p.style.setProperty('--particle-size', `${size}px`);
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;

    document.body.appendChild(p);
    setTimeout(() => {
      p.remove();
    }, 450);
  }
}

/**
 * Display an arcade-style floating text notification at specific coordinates or center.
 */
export function showRetroFloatingText(text, x, y, type = 'gold') {
  const floater = document.createElement('div');
  floater.className = `retro-floating-text retro-float-${type}`;
  floater.textContent = text;

  const posX = x !== undefined ? x : window.innerWidth / 2;
  const posY = y !== undefined ? y : window.innerHeight / 2;

  floater.style.left = `${posX}px`;
  floater.style.top = `${posY}px`;

  document.body.appendChild(floater);
  setTimeout(() => {
    floater.remove();
  }, 900);
}

/**
 * Initialize global retro click listener and topbar sound toggle.
 */
export function initRetroEffects() {
  if (typeof window === 'undefined') return;

  // 1. Global click sparkle particle listener & audio blip
  document.addEventListener('click', (e) => {
    // Spawn sparkles at click location
    spawnPixelSparkles(e.clientX, e.clientY);

    // Audio cue on interactive targets
    if (e.target.closest('button, a, .tab, .ai-option-chip, .auth-username-badge, input[type="submit"]')) {
      if (e.target.closest('.expense-delete-btn, .ai-history-item-del-btn')) {
        retroSound.buzz();
      } else if (e.target.closest('.mark-paid-btn, [data-action="mark-paid"]')) {
        retroSound.coin();
      } else {
        retroSound.click();
      }
    }
  }, { passive: true });

  // 2. Sound Toggle Controller
  const sfxBtn = document.getElementById('retro-sfx-toggle-btn');
  if (sfxBtn) {
    const updateSfxBtn = () => {
      sfxBtn.setAttribute('aria-pressed', String(sfxEnabled));
      sfxBtn.title = sfxEnabled ? 'Mute 8-bit Retro SFX' : 'Enable 8-bit Retro SFX';
      const icon = sfxBtn.querySelector('.sfx-icon');
      const text = sfxBtn.querySelector('.sfx-text');
      if (icon) icon.textContent = sfxEnabled ? '🔊' : '🔇';
      if (text) text.textContent = sfxEnabled ? 'SFX ON' : 'SFX OFF';
    };

    updateSfxBtn();

    sfxBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      sfxEnabled = !sfxEnabled;
      try {
        localStorage.setItem(SFX_STORAGE_KEY, String(sfxEnabled));
      } catch {}
      updateSfxBtn();
      if (sfxEnabled) {
        retroSound.coin();
      }
    };
  }
}

export const initRetroSFX = initRetroEffects;

export function playRetroSound(type = 'click') {
  if (type === 'coin') {
    retroSound.coin();
  } else if (type === 'levelUp') {
    retroSound.levelUp();
  } else if (type === 'buzz') {
    retroSound.buzz();
  } else {
    retroSound.click();
  }
}
