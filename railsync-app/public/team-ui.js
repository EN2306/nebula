const roleLabel = (r) =>
  ({ scheduler: 'Planner', supervisor: 'Supervisor', manager: 'Manager', worker: 'Worker' })[r] ||
  r;
let teamData = null;
function applyPlanPermissions() {
  if (user.role === 'scheduler') return;
  for (const id of ['ps-upload', 'ps-sample', 'ps-all', 'overview-build', 'overview-disruption'])
    if ($(id)) $(id).hidden = true;
  document.querySelectorAll('[data-build-plan]').forEach((b) => {
    b.hidden = true;
    b.disabled = true;
  });
  if (user.role === 'manager' && $('ps-what-if')) $('ps-what-if').hidden = true;
  if (!psData?.summary) {
    $('content').innerHTML =
      '<section class="panel panel-body"><h2>No programme has been loaded yet</h2><p>A planner can import the eight programme files. Saved schedules, contracts and risks will appear here for review.</p></section>';
    return;
  }
  if (!$('readonly-plan-context')) {
    const note = document.createElement('div');
    note.id = 'readonly-plan-context';
    note.className = 'schedule-help';
    const r = psData.results[psScenario];
    note.innerHTML = `<strong>Schedule review</strong><p>Explore the map, compare scenarios, inspect risks and download saved plans. Planners manage schedule changes.${user.role === 'supervisor' ? ' Use Emergency decisions to record your instructions.' : ' Use Worker issues & assignments to arrange staffing.'}</p>${(r?.disruptions || []).map((x) => `<p>${esc(x.type)}: ${esc(x.location)}, weeks ${x.start_week}–${x.end_week}</p>`).join('')}`;
    $('content').prepend(note);
  }
}
async function renderOverview() {
  const owner = user.id;
  $('content').innerHTML = '<div class="panel empty">Loading programme and team status…</div>';
  try {
    const data = await api('/team/state');
    if (user?.id !== owner || page !== 'overview') return;
    teamData = data;
    const ps = data.programme,
      results = Object.entries(ps?.results || {}),
      supervisor = user.role === 'supervisor';
    const pending = data.issues.filter((x) => x.status === 'pending'),
      decisions = data.decisions.filter((x) => x.status === 'pending' && !x.stale),
      stale = data.assignments.filter((x) => x.stale),
      active = data.assignments.filter((x) => x.status === 'assigned');
    const today = teamDate(),
      absent = data.availability.filter((x) => x.date === today);
    const stats = supervisor
      ? [
          ['Activities in programme', ps?.summary?.activities ?? 0],
          ['Urgent decisions', decisions.length],
          ['Worker reports pending', pending.length],
          ['Active assignments', active.length],
          ['Assignments to reconfirm', stale.length],
          ['Workers unavailable today', absent.length],
        ]
      : [
          ['Workers', data.people.filter((x) => x.role === 'worker').length],
          ['Reports to review', pending.length],
          ['Assignments to reconfirm', stale.length],
          ['Active assignments', active.length],
          ['Workers unavailable today', absent.length],
          ['Completed tasks', data.assignments.filter((x) => x.status === 'completed').length],
        ];
    $('content').innerHTML =
      `<div class="feature-stats">${stats.map(([label, value]) => `<div><small>${label}</small><b>${value}</b></div>`).join('')}</div><section class="panel section-gap"><div class="panel-head"><h2>Needs attention</h2></div><div class="panel-body overview-actions">${supervisor ? `<button data-overview-nav="decisions" class="${decisions.length ? 'danger-button' : ''}">${decisions.length} emergency decisions awaiting response</button>` : ''}<button data-overview-nav="team">${pending.length} worker reports ${supervisor ? 'awaiting manager review' : 'to review'}</button><button data-overview-nav="team">${stale.length} assignments need reconfirmation</button><button data-overview-nav="accounts">Manage team accounts</button></div></section><section class="panel section-gap"><div class="panel-head between"><h2>Programme & schedule health</h2><button data-overview-nav="ps1">Open schedules & map</button></div>${ps?.summary ? `<div class="panel-body"><p>${esc(ps.source)} · ${ps.summary.contracts} contracts · ${ps.summary.activities} activities</p><p class="hint">${esc(ps.summary.horizon_start)} · ${ps.summary.horizon_weeks} weeks. Each scenario uses its own objective; scores are not a single ranking.</p></div><div class="table-scroll"><table><thead><tr><th>Scenario</th><th>Completion</th><th>Rule issues</th><th>Late contracts</th><th>Extra access / ECLO</th><th></th></tr></thead><tbody>${results.map(([key, r]) => `<tr><td><strong>${key} · ${esc(planOptions[key].short)}</strong></td><td>${r.report.complete_activities}/${r.report.total_activities}</td><td>${badge(r.report.feasible ? 'Checks passed' : r.report.hard_violations.length + ' issues', r.report.feasible ? 'neutral' : 'amber')}</td><td>${r.report.soft_scores.contracts_overrunning ?? '—'}</td><td>${r.report.soft_scores.excess_access_nights_total ?? '—'} / ${r.report.soft_scores.eclo_nights_total ?? '—'}</td><td><button data-overview-scenario="${key}">Review plan</button></td></tr>`).join('') || '<tr><td colspan="6">A planner has not built any plans yet.</td></tr>'}</tbody></table></div>` : '<div class="panel-body"><p>No programme yet. A planner needs to import the programme before plans can be reviewed or work assigned.</p></div>'}</section><section class="panel section-gap"><div class="panel-head"><h2>${supervisor ? 'Recent emergency requests' : 'Upcoming assignments'}</h2></div><div class="panel-body">${
        supervisor
          ? data.decisions
              .slice(0, 5)
              .map(
                (x) =>
                  `<div class="listline"><strong>${esc(x.title)}</strong> ${badge(x.stale ? 'Schedule changed' : x.status, x.status === 'pending' ? 'amber' : 'neutral')}<p>${esc(x.planner)} · Scenario ${x.scenario}</p></div>`,
              )
              .join('') ||
            '<p class="muted">No emergency requests. All plans remain available above for routine oversight.</p>'
          : active
              .filter((x) => x.date >= today)
              .sort((a, b) => a.date.localeCompare(b.date))
              .slice(0, 8)
              .map(
                (x) =>
                  `<div class="listline"><strong>${esc(x.worker_name)}</strong> · ${esc(x.date)}<p>${esc(x.activity_id)} · ${esc(x.title)}${x.stale ? ' · Needs reconfirmation' : ''}</p></div>`,
              )
              .join('') ||
            '<p class="muted">No upcoming assignments. Open Worker issues & assignments to allocate work from a saved schedule.</p>'
      }</div></section>`;
    document.querySelectorAll('[data-overview-nav]').forEach(
      (b) =>
        (b.onclick = () => {
          page = b.dataset.overviewNav;
          render();
        }),
    );
    document.querySelectorAll('[data-overview-scenario]').forEach(
      (b) =>
        (b.onclick = () => {
          psScenario = b.dataset.overviewScenario;
          page = 'ps1';
          render();
        }),
    );
  } catch (error) {
    if (user?.id === owner && page === 'overview')
      $('content').innerHTML = `<div class="alert">${esc(error.message)}</div>`;
  }
}
const teamDate = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
function renderRoleWorkspace() {
  const role = user.role;
  const nav =
    role === 'worker'
      ? [['team', 'My work']]
      : role === 'manager'
        ? [
            ['overview', 'Operations overview'],
            ['team', 'Worker issues & assignments'],
            ['ps1', 'Schedules & map'],
            ['contracts', 'Contract requirements'],
            ['accounts', 'Team accounts'],
          ]
        : [
            ['overview', 'Supervisor overview'],
            ['ps1', 'Schedules & map'],
            ['contracts', 'Contracts'],
            ['team', 'Team oversight'],
            ['decisions', 'Emergency decisions'],
            ['activity', 'Workspace history'],
            ['accounts', 'Team accounts'],
          ];
  if (!nav.some((x) => x[0] === page)) page = nav[0][0];
  $('app').innerHTML =
    `<div class="shell"><aside class="sidebar"><div>${workspaceBrand()}<div class="workspace-label">${roleLabel(role)} workspace</div></div><nav aria-label="Workspace">${nav.map(([id, title]) => `<button data-role-nav="${id}" class="${page === id ? 'active' : ''}">${uiIcon(id === 'accounts' ? 'teams' : 'calendar')}${title}</button>`).join('')}</nav><div class="sidebar-foot"><strong>${esc(user.name)}</strong><p>${roleLabel(role)}</p><button id="role-logout">Sign out</button></div></aside><main class="main"><div class="page-topline">Trackwork / ${roleLabel(role)}<button id="role-mobile-logout" class="quiet">Sign out</button></div><header><div><h1>${nav.find((x) => x[0] === page)[1]}</h1><p class="muted">${role === 'worker' ? 'Your assignments, reports and manager decisions.' : role === 'manager' ? 'Review worker reports, record fair decisions and arrange replacement cover.' : 'Review programme health, team operations and decisions across the workspace.'}</p></div><button id="role-refresh">Refresh</button></header><div id="content" class="section-gap"></div><footer class="app-footer">Trackwork · Shared planning workspace</footer></main></div>`;
  document.querySelectorAll('[data-role-nav]').forEach(
    (b) =>
      (b.onclick = () => {
        page = b.dataset.roleNav;
        render();
      }),
  );
  $('role-refresh').onclick = () => run(refresh);
  for (const id of ['role-logout', 'role-mobile-logout'])
    $(id).onclick = () =>
      run(async () => {
        await api('/logout', {});
        csrf = '';
        psData = null;
        teamData = null;
        auth(false);
      });
  ({
    overview: renderOverview,
    accounts: renderTeamAccounts,
    ps1: renderPS1,
    contracts: renderContracts,
    activity: renderActivity,
    team: renderTeam,
    decisions: renderTeam,
  })[page]();
}
function renderTeamAccounts() {
  $('content').innerHTML =
    `<section class="panel"><div class="panel-head between"><h2>Team accounts</h2><button class="primary" id="team-add">Add account</button></div><div class="panel-body"><p class="hint">Workers report issues. Managers review them and assign work. Planners manage schedules. Supervisors decide escalated emergencies.</p>${state.users.map((x) => `<div class="listline"><strong>${esc(x.name)}</strong>${badge(roleLabel(x.role), 'neutral')}<p>${esc(x.email)}</p></div>`).join('')}</div></section>`;
  $('team-add').onclick = accountForm;
}
async function teamSubmit(route, body) {
  await api('/team/' + route, { ...body, version: teamData.version });
  $('modal').close();
  await refresh();
}
async function renderTeam() {
  const owner = user.id,
    currentPage = page;
  $('content').innerHTML = '<div class="panel empty">Loading your workspace…</div>';
  try {
    const data = await api('/team/state');
    if (user?.id !== owner || page !== currentPage) return;
    teamData = data;
    if (page === 'decisions') {
      paintDecisions();
      return;
    }
    const worker = user.role === 'worker',
      manager = user.role === 'manager',
      oversight = user.role === 'supervisor';
    const pending = data.issues.filter((x) => x.status === 'pending').length;
    const points = data.penalties.reduce((n, x) => n + x.points, 0);
    $('content').innerHTML =
      `<div class="feature-stats"><div><small>${worker ? 'My active tasks' : 'Active assignments'}</small><b>${data.assignments.filter((x) => x.status === 'assigned').length}</b></div><div><small>${worker ? 'Reports awaiting review' : 'Pending worker reports'}</small><b>${pending}</b></div><div><small>${worker ? 'My penalty points' : manager || oversight ? 'Reviewed penalty points' : 'Reported absences'}</small><b>${manager || worker || oversight ? points : data.availability.length}</b></div></div>
    <div class="actions section-gap">${worker ? '<button id="report-issue" class="primary">Report an issue / absence</button>' : manager ? '<button id="assign-worker" class="primary">Assign work</button><button id="team-add">Add worker</button>' : ''}</div>
    ${worker || manager || oversight ? `<section class="panel section-gap"><div class="panel-head"><h2>${worker ? 'My reports & decisions' : 'Worker reports'}</h2></div><div class="panel-body"><p class="hint">Reporting adds no penalty automatically. Managers may assign 0–10 internal points with a reason. Points are not payroll deductions.</p>${data.issues.length ? data.issues.map((x) => `<article class="issue-card ${x.status === 'pending' ? 'pending' : ''}"><div class="between"><strong>${esc(x.worker_name)} · ${esc(x.type)} · ${esc(x.date)}</strong>${badge(x.status, x.status === 'pending' ? 'amber' : 'neutral')}</div><p class="preserve-lines">${esc(x.description)}</p>${x.status === 'reviewed' ? `<div class="review-note"><strong>${x.points} points</strong> · ${esc(x.reviewer)}<p>${esc(x.decision)}</p></div>` : manager ? `<button data-review="${x.id}">Review report</button>` : '<p class="muted">Waiting for your manager.</p>'}</article>`).join('') : '<div class="empty">No reports yet.</div>'}</div></section>` : ''}
    ${!worker ? `<section class="panel section-gap"><div class="panel-head"><h2>Reported absences</h2></div><div class="panel-body">${data.availability.map((x) => `<div class="listline"><strong>${esc(x.name)}</strong> · ${esc(x.date)} ${badge(x.status, 'amber')}</div>`).join('') || '<p class="muted">No reported absences.</p>'}</div></section>` : ''}
    <section class="panel section-gap"><div class="panel-head"><h2>${worker ? 'My assignments' : 'Assignments'}</h2></div><div class="panel-body">${data.assignments.length ? data.assignments.map((x) => `<article class="issue-card"><div class="between"><strong>${esc(x.title)} · ${esc(x.activity_id)}</strong>${badge(x.status, 'neutral')}</div><p>${esc(x.worker_name)} · ${esc(x.date)} · Scenario ${esc(x.scenario)}, week ${x.week}</p><p class="muted">${esc(x.location)}</p><p>${esc(x.notes)}</p>${x.stale ? '<p class="alert">The plan changed. Ask the manager to confirm and reassign this task.</p>' : ''}${x.cancel_reason ? `<p>Cancelled: ${esc(x.cancel_reason)}</p>` : ''}${x.status === 'assigned' ? `<div class="actions">${worker ? `<button data-complete="${x.id}" ${x.stale ? 'disabled' : ''}>Mark completed</button>` : manager ? `<button data-cancel-assignment="${x.id}">Cancel / arrange replacement</button>` : ''}</div>` : ''}</article>`).join('') : '<div class="empty">No assignments yet. A manager can assign a worker to a date within a scheduled week.</div>'}</div></section>
    ${manager || oversight ? `<section class="panel section-gap"><div class="panel-head"><h2>Penalty totals</h2></div><div class="panel-body">${data.penalties.map((x) => `<div class="listline"><strong>${esc(x.name)}</strong> · ${x.points} points</div>`).join('') || '<p>No worker accounts yet.</p>'}</div></section>` : ''}`;
    if ($('report-issue')) $('report-issue').onclick = reportIssue;
    if ($('assign-worker')) $('assign-worker').onclick = assignWorker;
    if ($('team-add')) $('team-add').onclick = accountForm;
    document
      .querySelectorAll('[data-review]')
      .forEach((b) => (b.onclick = () => reviewIssue(b.dataset.review)));
    document
      .querySelectorAll('[data-complete]')
      .forEach(
        (b) =>
          (b.onclick = () =>
            run(() => teamSubmit('complete-assignment', { id: b.dataset.complete }), b)),
      );
    document.querySelectorAll('[data-cancel-assignment]').forEach(
      (b) =>
        (b.onclick = () => {
          dialog(
            'Cancel assignment',
            `<form id="cancel-task"><label for="cancel-reason">Reason / replacement arrangement</label><textarea id="cancel-reason" name="reason" required maxlength="2000"></textarea><p class="hint">The worker will see this reason. You can assign a replacement after cancelling.</p><button class="primary">Cancel assignment</button></form>`,
          );
          $('cancel-task').onsubmit = (e) => {
            e.preventDefault();
            run(
              () =>
                teamSubmit('cancel-assignment', {
                  id: b.dataset.cancelAssignment,
                  ...formData(e.target),
                }),
              e.submitter,
            );
          };
        }),
    );
  } catch (error) {
    if (user?.id === owner && page === currentPage)
      $('content').innerHTML = `<div class="alert">${esc(error.message)}</div>`;
  }
}
function reportIssue() {
  dialog(
    'Report an issue',
    `<form id="issue-form"><div class="forms"><div><label for="issue-type">Type</label><select id="issue-type" name="type"><option value="absence">Cannot work / absence</option><option value="safety">Safety concern</option><option value="equipment">Equipment problem</option><option value="other">Other</option></select></div><div><label for="issue-date">Affected date</label><input id="issue-date" name="date" type="date" value="${teamDate()}" required></div><div class="span2"><label for="issue-task">Related assignment (optional)</label><select id="issue-task" name="assignment_id"><option value="">General report</option>${teamData.assignments
      .filter((x) => x.status === 'assigned')
      .map((x) => `<option value="${x.id}">${esc(x.date + ' · ' + x.activity_id)}</option>`)
      .join(
        '',
      )}</select></div><div class="span2"><label for="issue-description">What happened?</label><textarea id="issue-description" name="description" maxlength="2000" required placeholder="Explain the issue so your manager can arrange support."></textarea></div></div><p class="hint">Your manager will review this. No points are added when you submit.</p><button class="primary">Send to manager</button></form>`,
  );
  $('issue-form').onsubmit = (e) => {
    e.preventDefault();
    run(() => teamSubmit('issues', formData(e.target)), e.submitter);
  };
}
function reviewIssue(id) {
  const issue = teamData.issues.find((x) => x.id === id);
  dialog(
    'Review worker report',
    `<p><strong>${esc(issue.worker_name)}</strong> · ${esc(issue.date)}</p><p>${esc(issue.description)}</p><form id="review-form"><label for="review-points">Penalty points (0 means no penalty)</label><input type="number" min="0" max="10" step="1" value="0" required id="review-points" name="points"><label for="review-reason">Decision and reason, visible to the worker</label><textarea id="review-reason" name="decision" required maxlength="2000"></textarea><button class="primary">Record review</button></form>`,
  );
  $('review-form').onsubmit = (e) => {
    e.preventDefault();
    const b = formData(e.target);
    run(() => teamSubmit('review', { ...b, id, points: Number(b.points) }), e.submitter);
  };
}
function assignWorker() {
  const programme = teamData.programme,
    workers = teamData.people.filter((x) => x.role === 'worker');
  const scenarios = Object.keys(programme?.results || {}).filter(
    (s) => programme.results[s].report.feasible,
  );
  if (!workers.length || !scenarios.length) {
    toast('Create a worker account and build a feasible plan before assigning work.', true);
    return;
  }
  dialog(
    'Assign work',
    `<form id="assign-form"><div class="forms"><div><label for="assign-person">Worker</label><select name="worker_id" id="assign-person">${workers.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></div><div><label for="assign-scenario">Scenario</label><select name="scenario" id="assign-scenario">${opts(scenarios, scenarios[0])}</select></div><div class="span2"><label for="assign-activity">Activity</label><select id="assign-activity" name="activity_id">${programme.summary.jobs.map((x) => `<option value="${esc(x.id)}">${esc(x.id + ' · ' + x.type)}</option>`).join('')}</select></div><div><label for="assign-date">Work date</label><input id="assign-date" type="date" name="date" required></div><div class="span2"><p id="assign-weeks" class="hint"></p><label for="assign-notes">Instructions</label><textarea id="assign-notes" name="notes" maxlength="2000"></textarea></div></div><p class="hint">The programme allocates weekly access. The manager chooses the actual work date. A reported absence or another assignment on that date blocks assignment.</p><button class="primary">Assign worker</button></form>`,
  );
  const dates = () => {
    const rows = programme.results[$('assign-scenario').value].access.filter(
      (x) => x.activity_id === $('assign-activity').value,
    );
    $('assign-weeks').textContent = 'Scheduled weeks: ' + rows.map((x) => x.week).join(', ');
    if (rows.length)
      $('assign-date').value = new Date(
        Date.parse(programme.summary.horizon_start) + (rows[0].week - 1) * 604800000,
      )
        .toISOString()
        .slice(0, 10);
  };
  $('assign-scenario').onchange = dates;
  $('assign-activity').onchange = dates;
  dates();
  $('assign-form').onsubmit = (e) => {
    e.preventDefault();
    run(() => teamSubmit('assign', formData(e.target)), e.submitter);
  };
}
function paintDecisions() {
  const supervisor = user.role === 'supervisor';
  $('content').innerHTML =
    `<div class="info">Emergency alerts appear in the supervisor workspace and refresh every 15 seconds while it is open. A decision applies to the submitted schedule version.</div>${!supervisor ? '<div class="actions section-gap"><button id="emergency-new" class="danger-button">Emergency → Supervisor</button></div>' : ''}<section class="panel section-gap"><div class="panel-head"><h2>Emergency decisions</h2></div><div class="panel-body">${teamData.decisions.map((x) => `<article class="issue-card ${x.status === 'pending' ? 'urgent' : ''}"><div class="between"><strong>${esc(x.title)}</strong>${badge(x.status, x.status === 'pending' ? 'amber' : 'neutral')}</div><p class="hint">${esc(x.planner)} · Scenario ${x.scenario} · ${new Date(x.created_at).toLocaleString()}</p><p class="preserve-lines">${esc(x.question)}</p><p>Submitted plan: ${x.summary.feasible ? 'checks passed' : 'has hard rule issues'} · Schedule score ${x.summary.score ?? 'unavailable'}</p>${x.summary.issues.map((v) => `<p class="alert">${esc(v.detail)}</p>`).join('')}${x.stale ? '<p class="alert">Schedule changed since this request. A new request is needed for the current plan.</p>' : ''}${x.decision ? `<div class="review-note"><strong>${esc(x.supervisor)}</strong><p>${esc(x.decision)}</p></div>` : supervisor && !x.stale ? `<div class="actions"><button data-inspect-plan="${x.scenario}">View schedule</button><button data-decide="${x.id}" class="primary">Make decision</button></div>` : '<p class="muted">Waiting for supervisor review.</p>'}</article>`).join('') || '<div class="empty">No emergency decisions yet.</div>'}</div></section>`;
  if ($('emergency-new')) $('emergency-new').onclick = emergencyForm;
  document.querySelectorAll('[data-decide]').forEach(
    (b) =>
      (b.onclick = () => {
        dialog(
          'Supervisor decision',
          `<form id="decision-form"><label for="decision-status">Decision</label><select id="decision-status" name="status"><option value="approved">Approve</option><option value="changes_requested">Request changes</option><option value="rejected">Reject</option></select><label for="decision-reason">Reason and instructions to the planner</label><textarea id="decision-reason" name="decision" required maxlength="2000"></textarea><button class="primary">Send final decision</button></form>`,
        );
        $('decision-form').onsubmit = (e) => {
          e.preventDefault();
          run(
            () => teamSubmit('decide', { id: b.dataset.decide, ...formData(e.target) }),
            e.submitter,
          );
        };
      }),
  );
  document.querySelectorAll('[data-inspect-plan]').forEach(
    (b) =>
      (b.onclick = () =>
        run(async () => {
          const data = await api('/ps1/state'),
            r = data.results[b.dataset.inspectPlan];
          dialog(
            'Schedule for supervisor review',
            `<div class="table-scroll"><table><thead><tr><th>Activity</th><th>Weeks</th><th>Work</th></tr></thead><tbody>${data.summary.jobs
              .map(
                (a) =>
                  `<tr><td>${esc(a.id)}</td><td>${r.access
                    .filter((x) => x.activity_id === a.id)
                    .map((x) => x.week)
                    .join(', ')}</td><td>${esc(a.type)}</td></tr>`,
              )
              .join('')}</tbody></table></div>`,
          );
        }, b)),
  );
}
async function emergencyForm(prefill = '') {
  try {
    teamData = await api('/team/state');
    const programme = teamData.programme,
      scenarios = Object.keys(programme?.results || {});
    if (!scenarios.length) {
      toast('Build a plan before sending a schedule decision.', true);
      return;
    }
    dialog(
      'Emergency → Supervisor',
      `<form id="emergency-form"><div class="alert">This sends an urgent alert to supervisor accounts in this workspace.</div><label for="emergency-title">Emergency</label><input id="emergency-title" name="title" required maxlength="150" placeholder="Power failure affecting the next work window"><label for="emergency-scenario">Schedule</label><select id="emergency-scenario" name="scenario">${opts(scenarios, psScenario)}</select><label for="emergency-question">Situation and decision needed</label><textarea id="emergency-question" name="question" required maxlength="2000" placeholder="What happened? What options should the supervisor decide between?">${esc(typeof prefill === 'string' ? prefill : '')}</textarea><button class="danger-button">Send emergency alert</button></form>`,
    );
    $('emergency-form').onsubmit = (e) => {
      e.preventDefault();
      run(async () => {
        await api('/team/escalate', { ...formData(e.target), version: teamData.version });
        $('modal').close();
        page = 'decisions';
        await refresh();
        toast('Emergency sent to supervisor accounts.');
      }, e.submitter);
    };
  } catch (error) {
    toast(error.message, true);
  }
}
setInterval(async () => {
  if (
    !user ||
    !['scheduler', 'supervisor', 'manager', 'worker'].includes(user.role) ||
    document.hidden ||
    $('modal').open
  )
    return;
  const owner = user.id;
  try {
    const data = await api('/team/state');
    if (user?.id !== owner) return;
    if (
      ['team', 'decisions', 'overview'].includes(page) &&
      teamData &&
      data.version !== teamData.version
    ) {
      if (page === 'overview') await renderOverview();
      else await renderTeam();
      return;
    }
    const pending = data.decisions.filter((x) => x.status === 'pending' && !x.stale).length;
    const nav = document.querySelector('[data-nav="decisions"], [data-role-nav="decisions"]');
    if (nav) nav.textContent = `Emergency decisions${pending ? ' (' + pending + ')' : ''}`;
  } catch {}
}, 15000);
