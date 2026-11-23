const { spawn } = require('child_process');
const http = require('http');

async function testFullJourney() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const proc = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9224',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'http://localhost:3000/'
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  http.get('http://127.0.0.1:9224/json', (res) => {
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

            // Test 1: Verify Landing Page Initial State (Zero Scroll, Only Landing Visible)
            const landingState = await send('Runtime.evaluate', {
              expression: `(() => {
                const landing = document.getElementById('landing-view');
                const auth = document.getElementById('auth-view');
                const dash = document.getElementById('dashboard-view');
                const group = document.getElementById('group-view');
                return {
                  hasIsLandingClass: document.body.classList.contains('is-landing'),
                  bodyOverflow: getComputedStyle(document.body).overflow,
                  landingDisplay: getComputedStyle(landing).display,
                  authDisplay: getComputedStyle(auth).display,
                  dashDisplay: getComputedStyle(dash).display,
                  groupDisplay: getComputedStyle(group).display,
                  scrollHeight: document.documentElement.scrollHeight,
                  clientHeight: document.documentElement.clientHeight,
                  noScroll: document.documentElement.scrollHeight <= document.documentElement.clientHeight
                };
              })()`,
              returnByValue: true
            });
            console.log('TEST 1 (Landing Zero-Scroll & Isolation):', landingState.result.value);

            // Test 2: Click "Get Started →" Button
            const getStartedClick = await send('Runtime.evaluate', {
              expression: `(() => {
                const btn = document.getElementById('landing-get-started-btn');
                btn.click();
                const landing = document.getElementById('landing-view');
                const auth = document.getElementById('auth-view');
                return {
                  url: window.location.pathname,
                  landingDisplay: getComputedStyle(landing).display,
                  authDisplay: getComputedStyle(auth).display,
                  bodyOverflow: getComputedStyle(document.body).overflow
                };
              })()`,
              returnByValue: true
            });
            console.log('TEST 2 (Click Get Started -> /login):', getStartedClick.result.value);

            // Test 3: Sign Up new test user
            const testEmail = 'pilot_' + Date.now() + '@example.com';
            const testPass = 'Secret123!';
            const signUpTest = await send('Runtime.evaluate', {
              expression: `(async () => {
                // Switch to register tab
                document.getElementById('tab-register').click();
                document.getElementById('reg-name').value = 'Pilot Tester';
                document.getElementById('reg-email').value = '${testEmail}';
                document.getElementById('reg-username').value = 'pilot_${Date.now().toString().slice(-6)}';
                document.getElementById('reg-password').value = '${testPass}';
                
                // Submit form
                const form = document.getElementById('auth-register-form');
                form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                
                // Wait 1200ms for network & navigation
                await new Promise(r => setTimeout(r, 1200));
                
                const landing = document.getElementById('landing-view');
                const auth = document.getElementById('auth-view');
                const dash = document.getElementById('dashboard-view');
                const userBadge = document.getElementById('dash-user-badge');
                const kpiTotalPaid = document.getElementById('kpi-total-paid');
                const kpiNetBalance = document.getElementById('kpi-net-balance');
                
                return {
                  url: window.location.pathname,
                  landingDisplay: getComputedStyle(landing).display,
                  authDisplay: getComputedStyle(auth).display,
                  dashDisplay: getComputedStyle(dash).display,
                  userBadge: userBadge ? userBadge.textContent : null,
                  kpiPaid: kpiTotalPaid ? kpiTotalPaid.textContent : null,
                  kpiNet: kpiNetBalance ? kpiNetBalance.textContent : null
                };
              })()`,
              awaitPromise: true,
              returnByValue: true
            });
            console.log('TEST 3 (Sign Up -> /dashboard):', signUpTest.result.value);

            // Test 4: Verify Logout navigates back cleanly
            const logoutTest = await send('Runtime.evaluate', {
              expression: `(async () => {
                const logoutBtn = document.getElementById('dashboard-logout-btn');
                logoutBtn.click();
                await new Promise(r => setTimeout(r, 600));
                return {
                  url: window.location.pathname,
                  tokenAfterLogout: sessionStorage.getItem('fs_auth_token')
                };
              })()`,
              awaitPromise: true,
              returnByValue: true
            });
            console.log('TEST 4 (Logout):', logoutTest.result.value);

            ws.close();
            proc.kill();
            process.exit(0);
          }

          run().catch((e) => {
            console.error('Run failed:', e);
            proc.kill();
            process.exit(1);
          });
        });
      } catch (err) {
        console.error('CDP attach failed:', err);
        proc.kill();
        process.exit(1);
      }
    });
  });
}

testFullJourney().catch(console.error);
