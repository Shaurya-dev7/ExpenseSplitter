const { spawn } = require('child_process');
const http = require('http');

async function testAiAuth() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const proc = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9227',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'http://localhost:3000/'
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  http.get('http://127.0.0.1:9227/json', (res) => {
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

          await send('Console.enable');
          let dialogMessage = null;
          ws.on('message', (m) => {
            const p = JSON.parse(m);
            if (p.method === 'Page.javascriptDialogOpening') {
              dialogMessage = p.params.message;
              console.log('DIALOG DETECTED:', p.params.message);
              send('Page.handleJavaScriptDialog', { accept: true });
            }
          });
          await send('Page.enable');
          await send('Runtime.enable');
          await new Promise((r) => setTimeout(r, 500));

          // Step 1: Create a test user or login
          const testEmail = 'shaurya_' + Date.now() + '@example.com';
          const testUser = await send('Runtime.evaluate', {
            expression: `(async () => {
              // Sign up
              const regRes = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  name: 'Shaurya',
                  username: 'shaurya_' + Date.now().toString().slice(-6),
                  email: '${testEmail}',
                  password: 'Password123!'
                })
              });
              const regData = await regRes.json();
              
              // Login
              const loginRes = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  email: '${testEmail}',
                  password: 'Password123!'
                })
              });
              const loginData = await loginRes.json();
              
              // Store session
              sessionStorage.setItem('fs_auth_token', loginData.token);
              sessionStorage.setItem('fs_auth_user', JSON.stringify(loginData.user));
              
              // Call setSession in app if available
              if (window.fairShareAuth) {
                window.fairShareAuth.currentUser = loginData.user;
              }
              
              return loginData.user;
            })()`,
            awaitPromise: true,
            returnByValue: true
          });
          console.log('Logged in user:', testUser.result.value);

          // Step 2: Navigate to Dashboard view
          await send('Runtime.evaluate', {
            expression: `(() => {
              // Reload dashboard view directly
              window.location.href = '/dashboard';
            })()`
          });

          await new Promise((r) => setTimeout(r, 1500));

          // Step 3: Click the AI Assistant launcher FAB
          const clickFabResult = await send('Runtime.evaluate', {
            expression: `(() => {
              const fab = document.getElementById('ai-chat-launcher-btn');
              const beforeClick = {
                fabExists: !!fab,
                fabDisplay: fab ? getComputedStyle(fab).display : 'none',
                drawerDisplay: getComputedStyle(document.getElementById('ai-chat-drawer')).display
              };
              if (fab) fab.click();
              return beforeClick;
            })()`,
            returnByValue: true
          });
          console.log('FAB Click State:', clickFabResult.result.value);

          await new Promise((r) => setTimeout(r, 600));

          // Step 4: Verify Drawer is Open and check greeting
          const drawerState = await send('Runtime.evaluate', {
            expression: `(() => {
              const drawer = document.getElementById('ai-chat-drawer');
              const messages = document.getElementById('ai-chat-messages');
              return {
                dialogFired: ${dialogMessage !== null ? `'${dialogMessage}'` : 'null'},
                drawerDisplay: getComputedStyle(drawer).display,
                drawerHasOpenClass: drawer.classList.contains('open'),
                messagesCount: messages ? messages.children.length : 0,
                firstMessageText: messages?.children[0]?.textContent || null
              };
            })()`,
            returnByValue: true
          });
          console.log('Drawer Open State:', drawerState.result.value);

          // Step 5: Test sending a message "who am i"
          const chatResult = await send('Runtime.evaluate', {
            expression: `(async () => {
              const input = document.getElementById('ai-chat-input');
              const form = document.getElementById('ai-chat-form');
              input.value = 'who am i';
              form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
              
              await new Promise(r => setTimeout(r, 1200));
              
              const messages = document.getElementById('ai-chat-messages');
              const lastMsg = messages?.children[messages.children.length - 1];
              return {
                totalMessages: messages?.children.length,
                lastMessageText: lastMsg ? lastMsg.textContent : null
              };
            })()`,
            awaitPromise: true,
            returnByValue: true
          });
          console.log('Chat Interaction Result:', chatResult.result.value);

          ws.close();
          proc.kill();
          process.exit(0);
        });
      } catch (err) {
        console.error('Error:', err);
        proc.kill();
        process.exit(1);
      }
    });
  });
}

testAiAuth().catch(console.error);
