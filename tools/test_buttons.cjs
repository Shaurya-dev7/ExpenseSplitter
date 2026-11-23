const { spawn } = require('child_process');
const http = require('http');

async function testAll() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const proc = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9223',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'http://localhost:3000/'
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  http.get('http://127.0.0.1:9223/json', (res) => {
    let data = '';
    res.on('data', (c) => (data += c));
    res.on('end', async () => {
      try {
        const pages = JSON.parse(data);
        const target = pages.find((p) => p.url.includes('localhost:3000'));
        const WebSocket = require('ws');
        const ws = new WebSocket(target.webSocketDebuggerUrl);

        ws.on('open', () => {
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

          async function run() {
            await send('Console.enable');
            ws.on('message', (m) => {
              const p = JSON.parse(m);
              if (p.method === 'Runtime.consoleAPICalled') {
                console.log('CONSOLE:', p.params.args.map((a) => a.value || a.description).join(' '));
              }
              if (p.method === 'Runtime.exceptionThrown') {
                console.error('ERROR:', JSON.stringify(p.params.exceptionDetails));
              }
            });
            await send('Runtime.enable');
            await new Promise((r) => setTimeout(r, 500));

            // Test 1: Test "How it works" modal opening
            const howTest = await send('Runtime.evaluate', {
              expression: `(() => {
                const howBtn = document.getElementById('landing-how-btn');
                howBtn.click();
                const modal = document.getElementById('how-it-works-modal');
                return {
                  modalOpen: modal?.open,
                  modalDisplay: getComputedStyle(modal).display
                };
              })()`,
              returnByValue: true
            });
            console.log('TEST 1 (How it works):', howTest.result.value);

            // Close modal
            await send('Runtime.evaluate', {
              expression: `document.getElementById('how-it-works-modal').close()`
            });

            // Test 2: Test "Log in / Sign up" button on nav
            const loginNavTest = await send('Runtime.evaluate', {
              expression: `(() => {
                const btn = document.getElementById('landing-login-btn');
                btn.click();
                return {
                  url: window.location.pathname,
                  authViewVisible: getComputedStyle(document.getElementById('auth-view')).display !== 'none',
                  landingViewHidden: getComputedStyle(document.getElementById('landing-view')).display === 'none'
                };
              })()`,
              returnByValue: true
            });
            console.log('TEST 2 (Login nav click):', loginNavTest.result.value);

            // Test 3: Test tab switching on Auth View (Create account tab)
            const tabTest = await send('Runtime.evaluate', {
              expression: `(() => {
                const regTab = document.getElementById('tab-register');
                regTab.click();
                return {
                  regFormVisible: getComputedStyle(document.getElementById('auth-register-form')).display !== 'none',
                  loginFormHidden: getComputedStyle(document.getElementById('auth-login-form')).display === 'none'
                };
              })()`,
              returnByValue: true
            });
            console.log('TEST 3 (Tab register click):', tabTest.result.value);

            // Test 4: Brand logo back to landing
            const brandTest = await send('Runtime.evaluate', {
              expression: `(() => {
                const brandLink = document.getElementById('auth-brand-link');
                brandLink.click();
                return {
                  url: window.location.pathname,
                  landingViewVisible: getComputedStyle(document.getElementById('landing-view')).display !== 'none'
                };
              })()`,
              returnByValue: true
            });
            console.log('TEST 4 (Brand link click):', brandTest.result.value);

            proc.kill();
            process.exit(0);
          }

          run();
        });
      } catch (err) {
        console.error('Test failed:', err);
        proc.kill();
        process.exit(1);
      }
    });
  });
}

testAll();
