const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

async function capture() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const proc = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9226',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,800',
    'http://localhost:3000/'
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  http.get('http://127.0.0.1:9226/json', (res) => {
    let data = '';
    res.on('data', (c) => (data += c));
    res.on('end', async () => {
      try {
        const pages = JSON.parse(data);
        const target = pages.find((p) => p.url.includes('localhost:3000'));
        const WebSocket = require('ws');
        const ws = new WebSocket(target.webSocketDebuggerUrl);

        ws.on('open', async () => {
          let id = 1;
          function send(method, params = {}) {
            return new Promise((resolve) => {
              const curId = id++;
              const handler = (msg) => {
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
          await send('Runtime.enable');
          await send('Emulation.setDeviceMetricsOverride', {
            width: 1280,
            height: 800,
            deviceScaleFactor: 1,
            mobile: false
          });

          // Ensure session is cleared so unauthenticated landing view is shown
          await send('Runtime.evaluate', {
            expression: `(() => {
              sessionStorage.clear();
              localStorage.clear();
              // re-trigger unauth display
              const landingView = document.getElementById('landing-view');
              landingView.classList.remove('fading-out');
              const authSplash = document.getElementById('landing-auth-splash');
              if (authSplash) authSplash.style.display = 'none';
              const unauth = document.getElementById('landing-unauth-actions');
              if (unauth) unauth.style.display = 'flex';
              const loginBtn = document.getElementById('landing-login-btn');
              if (loginBtn) loginBtn.style.display = 'inline-flex';
            })()`
          });

          await new Promise((r) => setTimeout(r, 1200));

          // Capture Landing View
          const snap1 = await send('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync('tools/landing_screen.png', Buffer.from(snap1.data, 'base64'));
          console.log('Saved tools/landing_screen.png');

          ws.close();
          proc.kill();
          process.exit(0);
        });
      } catch (err) {
        console.error(err);
        proc.kill();
        process.exit(1);
      }
    });
  });
}

capture().catch(console.error);
