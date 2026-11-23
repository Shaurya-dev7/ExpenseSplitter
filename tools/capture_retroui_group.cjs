const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:\\Users\\Shaurya Deep Rai\\.gemini\\antigravity\\brain\\8ff3496e-a366-4f14-acf0-c558d0cf95e7';

async function captureGroupView() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const proc = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9242',
    '--window-size=1280,900',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'http://localhost:3000/'
  ]);

  await new Promise(r => setTimeout(r, 2200));

  http.get('http://127.0.0.1:9242/json', res => {
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

          // Log in / register
          const testUser = 'retro_grp_' + Math.floor(Math.random() * 90000 + 10000);
          await send('Runtime.evaluate', {
            expression: `document.getElementById('landing-get-started-btn').click()`
          });
          await new Promise(r => setTimeout(r, 400));

          await send('Runtime.evaluate', {
            expression: `(() => {
              document.getElementById('tab-register').click();
              document.getElementById('reg-name').value = 'Retro Hero';
              document.getElementById('reg-username').value = '${testUser}';
              document.getElementById('reg-email').value = '${testUser}@example.com';
              document.getElementById('reg-password').value = 'Password123';
              document.getElementById('auth-register-submit-btn').click();
            })()`
          });
          await new Promise(r => setTimeout(r, 2200));

          // In dashboard, click "+ Create Trip Group"
          await send('Runtime.evaluate', {
            expression: `document.getElementById('dash-create-group-btn')?.click()`
          });
          await new Promise(r => setTimeout(r, 500));

          // Fill create group modal
          await send('Runtime.evaluate', {
            expression: `(() => {
              const nameInput = document.getElementById('group-name');
              const membersInput = document.getElementById('initial-members');
              if (nameInput) nameInput.value = 'Goa Beach Party';
              if (membersInput) membersInput.value = 'Shaurya, Rahul, Priya, Amit';
              const submitBtn = document.querySelector('#create-group-modal button[type="submit"]');
              if (submitBtn) submitBtn.click();
            })()`
          });
          await new Promise(r => setTimeout(r, 2200));

          // Take screenshot of group workspace
          const shot = await send('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(path.join(ARTIFACT_DIR, 'retroui_group.png'), Buffer.from(shot.data, 'base64'));
          console.log('Saved: retroui_group.png');

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

captureGroupView();
