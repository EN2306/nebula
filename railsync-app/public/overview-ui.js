let overviewWeek = 1,
  overviewFilter = 'attention';

const deadlineLabel = (row) =>
  row.status === 'incomplete'
    ? `${row.remaining_work} work units unscheduled`
    : row.status === 'late'
      ? `${row.delay_days} days late`
      : `${row.slack_days} days of margin`;

async function psOverview() {
  const result = psData.results[psScenario];
  const target = $('planner-body');
  if (!result) {
    target.innerHTML =
      '<div class="overview-empty"><span class="eyebrow">Your programme, at a glance</span><h2>Find the right plan for every possession.</h2><p>Build the three scenarios to see weekly workload, activities near their targets and opportunities to reduce disruption.</p><button id="overview-build" class="primary">Build all three plans</button></div>';
    $('overview-build').disabled = psLoading;
    $('overview-build').onclick = () => psGenerate(['A', 'B', 'C']);
    return;
  }
  const scenario = psScenario,
    version = psData.version,
    token = psData.plan_tokens[scenario],
    owner = user?.id;
  target.innerHTML =
    '<div class="overview-empty" role="status">Preparing your programme overview…</div>';
  try {
    const insight = await api('/ps1/insights?scenario=' + scenario);
    if (!target.isConnected || page !== 'ps1' || psTab !== 'overview' || user?.id !== owner) return;
    if (insight.dataset_version !== version || insight.plan_token !== token) {
      target.innerHTML =
        '<div class="overview-empty"><h3>The saved plan has changed.</h3><p>Refresh the programme to review its latest bookings.</p><button id="overview-reload">Refresh programme</button></div>';
      $('overview-reload').onclick = renderPS1;
      return;
    }
    drawOverview(target, insight, result);
  } catch (error) {
    if (target.isConnected) {
      target.innerHTML = `<div class="overview-empty"><p role="alert">${esc(error.message)}</p><button id="overview-retry">Try again</button></div>`;
      $('overview-retry').onclick = psOverview;
    }
  }
}

function drawOverview(target, insight, result) {
  overviewWeek = Math.max(1, Math.min(overviewWeek, insight.weeks.length));
  const week = insight.weeks[overviewWeek - 1];
  const maxBookings = Math.max(1, ...insight.weeks.map((row) => row.bookings));
  const visibleWeeks = insight.weeks.slice(
    Math.floor((overviewWeek - 1) / 12) * 12,
    Math.floor((overviewWeek - 1) / 12) * 12 + 12,
  );
  const watch = insight.deadline_watch.filter(
    (row) =>
      overviewFilter === 'all' ||
      (overviewFilter === 'attention' ? row.status !== 'on_track' : row.status === overviewFilter),
  );
  const selectedRows = result.access.filter((row) => row.week === overviewWeek);
  const health = result.report.feasible
    ? 'Automatic checks passed'
    : 'Review required before export';
  target.innerHTML = `
    <div class="programme-overview">
      <section class="overview-hero">
        <div><span class="eyebrow">Scenario ${esc(psScenario)} / Programme overview</span><h2>A clear view of the work ahead.</h2><p>${esc(planOptions[psScenario].detail)}</p><span class="overview-health ${result.report.feasible ? '' : 'needs-review'}">${uiIcon(result.report.feasible ? 'check' : 'help')}${health}</span></div>
        <div class="overview-hero-side"><span class="eyebrow">Meeting-ready</span><p>Take the schedule, risks and tradeoffs into your next planning conversation.</p><button id="overview-brief">${uiIcon('download')}Download planning brief</button></div>
      </section>
      <div class="overview-grid">
        <section class="overview-card workload-card">
          <div class="overview-card-head"><div><span class="eyebrow">Possession planning</span><h3>Weekly workload</h3></div><div class="chart-pager"><button id="overview-earlier" aria-label="Earlier twelve weeks" ${visibleWeeks[0].week === 1 ? 'disabled' : ''}>←</button><button id="overview-later" aria-label="Later twelve weeks" ${visibleWeeks.at(-1).week >= insight.weeks.length ? 'disabled' : ''}>→</button></div></div>
          <p class="overview-caption">Select a week to inspect bookings. Each bar counts activity accesses.</p>
          <div class="workload-chart" role="group" aria-label="Bookings by week">${visibleWeeks.map((row) => `<button class="week-bar ${row.week === overviewWeek ? 'active' : ''}" data-overview-week="${row.week}" aria-pressed="${row.week === overviewWeek}" aria-label="Week ${row.week}: ${row.bookings} accesses, ${row.eclo} longer windows"><span class="bar-total">${row.bookings}</span><span class="bar-track"><span class="bar-fill" style="height:${(row.bookings / maxBookings) * 100}%"><span class="bar-eclo" style="height:${row.bookings ? (row.eclo / row.bookings) * 100 : 0}%"></span></span></span><span class="bar-week">W${row.week}</span></button>`).join('')}</div>
          <div class="chart-legend"><span><i></i>Normal access</span><span><i class="legend-eclo"></i>Longer window (ECLO)</span></div>
          <div class="week-summary" aria-live="polite"><div><strong>Week ${overviewWeek}</strong><span>${shortDate(weekDate(overviewWeek))} – ${shortDate(weekDate(overviewWeek, true))}</span></div><div><strong>${week.activities.length}</strong><span>active jobs</span></div><div><strong>${week.finishing}</strong><span>finishing</span></div><div><strong>${week.constrained_locations}</strong><span>locations at capacity</span></div></div>
          <div class="week-job-list">${
            selectedRows.length
              ? selectedRows
                  .slice(0, 6)
                  .map(
                    (row) =>
                      `<button data-overview-activity="${esc(row.activity_id)}"><span class="line-dot ${planJob(row.activity_id)?.line === 'BET' ? 'beta' : ''}"></span><strong>${esc(row.activity_id)}</strong><span>${esc(planJob(row.activity_id)?.type)}</span>${row.eclo ? '<small>ECLO</small>' : ''}</button>`,
                  )
                  .join('')
              : '<p class="muted">No bookings in this week.</p>'
          }</div>
          <div class="overview-card-foot"><span>${selectedRows.length > 6 ? `Showing 6 of ${selectedRows.length} bookings` : `${selectedRows.length} bookings in this week`}</span><button id="overview-open-week" class="quiet">Open week in map →</button></div>
        </section>
        <aside class="overview-card decision-card">
          <div class="overview-card-head"><div><span class="eyebrow">Your next decisions</span><h3>Where to focus</h3></div>${uiIcon('timeline')}</div>
          <button class="focus-item" data-overview-filter="incomplete"><span class="focus-number ${insight.overview.incomplete_activities ? 'attention' : ''}">${insight.overview.incomplete_activities}</span><span><strong>Incomplete activities</strong><small>Work still needing a booking</small></span><span>↗</span></button>
          <button class="focus-item" data-overview-filter="late"><span class="focus-number ${insight.overview.late_activities ? 'attention' : ''}">${insight.overview.late_activities}</span><span><strong>Activities past target</strong><small>Review priority and downstream work</small></span><span>↗</span></button>
          <button class="focus-item" data-overview-filter="tight"><span class="focus-number">${insight.overview.tight_activities}</span><span><strong>Less than one week of margin</strong><small>A later booking could miss the target</small></span><span>↗</span></button>
          <div class="decision-note"><strong>Test the next disruption.</strong><p>Preview an outage and check how much work moves before changing the saved plan.</p><button id="overview-disruption">Preview disruption →</button></div>
          <button id="overview-capacity" class="quiet">Review week ${overviewWeek} capacity →</button>
        </aside>
      </div>
      <section class="overview-card deadline-card" id="deadline-watch">
        <div class="overview-card-head"><div><span class="eyebrow">Deadline watchlist</span><h3>Keep the critical work in view</h3></div><label class="overview-filter" for="overview-filter">Show<select id="overview-filter">${[
          ['attention', 'Needs attention'],
          ['incomplete', 'Incomplete'],
          ['late', 'Past target'],
          ['tight', 'Under one week of margin'],
          ['all', 'All activities'],
        ]
          .map(
            ([value, label]) =>
              `<option value="${value}" ${overviewFilter === value ? 'selected' : ''}>${label}</option>`,
          )
          .join('')}</select></label></div>
        <p class="overview-caption">Margin is the number of days from the scheduled finish to the planned target. It is not a prediction of disruption.</p>
        <div class="watch-scroll"><table><thead><tr><th>Activity / contract</th><th>Priority</th><th>Planned target</th><th>Schedule margin</th><th>Predecessor</th></tr></thead><tbody>${watch.map((row) => `<tr><td><button class="work-title" data-overview-activity="${esc(row.activity_id)}">${esc(row.activity_id)}</button><small class="watch-contract">${esc(row.contract)}</small></td><td><span class="priority-chip">P${row.priority}</span></td><td>${esc(shortDate(row.target_date))}</td><td><span class="deadline-status ${row.status}">${esc(deadlineLabel(row))}</span></td><td>${row.predecessor ? `<button class="quiet" data-overview-activity="${esc(row.predecessor)}">${esc(row.predecessor)}</button>` : '—'}</td></tr>`).join('')}</tbody></table>${watch.length ? '' : '<div class="overview-empty"><h3>No activities in this selection.</h3><p>Try another filter to review the rest of the programme.</p></div>'}</div>
        <div class="overview-card-foot"><span>${watch.length} of ${insight.deadline_watch.length} activities · Select an activity for booking evidence.</span><span>Based on saved Scenario ${esc(psScenario)}</span></div>
      </section>
      <p class="overview-disclaimer">Schedule analysis from the saved programme. Automatic checks use the app’s model; official validation is still pending.</p>
    </div>`;
  const redraw = (focusId) => {
    drawOverview(target, insight, result);
    if (focusId) $(focusId)?.focus();
  };
  target.querySelectorAll('[data-overview-week]').forEach(
    (button) =>
      (button.onclick = () => {
        overviewWeek = Number(button.dataset.overviewWeek);
        redraw();
        target.querySelector(`[data-overview-week="${overviewWeek}"]`)?.focus();
      }),
  );
  $('overview-earlier').onclick = () => {
    overviewWeek = Math.max(1, visibleWeeks[0].week - 12);
    redraw('overview-earlier');
  };
  $('overview-later').onclick = () => {
    overviewWeek = visibleWeeks.at(-1).week + 1;
    redraw('overview-later');
  };
  $('overview-filter').onchange = (event) => {
    overviewFilter = event.target.value;
    redraw('overview-filter');
  };
  target.querySelectorAll('[data-overview-filter]').forEach(
    (button) =>
      (button.onclick = () => {
        overviewFilter = button.dataset.overviewFilter;
        redraw('overview-filter');
        $('deadline-watch').scrollIntoView({ block: 'start', behavior: 'auto' });
      }),
  );
  target
    .querySelectorAll('[data-overview-activity]')
    .forEach((button) => (button.onclick = () => psActivity(button.dataset.overviewActivity)));
  $('overview-open-week').onclick = () => {
    mapStart = overviewWeek;
    psTab = 'network';
    paintPS1();
  };
  $('overview-capacity').onclick = () => {
    psWeek = overviewWeek;
    psPage = 0;
    psTab = 'capacity';
    paintPS1();
  };
  $('overview-disruption').onclick = disruptionForm;
  $('overview-disruption').disabled = psLoading;
  $('overview-brief').onclick = () => downloadPlanningBrief(insight, result);
  applyPlanPermissions();
}

function planningBriefText(insight, result) {
  const clean = (value) => String(value ?? '').replace(/[\r\n|]/g, ' ');
  const lines = [
    '# Trackwork planning brief',
    '',
    `Scenario ${result.scenario}: ${planOptions[result.scenario].name}`,
    `Source: ${clean(psData.source)}`,
    `Dataset version: ${insight.dataset_version} · Plan reference: ${insight.plan_token}`,
    `Generated: ${insight.generated_at}`,
    '',
    `Automatic checks: ${result.report.feasible ? 'passed' : 'failed'}`,
    `Activities fully scheduled: ${insight.overview.completed}`,
    `Incomplete activities: ${insight.overview.incomplete_activities}`,
    `Contract delay days: ${insight.overview.delay_days}`,
    `Extra location/week slots: ${insight.overview.extra_slots}`,
    `Longer activity work windows: ${insight.overview.eclo_nights}`,
    '',
    '## Planning handover',
    '',
    insight.handover,
    '',
    '## Scenario tradeoffs',
    '',
    'Scenario | Checks | Contract delay days | Extra slots | Longer windows',
    '--- | --- | --- | --- | ---',
    ...Object.entries(psData.results).map(
      ([scenario, plan]) =>
        `${scenario} | ${plan.report.feasible ? 'Passed' : 'Failed'} | ${plan.report.soft_scores.overrun_days_total} | ${plan.report.soft_scores.excess_access_nights_total} | ${plan.report.soft_scores.eclo_nights_total}`,
    ),
    '',
    'Scenario scores use different objectives; compare delays and access needs directly.',
    '',
    `## Week ${overviewWeek} handover`,
    '',
    ...result.access
      .filter((row) => row.week === overviewWeek)
      .map(
        (row) =>
          `- ${clean(row.activity_id)} · ${clean(planJob(row.activity_id)?.contract)} · ${row.eclo ? 'Longer window' : 'Normal access'}`,
      ),
    '',
    '## Deadline watchlist',
    '',
    ...insight.deadline_watch
      .filter((row) => row.status !== 'on_track')
      .map(
        (row) =>
          `- ${clean(row.activity_id)} · ${clean(row.contract)} · P${row.priority} · ${deadlineLabel(row)} · target ${row.target_date}`,
      ),
    '',
    '## Capacity requests',
    '',
    ...(insight.negotiation.length
      ? insight.negotiation.map((row) => '- ' + clean(row.request))
      : ['No extra slot requests indicated.']),
    '',
    '## Active disruption windows',
    '',
    ...(result.disruptions?.length
      ? result.disruptions.map(
          (row) =>
            `- ${clean(row.type)} · ${clean(row.location)} · weeks ${row.start_week}–${row.end_week}`,
        )
      : ['No active disruption windows.']),
    '',
    insight.note,
    '',
  ];
  return lines.join('\n');
}

function downloadPlanningBrief(insight, result) {
  const url = URL.createObjectURL(
    new Blob([planningBriefText(insight, result)], { type: 'text/markdown;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `TRACKWORK_BRIEF_${result.scenario}.md`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Planning brief downloaded.');
}
