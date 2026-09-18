// Optional real-browser smoke test using the browser's DevTools protocol.
// No browser automation dependency. Set BROWSER_BIN to Edge/Chromium/Chrome.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createApp } from '../railsync-app/server.mjs';

const root = path.resolve('.local/browser-check');
mkdirSync(root, { recursive: true });
const profile = mkdtempSync(path.join(root, 'profile-'));
const browserBin =
  process.env.BROWSER_BIN || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
if (!existsSync(browserBin)) throw Error('Set BROWSER_BIN to a Chromium-based browser executable');
const app = createApp({ dbPath: ':memory:', publicOrigin: '', setupToken: '' });
await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
const browser = spawn(
  browserBin,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    '--user-data-dir=' + profile,
    'about:blank',
  ],
  { windowsHide: true, stdio: 'ignore' },
);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let socket;
try {
  const active = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !existsSync(active); i++) await pause(100);
  if (!existsSync(active)) throw Error('Browser debugging endpoint did not start');
  const debugPort = readFileSync(active, 'utf8').split('\n')[0];
  const target = await (
    await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' })
  ).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let serial = 0;
  const pending = new Map(),
    errors = [];
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      message.error
        ? request.reject(Error(message.error.message))
        : request.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown')
      errors.push(message.params.exceptionDetails.text);
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++serial;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  async function until(expression) {
    for (let i = 0; i < 100; i++) {
      if (await evaluate(expression)) return;
      await pause(100);
    }
    throw Error('Timed out: ' + expression);
  }
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send('Page.navigate', { url: 'http://127.0.0.1:' + app.server.address().port });
  await until("!!document.querySelector('#auth-form')");
  await evaluate(
    "document.querySelector('#name').value='Browser QA';document.querySelector('#email').value='browser@example.test';document.querySelector('#password').value='browser-test-password';document.querySelector('#auth-form button[type=submit]').click()",
  );
  await until("!!document.querySelector('#ps-sample')");
  await evaluate("document.querySelector('#ps-sample').click()");
  await until('!!psData?.summary');
  await evaluate("psGenerate(['A','B','C'])");
  assert.equal(await evaluate('psData.results.B.report.soft_scores.objective_score'), 30);
  await evaluate("psTab='compare';paintPS1()");
  assert(await evaluate("document.body.innerText.includes('Bound reached')"));
  let screenshot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(root, 'compare-desktop.png'), Buffer.from(screenshot.data, 'base64'));
  await evaluate("psWhatIf();document.querySelector('#what-if-form button[type=submit]').click()");
  await until(
    "document.querySelector('#what-if-result')?.innerText.includes('Existing bookings still fit')",
  );
  await evaluate("document.querySelector('#modal').close();psActivity('A036')");
  assert(
    await evaluate("document.querySelector('#modal').innerText.includes('Requires 7 work units')"),
  );
  await evaluate("document.querySelector('#modal').close();psTab='work';paintPS1()");
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  screenshot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(root, 'planner-mobile.png'), Buffer.from(screenshot.data, 'base64'));
  assert.deepEqual(errors, []);
  console.log(
    'Browser passed: setup, sample import, A/B/C solve, quality table, capacity preview and evidence dialog; desktop/mobile screenshots saved to .local/browser-check.',
  );
  await send('Browser.close');
} finally {
  socket?.close();
  browser.kill();
  await app.close();
}
