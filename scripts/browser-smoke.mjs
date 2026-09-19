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
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await evaluate("psTab='network';paintPS1()");
  assert(await evaluate("document.querySelectorAll('[data-drag-activity]').length>0"));
  assert(await evaluate("document.querySelectorAll('.buffer-chip').length>0"));
  screenshot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(root, 'schedule-map.png'), Buffer.from(screenshot.data, 'base64'));
  await evaluate("document.querySelector('#manual-move').click()");
  assert(await evaluate("!!document.querySelector('#move-form')"));
  await evaluate(
    "document.querySelector('#modal').close();const finalBooking=psData.results[psScenario].access.at(-1);moveForm(finalBooking.activity_id,finalBooking.week,finalBooking.week+1);document.querySelector('#move-form button').click()",
  );
  await until("!!document.querySelector('#apply-schedule-preview')");
  await evaluate("document.querySelector('#apply-schedule-preview').click()");
  await until(
    "!document.querySelector('#modal').open && !!document.querySelector('#undo-schedule')",
  );
  await evaluate("document.querySelector('#undo-schedule').click()");
  await until(
    "document.querySelector('#toast')?.innerText.includes('Previous saved plan restored')",
  );
  await evaluate(
    "document.querySelector('#modal').close();document.querySelector('#disruption-backup').click();document.querySelector('#disruption-scope').value='network';document.querySelector('#disruption-scope').dispatchEvent(new Event('change'));document.querySelector('#disruption-form button').click()",
  );
  await until("!!document.querySelector('#apply-schedule-preview')");
  screenshot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(root, 'backup-preview.png'), Buffer.from(screenshot.data, 'base64'));
  await evaluate(
    "document.querySelector('#modal').close();psImportDialog();document.querySelector('#csv-format-guide').click()",
  );
  await until("document.querySelectorAll('[data-download-template]').length===8");
  await evaluate(
    "document.querySelector('#modal').close();page='settings';render();document.querySelector('#add-account').click()",
  );
  assert.equal(await evaluate("document.querySelectorAll('#a-role option').length"), 4);
  await evaluate("document.querySelector('#modal').close()");
  for (const role of ['worker', 'manager', 'supervisor']) {
    await evaluate(
      `(async()=>{const s=await api('/state');await api('/users',{version:s.version,name:'${role} QA',email:'${role}@browser.test',password:'browser-test-password',role:'${role}'});})()`,
    );
  }
  const signIn = async (role) => {
    await evaluate(
      `(async()=>{await api('/logout',{});auth(false);document.querySelector('#email').value='${role}@browser.test';document.querySelector('#password').value='browser-test-password';document.querySelector('#auth-form button[type=submit]').click();})()`,
    );
    await until(`user?.role==='${role}' && !!document.querySelector('#content .panel-body')`);
  };
  await signIn('worker');
  await evaluate(
    "document.querySelector('#report-issue').click();document.querySelector('#issue-description').value='Cannot attend today; please arrange cover.';document.querySelector('#issue-form button').click()",
  );
  await until("document.querySelector('#content')?.innerText.includes('Cannot attend today')");
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  screenshot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(root, 'worker-mobile.png'), Buffer.from(screenshot.data, 'base64'));
  assert(await evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'));
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await signIn('manager');
  assert(
    await evaluate(
      "document.querySelector('#content').innerText.includes('Programme & schedule health')",
    ),
  );
  await evaluate("document.querySelector('[data-role-nav=ps1]').click()");
  await until("!!document.querySelector('#readonly-plan-context')");
  assert(
    await evaluate(
      "document.querySelector('#ps-all').hidden && document.querySelector('#ps-upload').hidden && document.querySelector('#ps-what-if').hidden",
    ),
  );
  await evaluate("document.querySelector('[data-role-nav=team]').click()");
  await until("!!document.querySelector('[data-review]')");
  await evaluate(
    "document.querySelector('[data-review]').click();document.querySelector('#review-points').value='1';document.querySelector('#review-reason').value='Reviewed by manager';document.querySelector('#review-form button').click()",
  );
  await until("document.querySelector('#content')?.innerText.includes('Reviewed by manager')");
  screenshot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(root, 'manager-desktop.png'), Buffer.from(screenshot.data, 'base64'));
  await evaluate(
    "(async()=>{await api('/logout',{});const m=await api('/login',{email:'browser@example.test',password:'browser-test-password'});user=m.user;csrf=m.csrf;page='decisions';await refresh();})()",
  );
  await until("!!document.querySelector('#emergency-new')");
  await evaluate("document.querySelector('#emergency-new').click()");
  await until("!!document.querySelector('#emergency-form')");
  await evaluate(
    "document.querySelector('#emergency-title').value='Power outage';document.querySelector('#emergency-question').value='Please decide whether to postpone this work.';document.querySelector('#emergency-form button').click()",
  );
  await until("document.querySelector('#content')?.innerText.includes('Power outage')");
  await signIn('supervisor');
  assert(
    await evaluate(
      "document.querySelector('#content').innerText.includes('Programme & schedule health')",
    ),
  );
  screenshot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(root, 'supervisor-overview.png'), Buffer.from(screenshot.data, 'base64'));
  await evaluate("document.querySelector('[data-role-nav=ps1]').click()");
  await until("!!document.querySelector('#readonly-plan-context')");
  assert(
    await evaluate(
      "document.querySelector('#ps-all').hidden && !!document.querySelector('#ps-insights') && !!document.querySelector('#ps-export')",
    ),
  );
  await evaluate("psTab='network';paintPS1()");
  assert.equal(await evaluate("document.querySelectorAll('[data-drag-activity]').length"), 0);
  await evaluate("document.querySelector('#ps-insights').click()");
  await until("document.querySelector('#modal').open");
  assert(await evaluate("document.querySelector('#modal').innerText.includes('Priority risks')"));
  await evaluate(
    "document.querySelector('#modal').close();document.querySelector('[data-role-nav=team]').click()",
  );
  await until("document.querySelector('#content')?.innerText.includes('Reviewed by manager')");
  assert.equal(await evaluate("document.querySelectorAll('[data-review]').length"), 0);
  await evaluate("document.querySelector('[data-role-nav=decisions]').click()");
  await until("!!document.querySelector('[data-decide]')");
  screenshot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(root, 'supervisor-desktop.png'), Buffer.from(screenshot.data, 'base64'));
  await evaluate(
    "document.querySelector('[data-decide]').click();document.querySelector('#decision-status').value='changes_requested';document.querySelector('#decision-reason').value='Rebuild with the power outage window.';document.querySelector('#decision-form button').click()",
  );
  await until(
    "document.querySelector('#content')?.innerText.includes('Rebuild with the power outage window.')",
  );
  assert.deepEqual(errors, []);
  console.log(
    'Browser passed: planner, buffer map, backup preview, CSV templates, four-role account form, worker report, manager review and supervisor emergency decision; desktop/mobile screenshots saved to .local/browser-check.',
  );
  await send('Browser.close');
} finally {
  socket?.close();
  browser.kill();
  await app.close();
}
