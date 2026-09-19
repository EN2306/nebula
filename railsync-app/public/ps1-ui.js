let psData = null,
  psScenario = 'A',
  psWeek = 0,
  psContract = '',
  psLoading = false,
  psTab = 'overview',
  psLayout = 'list',
  psSearch = '',
  psLine = '',
  psPage = 0,
  psTimelineStart = 1,
  psProgress = '';
function psQualitySummary() {
  const rows = Object.entries(psData.results).filter(([, r]) => r.report.quality);
  if (!rows.length) return '';
  return `<div class="plan-help"><h3>How much room remains to improve?</h3><div class="table-scroll"><table><thead><tr><th>Scenario</th><th>Plan penalty</th><th>Model lower bound</th><th>Gap</th><th>Search time</th></tr></thead><tbody>${rows
    .map(([s, r]) => {
      const q = r.report.quality;
      return `<tr><td>${s}</td><td>${r.report.soft_scores.objective_score ?? 'Infeasible'}</td><td>${q.lower_bound ?? 'Not available'}</td><td>${q.gap === 0 ? 'Bound reached' : (q.gap ?? 'Not available')}</td><td>${q.elapsed_ms} ms</td></tr>`;
    })
    .join(
      '',
    )}</tbody></table></div><p>A zero gap means the plan reaches a mathematical lower bound under this app’s weekly model. Capacity, workfronts and shared ECLO windows are relaxed to calculate that bound. This is not an official-validator certificate.</p><p>Different scenarios use different objectives; compare each plan with its own bound.</p></div>`;
}
function psWhatIf() {
  const locations = psData.summary.location_supply || [],
    scenario = psScenario,
    version = psData.version;
  dialog(
    'Preview a capacity change',
    `<p>Scenario ${scenario}. Change the available slots at one location <strong>for every week</strong>, matching the flat supply input. Previewing keeps your saved programme and exports unchanged.</p><form id="what-if-form"><div class="field"><label for="what-if-location">Track location</label><select id="what-if-location">${locations.map((x) => `<option value="${esc(x.location)}">${esc(x.location)} · ${x.capacity} slots</option>`).join('')}</select></div><div class="field"><label for="what-if-capacity">New weekly capacity</label><input id="what-if-capacity" type="number" min="0" max="100" step="1" required value="${locations[0]?.capacity ?? 0}"></div><button type="submit" class="primary">Preview impact</button></form><div id="what-if-result" role="status"></div>`,
  );
  $('what-if-location').onchange = (e) => {
    $('what-if-capacity').value = locations.find((x) => x.location === e.target.value).capacity;
  };
  $('what-if-form').onsubmit = async (event) => {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    const target = $('what-if-result');
    target.textContent = 'Checking the existing plan and rebuilding if needed…';
    try {
      const preview = await api('/ps1/what-if', {
        scenario,
        version,
        location: $('what-if-location').value,
        capacity: Number($('what-if-capacity').value),
      });
      if (!target.isConnected) return;
      const report = preview.result.report,
        comparison = preview.comparison;
      target.innerHTML = `<h3 class="section-gap">${preview.retained_baseline ? 'Existing bookings still fit' : report.feasible ? 'A feasible alternative was found' : 'No feasible alternative found'}</h3><p>${report.complete_activities}/${report.total_activities} activities complete. Penalty: ${preview.baseline_score ?? 'infeasible'} → ${report.soft_scores.objective_score ?? 'infeasible'}.</p><p>${comparison.changed_activities} activities change weeks or ECLO; ${comparison.unchanged_activities} retain them. ${preview.baseline_report.hard_violations.length} rule issues in the original bookings under the changed supply.</p><div class="table-scroll"><table><thead><tr><th>Activity</th><th>Original weeks</th><th>Preview weeks</th><th>ECLO before → after</th></tr></thead><tbody>${comparison.changes
        .slice(0, 30)
        .map(
          (x) =>
            `<tr><td>${esc(x.activity_id)}</td><td>${x.before_weeks.join(', ')}</td><td>${x.after_weeks.join(', ')}</td><td>${x.before_eclo} → ${x.after_eclo}</td></tr>`,
        )
        .join(
          '',
        )}</tbody></table></div><p class="hint">${comparison.changes.length > 30 ? 'First 30 changes shown. ' : ''}This preview does not prove minimum churn. To adopt a change, update the location supply CSV, import the revised eight-file programme and rebuild.</p>`;
    } catch (error) {
      if (target.isConnected) target.textContent = error.message;
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  };
}
async function psInsights() {
  try {
    const insight = await api(`/ps1/insights?scenario=${encodeURIComponent(psScenario)}`);
    dialog(
      `Risk & handover · Scenario ${psScenario}`,
      `<p class="info">${esc(insight.handover)}</p><div class="detail-grid"><div><span>Completion</span><b>${esc(insight.overview.completed)}</b></div><div><span>Objective score</span><b>${insight.overview.objective_score ?? 'Infeasible'}</b></div><div><span>Delay days</span><b>${insight.overview.delay_days}</b></div><div><span>Extra slots / ECLO</span><b>${insight.overview.extra_slots} / ${insight.overview.eclo_nights}</b></div></div><h3 class="section-gap">Priority risks</h3>${
        insight.priority_risks.length
          ? `<div class="table-scroll"><table><thead><tr><th>Activity</th><th>Contract</th><th>Priority</th><th>Delay</th><th>Risk score</th></tr></thead><tbody>${insight.priority_risks
              .slice(0, 10)
              .map(
                (risk) =>
                  `<tr><td>${esc(risk.activity_id)}</td><td>${esc(risk.contract)}</td><td>P${risk.priority}</td><td>${risk.completed ? risk.delay_days + ' days' : 'Incomplete'}</td><td>${risk.score}</td></tr>`,
              )
              .join('')}</tbody></table></div>`
          : '<p class="muted">No scored priority risks in this plan.</p>'
      }<h3 class="section-gap">Fragile locations</h3>${
        insight.fragile_locations.length
          ? `<ul>${insight.fragile_locations
              .slice(0, 8)
              .map(
                (location) =>
                  `<li><strong>${esc(location.location)}</strong> · week ${location.week} · ${location.used}/${location.capacity} slots · ${esc(location.affected_activities.join(', '))}</li>`,
              )
              .join('')}</ul>`
          : '<p class="muted">No locations at or above nominal capacity.</p>'
      }<h3 class="section-gap">Contractor negotiation prompts</h3>${insight.negotiation.length ? `<ul>${insight.negotiation.map((item) => `<li>${esc(item.request)} Affects ${esc(item.affected_activities.join(', '))}.</li>`).join('')}</ul>` : '<p class="muted">No additional slot request is indicated for this plan.</p>'}<p class="hint">${esc(insight.note)}</p>`,
    );
  } catch (error) {
    toast(error.message, true);
  }
}
const psFiles = [
  '01_LINES.csv',
  '02_STATIONS.csv',
  '03_SECTORS.csv',
  '04_LOCATION_SUPPLY.csv',
  '05_BUFFER_LOCATION.csv',
  '06_PARAMETERS.csv',
  '07_PROJECT_DETAILS.csv',
  '08_ACTIVITY_DETAILS.csv',
];
const planOptions = {
  A: {
    name: 'Use available access',
    short: 'Use available access',
    detail: 'Keep within existing track access. Some completion dates may move.',
  },
  B: {
    name: 'Meet target dates',
    short: 'Meet target dates',
    detail:
      'Keep planned completion dates. Request extra track access or longer work windows where needed.',
  },
  C: {
    name: 'Balance access and delays',
    short: 'Balance access & delays',
    detail:
      'Allow limited extra access and longer work windows when they reduce the cost of delays.',
  },
};
const shortDate = (value) =>
  value
    ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
        new Date(value),
      )
    : '—';
function weekDate(w, end = false) {
  return new Date(
    Date.parse(psData.summary.horizon_start) + ((w - 1) * 7 + (end ? 6 : 0)) * 86400000,
  )
    .toISOString()
    .slice(0, 10);
}
function planJob(id) {
  return psData.summary.jobs?.find((a) => a.id === id);
}
function planContract(id) {
  return psData.summary.projects?.find((p) => p.id === id);
}
function planRoute(a) {
  const job = planJob(a.activity_id),
    ids = job
      ? [job.from, job.to]
      : (psData.results[psScenario]?.occupancy || [])
          .filter((x) => x.activity_id === a.activity_id)
          .map((x) => x.location_id);
  const stationIds = [...new Set(ids.flatMap((x) => (x?.split(':')[2] || '').split('_')))];
  const path = psData.summary.stations
    .filter((s) => s.line_code === a.line)
    .sort((a, b) => +a.seq - +b.seq)
    .map((s) => s.station_id);
  stationIds.sort((a, b) => path.indexOf(a) - path.indexOf(b));
  return stationIds.length
    ? stationIds[0] + (stationIds.length > 1 ? ' – ' + stationIds.at(-1) : '')
    : 'Track section';
}
function planningJobs() {
  const r = psData.results[psScenario];
  return r
    ? r.explanations
    : (psData.summary.jobs || []).map((a) => ({
        activity_id: a.id,
        contract: a.contract,
        line: a.line,
        bound: a.bound,
        workload: a.workload,
        priority: a.priority,
        nature: a.nature,
        access_type: a.access_type,
      }));
}
async function renderPS1() {
  const owner = user?.id;
  $('content').innerHTML = '<div class="panel empty">Loading the work programme…</div>';
  try {
    const data = await api('/ps1/state');
    if (page !== 'ps1' || user?.id !== owner) return;
    psData = data;
    paintPS1();
  } catch (e) {
    if (page === 'ps1') $('content').innerHTML = `<div class="alert">${esc(e.message)}</div>`;
  }
}
function plannerHelp() {
  dialog(
    'Using the track planner',
    `<ol class="start-steps"><li><span class="step-number">1</span><div><strong>Add your work programme</strong><p>Use the supplied example or import the eight CSV files with your tracks, available access, contracts and maintenance jobs.</p></div></li><li><span class="step-number">2</span><div><strong>Build and compare plans</strong><p>The planner tries three approaches: stay within available access, meet target dates, or balance access against delays. Every job must be included.</p></div></li><li><span class="step-number">3</span><div><strong>Review before you export</strong><p>Check the weekly schedule, late contracts and busy track sections. Open a job to see its work locations and bookings, then download the files for your selected plan.</p></div></li></ol><div class="info section-gap">A longer work window means early closure or late opening of passenger service (ECLO). It gives a job 1.5 times the work of a normal access.</div><p class="hint section-gap">Workfront limits count concurrent contract activities. PM, PC and C are possession access types. Automatic checks use the app’s implemented rules; official validator verification is still pending.</p>`,
  );
}
function paintPS1() {
  if (page !== 'ps1' || !psData) return;
  const d = psData.summary,
    r = psData.results[psScenario],
    rep = r?.report,
    busy = psLoading ? 'disabled' : '',
    sample = psData.source?.startsWith('NebulaX'),
    hasPlans = Object.keys(psData.results).length > 0;
  $('content').innerHTML = !d
    ? `<section class="panel planner-start"><div><span class="eyebrow">Start planning</span><h2 class="section-gap">Bring your maintenance work together.</h2><p>Add the jobs, track availability and deadlines. We’ll build schedules you can check and compare.</p><div class="actions section-gap"><button class="primary" id="ps-sample" ${busy}>Try the example programme</button><button id="ps-upload" ${busy}>${uiIcon('upload')}Import work files</button></div><p class="hint section-gap">The example contains 54 jobs across Line Alpha and Line Beta.</p></div><ol class="start-steps"><li><span class="step-number">1</span><div><strong>Add the work</strong><p>Import the eight programme files, or start with the example.</p></div></li><li><span class="step-number">2</span><div><strong>Compare the choices</strong><p>See which jobs slip and where extra access would help.</p></div></li><li><span class="step-number">3</span><div><strong>Review the schedule</strong><p>Check the bookings and download the plan.</p></div></li></ol></section>`
    : `
 <section class="dataset-strip" aria-label="Loaded work programme"><div class="dataset-info"><span class="dataset-icon">${uiIcon('file')}</span><div><strong>${sample ? 'Example work programme' : 'Imported work programme'}</strong><small>${d.contracts} contracts · ${esc(shortDate(d.horizon_start))} – ${esc(shortDate(weekDate(d.horizon_weeks, true)))} ${new Date(d.horizon_start).getUTCFullYear()} · ${d.horizon_weeks} weeks</small></div></div><div class="actions"><button class="quiet" id="ps-refresh" ${busy}>${uiIcon('refresh')}Refresh</button><button id="ps-upload" ${busy}>${uiIcon('upload')}Change programme</button></div></section>
 <section class="compact-stats" aria-label="Selected plan summary">${[
   ['Jobs in programme', d.activities, `${d.contracts} contracts`, ''],
   [
     'Fully scheduled',
     rep ? `${rep.complete_activities} / ${rep.total_activities}` : '—',
     rep
       ? rep.complete_activities === rep.total_activities
         ? 'All required work accounted for'
         : 'Some work is still unscheduled'
       : 'Build a plan to see the result',
     '',
   ],
   [
     'Contracts finishing late',
     rep ? rep.soft_scores.contracts_overrunning : '—',
     rep
       ? `${rep.soft_scores.overrun_days_total} delay days across contracts`
       : 'Compared with target dates',
     rep?.soft_scores.contracts_overrunning ? 'warn' : '',
   ],
   [
     'Longer work windows',
     rep ? rep.soft_scores.eclo_nights_total : '—',
     'Early closure / late opening',
     rep?.soft_scores.eclo_nights_total ? 'warn' : '',
   ],
 ]
   .map(
     ([label, value, note, cls]) =>
       `<div class="compact-stat"><span>${label}</span><strong class="${cls}">${value}</strong><small>${note}</small></div>`,
   )
   .join('')}</section>
 <div class="planner-toolbar"><div><h2>Work programme</h2><p>${hasPlans ? 'Choose a plan, then review its schedule and access needs.' : 'Your jobs are ready. Build plans to find suitable track access.'}</p></div><div class="actions">${r ? `<details class="planner-toolbox"><summary>Planning tools</summary><div class="toolbox-menu"><button id="ps-insights" ${busy}>Risk & handover</button><button id="ps-what-if" ${busy}>What-if capacity</button><div id="schedule-tool-slot"></div></div></details><button id="ps-export" ${busy}>${uiIcon('download')}Export plan</button>` : ''}<button class="primary" id="ps-all" ${busy}>${psLoading ? 'Building plans…' : hasPlans ? 'Rebuild plans' : 'Build plans'}</button></div></div><div id="active-disruptions"></div>
 ${psLoading ? `<div class="build-progress" role="status">${esc(psProgress || 'Checking work and track availability…')}</div>` : ''}
 <section class="panel ${psLoading ? 'section-gap' : ''}"><div class="planner-tabs" role="tablist" aria-label="Programme views">${[
   ['overview', 'Overview', null],
   ['work', 'Work schedule', d.activities],
   ['compare', 'Compare plans', null],
   ['capacity', 'Track capacity', null],
   ['network', 'Schedule map', null],
 ]
   .map(
     ([id, label, n]) =>
       `<button role="tab" aria-selected="${id === psTab}" aria-controls="planner-body" id="tab-${id}" class="${id === psTab ? 'active' : ''}" data-plan-tab="${id}">${label}${n ? `<span class="tab-count">${n}</span>` : ''}</button>`,
   )
   .join(
     '',
   )}</div><div class="plan-controls"><div class="plan-choice"><label for="ps-choice">Planning approach</label><select id="ps-choice" ${busy}>${Object.entries(
   planOptions,
 )
   .map(
     ([s, o]) =>
       `<option value="${s}" ${psScenario === s ? 'selected' : ''}>${o.short}${psData.results[s] ? '' : ' · not built'}</option>`,
   )
   .join(
     '',
   )}</select></div><div class="plan-status ${rep && !rep.feasible ? 'warning' : ''}">${rep ? `${uiIcon(rep.feasible ? 'check' : 'help')}${rep.feasible ? 'Draft · automatic checks passed' : `${rep.hard_violations.length} issues to review`}` : 'No schedule built yet'}</div></div><div id="planner-body" role="tabpanel" aria-labelledby="tab-${psTab}"></div></section>`;
  if ($('ps-sample')) $('ps-sample').onclick = (e) => run(() => psImportSample(), e.target);
  $('ps-upload').onclick = psImportDialog;
  applyPlanPermissions();
  if (!d) return;
  $('ps-refresh').onclick = (e) => run(renderPS1, e.target);
  $('ps-all').onclick = () => psGenerate(['A', 'B', 'C']);
  if ($('ps-export')) $('ps-export').onclick = psExportDialog;
  if ($('ps-what-if')) $('ps-what-if').onclick = psWhatIf;
  if ($('ps-insights')) $('ps-insights').onclick = psInsights;
  $('ps-choice').onchange = (e) => {
    psScenario = e.target.value;
    psPage = 0;
    paintPS1();
  };
  document.querySelectorAll('[data-plan-tab]').forEach((b) => {
    b.onclick = () => {
      psTab = b.dataset.planTab;
      psPage = 0;
      paintPS1();
    };
    b.onkeydown = (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const tabs = [...document.querySelectorAll('[data-plan-tab]')],
        index = tabs.indexOf(b),
        next =
          e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? tabs.length - 1
              : (index + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      psTab = tabs[next].dataset.planTab;
      paintPS1();
      $('tab-' + psTab).focus();
    };
  });
  ({
    overview: psOverview,
    work: psWork,
    compare: psCompare,
    capacity: psCapacity,
    network: psNetwork,
  })[psTab]();
  mountScheduleTools();
  applyPlanPermissions();
}
function resetPlannerFilters() {
  psWeek = 0;
  psContract = '';
  psSearch = '';
  psLine = '';
  psPage = 0;
  psTimelineStart = 1;
  psTab = 'overview';
}
async function psImportSample() {
  psData = await api('/ps1/import', { version: psData.version, sample: true });
  resetPlannerFilters();
  paintPS1();
  toast('Example programme loaded. Select Build plans to schedule the work.');
}
function psImportDialog() {
  dialog(
    'Import work programme',
    `<p>Select all eight CSV files together. We’ll check filenames, columns and data before saving the programme.</p>${psData.summary ? '<div class="alert">A successful import replaces the current weekly programme and its saved plans. Export any plans you want to keep first.</div>' : ''}<ul class="import-list">${psFiles.map((f) => `<li>${f}</li>`).join('')}</ul><label for="ps-files">Programme files</label><input type="file" multiple accept=".csv,text/csv" id="ps-files"><p class="hint">Up to 1 MB per file. Maximum 250 jobs per programme.</p><p id="ps-import-status" class="import-error" role="alert"></p><div class="actions section-gap"><button class="primary" id="ps-confirm-import" disabled>Check and import</button><button id="ps-import-sample">Use example programme</button></div>`,
  );
  let selected = [];
  $('ps-files').insertAdjacentHTML(
    'beforebegin',
    '<button type="button" id="csv-format-guide" class="quiet">View required columns & download templates</button>',
  );
  $('csv-format-guide').onclick = csvFormatGuide;
  const input = $('ps-files'),
    submit = $('ps-confirm-import'),
    status = $('ps-import-status');
  input.onchange = () => {
    selected = [...input.files];
    const missing = psFiles.filter((f) => !selected.some((x) => x.name === f));
    const valid =
      selected.length === 8 && !missing.length && selected.every((f) => f.size <= 1000000);
    submit.disabled = !valid;
    status.textContent = valid
      ? '8 correctly named files selected. Ready to check.'
      : missing.length
        ? 'Missing files:\n' + missing.join('\n')
        : 'Select exactly 8 files, each no larger than 1 MB.';
    status.className = valid ? 'hint' : 'import-error';
  };
  submit.onclick = async () => {
    submit.disabled = true;
    input.disabled = true;
    status.textContent = 'Checking programme…';
    try {
      const files = Object.fromEntries(
        await Promise.all(selected.map(async (f) => [f.name, await f.text()])),
      );
      psData = await api('/ps1/import', { version: psData.version, files });
      resetPlannerFilters();
      $('modal').close();
      paintPS1();
      toast('Programme imported. Build plans to schedule the work.');
    } catch (e) {
      status.className = 'import-error';
      status.innerHTML = e.uploadIssues?.length
        ? `<strong>Fix these upload issues:</strong><ul>${e.uploadIssues.map((issue) => `<li>${esc(issue)}</li>`).join('')}</ul>`
        : esc(e.message);
      submit.disabled = false;
      input.disabled = false;
    }
  };
  $('ps-import-sample').onclick = (e) =>
    run(async () => {
      await psImportSample();
      $('modal').close();
    }, e.target);
}
async function psGenerate(scenarios) {
  if (psLoading) return;
  psLoading = true;
  const owner = user?.id,
    version = psData.version;
  try {
    for (const [i, scenario] of scenarios.entries()) {
      psProgress = `Building ${i + 1} of ${scenarios.length}: ${planOptions[scenario].name.toLowerCase()}…`;
      paintPS1();
      const result = await api('/ps1/solve', { version, scenario });
      if (user?.id !== owner) return;
      psData.results[scenario] = result;
    }
    psTab = 'overview';
    psPage = 0;
    toast('Plans are ready. Compare the access needed and any delayed contracts.');
  } catch (e) {
    toast(e.message, true);
  } finally {
    psLoading = false;
    if (page === 'ps1' && user?.id === owner) await renderPS1();
  }
}
function psFilteredJobs() {
  return planningJobs().filter(
    (a) =>
      (!psContract || a.contract === psContract) &&
      (!psLine || a.line === psLine) &&
      (!psSearch ||
        [a.activity_id, a.contract, planContract(a.contract)?.name, a.line, planRoute(a), a.nature]
          .join(' ')
          .toLowerCase()
          .includes(psSearch.toLowerCase())),
  );
}
function psWork() {
  const d = psData.summary,
    r = psData.results[psScenario],
    rep = r?.report,
    contracts = [...new Set(planningJobs().map((a) => a.contract))];
  $('planner-body').innerHTML =
    `${rep?.hard_violations.length ? `<div class="review-strip"><p>${rep.hard_violations.length} rule issues need review before export.</p><button id="ps-review">See issues</button></div>` : rep?.soft_scores.contracts_overrunning ? `<div class="review-strip"><p>${rep.soft_scores.contracts_overrunning} contracts finish after their target dates in this plan.</p><button id="ps-review">Review completion dates</button></div>` : ''}
 <div class="schedule-filters"><label class="search-field"><span class="hidden">Search jobs</span>${uiIcon('search')}<input id="ps-search" type="search" placeholder="Search job, contract or station…" value="${esc(psSearch)}"></label><select id="ps-line" aria-label="Filter by line"><option value="">All lines</option>${d.lines.map((l) => `<option value="${esc(l.line_code)}" ${psLine === l.line_code ? 'selected' : ''}>${esc(l.line_name)}</option>`).join('')}</select><select id="ps-contract" aria-label="Filter by contract"><option value="">All contracts</option>${opts(contracts, psContract)}</select><div class="view-switch" aria-label="Schedule display"><button id="ps-list" class="${psLayout === 'list' ? 'active' : ''}" aria-pressed="${psLayout === 'list'}">${uiIcon('list')}List</button><button id="ps-timeline-view" ${!r ? 'disabled' : ''} class="${psLayout === 'timeline' ? 'active' : ''}" aria-pressed="${psLayout === 'timeline'}">${uiIcon('timeline')}Timeline</button></div></div><div id="ps-work-results"></div>`;
  if ($('ps-review')) $('ps-review').onclick = psReviewDialog;
  $('ps-search').oninput = (e) => {
    psSearch = e.target.value;
    psPage = 0;
    psWorkResults();
  };
  $('ps-line').onchange = (e) => {
    psLine = e.target.value;
    psPage = 0;
    psWorkResults();
  };
  $('ps-contract').onchange = (e) => {
    psContract = e.target.value;
    psPage = 0;
    psWorkResults();
  };
  $('ps-list').onclick = () => {
    psLayout = 'list';
    psWeek = 0;
    psWork();
  };
  $('ps-timeline-view').onclick = () => {
    psLayout = 'timeline';
    psWork();
  };
  psWorkResults();
}
function psWorkResults() {
  const r = psData.results[psScenario],
    all = psFilteredJobs();
  if (!r && psLayout === 'timeline') psLayout = 'list';
  if (psLayout === 'timeline') {
    psTimeline(all);
    return;
  }
  psPage = Math.min(psPage, Math.max(0, Math.ceil(all.length / 12) - 1));
  const acts = all.slice(psPage * 12, psPage * 12 + 12);
  $('ps-work-results').innerHTML = `${
    acts.length
      ? `<div class="table-scroll"><table class="work-table"><thead><tr><th>Work</th><th>Track section</th><th>Contract</th><th>First access</th><th>Last access</th><th>Work scheduled</th></tr></thead><tbody>${acts
          .map((a) => {
            const job = planJob(a.activity_id),
              rows = r?.access.filter((x) => x.activity_id === a.activity_id) || [],
              delivered = rows.reduce((n, x) => n + (x.eclo ? 1.5 : 1), 0);
            return `<tr><td><button class="work-title" data-ps-activity="${esc(a.activity_id)}">${esc(job?.type || 'Track work')} <span class="muted">${esc(a.activity_id)}</span></button><small>${esc(a.nature || 'Maintenance')}</small></td><td><span class="line-tag ${a.line === 'BET' ? 'beta' : ''}">${esc(a.line)}</span><span class="route-label">${esc(planRoute(a))}</span><small>${a.bound === 'EB' ? 'Eastbound' : 'Westbound'}</small></td><td>${esc(a.contract)}<small>${esc(planContract(a.contract)?.name || '')}</small></td><td>${a.first_week ? shortDate(weekDate(a.first_week)) : '—'}${a.first_week ? `<small>Week ${a.first_week}</small>` : ''}</td><td>${a.last_week ? shortDate(weekDate(a.last_week, true)) : '—'}${a.last_week ? `<small>Week ${a.last_week}</small>` : ''}</td><td>${r ? badge(delivered >= a.workload ? 'Fully scheduled' : 'Incomplete', delivered >= a.workload ? 'neutral' : 'amber') : badge('Awaiting plan', 'neutral')}<small>${r ? `${rows.length} access${rows.length === 1 ? '' : 'es'} · ` : ''}${a.workload} work units required</small></td></tr>`;
          })
          .join('')}</tbody></table></div>`
      : '<div class="empty-filter">No jobs match these filters.</div>'
  }<div class="table-footer"><span>${all.length ? `${psPage * 12 + 1}–${Math.min((psPage + 1) * 12, all.length)} of ${all.length} jobs` : '0 jobs'} · Click a job for its bookings and work locations.</span><div class="actions"><button id="ps-prev" ${psPage === 0 ? 'disabled' : ''}>Previous</button><button id="ps-next" ${(psPage + 1) * 12 >= all.length ? 'disabled' : ''}>Next</button></div></div>`;
  $('ps-prev').onclick = () => {
    psPage--;
    psWorkResults();
  };
  $('ps-next').onclick = () => {
    psPage++;
    psWorkResults();
  };
  bindPlanJobs();
}
function psTimeline(acts) {
  const r = psData.results[psScenario],
    max = Math.max(psData.summary.horizon_weeks, r.report.detail.last_week);
  psTimelineStart = Math.max(1, Math.min(psTimelineStart, max));
  const weeks = Array.from(
    { length: Math.min(12, max - psTimelineStart + 1) },
    (_, i) => psTimelineStart + i,
  );
  const indexes = new Map(r.access.map((x) => [x.activity_id + '|' + x.week, x]));
  $('ps-work-results').innerHTML =
    `<div class="table-footer"><span>Weeks ${weeks[0]}–${weeks.at(-1)} · ${shortDate(weekDate(weeks[0]))} – ${shortDate(weekDate(weeks.at(-1), true))}</span><div class="actions"><button id="ps-week-back" ${psTimelineStart <= 1 ? 'disabled' : ''}>Earlier weeks</button><button id="ps-week-next" ${weeks.at(-1) >= max ? 'disabled' : ''}>Later weeks</button></div></div><div class="timeline-window"><table class="ps-grid"><thead><tr><th>Work / track section</th>${weeks.map((w) => `<th>Week ${w}<small>${shortDate(weekDate(w))}</small></th>`).join('')}</tr></thead><tbody>${acts
      .map(
        (a) =>
          `<tr><th><button class="work-title" data-ps-activity="${esc(a.activity_id)}">${esc(a.activity_id)}</button><small>${esc(a.line)} · ${esc(planRoute(a))} · ${esc(a.bound)}</small></th>${weeks
            .map((w) => {
              const x = indexes.get(a.activity_id + '|' + w);
              return `<td>${x ? `<button data-ps-activity="${esc(a.activity_id)}" class="ps-dot ${x.eclo ? 'extended' : ''}" aria-label="${esc(a.activity_id)}, week ${w}, ${x.eclo ? 'longer' : 'normal'} work window">${x.eclo ? '1.5' : '1'}</button>` : ''}</td>`;
            })
            .join('')}</tr>`,
      )
      .join(
        '',
      )}</tbody></table>${acts.length ? '' : '<div class="empty-filter">No jobs match these filters.</div>'}</div><div class="ps-legend"><span><i></i>Normal window · 1 work unit</span><span><i class="extended"></i>Longer window · 1.5 work units</span><span>Bookings are weekly; local night numbers are not weekdays.</span></div>`;
  $('ps-week-back').onclick = () => {
    psTimelineStart = Math.max(1, psTimelineStart - 12);
    psWorkResults();
  };
  $('ps-week-next').onclick = () => {
    psTimelineStart += 12;
    psWorkResults();
  };
  bindPlanJobs();
}
function bindPlanJobs() {
  document
    .querySelectorAll('[data-ps-activity]')
    .forEach((b) => (b.onclick = () => psActivity(b.dataset.psActivity)));
}
function psCompare() {
  $('planner-body').innerHTML =
    `<div class="compare-intro"><h3>What matters most for this programme?</h3><p>Compare completion delays with the extra access each plan needs. Selecting an option changes the schedule you are reviewing.</p></div><div class="table-scroll"><table class="compare-table"><thead><tr><th>Approach</th><th>Late contracts</th><th>Total delay days</th><th>Extra track slots</th><th>Longer windows</th><th></th></tr></thead><tbody>${Object.entries(
      planOptions,
    )
      .map(([s, o]) => {
        const rep = psData.results[s]?.report,
          score = rep?.soft_scores;
        return `<tr class="${s === psScenario ? 'chosen' : ''}"><td><strong>${o.name}</strong><small>${o.detail}</small></td><td>${score?.contracts_overrunning ?? '—'}</td><td>${score?.overrun_days_total ?? '—'}</td><td>${score?.excess_access_nights_total ?? '—'}</td><td>${score?.eclo_nights_total ?? '—'}</td><td>${rep ? `<button data-use-plan="${s}" class="${s === psScenario ? 'selected' : ''}">Review schedule</button><small>${rep.feasible ? 'Checks passed' : `${rep.hard_violations.length} issues`}</small>` : `<button data-build-plan="${s}" ${psLoading ? 'disabled' : ''}>Build this plan</button>`}</td></tr>`;
      })
      .join(
        '',
      )}</tbody></table></div><div class="compare-note">Extra track slots are counted per location and week. Longer windows mean early closure or late opening of passenger service, so they need operational agreement.</div><div class="plan-help"><details><summary>Scenario rules and scoring</summary><p><strong>A — Use available access.</strong> No extra slots and no longer windows. Prioritise reducing delays, especially on high-priority contracts.</p><p><strong>B — Meet target dates.</strong> Planned completion dates are fixed. Extra slots and longer windows are allowed and add to the score.</p><p><strong>C — Balance access and delays.</strong> At most one extra slot per location-week; longer windows must fall within a two-week span on each affected line.</p><p>Scores use different objectives, so they are not a single ranking across approaches. ${Object.keys(
      planOptions,
    )
      .map(
        (s) => `${s}: ${psData.results[s]?.report.soft_scores.objective_score ?? 'not available'}`,
      )
      .join(
        ' · ',
      )}.</p><p>Automatic checks are independent app checks. Verification against the judges’ validator is still pending.</p></details></div>`;
  $('planner-body').insertAdjacentHTML('beforeend', psQualitySummary());
  document.querySelectorAll('[data-use-plan]').forEach(
    (b) =>
      (b.onclick = () => {
        psScenario = b.dataset.usePlan;
        psTab = 'work';
        psPage = 0;
        paintPS1();
      }),
  );
  document
    .querySelectorAll('[data-build-plan]')
    .forEach((b) => (b.onclick = () => psGenerate([b.dataset.buildPlan])));
}
function psCapacity() {
  const r = psData.results[psScenario];
  if (!r) {
    $('planner-body').innerHTML =
      '<div class="empty"><h3>Build a plan to check track capacity</h3><p>You’ll see where access is fully booked and where extra slots are needed.</p></div>';
    return;
  }
  const max = Math.max(psData.summary.horizon_weeks, r.report.detail.last_week);
  $('planner-body').innerHTML =
    `<div class="schedule-filters"><label for="ps-capacity-week">Show capacity for</label><select id="ps-capacity-week"><option value="0">All weeks</option>${Array.from({ length: max }, (_, i) => `<option value="${i + 1}" ${psWeek === i + 1 ? 'selected' : ''}>Week ${i + 1} · ${shortDate(weekDate(i + 1))}</option>`).join('')}</select><span class="muted">Locations at or above their available access.</span></div><div id="ps-capacity-results"></div>`;
  $('ps-capacity-week').onchange = (e) => {
    psWeek = +e.target.value;
    psPage = 0;
    psCapacityResults();
  };
  psCapacityResults();
}
function psCapacityResults() {
  const r = psData.results[psScenario],
    all = r.report.detail.capacity_hotspots
      .filter((x) => !psWeek || x.week === psWeek)
      .sort((a, b) => b.excess - a.excess || a.week - b.week);
  psPage = Math.min(psPage, Math.max(0, Math.ceil(all.length / 15) - 1));
  const rows = all.slice(psPage * 15, psPage * 15 + 15);
  $('ps-capacity-results').innerHTML =
    `<div class="table-scroll"><table class="capacity-table"><thead><tr><th>Location</th><th>Week beginning</th><th>Access used</th><th>Review</th></tr></thead><tbody>${rows
      .map((x) => {
        const [kind, line, id, bound] = x.location.split(':');
        return `<tr><td><span class="line-tag ${line === 'BET' ? 'beta' : ''}">${esc(line)}</span>${esc(id.replaceAll('_', ' – '))}<small class="muted"> · ${kind === 'SEC' ? 'Tunnel' : 'Platform'} · ${esc(bound)}</small></td><td>${shortDate(weekDate(x.week))}<small class="muted"> · Week ${x.week}</small></td><td>${x.used} / ${x.capacity} slots<div class="capacity-meter ${x.excess ? 'excess' : ''}"><span style="width:${Math.min(100, (x.used / Math.max(1, x.capacity)) * 100)}%"></span></div></td><td>${badge(x.excess ? `${x.excess} extra slot${x.excess === 1 ? '' : 's'} needed` : 'Fully booked', x.excess ? 'amber' : 'neutral')}</td></tr>`;
      })
      .join(
        '',
      )}</tbody></table></div>${!all.length ? '<div class="empty-filter">No locations at capacity in this selection.</div>' : ''}<div class="table-footer"><span>${all.length ? `${psPage * 15 + 1}–${Math.min((psPage + 1) * 15, all.length)} of ${all.length} locations / weeks` : '0 locations'}</span><div class="actions"><button id="ps-cap-prev" ${psPage === 0 ? 'disabled' : ''}>Previous</button><button id="ps-cap-next" ${(psPage + 1) * 15 >= all.length ? 'disabled' : ''}>Next</button></div></div>`;
  $('ps-cap-prev').onclick = () => {
    psPage--;
    psCapacityResults();
  };
  $('ps-cap-next').onclick = () => {
    psPage++;
    psCapacityResults();
  };
}
function psStaticNetwork() {
  const d = psData.summary;
  $('planner-body').innerHTML = `<div class="network-view">${d.lines
    .map(
      (l) =>
        `<div class="ps-line"><strong>${esc(l.line_code)}</strong><div>${d.stations
          .filter((s) => s.line_code === l.line_code)
          .sort((a, b) => +a.seq - +b.seq)
          .map(
            (s) =>
              `<span class="ps-stop ${+s.is_interchange ? 'hub' : ''}"><i></i>${esc(s.station_id)}</span>`,
          )
          .join('')}</div></div>`,
    )
    .join(
      '',
    )}</div><div class="network-notes"><div><h3>Separate tracks, shared interchange</h3><p>Each line and direction has its own access availability. Live work around H01–H02 can require closures on both lines.</p></div><div><h3>Working areas include platforms</h3><p>A job books its tunnel sections and the platforms along its route. Buffers and compatible sharing are checked when the plan is built.</p></div></div>`;
}
function psReviewDialog() {
  const r = psData.results[psScenario];
  dialog(
    'Completion dates & plan checks',
    `${r.report.hard_violations.length ? `<div class="alert">Export is blocked until all rule issues are resolved.</div><ul>${r.report.hard_violations.map((v) => `<li>${esc(v.detail)}</li>`).join('')}</ul>` : ''}<div class="table-scroll"><table><thead><tr><th>Contract</th><th>Target</th><th>Planned finish</th><th>Delay</th></tr></thead><tbody>${[
      ...r.report.results,
    ]
      .sort((a, b) => b.overrun_days - a.overrun_days)
      .map(
        (x) =>
          `<tr><td>${esc(x.contract_number)}</td><td>${shortDate(planContract(x.contract_number)?.target)}</td><td>${shortDate(x.simulated_completion_date)}</td><td>${x.overrun_days ? badge(`${x.overrun_days} days late`, 'amber') : badge('Within target', 'neutral')}</td></tr>`,
      )
      .join(
        '',
      )}</tbody></table></div><p class="hint section-gap">These are calculated planning dates, not confirmations that work has been completed.</p>`,
  );
}
function psActivity(id) {
  const r = psData.results[psScenario],
    a = planningJobs().find((x) => x.activity_id === id),
    job = planJob(id),
    p = planContract(a.contract),
    rows = r?.access.filter((x) => x.activity_id === id) || [];
  const reason = a.evidence?.length
    ? a.evidence.join(' ')
    : a.reason === 'Contract weekly access/workfront limit'
      ? 'Some weeks were unavailable because this contract had used its access allowance or its concurrent activity limit.'
      : a.reason === 'Location supply or exclusion/co-sharing constraints'
        ? 'Some weeks could not accommodate this job within track capacity and the rules for separation and shared access.'
        : 'Placed in available weeks after its start date and any preceding work, subject to access and sharing rules.';
  dialog(
    `${job?.type || 'Track work'} · ${id}`,
    `<p><span class="line-tag ${a.line === 'BET' ? 'beta' : ''}">${esc(a.line)}</span>${esc(planRoute(a))} · ${a.bound === 'EB' ? 'Eastbound' : 'Westbound'}</p><div class="detail-grid"><div><span>Contract</span><b>${esc(a.contract)}${p ? ' · ' + esc(p.name) : ''}</b></div><div><span>Target completion</span><b>${shortDate(p?.target)}</b></div><div><span>Work required</span><b>${a.workload} standard access units</b></div><div><span>Access arrangement</span><b>${esc({ PM: 'Exclusive possession', PC: 'Possession master', C: 'Co-worker' }[a.access_type] || a.access_type)}</b></div><div><span>Preceding job</span><b>${esc(job?.predecessor || 'None')}</b></div><div><span>Earliest start</span><b>${shortDate(job?.start)}</b></div></div>${r ? `<div class="info"><strong>Schedule evidence</strong><br>${esc(reason)}</div><h3 class="section-gap">Scheduled access</h3><div class="table-scroll"><table><thead><tr><th>Week beginning</th><th>Week</th><th>Local night</th><th>Work window</th></tr></thead><tbody>${rows.map((x) => `<tr><td>${shortDate(weekDate(x.week))}</td><td>${x.week}</td><td>${x.access_night}</td><td>${x.eclo ? 'Longer · 1.5 units' : 'Normal · 1 unit'}</td></tr>`).join('')}</tbody></table></div><p class="hint section-gap">Local night is this contract’s weekly allocation number, not a day of the week. ${rows.reduce((n, x) => n + (x.eclo ? 1.5 : 1), 0)} work units scheduled.</p><details><summary>Booked work locations</summary><p class="muted">${[...new Set(r.occupancy.filter((x) => x.activity_id === id).map((x) => x.location_id))].map(esc).join('<br>')}</p></details>` : '<div class="info">This job has not been scheduled yet. Select Build plans to find access weeks.</div>'}`,
  );
}
function psExportDialog() {
  const r = psData.results[psScenario],
    feasible = r.report.feasible;
  dialog(
    'Export plan',
    `<p><strong>${planOptions[psScenario].name}</strong> · Scenario ${psScenario}</p>${feasible ? `<p>${r.report.complete_activities} jobs fully scheduled. Download the three CSV files for this plan.</p>` : '<div class="alert">This plan still has rule issues. The check report is available; submission files are blocked until the plan passes.</div>'}<div class="export-list">${(feasible
      ? [
          ['SCHEDULE_ACCESS.csv', 'Access schedule', 'Jobs, weeks and allocated nights'],
          ['SCHEDULE_OCCUPANCY.csv', 'Track bookings', 'Work locations and shared access groups'],
          ['RESULTS.csv', 'Completion summary', 'Contract finish dates and delays'],
        ]
      : []
    )
      .concat([['VALIDATION.json', 'Check report', 'Automatic checks and score details']])
      .map(
        ([f, title, note]) =>
          `<a href="/api/ps1/export?scenario=${psScenario}&file=${f}" download="${f}"><span><strong>${title}</strong><small>${note} · ${f}</small></span>${uiIcon('download')}</a>`,
      )
      .join(
        '',
      )}</div><p class="hint">Keep each scenario’s files in a separate folder. The required filenames and columns are preserved.</p><details><summary>What these checks cover</summary><p class="muted">${esc(r.report.note.replaceAll('RailSync', 'Trackwork'))}</p><p class="muted">The solver searches for a workable schedule; it does not prove it found the best possible one. Results still need verification with the judges’ validator and operator review before railway use.</p></details>`,
  );
}
