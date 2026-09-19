import { loadDataset, validatePlan } from './ps1.mjs';
import { explainPlan } from './explain.mjs';
export function planningModel(files, plan = {}) {
  const d = loadDataset(files);
  d.disruptions = plan.disruptions || [];
  return d;
}
export function normaliseAccess(rows) {
  const out = rows
    .map((x) => ({ ...x }))
    .sort((a, b) => a.week - b.week || a.activity_id.localeCompare(b.activity_id));
  const seq = new Map();
  for (const r of out) {
    const n = (seq.get(r.activity_id) || 0) + 1;
    seq.set(r.activity_id, n);
    r.access_seq = n;
  }
  return out;
}
export function moveBooking(files, baseline, activity, from, to) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || to < 1 || to > 1040)
    throw Object.assign(Error('Choose a target week from 1 to 1040.'), { status: 400 });
  const d = planningModel(files, baseline),
    a = d.am.get(activity);
  if (!a || !baseline.access.some((x) => x.activity_id === activity && x.week === from))
    throw Object.assign(Error('Booking not found. Refresh the schedule.'), { status: 404 });
  if (from === to || baseline.access.some((x) => x.activity_id === activity && x.week === to))
    throw Object.assign(
      Error('Choose a different week without another booking for this activity.'),
      { status: 400 },
    );
  const labels = [
    ...new Set(baseline.occupancy.filter((x) => x.week === to).map((x) => x.co_share_group)),
    'move-' + activity + '-' + to,
  ];
  const counts = Array(a.project.cap).fill(0);
  for (const r of baseline.access.filter((x) => x.week === to)) {
    const p = d.am.get(r.activity_id);
    if (p.contract_number === a.contract_number && p.activity_type === a.activity_type)
      counts[r.access_night - 1]++;
  }
  const night = counts.findIndex((n) => n < a.project.fronts) + 1;
  let candidate;
  for (const label of labels) {
    const access = normaliseAccess(
      baseline.access.map((r) =>
        r.activity_id === activity && r.week === from
          ? { ...r, week: to, access_night: night || 1 }
          : r,
      ),
    );
    const occupancy = baseline.occupancy.map((r) =>
      r.activity_id === activity && r.week === from ? { ...r, week: to, co_share_group: label } : r,
    );
    const report = validatePlan(d, baseline.scenario, access, occupancy);
    candidate = {
      ...baseline,
      access,
      occupancy,
      report,
      generated_at: new Date().toISOString(),
      method: 'Planner edit checked against the full schedule',
    };
    delete candidate.optimization;
    if (report.feasible) break;
  }
  candidate.explanations = explainPlan(d, candidate);
  return candidate;
}
export function validateDisruption(d, b) {
  if (!['weather', 'power', 'equipment', 'other', 'capacity'].includes(b.type))
    throw Error('Choose a disruption type.');
  if (
    !Number.isInteger(b.start_week) ||
    !Number.isInteger(b.end_week) ||
    b.start_week < 1 ||
    b.end_week < b.start_week ||
    b.end_week > 1040 ||
    b.end_week - b.start_week > 51
  )
    throw Error('Choose a disruption lasting 1 to 52 weeks, within weeks 1 to 1040.');
  let locations;
  if (b.scope === 'network') locations = d.supply.map((x) => x.location_id);
  else if (b.scope === 'line' && d.lines.some((x) => x.line_code === b.location))
    locations = d.supply.filter((x) => x.line_code === b.location).map((x) => x.location_id);
  else if (b.scope === 'location' && d.loc.has(b.location)) locations = [b.location];
  else throw Error('Choose a valid affected line or track location.');
  const capacity = b.type === 'capacity' ? b.capacity : null;
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 0 || capacity > 100))
    throw Error('Choose a temporary quota from 0 to 100 possessions per location/week.');
  return {
    type: b.type,
    scope: b.scope,
    location: b.location || 'All lines',
    start_week: b.start_week,
    end_week: b.end_week,
    locations,
    ...(capacity === null ? {} : { capacity }),
  };
}
