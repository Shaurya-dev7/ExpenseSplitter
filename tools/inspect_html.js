import fs from 'node:fs';

const lines = fs.readFileSync('public/index.html', 'utf8').split('\n');
lines.forEach((l, i) => {
  if (
    l.includes('<!-- VIEW') ||
    l.includes('id="expense-modal"') ||
    l.includes('id="ai-chat-drawer"') ||
    l.includes('class="app-header"') ||
    l.includes('class="retro-scanlines"') ||
    l.includes('id="landing-view"') ||
    l.includes('id="auth-view"') ||
    l.includes('id="home-view"') ||
    l.includes('id="group-view"')
  ) {
    console.log(`${i + 1}: ${l.trim()}`);
  }
});
