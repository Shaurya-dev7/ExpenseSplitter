const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:\\Users\\Shaurya Deep Rai\\.gemini\\antigravity\\brain\\8ff3496e-a366-4f14-acf0-c558d0cf95e7';

async function captureRetroUiViews() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const proc = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9241',
    '--window-size=1280,840',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'http://localhost:3000/'
  ]);

  await new Promise(r => setTimeout(r, 2200));

  http.get('http://127.0.0.1:9241/json', res => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', async () => {
      try {
        const pages = JSON.parse(data);
        const target = pages.find(p => p.url.includes('localhost:3000'));
        const WebSocket = require('ws');
        const ws = new WebSocket(target.webSocketDebuggerUrl);

        ws.on('open', async () => {
          let id = 1;
          function send(method, params = {}) {
            return new Promise(resolve => {
              const curId = id++;
              const handler = msg => {
                const parsed = JSON.parse(msg);
                if (parsed.id === curId) {
                  ws.off('message', handler);
                  resolve(parsed.result);
                }
              };
              ws.on('message', handler);
              ws.send(JSON.stringify({ id: curId, method, params }));
            });
          }

          await send('Page.enable');
          await send('DOM.enable');

          await new Promise(r => setTimeout(r, 800));

          // 1. Landing View Screenshot
          let shot = await send('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(path.join(ARTIFACT_DIR, 'retroui_landing.png'), Buffer.from(shot.data, 'base64'));
          console.log('Saved: retroui_landing.png');

          // 2. Click Get Started -> Login/Register View
          await send('Runtime.evaluate', {
            expression: `document.getElementById('landing-get-started-btn').click()`
          });
          await new Promise(r => setTimeout(r, 600));

          shot = await send('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(path.join(ARTIFACT_DIR, 'retroui_auth.png'), Buffer.from(shot.data, 'base64'));
          console.log('Saved: retroui_auth.png');

          // 3. Register user -> Dashboard View
          const testUser = 'retro_' + Math.floor(Math.random() * 90000 + 10000);
          await send('Runtime.evaluate', {
            expression: `(() => {
              document.getElementById('tab-register').click();
              document.getElementById('reg-name').value = 'Retro Gamer';
              document.getElementById('reg-username').value = '${testUser}';
              document.getElementById('reg-email').value = '${testUser}@example.com';
              document.getElementById('reg-password').value = 'Password123';
              document.getElementById('auth-register-submit-btn').click();
            })()`
          });

          await new Promise(r => setTimeout(r, 2200));

          shot = await send('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(path.join(ARTIFACT_DIR, 'retroui_dashboard.png'), Buffer.from(shot.data, 'base64'));
          console.log('Saved: retroui_dashboard.png');

          // 4. Open AI Chat Drawer and simulate conversation
          await send('Runtime.evaluate', {
            expression: `document.getElementById('ai-chat-launcher-btn')?.click()`
          });
          await new Promise(r => setTimeout(r, 800));

          await send('Runtime.evaluate', {
            expression: `(() => {
              if (window.fairShareAi && typeof window.fairShareAi.appendMessage === 'function') {
                window.fairShareAi.appendMessage('user', 'Check balances for Goa Trip');
                window.fairShareAi.appendMessage('assistant', 'Goa Trip balances:\\n• Ankit: +₹850.00 (is owed)\\n• Aniket: -₹350.00 (owes)\\n• Anshita: -₹500.00 (owes)\\n\\nAll payments have been simplified to the fewest transfers using Hare-Niemeyer exact paise.', [
                  { label: '⚡ Settle up debts', message: 'How do I settle debts?' },
                  { label: '🍕 Add another expense', message: 'Add an expense' }
                ]);
              }
            })()`
          });

          await new Promise(r => setTimeout(r, 800));

          shot = await send('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(path.join(ARTIFACT_DIR, 'retroui_ai_chat.png'), Buffer.from(shot.data, 'base64'));
          console.log('Saved: retroui_ai_chat.png');

          proc.kill();
          process.exit(0);
        });
      } catch (err) {
        console.error('ERROR:', err);
        proc.kill();
        process.exit(1);
      }
    });
  });
}

captureRetroUiViews();
