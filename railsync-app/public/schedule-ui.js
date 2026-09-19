let mapLine = '',
  mapBound = 'EB',
  mapStart = 1,
  mapPlatforms = false;
async function csvFormatGuide() {
  try {
    const schema = await api('/ps1/schema');
    $('modal').close();
    dialog(
      'CSV format guide',
      `<p>Use the exact filenames and column names below. Dates use YYYY-MM-DD. Numeric fields require whole numbers. Only predecessor_activity_id may be blank. Templates contain headers; add your records before uploading.</p>${schema.files.map((f, i) => `<details class="issue-card"><summary>${esc(f.name)}</summary><p class="preserve-lines">${f.columns.map(esc).join(', ')}</p><button data-download-template="${i}">Download header template</button></details>`).join('')}<p class="hint">References must match across files: lines → stations → sectors and locations; projects → activities. Upload all eight files together. Invalid uploads leave your existing programme untouched.</p><button id="back-to-import" class="primary">Back to upload</button>`,
    );
    document.querySelectorAll('[data-download-template]').forEach(
      (b) =>
        (b.onclick = () => {
          const f = schema.files[Number(b.dataset.downloadTemplate)],
            url = URL.createObjectURL(
              new Blob([f.columns.join(',') + '\r\n'], { type: 'text/csv;charset=utf-8' }),
            );
          const a = document.createElement('a');
          a.href = url;
          a.download = f.name;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }),
    );
    $('back-to-import').onclick = () => {
      $('modal').close();
      psImportDialog();
    };
  } catch (error) {
    toast(error.message, true);
  }
}
function mountScheduleTools() {
  if (user.role !== 'scheduler') return;
  const r = psData.results[psScenario];
  if (!r) return;
  const toolbar = $('schedule-tool-slot');
  toolbar.insertAdjacentHTML(
    'beforeend',
    '<div id="schedule-tools"><button id="disruption-backup">Preview disruption / backup plan</button><button id="manual-move">Move booking</button><button id="undo-schedule">Undo saved edit</button><button id="schedule-emergency" class="danger-button">Emergency → Supervisor</button></div>',
  );
  $('active-disruptions').innerHTML = r.disruptions?.length
    ? `<div class="schedule-help active-disruptions"><strong>Active disruption windows</strong>${r.disruptions.map((x) => `<p>${esc(x.type)} · ${esc(x.location)} · weeks ${x.start_week}–${x.end_week}</p>`).join('')}</div>`
    : '';
  document.querySelector('.toolbox-menu').addEventListener('click', (event) => {
    if (event.target.closest('button')) document.querySelector('.planner-toolbox').open = false;
  });
  $('disruption-backup').onclick = disruptionForm;
  $('manual-move').onclick = () => moveForm();
  $('schedule-emergency').onclick = () => emergencyForm();
  $('undo-schedule').onclick = (e) =>
    run(async () => {
      psData = await api('/ps1/undo', scheduleRequest());
      paintPS1();
      toast('Previous saved plan restored.');
    }, e.target);
  for (const b of $('schedule-tools').querySelectorAll('button')) if (psLoading) b.disabled = true;
}
const scheduleRequest = () => ({
  scenario: psScenario,
  version: psData.version,
  fingerprint: psData.plan_tokens[psScenario],
});
function psNetwork() {
  const d = psData.summary,
    r = psData.results[psScenario];
  if (!r) {
    psStaticNetwork();
    return;
  }
  if (!d.lines.some((x) => x.line_code === mapLine)) mapLine = d.lines[0].line_code;
  const max = Math.max(d.horizon_weeks, r.report.detail.last_week || 1, mapStart + 5);
  const weeks = Array.from({ length: 6 }, (_, i) => mapStart + i);
  const locations = d.location_supply.filter(
    (x) =>
      x.location.split(':')[1] === mapLine &&
      x.location.endsWith(':' + mapBound) &&
      (mapPlatforms || x.location.startsWith('SEC:')),
  );
  const path = d.stations
    .filter((x) => x.line_code === mapLine)
    .sort((a, b) => +a.seq - +b.seq)
    .map((x) => x.station_id);
  locations.sort(
    (a, b) =>
      path.indexOf(a.location.split(':')[2].split('_')[0]) -
      path.indexOf(b.location.split(':')[2].split('_')[0]),
  );
  $('planner-body').innerHTML =
    `<div class="schedule-help"><strong>Track locations × scheduled weeks</strong><p>Drag a blue work booking to another week, or select <strong>Move booking</strong>. The route stays fixed. Amber areas are safety buffers; red areas are additional closures. All moves are checked before saving.</p></div><div class="map-toolbar"><div><label for="map-line">Line</label><select id="map-line">${d.lines.map((x) => `<option value="${esc(x.line_code)}" ${x.line_code === mapLine ? 'selected' : ''}>${esc(x.line_name)}</option>`).join('')}</select></div><div><label for="map-bound">Direction</label><select id="map-bound">${opts(['EB', 'WB'], mapBound)}</select></div><div><label for="map-platforms">Locations</label><select id="map-platforms"><option value="no" ${!mapPlatforms ? 'selected' : ''}>Track sectors</option><option value="yes" ${mapPlatforms ? 'selected' : ''}>Sectors and platforms</option></select></div><button id="map-back" ${mapStart === 1 ? 'disabled' : ''}>Earlier</button><button id="map-next" ${mapStart + 6 > 1040 ? 'disabled' : ''}>Later</button></div><div class="map-legend"><span>Scheduled work</span><span class="buffer">Safety buffer</span><span class="closure">Additional closure / disruption</span></div><div class="schedule-map"><table><thead><tr><th>Location · ${esc(mapBound)}</th>${weeks.map((w) => `<th>Week ${w}<small class="block">${shortDate(weekDate(w))}</small></th>`).join('')}</tr></thead><tbody>${locations
      .map(
        (loc) =>
          `<tr><th>${esc(loc.location.split(':')[2].replace('_', ' → '))}<small class="block">${loc.location.startsWith('PLAT') ? 'Platform' : 'Track sector'} · ${loc.capacity} slots/week</small></th>${weeks
            .map((week) => {
              const rows = r.access.filter((x) => x.week === week);
              const chips = rows
                .map((x) => {
                  const a = planJob(x.activity_id),
                    work = a.occupied.includes(loc.location),
                    closure = !work && a.closures.includes(loc.location),
                    buffer = !work && !closure && a.buffers.includes(loc.location);
                  if (!work && !closure && !buffer) return '';
                  return `<button class="map-chip ${buffer ? 'buffer-chip' : closure ? 'closure-chip' : ''}" ${work && user.role === 'scheduler' ? `draggable="true" data-drag-activity="${esc(a.id)}" data-drag-week="${week}"` : ''} data-map-activity="${esc(a.id)}" title="${esc(a.id + ' · ' + (work ? 'Work' : closure ? 'Closure' : 'Safety buffer'))}">${esc(a.id)}${buffer ? ' · Buffer' : closure ? ' · Closed' : ''}</button>`;
                })
                .join('');
              const outages = (r.disruptions || [])
                .filter(
                  (x) =>
                    week >= x.start_week &&
                    week <= x.end_week &&
                    x.locations.includes(loc.location),
                )
                .map(
                  (x) => `<span class="map-chip closure-chip">${esc(x.type)} · unavailable</span>`,
                )
                .join('');
              return `<td class="map-cell" data-drop-week="${week}">${outages}${chips || '<span class="muted">—</span>'}</td>`;
            })
            .join('')}</tr>`,
      )
      .join(
        '',
      )}</tbody></table></div><p class="hint">Overlapping colours in a week do not automatically mean a conflict: compatible work may share access, and separate possession slots can occur in the same week. The validator checks the full plan.</p>`;
  $('map-line').onchange = (e) => {
    mapLine = e.target.value;
    psNetwork();
  };
  $('map-bound').onchange = (e) => {
    mapBound = e.target.value;
    psNetwork();
  };
  $('map-platforms').onchange = (e) => {
    mapPlatforms = e.target.value === 'yes';
    psNetwork();
  };
  $('map-back').onclick = () => {
    mapStart = Math.max(1, mapStart - 6);
    psNetwork();
  };
  $('map-next').onclick = () => {
    mapStart = Math.min(1035, mapStart + 6);
    psNetwork();
  };
  const scheduledJobs = r.access
    .filter((x) => x.week === mapStart)
    .map((x) => planJob(x.activity_id));
  const segment = (left, right) => {
    const loc = `SEC:${mapLine}:${left}_${right}:${mapBound}`;
    const work = scheduledJobs.filter((x) => x.occupied.includes(loc)),
      closures = scheduledJobs.filter((x) => !x.occupied.includes(loc) && x.closures.includes(loc)),
      buffers = scheduledJobs.filter(
        (x) => !x.occupied.includes(loc) && !x.closures.includes(loc) && x.buffers.includes(loc),
      );
    const outages = (r.disruptions || []).filter(
      (x) => mapStart >= x.start_week && mapStart <= x.end_week && x.locations.includes(loc),
    );
    return `<div class="rail-segment ${outages.length || closures.length ? 'rail-closed' : work.length ? 'rail-work' : buffers.length ? 'rail-buffer' : ''}"><span>${esc(left)}</span><div>${outages.length ? '<b>Unavailable</b>' : ''}${work.map((x) => `<button data-map-activity="${esc(x.id)}">${esc(x.id)}</button>`).join('')}${closures.length ? '<b>Closure</b>' : ''}${buffers.length ? '<b>Buffer</b>' : ''}</div><small>${buffers.map((x) => esc(x.id)).join(', ')}</small></div>`;
  };
  document.querySelector('.schedule-map').insertAdjacentHTML(
    'beforebegin',
    `<div class="rail-overview"><strong>${esc(mapLine)} ${mapBound} · track overview, week ${mapStart}</strong><p class="hint">Use Earlier / Later to change the displayed week range. Work, buffer and closure markings follow the imported track geometry.</p><div class="rail-ribbon">${path
      .slice(0, -1)
      .map((s, i) => segment(s, path[i + 1]))
      .join('')}<div class="rail-end">${esc(path.at(-1))}</div></div></div>`,
  );
  document
    .querySelectorAll('[data-map-activity]')
    .forEach((b) => (b.onclick = () => psActivity(b.dataset.mapActivity)));
  bindScheduleDrag();
}
function bindScheduleDrag() {
  document.querySelectorAll('[data-drag-activity]').forEach(
    (b) =>
      (b.ondragstart = (e) => {
        e.dataTransfer.setData(
          'application/x-trackwork',
          JSON.stringify({
            activity_id: b.dataset.dragActivity,
            from_week: Number(b.dataset.dragWeek),
          }),
        );
        e.dataTransfer.effectAllowed = 'move';
      }),
  );
  document.querySelectorAll('[data-drop-week]').forEach((cell) => {
    cell.ondragover = (e) => {
      if ([...e.dataTransfer.types].includes('application/x-trackwork')) {
        e.preventDefault();
        cell.classList.add('drop-over');
      }
    };
    cell.ondragleave = () => cell.classList.remove('drop-over');
    cell.ondrop = (e) => {
      e.preventDefault();
      cell.classList.remove('drop-over');
      try {
        const data = JSON.parse(e.dataTransfer.getData('application/x-trackwork'));
        moveForm(data.activity_id, data.from_week, Number(cell.dataset.dropWeek));
      } catch {
        toast('Select Move booking to choose a target week.', true);
      }
    };
  });
}
function moveForm(id, from, to) {
  const r = psData.results[psScenario];
  if (!r) return;
  dialog(
    'Move a scheduled booking',
    `<form id="move-form"><label for="move-activity">Activity</label><select id="move-activity" name="activity_id">${psData.summary.jobs.map((x) => `<option value="${esc(x.id)}" ${x.id === id ? 'selected' : ''}>${esc(x.id + ' · ' + x.type)}</option>`).join('')}</select><div class="forms"><div><label for="move-from">Current week</label><select id="move-from" name="from_week"></select></div><div><label for="move-to">Target week</label><input id="move-to" name="to_week" type="number" min="1" max="1040" step="1" value="${to || 1}" required></div></div><p class="hint">This moves one weekly booking. Predecessors, completion dates, capacity, workfronts and safety buffers are checked across the whole plan.</p><button class="primary">Check move</button></form><div id="schedule-preview" role="status"></div>`,
  );
  const weeks = () => {
    const rows = r.access.filter((x) => x.activity_id === $('move-activity').value);
    $('move-from').innerHTML = opts(
      rows.map((x) => String(x.week)),
      String(from || rows[0]?.week),
    );
  };
  weeks();
  $('move-activity').onchange = weeks;
  $('move-form').onsubmit = (e) => {
    e.preventDefault();
    const b = formData(e.target);
    run(async () => {
      const preview = await api('/ps1/move', {
        ...scheduleRequest(),
        ...b,
        from_week: Number(b.from_week),
        to_week: Number(b.to_week),
      });
      showSchedulePreview(preview);
    }, e.submitter);
  };
}
function disruptionForm() {
  dialog(
    'What-if disruption & backup plan',
    `<p>Test a temporary closure caused by weather, a power outage, equipment failure or another incident. Choose the affected area and weeks. Earlier bookings stay fixed.</p><form id="disruption-form"><div class="forms"><div><label for="disruption-type">Incident</label><select id="disruption-type" name="type"><option value="weather">Severe weather</option><option value="power">Power outage / shortage</option><option value="equipment">Equipment unavailable</option><option value="other">Other closure</option></select></div><div><label for="disruption-scope">Affected area</label><select id="disruption-scope" name="scope"><option value="line">One line</option><option value="location">One location</option><option value="network">Whole network</option></select></div><div class="span2"><label for="disruption-location">Line / location</label><select id="disruption-location" name="location"></select></div><div><label for="disruption-start">First affected week</label><input id="disruption-start" name="start_week" type="number" min="1" max="1040" value="1" required></div><div><label for="disruption-end">Last affected week</label><input id="disruption-end" name="end_week" type="number" min="1" max="1040" value="1" required></div></div><p class="hint">Uses Scenario ${psScenario} rules. Affected work areas and buffers are unavailable for the selected weeks. For a partial capacity reduction across all weeks, use What-if capacity.</p><button class="primary">Generate backup plan</button></form><div id="schedule-preview" role="status"></div>`,
  );
  const locations = () => {
    const scope = $('disruption-scope').value;
    $('disruption-location').innerHTML =
      scope === 'line'
        ? psData.summary.lines
            .map((x) => `<option value="${esc(x.line_code)}">${esc(x.line_name)}</option>`)
            .join('')
        : scope === 'location'
          ? psData.summary.location_supply
              .map((x) => `<option value="${esc(x.location)}">${esc(x.location)}</option>`)
              .join('')
          : '<option value="">All lines</option>';
  };
  locations();
  $('disruption-scope').onchange = locations;
  $('disruption-form').onsubmit = (e) => {
    e.preventDefault();
    const b = formData(e.target);
    run(async () => {
      $('schedule-preview').textContent = 'Building and checking a backup plan…';
      const preview = await api('/ps1/disruption', {
        ...scheduleRequest(),
        ...b,
        start_week: Number(b.start_week),
        end_week: Number(b.end_week),
      });
      showSchedulePreview(preview);
    }, e.submitter);
  };
}
function showSchedulePreview(p) {
  const target = $('schedule-preview');
  if (!target) return;
  const r = p.result,
    rep = r.report,
    baseline = psData.results[psScenario];
  target.innerHTML = `<h3 class="section-gap">${rep.feasible ? 'Backup / edit passes the schedule checks' : 'This alternative cannot be saved'}</h3><div class="preview-summary"><div>Changed activities: <strong>${p.comparison.changed_activities}</strong></div><div>Schedule score: <strong>${baseline.report.soft_scores.objective_score ?? '—'} → ${rep.soft_scores.objective_score ?? 'infeasible'}</strong></div><div>Complete activities: ${rep.complete_activities}/${rep.total_activities}</div><div>Total delay days: ${baseline.report.soft_scores.overrun_days_total ?? 0} → ${rep.soft_scores.overrun_days_total ?? 0}</div></div>${p.frozen_before_week ? `<p>Bookings before week ${p.frozen_before_week} are preserved.</p>` : ''}${rep.hard_violations.length ? `<div class="alert inline-issues"><strong>Resolve these issues:</strong><ul>${rep.hard_violations.map((x) => `<li>${esc(x.rule)}: ${esc(x.detail)}</li>`).join('')}</ul></div>` : ''}<details class="section-gap"><summary>Changed activity weeks (${p.comparison.changed_activities})</summary><div class="table-scroll"><table><thead><tr><th>Activity</th><th>Before</th><th>After</th></tr></thead><tbody>${p.comparison.changes.map((x) => `<tr><td>${esc(x.activity_id)}</td><td>${x.before_weeks.join(', ')}</td><td>${x.after_weeks.join(', ')}</td></tr>`).join('')}</tbody></table></div></details><div class="actions section-gap">${rep.feasible ? '<button id="apply-schedule-preview" class="primary">Save this plan</button>' : ''}<button id="preview-emergency" class="danger-button">Ask supervisor</button></div><p class="hint">The saved plan stays unchanged until you choose Save. Managers will be asked to reconfirm existing worker assignments after a schedule change.</p>`;
  if ($('apply-schedule-preview'))
    $('apply-schedule-preview').onclick = (e) =>
      run(async () => {
        psData = await api('/ps1/apply-preview', { id: p.id });
        $('modal').close();
        paintPS1();
        toast('Validated plan saved. Undo saved edit restores the previous plan.');
      }, e.target);
  $('preview-emergency').onclick = () => {
    const note = `${p.outage ? `${p.outage.type} affects ${p.outage.location}, weeks ${p.outage.start_week}–${p.outage.end_week}. ` : 'A schedule change needs review. '}Preview: ${rep.feasible ? 'feasible' : rep.hard_violations.length + ' rule issues'}, ${p.comparison.changed_activities} changed activities. ${rep.hard_violations
      .slice(0, 3)
      .map((x) => x.detail)
      .join(' ')} Decision needed: `;
    $('modal').close();
    emergencyForm(note);
  };
}
