const $ = (id) => document.getElementById(id),
  esc = (v) =>
    String(v ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
function uiIcon(name) {
  const shapes = {
    track: 'M7 3v18M17 3v18M7 6h10M7 12h10M7 18h10',
    calendar: 'M5 5h14v15H5zM8 3v4M16 3v4M5 10h14M9 14h2M14 14h1',
    list: 'M8 5h12M8 12h12M8 19h12M3 5h1M3 12h1M3 19h1',
    teams:
      'M16 20v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8M18 5a3 3 0 0 1 0 6M20 20v-3a3 3 0 0 0-2-3',
    history: 'M4 11a8 8 0 1 1 2 7M4 5v6h6M12 7v5l3 2',
    chat: 'M4 4h16v12H9l-5 4z',
    user: 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M4 21v-3a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v3',
    settings: 'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6',
    file: 'M5 3h9l5 5v13H5zM14 3v6h5M8 13h8M8 17h6',
    search: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14M15 15l6 6',
    download: 'M12 3v12M7 10l5 5 5-5M4 17v4h16v-4',
    upload: 'M12 16V4M7 9l5-5 5 5M4 17v4h16v-4',
    check: 'M5 12l4 4L19 6',
    refresh: 'M20 10a8 8 0 0 0-14-5L3 8M3 3v5h5M4 14a8 8 0 0 0 14 5l3-3M21 21v-5h-5',
    help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5M12 17h.01',
    timeline: 'M3 5h18M3 11h9M9 17h12',
  };
  return `<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="${shapes[name] || shapes.list}"/></svg>`;
}
function workspaceBrand() {
  return `<div class="brand"><span class="brand-mark">${uiIcon('track')}</span>Trackwork</div>`;
}
let hostInfo = {};
let csrf = '',
  user = null,
  state = null,
  page = 'ps1',
  chat = [],
  toastTimer;
async function api(route, body) {
  const res = await fetch('/api' + route, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data;
  try {
    data = await res.json();
  } catch {
    throw Error('Server unavailable. Check that Trackwork is running.');
  }
  if (!res.ok)
    throw Object.assign(new Error(data.error || 'Request failed'), {
      status: res.status,
      uploadIssues: data.uploadIssues,
    });
  return data;
}
function toast(message, error = false) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').className = 'toast' + (error ? ' error' : '');
  toastTimer = setTimeout(() => $('toast').classList.add('hidden'), 8000);
}
async function run(fn, button) {
  if (button) button.disabled = true;
  document.getElementById('dialog-error')?.remove();
  try {
    await fn();
  } catch (e) {
    if ($('modal').open) {
      const alert = document.createElement('p');
      alert.id = 'dialog-error';
      alert.className = 'alert';
      alert.setAttribute('role', 'alert');
      alert.textContent = e.message;
      $('modal').querySelector('.modal-body').append(alert);
      alert.scrollIntoView({ block: 'nearest' });
      if ($('schedule-preview') && !$('schedule-preview').querySelector('h3'))
        $('schedule-preview').textContent = 'Preview was not saved.';
    } else toast(e.message, true);
  } finally {
    if (button && button.isConnected) button.disabled = false;
  }
}
async function mutate(route, body) {
  const result = await api(route, { ...body, version: state.version });
  await refresh();
  return result;
}
const opts = (values, selected) =>
  values
    .map((v) => `<option value="${esc(v)}" ${v === selected ? 'selected' : ''}>${esc(v)}</option>`)
    .join('');
function dialog(title, body) {
  $('modal').innerHTML =
    `<div class="panel-head between"><h2>${esc(title)}</h2><button class="close" data-close aria-label="Close dialog">×</button></div><div class="modal-body">${body}</div>`;
  $('modal').showModal();
  $('modal').querySelector('[data-close]').onclick = () => $('modal').close();
}
function formData(form) {
  return Object.fromEntries(new FormData(form));
}
async function boot() {
  try {
    const h = await api('/health');
    hostInfo = h;
    if (h.setupRequired) {
      auth(true);
      return;
    }
    try {
      const m = await api('/me');
      csrf = m.csrf;
      user = m.user;
      if (['supervisor', 'manager'].includes(user.role)) page = 'overview';
      await refresh();
    } catch (e) {
      if (e.status === 401) auth(false);
      else throw e;
    }
  } catch (e) {
    $('app').innerHTML =
      `<div class="empty"><h2>Unable to reach Trackwork</h2><p>${esc(e.message)}</p><button id="retry">Retry</button></div>`;
    $('retry').onclick = boot;
  }
}
async function refresh() {
  state = await api('/state');
  user = state.user;
  render();
}
const badge = (s, c = '') =>
  `<span class="badge ${c}">${esc(String(s).replaceAll('_', ' '))}</span>`;
function auth(setup) {
  clearTimeout(toastTimer);
  $('toast').classList.add('hidden');
  state = null;
  user = null;
  chat = [];
  $('app').innerHTML =
    `<div class="auth"><section class="auth-intro">${workspaceBrand()}<h1>Rail maintenance<br>planning workspace.</h1><p>Plan contract activities across Line Alpha and Line Beta.</p><div class="auth-rail"><span>Import contracts</span><span>Compare weekly plans</span><span>Review & export</span></div></section><form id="auth-form"><span class="eyebrow">${setup ? 'GET STARTED' : 'WELCOME BACK'}</span><h2 style="margin-top:10px">${setup ? 'Create your planner account' : 'Sign in to Trackwork'}</h2><p class="muted">${setup ? 'This account manages track plans, planner access and the optional chat connection. Your data is saved in this planning workspace.' : 'Sign in to review your saved track access plans.'}</p>${setup ? '<div class="field"><label for="name">Your name</label><input id="name" name="name" required maxlength="80" autocomplete="name"></div>' : ''}<div class="field"><label for="email">Email</label><input id="email" name="email" type="email" required autocomplete="username"></div><div class="field"><label for="password">Password</label><input id="password" name="password" type="password" required ${setup ? 'minlength="12"' : ''} maxlength="200" autocomplete="${setup ? 'new-password' : 'current-password'}">${setup ? '<div class="hint">At least 12 characters. Choose a password you can remember.</div>' : ''}</div>${setup && hostInfo.setupTokenRequired ? '<div class="field"><label for="setupToken">Host setup token</label><input id="setupToken" name="setupToken" type="password" required autocomplete="off"></div>' : ''}<p id="auth-error" class="inline-error" role="alert"></p><button class="primary" type="submit">${setup ? 'Create workspace' : 'Sign in'} →</button><p class="footnote">${setup ? 'Planner accounts share this workspace and its imported programme.' : 'Need access? Ask a planner to create your account.'}</p></form></div>`;
  $('auth-form').onsubmit = async (e) => {
    e.preventDefault();
    const b = e.submitter;
    b.disabled = true;
    $('auth-error').textContent = '';
    try {
      const result = await api(setup ? '/setup' : '/login', formData(e.target));
      csrf = result.csrf;
      user = result.user;
      page = ['supervisor', 'manager'].includes(user.role) ? 'overview' : 'ps1';
      await refresh();
    } catch (err) {
      $('auth-error').textContent = err.message;
      b.disabled = false;
    }
  };
}

function render() {
  if (['worker', 'manager', 'supervisor'].includes(user.role)) {
    renderRoleWorkspace();
    return;
  }
  const planner = user.role === 'scheduler';
  const nav = planner
    ? [
        ['ps1', 'track', 'Track planner'],
        ['contracts', 'list', 'Contracts'],
        ['activity', 'history', 'Plan history'],
        ['team', 'teams', 'Team availability'],
        ['decisions', 'chat', 'Emergency decisions'],
        ['copilot', 'chat', 'Ask a question'],
        ['settings', 'settings', 'Settings'],
      ]
    : [];
  if (planner && !nav.some((n) => n[0] === page)) page = 'ps1';
  const titles = {
    ps1: 'Track planner',
    contracts: 'Contracts',
    activity: 'Plan history',
    copilot: 'Ask a question',
    settings: 'Settings',
    team: 'Team availability',
    decisions: 'Emergency decisions',
  };
  const descriptions = {
    ps1: 'Schedule contract activities. Review track access, completion dates and capacity.',
    contracts: 'The contracts and activity limits from your imported work programme.',
    activity: 'Dataset imports and generated plans, recorded with the planner who made them.',
    copilot: 'Ask about the imported programme and a selected weekly plan.',
    settings: 'Manage team accounts and the optional chat connection.',
    team: 'Reported availability and worker assignments. Managers handle personal issues.',
    decisions: 'Send urgent decisions to your supervisor and follow their response.',
  };
  $('app').innerHTML =
    `<div class="shell"><aside class="sidebar"><div>${workspaceBrand()}<div class="workspace-label">Track access planning</div></div><div><div class="nav-group">Workspace</div><nav aria-label="Workspace">${nav.map(([id, icon, title]) => `<button data-nav="${id}" ${id === page ? 'aria-current="page"' : ''} class="${id === page ? 'active' : ''}"><span class="icon">${uiIcon(icon)}</span>${title}</button>`).join('')}</nav></div><div class="sidebar-foot"><div class="userline"><span class="avatar">${esc(user.name.slice(0, 1))}</span><div>${esc(user.name)}<small>${planner ? 'Planner' : 'Existing account'}</small></div></div><button class="quiet" id="logout">Sign out</button></div></aside><main class="main"><div class="page-topline"><span>Trackwork / ${planner ? titles[page] : 'Access'}</span><span class="local-status">${hostInfo.hosted ? 'Hosted team workspace' : 'Local workspace'}</span></div><header><div><h1>${planner ? titles[page] : 'Planner access required'}</h1><p class="muted header-note">${planner ? descriptions[page] : 'This account belongs to the previous crew workflow. Sign in with a planner account to use track planning.'}</p></div><div class="actions">${planner ? (page === 'ps1' ? `<button id="planner-help" class="quiet">${uiIcon('help')}How to use this</button>` : `<button id="refresh">${uiIcon('refresh')}Refresh</button>`) : ''}<button id="mobile-logout" class="quiet">Sign out</button></div></header><div id="content" class="section-gap"></div><footer class="app-footer"><span>Trackwork · Track access planning</span><span>Planning prototype · Review before operational use</span></footer></main></div>`;
  document.querySelectorAll('[data-nav]').forEach(
    (b) =>
      (b.onclick = () => {
        page = b.dataset.nav;
        if (page === 'activity') run(refresh);
        else render();
      }),
  );
  if ($('refresh')) $('refresh').onclick = (e) => run(refresh, e.target);
  if ($('planner-help')) $('planner-help').onclick = plannerHelp;
  for (const id of ['logout', 'mobile-logout'])
    $(id).onclick = () =>
      run(async () => {
        await api('/logout', {});
        csrf = '';
        psData = null;
        auth(false);
      });
  if (planner)
    ({
      ps1: renderPS1,
      contracts: renderContracts,
      activity: renderActivity,
      copilot: renderChat,
      settings: renderSettings,
      team: renderTeam,
      decisions: renderTeam,
    })[page]();
}
async function renderContracts() {
  const owner = user.id;
  $('content').innerHTML = '<div class="empty">Loading contracts…</div>';
  try {
    const data = await api('/ps1/state');
    if (user?.id !== owner || page !== 'contracts') return;
    if (!data.summary) {
      $('content').innerHTML =
        '<div class="panel panel-body"><h2>No work programme yet</h2><p>Open Track planner to import the eight CSV files or load the example dataset.</p></div>';
      return;
    }
    $('content').innerHTML =
      `<div class="info">Review each contract’s weekly access allowance, concurrent activity limit and completion dates. Access types describe how activities can share a track location.</div><section class="panel section-gap"><div class="panel-head"><h2>${data.summary.contracts} contracts · ${data.summary.activities} activities</h2><small>${esc(data.source)}</small></div><div class="table-scroll"><table class="contract-table"><thead><tr><th>CONTRACT / ACTIVITY TYPE</th><th>WORK & ACCESS</th><th>PRIORITY</th><th>ACCESS NIGHTS / WEEK</th><th>CONCURRENT ACTIVITIES / NIGHT</th><th>TARGET / CONTRACT DEADLINE</th><th>ACTIVITIES</th></tr></thead><tbody>${data.summary.projects.map((p) => `<tr><td><strong>${esc(p.id)}</strong> · ${esc(p.type)}<small class="block">${esc(p.name)}</small></td><td>${esc(p.nature)}<br>${badge(p.access_type, 'neutral')}</td><td>${esc(p.priority)}</td><td>${esc(p.weekly_cap)}</td><td>${esc(p.workfronts)}</td><td>${esc(p.target)}<small class="block">${esc(p.contract_deadline)}</small></td><td>${data.summary.jobs.filter((j) => j.contract === p.id && j.type === p.type).length}</td></tr>`).join('')}</tbody></table></div></section><p class="hint">PM: sole possession. PC: possession master / host. C: co-worker. Weekly access limits and concurrent work limits are separate constraints.</p>`;
  } catch (e) {
    if (page === 'contracts') $('content').innerHTML = `<div class="alert">${esc(e.message)}</div>`;
  }
}
function renderActivity() {
  $('content').innerHTML =
    `<section class="panel"><div class="panel-head"><h2>Planning history</h2></div><div class="panel-body feed">${state.events.map((e) => `<article class="event"><strong>${esc(e.action)}</strong><p>${esc(e.detail)}</p><small>${esc(e.actor)} · ${new Date(e.at).toLocaleString('en-SG', { timeZone: 'Asia/Singapore' })}</small></article>`).join('') || '<p class="muted">New dataset imports and generated plans will appear here.</p>'}</div></section>`;
}
function accountForm() {
  dialog(
    'Add a team account',
    `<form id="account-form"><div class="forms"><div><label for="a-name">Name</label><input id="a-name" name="name" required maxlength="80"></div><div><label for="a-email">Sign-in email</label><input id="a-email" name="email" type="email" required></div><div class="span2"><label for="a-password">Password · at least 12 characters</label><input id="a-password" name="password" type="password" minlength="12" maxlength="200" required autocomplete="new-password"></div></div><p class="hint">Planners can replace the shared dataset, build plans, export results and manage this workspace. Share sign-in details privately; this app does not send email.</p><button class="primary section-gap">Create team account</button></form>`,
  );
  $('account-form')
    .querySelector('.forms')
    .insertAdjacentHTML(
      'beforeend',
      `<div class="span2"><label for="a-role">Role</label><select id="a-role" name="role">${(user.role === 'manager' ? ['worker'] : ['worker', 'manager', 'scheduler', 'supervisor']).map((r) => `<option value="${r}">${roleLabel(r)}</option>`).join('')}</select></div>`,
    );
  $('account-form').onsubmit = (e) => {
    e.preventDefault();
    run(async () => {
      await mutate('/users', formData(e.target));
      $('modal').close();
      toast('Team account created.');
    }, e.submitter);
  };
}
function renderChat() {
  $('content').innerHTML =
    `<div class="grid"><section class="panel"><div class="panel-head between"><h2>Planning conversation</h2><label for="chat-scenario" class="hidden">Plan to discuss</label><select id="chat-scenario">${Object.entries(
      planOptions,
    )
      .map(
        ([key, value]) =>
          `<option value="${key}" ${key === psScenario ? 'selected' : ''}>${esc(value.name || value.title || key)}</option>`,
      )
      .join(
        '',
      )}</select>${badge(state.ai.configured ? state.ai.provider : 'Not connected', state.ai.configured ? '' : 'amber')}</div><div class="chat-box" id="chat-messages"></div><div class="suggestions"><button data-prompt="Explain the rule violations in this selected plan, citing activity IDs.">Explain conflicts</button><button data-prompt="Which contracts miss their target dates in this selected plan?">What needs attention?</button><button data-prompt="Explain how workfront caps and weekly access limits affect this plan.">Explain contract limits</button></div><form id="chat-form" class="chat-compose"><label for="chat-input" class="hidden">Message</label><textarea id="chat-input" name="message" required maxlength="4000" placeholder="Ask about a job, a delay or the selected plan…"></textarea><button class="primary" ${!state.ai.configured ? 'disabled' : ''}>Send</button></form></section><section class="panel"><div class="panel-body"><h2>Grounded in your workspace</h2><p class="muted">Ask about contracts, activities, capacity or completion dates. The assistant receives the imported dataset and the selected plan. Each plan has a separate conversation.</p><div class="info">Chat explains the saved result. Use Build plans in Track planner to generate schedules, then review the results and export. Chat cannot change a schedule.</div><p class="section-gap muted">${state.ai.configured ? `Connected provider: ${esc(state.ai.provider)}<br>Model: ${esc(state.ai.model)}<br>Your message and authorized context are sent to this provider when you press Send.` : 'No API key is connected. Open Settings to connect a provider. Building plans and exporting work without AI.'}</p></div></section></div>`;
  chat = [];
  paintChat();
  loadChat();
  $('chat-scenario').onchange = () => {
    psScenario = $('chat-scenario').value;
    chat = [];
    paintChat();
    loadChat();
  };
  document.querySelectorAll('[data-prompt]').forEach(
    (b) =>
      (b.onclick = () => {
        $('chat-input').value = b.dataset.prompt;
        $('chat-input').focus();
      }),
  );
  $('chat-form').onsubmit = (e) => {
    e.preventDefault();
    const message = formData(e.target).message,
      scenario = psScenario,
      owner = user.id;
    run(async () => {
      const result = await api('/chat', { message, scenario });
      if (user?.id !== owner || scenario !== psScenario || page !== 'copilot') return;
      chat.push({ role: 'user', content: message }, { role: 'assistant', content: result.reply });
      if ($('chat-input')) $('chat-input').value = '';
      paintChat();
    }, e.submitter);
  };
}
function paintChat() {
  if (!$('chat-messages')) return;
  $('chat-messages').innerHTML = chat.length
    ? chat
        .map(
          (m) =>
            `<div class="message ${m.role === 'user' ? 'user' : ''}"><small>${m.role === 'user' ? 'YOU' : 'PLANNING ASSISTANT'}</small>${esc(m.content)}</div>`,
        )
        .join('')
    : '<div class="empty"><h2>Ask about the work ahead.</h2><p>Your conversation is saved privately to your account.</p></div>';
  $('chat-messages').scrollTop = $('chat-messages').scrollHeight;
}
async function loadChat() {
  const owner = user?.id,
    scenario = psScenario;
  try {
    const history = await api('/chat/history?scenario=' + scenario);
    if (user?.id === owner && psScenario === scenario && page === 'copilot') {
      chat = history;
      paintChat();
    }
  } catch (e) {
    toast(e.message, true);
  }
}
function renderSettings() {
  $('content').innerHTML =
    `<div class="grid equal"><section class="panel"><div class="panel-head"><h2>AI provider connection</h2></div><form id="ai-form" class="panel-body"><p>${badge(state.ai.configured ? (state.ai.verified ? 'Verified connection' : 'Configured · not yet tested') : 'Not connected', state.ai.verified ? '' : 'amber')}</p><div class="forms"><div><label for="ai-provider">Provider</label><select id="ai-provider" name="provider"><option value="openai" ${state.ai.provider === 'openai' ? 'selected' : ''}>OpenAI</option><option value="anthropic" ${state.ai.provider === 'anthropic' ? 'selected' : ''}>Anthropic Claude</option></select></div><div><label for="ai-model">Model ID</label><input id="ai-model" name="model" list="ai-model-options" required value="${esc(state.ai.model)}" maxlength="100"><datalist id="ai-model-options"><option value="claude-sonnet-4-6"></option><option value="claude-3-7-sonnet-latest"></option><option value="claude-3-5-haiku-latest"></option><option value="gpt-4.1-mini"></option></datalist></div><div class="span2"><label id="ai-key-label" for="ai-key">${state.ai.provider === 'anthropic' ? 'Claude API key' : 'OpenAI API key'}</label><input type="password" id="ai-key" name="key" autocomplete="off" placeholder="${state.ai.configured ? 'Leave blank to keep the current key' : 'Paste your API key here'}" maxlength="500"><p class="hint">Sent only to this local server. Held in server memory and never returned to the browser or saved in the database. Re-enter after restarting, or configure a server environment variable.</p></div></div><div class="actions section-gap"><button class="primary">Save connection</button><button id="test-ai" type="button" ${!state.ai.configured ? 'disabled' : ''}>Test live connection</button><button id="disconnect-ai" type="button" class="quiet" ${!state.ai.configured ? 'disabled' : ''}>Disconnect</button></div><p class="hint">Testing makes a small billable API request. Chat sends your message, imported programme and selected plan to the provider.</p></form></section><section class="panel"><div class="panel-body"><h2>About this workspace</h2><div class="listline"><strong>Saved workflows</strong><p>Your imported programme, generated plans, planning history and conversations are saved on this computer.</p></div><div class="listline"><strong>Planner access</strong><p>Planner accounts manage this shared workspace. PM, PC and C are activity access types, not user account roles.</p></div><div class="listline"><strong>Model configuration</strong><p>Use a model ID available to your API account. OpenAI defaults to gpt-4.1-mini; Claude defaults to claude-sonnet-4-6.</p></div><div class="listline"><strong>Local access</strong><p>This app listens on this computer only. Other planner accounts can sign in through separate browser profiles. Remote hosting needs HTTPS and deployment configuration.</p></div><p class="hint">Download the three schedule files from Track planner after building and reviewing a plan.</p></div></section></div><section class="panel section-gap"><div class="panel-head between"><h2>Team accounts</h2><button id="add-account">Add account</button></div><div class="panel-body">${state.users.map((u) => `<div class="listline"><strong>${esc(u.name)}</strong> ${badge(roleLabel(u.role), 'neutral')}<p>${esc(u.email)}</p></div>`).join('')}</div></section>`;
  $('add-account').onclick = accountForm;
  $('ai-provider').onchange = () => {
    const claude = $('ai-provider').value === 'anthropic';
    $('ai-model').value = claude ? 'claude-sonnet-4-6' : 'gpt-4.1-mini';
    $('ai-key-label').textContent = claude ? 'Claude API key' : 'OpenAI API key';
  };
  $('ai-form').onsubmit = (e) => {
    e.preventDefault();
    const d = formData(e.target);
    run(async () => {
      await api('/ai/config', d);
      $('ai-key').value = '';
      await refresh();
      toast('Connection saved in server memory. Use Test live connection to verify it.');
    }, e.submitter);
  };
  $('test-ai').onclick = (e) =>
    run(async () => {
      await api('/ai/test', {});
      await refresh();
      toast('Live API request succeeded. Planning chat is ready.');
    }, e.target);
  $('disconnect-ai').onclick = (e) =>
    run(async () => {
      await api('/ai/config', { disconnect: true });
      await refresh();
      toast('API key removed from this server session.');
    }, e.target);
}
boot();
