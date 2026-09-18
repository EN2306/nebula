// Deterministic PS1 planning and independent checks. No LLM or API key required.
import { lowerBound } from './quality.mjs';
import { repairPlan } from './repair.mjs';
import { explainPlan } from './explain.mjs';
import { inspectRows } from './input-checks.mjs';
export const FILES = [
  '01_LINES.csv',
  '02_STATIONS.csv',
  '03_SECTORS.csv',
  '04_LOCATION_SUPPLY.csv',
  '05_BUFFER_LOCATION.csv',
  '06_PARAMETERS.csv',
  '07_PROJECT_DETAILS.csv',
  '08_ACTIVITY_DETAILS.csv',
];
export const INPUT_SCHEMA = Object.freeze([
  ['line_code', 'line_name'],
  ['station_id', 'line_code', 'seq', 'is_interchange'],
  ['sector_id', 'line_code', 'from_station_id', 'to_station_id', 'seq', 'is_shared'],
  ['location_id', 'location_kind', 'line_code', 'bound', 'supply_capacity'],
  ['nature_of_works', 'up_to_buffer_sectors', 'opposite_bound_required'],
  ['key', 'value'],
  [
    'contract_number',
    'contract_description',
    'contract_award_date',
    'activity_type',
    'nature_of_activity',
    'contract_priority',
    'contract_completion_date',
    'planned_completion_date',
    'number_of_workfronts',
    'access_type',
    'number_of_maximum_access_per_week',
  ],
  [
    'activity_id',
    'contract_number',
    'activity_type',
    'start_location_id',
    'end_location_id',
    'total_accesses',
    'planned_start_date',
    'predecessor_activity_id',
    'activity_priority',
  ],
]);
const HEADERS = INPUT_SCHEMA;
export function parseCSV(text) {
  if (typeof text !== 'string' || text.length > 1000000)
    throw Error('CSV must be text, up to 1 MB per file.');
  const rows = [],
    rowNumbers = [];
  let lineNumber = 1,
    rowStart = 1;
  let row = [],
    cell = '',
    quoted = false,
    quoteClosed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoteClosed && ![',', '\r', '\n'].includes(c))
      throw Error(`CSV row ${lineNumber}: unexpected text after closing quote.`);
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        if (!quoted && cell.length)
          throw Error(`CSV row ${lineNumber}: quote must start at the beginning of a field.`);
        quoteClosed = quoted;
        quoted = !quoted;
      }
    } else if (c === ',' && !quoted) {
      row.push(cell);
      cell = '';
      quoteClosed = false;
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((x) => x.trim())) {
        rows.push(row);
        rowNumbers.push(rowStart);
      }
      row = [];
      cell = '';
      quoteClosed = false;
      lineNumber++;
      rowStart = lineNumber;
    } else {
      cell += c;
      if (c === '\n' || (c === '\r' && text[i + 1] !== '\n')) lineNumber++;
    }
  }
  if (quoted) throw Error('Unclosed CSV quote.');
  row.push(cell);
  if (row.some((x) => x.trim())) {
    rows.push(row);
    rowNumbers.push(rowStart);
  }
  if (!rows.length) throw Error('CSV is empty.');
  const header = rows.shift().map((x) => x.replace(/^\uFEFF/, '').trim());
  rowNumbers.shift();
  if (new Set(header).size !== header.length) throw Error('Duplicate CSV columns.');
  return {
    header,
    rowNumbers,
    rows: rows.map((r, i) => {
      if (r.length !== header.length)
        throw Error(`CSV row ${rowNumbers[i]} has ${r.length} columns; expected ${header.length}.`);
      return Object.fromEntries(header.map((k, j) => [k, r[j].trim()]));
    }),
  };
}

export function inspectInputFiles(files) {
  const issues = [];
  if (!files || typeof files !== 'object' || Array.isArray(files))
    return ['Upload the eight required CSV files.'];
  const expected = new Set(FILES);
  for (const name of FILES)
    if (!Object.hasOwn(files, name)) issues.push(`${name}: file is missing.`);
  for (const name of Object.keys(files).filter((name) => !expected.has(name)))
    issues.push(`${name}: unexpected filename. Use the required names exactly.`);
  for (const [index, name] of FILES.entries()) {
    if (!Object.hasOwn(files, name)) continue;
    if (typeof files[name] !== 'string') {
      issues.push(`${name}: file content could not be read as text.`);
      continue;
    }
    try {
      const parsed = parseCSV(files[name]);
      const required = INPUT_SCHEMA[index];
      const missing = required.filter((column) => !parsed.header.includes(column));
      const extra = parsed.header.filter((column) => !required.includes(column));
      if (missing.length) issues.push(`${name}: missing column(s): ${missing.join(', ')}.`);
      if (extra.length) issues.push(`${name}: unexpected column(s): ${extra.join(', ')}.`);
    } catch (error) {
      issues.push(`${name}: ${error.message}`);
    }
  }
  if (!issues.length)
    issues.push(
      ...inspectRows(
        FILES.map((f) => parseCSV(files[f])),
        FILES,
      ),
    );
  return issues;
}
const day = (s) => {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    !Number.isFinite(Date.parse(s)) ||
    new Date(s).toISOString().slice(0, 10) !== s
  )
    throw Error(`Invalid date: ${s}`);
  return Date.parse(s) / 86400000;
};
const integer = (v, label, min = 0, max = 10000) => {
  const n = Number(v);
  if (v === '' || !Number.isInteger(n) || n < min || n > max) throw Error(`Invalid ${label}: ${v}`);
  return n;
};
const unique = (rows, key) => {
  const m = new Map();
  for (const r of rows) {
    const k = key(r);
    if (!k || m.has(k)) throw Error(`Missing or duplicate identifier: ${k}`);
    m.set(k, r);
  }
  return m;
};
export function loadDataset(files) {
  const tables = FILES.map((f, i) => {
    if (!Object.hasOwn(files, f)) throw Error(`Missing ${f}`);
    const t = parseCSV(files[f]);
    for (const h of HEADERS[i]) if (!t.header.includes(h)) throw Error(`${f}: missing column ${h}`);
    if (!t.rows.length) throw Error(`${f}: no data rows`);
    return t.rows;
  });
  const [lines, stations, sectors, supply, buffers, parameters, projects, activities] = tables;
  if (activities.length > 250)
    throw Error(
      'This interactive solver supports up to 250 activities per instance. Split larger operational datasets outside this prototype.',
    );
  const lm = unique(lines, (r) => r.line_code),
    sm = unique(stations, (r) => r.line_code + ':' + r.station_id),
    sec = unique(sectors, (r) => r.sector_id),
    loc = unique(supply, (r) => r.location_id),
    pm = unique(projects, (r) => r.contract_number + '|' + r.activity_type),
    am = unique(activities, (r) => r.activity_id),
    bm = unique(buffers, (r) => r.nature_of_works),
    params = Object.fromEntries(
      unique(parameters, (r) => r.key)
        .entries()
        .map(([k, r]) => [k, r.value]),
    );
  const start = day(params.horizon_start),
    horizon = integer(params.horizon_weeks, 'horizon weeks', 1, 260);
  if (new Date(start * 86400000).getUTCDay() !== 1) throw Error('horizon_start must be a Monday.');
  const paths = {};
  for (const l of lines) {
    paths[l.line_code] = stations
      .filter((s) => s.line_code === l.line_code)
      .sort((a, b) => +a.seq - +b.seq);
    unique(paths[l.line_code], (s) => String(integer(s.seq, 'station sequence', 1)));
  }
  for (const s of stations)
    if (!lm.has(s.line_code)) throw Error(`Unknown line at station ${s.station_id}`);
  for (const s of sectors) {
    if (
      !sm.has(s.line_code + ':' + s.from_station_id) ||
      !sm.has(s.line_code + ':' + s.to_station_id)
    )
      throw Error(`Invalid sector ${s.sector_id}`);
    const p = paths[s.line_code];
    if (
      p.findIndex((x) => x.station_id === s.to_station_id) !==
      p.findIndex((x) => x.station_id === s.from_station_id) + 1
    )
      throw Error(`Sector ${s.sector_id} must connect adjacent stations.`);
  }
  for (const s of supply) {
    s.capacity = integer(s.supply_capacity, 'supply capacity', 0, 100);
    const [kind, line, id, bound] = s.location_id.split(':');
    if (
      !['SEC', 'PLAT'].includes(kind) ||
      !['EB', 'WB'].includes(bound) ||
      line !== s.line_code ||
      !({ SEC: ['SEC', 'tunnel sector'], PLAT: ['PLAT', 'platform sector'] }[kind] || []).includes(
        s.location_kind,
      ) ||
      bound !== s.bound ||
      (kind === 'PLAT'
        ? !sm.has(line + ':' + id)
        : !sectors.some(
            (x) => x.line_code === line && x.from_station_id + '_' + x.to_station_id === id,
          ))
    )
      throw Error(`Invalid location ${s.location_id}`);
  }
  for (const b of buffers) {
    b.size = integer(b.up_to_buffer_sectors, 'buffer size', 0, 20);
    integer(b.opposite_bound_required, 'opposite bound flag', 0, 1);
  }
  for (const p of projects) {
    if (!bm.has(p.nature_of_activity)) throw Error(`Unknown nature ${p.nature_of_activity}`);
    if (!['PM', 'PC', 'C'].includes(p.access_type)) throw Error('Unknown access type');
    p.cap = integer(p.number_of_maximum_access_per_week, 'weekly cap', 1, 7);
    p.fronts = integer(p.number_of_workfronts, 'workfronts', 1, 20);
    integer(p.contract_priority, 'contract priority', 1, 3);
    day(p.contract_award_date);
    day(p.contract_completion_date);
    p.deadline = day(p.planned_completion_date);
  }
  const model = {
    lines,
    stations,
    sectors,
    supply,
    projects,
    activities,
    paths,
    loc,
    am,
    pm,
    bm,
    start,
    horizon,
  };
  for (const a of activities) {
    if (!/^[A-Za-z0-9_.-]+$/.test(a.activity_id))
      throw Error('Activity identifiers must be letters, numbers, dots, hyphens or underscores.');
    a.project = pm.get(a.contract_number + '|' + a.activity_type);
    if (!a.project) throw Error(`Unknown contract/type for ${a.activity_id}`);
    a.work = integer(a.total_accesses, 'workload', 1, 100);
    a.earliest = Math.max(1, Math.floor((day(a.planned_start_date) - start) / 7) + 1);
    integer(a.activity_priority, 'activity priority', 1, 3);
    a.geometry = expand(model, a);
  }
  for (const a of activities) {
    let q = a,
      seen = new Set();
    while (q.predecessor_activity_id) {
      if (seen.has(q.activity_id)) throw Error(`Cyclic predecessors at ${a.activity_id}`);
      seen.add(q.activity_id);
      q = am.get(q.predecessor_activity_id);
      if (!q) throw Error(`Unknown predecessor for ${a.activity_id}`);
    }
  }
  return model;
}
export function expand(d, a) {
  const x = a.start_location_id.split(':'),
    y = a.end_location_id.split(':');
  if (
    x[0] !== 'SEC' ||
    y[0] !== 'SEC' ||
    x[1] !== y[1] ||
    x[3] !== y[3] ||
    !d.loc.has(a.start_location_id) ||
    !d.loc.has(a.end_location_id)
  )
    throw Error(`${a.activity_id}: endpoints must be tunnel sectors on the same line and bound.`);
  const line = x[1],
    bound = x[3],
    p = d.paths[line],
    indices = [...x[2].split('_'), ...y[2].split('_')].map((id) =>
      p.findIndex((s) => s.station_id === id),
    );
  if (indices.includes(-1)) throw Error('Unknown span station');
  const lo = Math.min(...indices),
    hi = Math.max(...indices),
    rule = d.bm.get(a.project.nature_of_activity),
    live = a.project.nature_of_activity === 'Live';
  function span(l, b, left, right) {
    const path = d.paths[l],
      out = [];
    for (let i = left; i <= right; i++) {
      out.push(`PLAT:${l}:${path[i].station_id}:${b}`);
      if (i < right) out.push(`SEC:${l}:${path[i].station_id}_${path[i + 1].station_id}:${b}`);
    }
    return out;
  }
  const occupied = span(line, bound, lo, hi),
    closed = new Set(occupied),
    envelope = new Set(
      span(line, bound, Math.max(0, lo - rule.size), Math.min(p.length - 1, hi + rule.size)),
    );
  if (live) {
    for (const id of [...closed])
      closed.add(id.replace(/:(EB|WB)$/, bound === 'EB' ? ':WB' : ':EB'));
    for (const id of [...envelope])
      envelope.add(id.replace(/:(EB|WB)$/, bound === 'EB' ? ':WB' : ':EB'));
    if ([...envelope].some((id) => /:(H01|H02|H01_H02):/.test(id)))
      for (const l of d.lines)
        if (l.line_code !== line)
          for (const b of ['EB', 'WB'])
            for (const id of [
              `SEC:${l.line_code}:H01_H02:${b}`,
              `PLAT:${l.line_code}:H01:${b}`,
              `PLAT:${l.line_code}:H02:${b}`,
            ])
              if (d.loc.has(id)) {
                closed.add(id);
                envelope.add(id);
              }
  }
  for (const id of envelope) if (!d.loc.has(id)) throw Error(`Missing location supply: ${id}`);
  return {
    line,
    bound,
    occupied,
    closed: [...closed],
    envelope: [...envelope],
    lines: [...new Set([...envelope].map((id) => id.split(':')[1]))],
    live,
  };
}
const intersects = (a, b) => a.some((x) => b.includes(x));
function compatible(a, b) {
  const pa = a.project,
    pb = b.project;
  return (
    !a.geometry.live &&
    !b.geometry.live &&
    pa.access_type !== 'PM' &&
    pb.access_type !== 'PM' &&
    !(pa.access_type === 'PC' && pb.access_type === 'PC')
  );
}
function collision(a, b) {
  return intersects(a.geometry.envelope, b.geometry.envelope) && !compatible(a, b);
}
const endDay = (d, w) => d.start + w * 7 - 1;
const dateString = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
export const SUMMARY_NOTE =
  'Independent RailSync checks, not the judges’ validator. Heuristic results are not a proof of optimality. Possession labels are synchronized across each activity’s span; local contract access_night indices are separate. Predecessors finish in an earlier week. Live closures and exclusion envelopes are checked internally; occupancy CSV lists the work span, as in the supplied example.';
export function validatePlan(d, scenario, access, occupancy) {
  if (!['A', 'B', 'C'].includes(scenario)) throw Error('Choose scenario A, B or C');
  // Reject malformed rows before arithmetic, grouping or date conversion. Never
  // let empty labels bypass collision checks or delimiter injection merge keys.
  const schema = [];
  if (!Array.isArray(access) || !Array.isArray(occupancy))
    schema.push({
      rule: 'schema',
      severity: 'hard',
      detail: 'Access and occupancy must be arrays',
    });
  else {
    for (const [i, r] of access.entries())
      if (
        !r ||
        !d.am.has(r.activity_id) ||
        !Number.isSafeInteger(r.week) ||
        r.week < 1 ||
        r.week > 1040 ||
        !Number.isSafeInteger(r.access_seq) ||
        r.access_seq < 1 ||
        !Number.isSafeInteger(r.access_night) ||
        r.access_night < 1 ||
        ![0, 1].includes(r.eclo)
      )
        schema.push({ rule: 'schema', severity: 'hard', detail: `Invalid access row ${i + 1}` });
    for (const [i, r] of occupancy.entries())
      if (
        !r ||
        !d.am.has(r.activity_id) ||
        !d.loc.has(r.location_id) ||
        !Number.isSafeInteger(r.week) ||
        r.week < 1 ||
        r.week > 1040 ||
        typeof r.co_share_group !== 'string' ||
        !r.co_share_group.trim() ||
        r.co_share_group.length > 100 ||
        /[|\r\n]/.test(r.co_share_group)
      )
        schema.push({ rule: 'schema', severity: 'hard', detail: `Invalid occupancy row ${i + 1}` });
  }
  if (schema.length)
    return {
      scenario,
      feasible: false,
      hard_violations: schema,
      complete_activities: 0,
      total_activities: d.activities.length,
      soft_scores: { objective_score: null },
      detail: { capacity_hotspots: [], last_week: 0 },
      results: [],
      note: SUMMARY_NOTE,
    };
  const violations = [],
    add = (rule, detail) => violations.push({ rule, severity: 'hard', detail });
  for (const r of access) {
    const a = d.am.get(r.activity_id);
    for (const outage of d.disruptions || [])
      if (
        r.week >= outage.start_week &&
        r.week <= outage.end_week &&
        a.geometry.envelope.some((id) => outage.locations.includes(id))
      )
        add(
          'disruption',
          `${r.activity_id}, week ${r.week}: ${outage.type} blocks this work area or its safety buffer.`,
        );
  }
  if (d.freeze) {
    const stable = (rows) =>
      JSON.stringify([...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
    if (
      stable(access.filter((r) => r.week < d.freeze.week)) !== stable(d.freeze.access) ||
      stable(occupancy.filter((r) => r.week < d.freeze.week)) !== stable(d.freeze.occupancy)
    )
      add('frozen_history', 'Bookings before the disruption must remain unchanged.');
  }
  const byWeek = new Map(),
    byActivity = new Map(),
    occ = new Map(),
    groups = new Map();
  for (const r of occupancy) {
    const key = r.activity_id + '|' + r.week;
    if (!occ.has(key)) occ.set(key, []);
    occ.get(key).push(r);
    const g = r.week + '|' + r.location_id + '|' + r.co_share_group;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(r.activity_id);
    if (!d.am.has(r.activity_id) || !d.loc.has(r.location_id))
      add('occupancy', `Unknown activity/location: ${key}`);
  }
  const ecloWeeks = {};
  for (const r of access) {
    const a = d.am.get(r.activity_id);
    if (!a) {
      add('activity', `Unknown ${r.activity_id}`);
      continue;
    }
    if (!Number.isInteger(r.week) || r.week < 1 || ![0, 1].includes(r.eclo))
      add('schema', `Invalid week/ECLO for ${a.activity_id}`);
    if (!Number.isInteger(r.access_night) || r.access_night < 1 || r.access_night > a.project.cap)
      add('weekly_allocation', `${a.activity_id}: local night outside granted cap`);
    if (!byActivity.has(a.activity_id)) byActivity.set(a.activity_id, []);
    byActivity.get(a.activity_id).push(r);
    if (!byWeek.has(r.week)) byWeek.set(r.week, []);
    byWeek.get(r.week).push(r);
    if (r.week < a.earliest) add('planned_start', `${a.activity_id} starts too early`);
    if (scenario === 'A' && r.eclo) add('eclo', `${a.activity_id}: A forbids ECLO`);
    if (r.eclo) for (const l of a.geometry.lines) (ecloWeeks[l] ??= []).push(r.week);
    const rows = occ.get(a.activity_id + '|' + r.week) || [],
      ids = rows.map((x) => x.location_id);
    if (
      ids.length !== new Set(ids).size ||
      ids.length !== a.geometry.occupied.length ||
      a.geometry.occupied.some((id) => !ids.includes(id))
    )
      add(
        'occupancy',
        `${a.activity_id}, week ${r.week}: work span is missing, duplicated or has extra locations`,
      );
    if (new Set(rows.map((x) => x.co_share_group)).size !== 1)
      add(
        'possession_alignment',
        `${a.activity_id}, week ${r.week}: RailSync expects one synchronized possession label along a span`,
      );
  }
  const accessKeys = new Set(access.map((r) => r.activity_id + '|' + r.week));
  for (const [key] of occ) if (!accessKeys.has(key)) add('occupancy', `Orphan occupancy ${key}`);
  for (const rows of byActivity.values()) rows.sort((a, b) => a.week - b.week);
  const completion = {};
  let weighted = 0,
    complete = 0;
  for (const a of d.activities) {
    const rows = byActivity.get(a.activity_id) || [],
      yieldSum = rows.reduce((n, r) => n + (r.eclo ? 1.5 : 1), 0);
    if (yieldSum < a.work)
      add('workload', `${a.activity_id}: ${yieldSum}/${a.work} work units delivered`);
    else complete++;
    if (new Set(rows.map((r) => r.week)).size !== rows.length)
      add('weekly_activity', `${a.activity_id}: more than one access in a week`);
    if (rows.some((r, i) => r.access_seq !== i + 1))
      add('sequence', `${a.activity_id}: access_seq is not consecutive`);
    const w = Math.max(0, ...rows.map((r) => r.week));
    completion[a.activity_id] = w;
    const late = Math.max(0, endDay(d, w) - a.project.deadline);
    weighted +=
      late *
      { 1: 100, 2: 10, 3: 1 }[a.project.contract_priority] *
      (1 + { 1: 0.3, 2: 0.2, 3: 0 }[a.activity_priority]);
    if (scenario === 'B' && late)
      add('planned_date', `${a.activity_id}: ${late} days past planned completion`);
  }
  for (const a of d.activities)
    if (
      a.predecessor_activity_id &&
      (byActivity.get(a.activity_id) || []).some(
        (r) => r.week <= completion[a.predecessor_activity_id],
      )
    )
      add('predecessor', `${a.activity_id} starts before predecessor finishes`);
  for (const [week, rows] of byWeek) {
    const budgets = new Map();
    for (const r of rows) {
      const a = d.am.get(r.activity_id),
        key = a.contract_number + '|' + a.activity_type + '|' + r.access_night;
      budgets.set(key, (budgets.get(key) || 0) + 1);
      if (budgets.get(key) > a.project.fronts)
        add('workfront', `Week ${week}, ${key}: workfront cap exceeded`);
    }
    for (let i = 0; i < rows.length; i++)
      for (let j = i + 1; j < rows.length; j++) {
        const a = d.am.get(rows[i].activity_id),
          b = d.am.get(rows[j].activity_id),
          ga = occ.get(a.activity_id + '|' + week)?.[0]?.co_share_group,
          gb = occ.get(b.activity_id + '|' + week)?.[0]?.co_share_group;
        if (ga && ga === gb && collision(a, b))
          add(
            'closure',
            `Week ${week}, ${ga}: ${a.activity_id} and ${b.activity_id} have overlapping exclusion envelopes`,
          );
      }
  }
  const counts = new Map();
  for (const [key, ids] of groups) {
    const acts = ids.map((id) => d.am.get(id)).filter(Boolean),
      types = acts.map((a) => a.project.access_type);
    if (
      ids.length > 4 ||
      types.filter((t) => t === 'PC').length > 1 ||
      (types.includes('PM') && ids.length > 1)
    )
      add('legal_mix', `${key}: illegal possession mix`);
    const k = key.split('|').slice(0, 2).join('|');
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  let excess = 0;
  const hotspots = [];
  for (const [key, n] of counts) {
    const [w, id] = key.split('|'),
      capacity = d.loc.get(id)?.capacity ?? 0,
      e = Math.max(0, n - capacity);
    excess += e;
    if (n >= capacity) hotspots.push({ week: +w, location: id, used: n, capacity, excess: e });
    if ((scenario === 'A' && e) || (scenario === 'C' && e > 1))
      add('capacity', `Week ${w}, ${id}: ${n} possessions / ${capacity} nominal`);
  }
  if (scenario === 'C')
    for (const [line, weeks] of Object.entries(ecloWeeks))
      if (Math.max(...weeks) - Math.min(...weeks) > 1)
        add('eclo_window', `${line}: ECLO exceeds a two-week window`);
  const results = [...new Set(d.projects.map((p) => p.contract_number))].map((contract) => {
    const acts = d.activities.filter((a) => a.contract_number === contract),
      w = Math.max(0, ...acts.map((a) => completion[a.activity_id] || 0)),
      deadline = Math.min(
        ...d.projects.filter((p) => p.contract_number === contract).map((p) => p.deadline),
      );
    return {
      scenario,
      contract_number: contract,
      simulated_completion_date: acts.length ? dateString(endDay(d, w)) : '',
      overrun_days: acts.length ? Math.max(0, endDay(d, w) - deadline) : 0,
    };
  });
  const eclo = access.filter((r) => r.eclo).length,
    score = (scenario === 'B' ? 0 : weighted) + (scenario === 'A' ? 0 : 7 * excess + 5 * eclo);
  return {
    scenario,
    feasible: violations.length === 0,
    hard_violations: violations,
    complete_activities: complete,
    total_activities: d.activities.length,
    soft_scores: {
      objective_score: violations.length ? null : Math.round(score * 10) / 10,
      priority_weighted_score: Math.round(weighted * 10) / 10,
      overrun_days_total: results.reduce((n, r) => n + r.overrun_days, 0),
      contracts_overrunning: results.filter((r) => r.overrun_days).length,
      excess_access_nights_total: excess,
      eclo_nights_total: eclo,
    },
    detail: {
      capacity_hotspots: hotspots,
      nights_scheduled: access.length,
      eclo_windows: Object.fromEntries(
        Object.entries(ecloWeeks).map(([l, w]) => [l, [Math.min(...w), Math.max(...w)]]),
      ),
      last_week: Math.max(0, ...access.map((r) => r.week)),
    },
    results,
    note: SUMMARY_NOTE,
  };
}
function attempt(d, scenario, mode, windowSeed = null) {
  const access = (d.freeze?.access || []).map((r) => ({ ...r })),
    occupancy = (d.freeze?.occupancy || []).map((r) => ({ ...r })),
    weeks = new Map(),
    finished = new Map(),
    progress = new Map(),
    windows = { ...windowSeed },
    reasons = {};
  for (const r of access) {
    progress.set(r.activity_id, (progress.get(r.activity_id) || 0) + (r.eclo ? 1.5 : 1));
    if (progress.get(r.activity_id) >= d.am.get(r.activity_id).work)
      finished.set(r.activity_id, r.week);
    if (r.eclo && scenario === 'C')
      for (const line of d.am.get(r.activity_id).geometry.lines)
        windows[line] = Math.min(windows[line] ?? r.week, r.week);
  }
  const weight = (a) =>
    ({ 1: 100, 2: 10, 3: 1 })[a.project.contract_priority] *
    (1 + { 1: 0.3, 2: 0.2, 3: 0 }[a.activity_priority]);
  const deadlineWeek = (a) => Math.floor((a.project.deadline - d.start + 1) / 7);
  const descendants = new Map(
      d.activities.map((a) => [
        a.activity_id,
        d.activities.filter((b) => b.predecessor_activity_id === a.activity_id),
      ]),
    ),
    critical = new Map();
  function downstream(a) {
    if (critical.has(a.activity_id)) return critical.get(a.activity_id);
    let due = deadlineWeek(a),
      priority = weight(a);
    for (const child of descendants.get(a.activity_id)) {
      const next = downstream(child);
      due = Math.min(due, next.due - (scenario === 'B' ? Math.ceil(child.work / 1.5) : child.work));
      priority = Math.max(priority, next.priority);
    }
    const value = { due, priority };
    critical.set(a.activity_id, value);
    return value;
  }
  if (mode >= 3) for (const a of d.activities) downstream(a);
  const maxWeek = Math.min(
    1040,
    Math.max(
      d.horizon,
      ...(d.disruptions || []).map((x) => x.end_week),
      ...d.activities.map((a) => a.earliest),
    ) + d.activities.reduce((n, a) => n + a.work, 0),
  );
  for (
    let week = d.freeze?.week || 1;
    week <= maxWeek && finished.size < d.activities.length;
    week++
  ) {
    const slots = [],
      local = new Map(),
      used = new Map();
    weeks.set(week, slots);
    const available = d.activities.filter(
      (a) =>
        !finished.has(a.activity_id) &&
        !(d.disruptions || []).some(
          (x) =>
            week >= x.start_week &&
            week <= x.end_week &&
            a.geometry.envelope.some((id) => x.locations.includes(id)),
        ) &&
        a.earliest <= week &&
        (!a.predecessor_activity_id ||
          (finished.has(a.predecessor_activity_id) &&
            finished.get(a.predecessor_activity_id) < week)),
    );
    available.sort((a, b) => {
      const slack = (a) =>
        (mode >= 3 ? critical.get(a.activity_id).due : deadlineWeek(a)) -
        week -
        (a.work - (progress.get(a.activity_id) || 0));
      if (mode === 3)
        return (
          slack(a) - slack(b) ||
          critical.get(b.activity_id).priority - critical.get(a.activity_id).priority ||
          a.activity_id.localeCompare(b.activity_id)
        );
      if (mode === 4)
        return (
          critical.get(b.activity_id).priority - critical.get(a.activity_id).priority ||
          slack(a) - slack(b) ||
          b.geometry.occupied.length - a.geometry.occupied.length ||
          a.activity_id.localeCompare(b.activity_id)
        );
      return mode === 1
        ? slack(a) - slack(b) || weight(b) - weight(a) || a.activity_id.localeCompare(b.activity_id)
        : weight(b) - weight(a) ||
            slack(a) - slack(b) ||
            a.activity_id.localeCompare(b.activity_id);
    });
    for (const a of available) {
      const p = a.project,
        id = a.activity_id,
        key = a.contract_number + '|' + a.activity_type,
        counts = local.get(key) || Array(p.cap).fill(0),
        night = counts.findIndex((n) => n < p.fronts);
      if (night < 0) {
        reasons[id] = 'Contract weekly access/workfront limit';
        continue;
      }
      const remaining = a.work - (progress.get(id) || 0),
        deadline = mode >= 3 ? critical.get(id).due : deadlineWeek(a),
        ecloAllowed =
          scenario === 'B' ||
          (scenario === 'C' &&
            a.geometry.lines.every(
              (l) => !windows[l] || (week >= windows[l] && week <= windows[l] + 1),
            ));
      // Request ECLO only where compression is necessary to reach a target.
      const eclo = +(
        scenario !== 'A' &&
        remaining > 1 &&
        ecloAllowed &&
        (mode === 5 ||
          remaining > deadline - week + 1 ||
          (mode === 2 && remaining >= 3 && week >= deadline - 2))
      );
      let chosen = -1,
        best = Infinity;
      for (let g = 0; g <= slots.length; g++) {
        const peers = slots[g] || [];
        if (peers.some((b) => collision(a, b))) continue;
        let extra = 0,
          valid = true;
        for (const location of a.geometry.occupied) {
          const sharing = peers.filter((b) => b.geometry.occupied.includes(location));
          const types = [...sharing.map((b) => b.project.access_type), p.access_type];
          if (
            types.length > 4 ||
            types.filter((t) => t === 'PC').length > 1 ||
            (types.includes('PM') && types.length > 1)
          ) {
            valid = false;
            break;
          }
          if (!sharing.length) {
            const current = used.get(location) || 0,
              cap = d.loc.get(location).capacity;
            if (scenario !== 'B' && current + 1 > cap + (scenario === 'C' ? 1 : 0)) {
              valid = false;
              break;
            }
            extra += Math.max(0, current + 1 - cap) - Math.max(0, current - cap);
          }
        }
        if (valid) {
          const cost = extra * 7 + (g === slots.length ? 0.05 : 0);
          if (cost < best) {
            best = cost;
            chosen = g;
          }
        }
      }
      if (chosen < 0) {
        reasons[id] = 'Location supply or exclusion/co-sharing constraints';
        continue;
      }
      const peers = (slots[chosen] ??= []);
      for (const location of a.geometry.occupied)
        if (!peers.some((b) => b.geometry.occupied.includes(location)))
          used.set(location, (used.get(location) || 0) + 1);
      peers.push(a);
      slots[chosen] = peers;
      counts[night]++;
      local.set(key, counts);
      const seq = access.filter((r) => r.activity_id === id).length + 1;
      access.push({ activity_id: id, access_seq: seq, week, eclo, access_night: night + 1 });
      for (const location_id of a.geometry.occupied)
        occupancy.push({ activity_id: id, week, location_id, co_share_group: 'p' + (chosen + 1) });
      if (eclo && scenario === 'C') for (const l of a.geometry.lines) windows[l] ??= week;
      const done = (progress.get(id) || 0) + (eclo ? 1.5 : 1);
      progress.set(id, done);
      if (done >= a.work) finished.set(id, week);
    }
  }
  const report = validatePlan(d, scenario, access, occupancy);
  return {
    scenario,
    access,
    occupancy,
    report,
    explanations: d.activities.map((a) => ({
      activity_id: a.activity_id,
      contract: a.contract_number,
      line: a.geometry.line,
      bound: a.geometry.bound,
      access_type: a.project.access_type,
      nature: a.project.nature_of_activity,
      priority: a.project.contract_priority,
      workload: a.work,
      first_week: access.find((r) => r.activity_id === a.activity_id)?.week ?? null,
      last_week: finished.get(a.activity_id) ?? null,
      reason:
        reasons[a.activity_id] ||
        'Earliest available weeks within starts, predecessor, capacity and possession rules',
    })),
  };
}
export function solve(d, scenario) {
  if (!['A', 'B', 'C'].includes(scenario)) throw Error('Choose scenario A, B or C');
  const started = performance.now(),
    bound = lowerBound(d, scenario);
  const variants = [0, 1, 2, 3, 4].map((mode) => attempt(d, scenario, mode));
  if (scenario !== 'A')
    for (const mode of [0, 1, 2, 3, 4]) {
      const strict = attempt(d, 'A', mode);
      strict.scenario = scenario;
      strict.report = validatePlan(d, scenario, strict.access, strict.occupancy);
      variants.push(strict);
    }
  // Explore compression when baseline policies have not met a lower bound.
  if (
    !variants.some((r) => r.report.feasible && r.report.soft_scores.objective_score === bound.score)
  ) {
    if (scenario === 'B') variants.push(attempt(d, scenario, 5));
    if (scenario === 'C') {
      const choices = d.lines.map((line) => {
        const weights = new Map();
        for (const a of d.activities.filter(
          (a) => a.geometry.lines.includes(line.line_code) && a.work >= 2,
        )) {
          const late = Math.max(0, endDay(d, a.earliest + a.work - 1) - a.project.deadline),
            w =
              { 1: 100, 2: 10, 3: 1 }[a.project.contract_priority] *
              (1 + { 1: 0.3, 2: 0.2, 3: 0 }[a.activity_priority]);
          for (let week = a.earliest; week < a.earliest + a.work - 1; week++)
            weights.set(week, (weights.get(week) || 0) + w * (late + 7));
        }
        return {
          line: line.line_code,
          weeks: [...weights]
            .sort((a, b) => b[1] - a[1] || a[0] - b[0])
            .slice(0, 4)
            .map((x) => x[0]),
        };
      });
      // PS1 has two lines. Bound the Cartesian search for imported variations.
      let windows = [{}];
      for (const choice of choices)
        windows = windows
          .flatMap((w) =>
            (choice.weeks.length ? choice.weeks : [1041]).map((week) => ({
              ...w,
              [choice.line]: week,
            })),
          )
          .slice(0, 16);
      for (const window of windows)
        for (const mode of [3, 5]) variants.push(attempt(d, scenario, mode, window));
    }
  }
  variants.sort(
    (a, b) =>
      a.report.hard_violations.length - b.report.hard_violations.length ||
      (a.report.soft_scores.objective_score ?? Infinity) -
        (b.report.soft_scores.objective_score ?? Infinity) ||
      a.report.detail.last_week - b.report.detail.last_week,
  );
  const baseline = variants[0],
    repaired = repairPlan(d, scenario, baseline, validatePlan, bound.score);
  const result = repaired.result;
  // Rebuild dates and explanations from the final candidate, not an earlier pass.
  result.explanations = explainPlan(d, result);
  result.report.quality = {
    lower_bound: bound.score,
    gap:
      result.report.feasible && bound.score !== null
        ? Math.round((result.report.soft_scores.objective_score - bound.score) * 10) / 10
        : null,
    note: bound.note,
    unavoidable_costs: bound.activities || [],
    baseline_score: baseline.report.soft_scores.objective_score,
    candidates: variants.length,
    repair_checks: repaired.checks,
    improvements: repaired.improvements,
    elapsed_ms: Math.round(performance.now() - started),
  };
  return {
    ...result,
    generated_at: new Date().toISOString(),
    method:
      'Deterministic priority/slack portfolio with validated local repair and a capacity-relaxed lower bound',
  };
}
const encode = (v) => '"' + String(v ?? '').replaceAll('"', '""') + '"';
export function csv(rows, headers) {
  return (
    headers.join(',') +
    '\r\n' +
    rows.map((r) => headers.map((h) => encode(r[h])).join(',')).join('\r\n') +
    '\r\n'
  );
}
export function exportsFor(result) {
  if (!result.report?.feasible) throw Error('Submission export requires a feasible validated plan');
  return {
    'SCHEDULE_ACCESS.csv': csv(result.access, [
      'activity_id',
      'access_seq',
      'week',
      'eclo',
      'access_night',
    ]),
    'SCHEDULE_OCCUPANCY.csv': csv(result.occupancy, [
      'activity_id',
      'week',
      'location_id',
      'co_share_group',
    ]),
    'RESULTS.csv': csv(result.report.results, [
      'scenario',
      'contract_number',
      'simulated_completion_date',
      'overrun_days',
    ]),
  };
}
export function describe(d) {
  return {
    lines: d.lines,
    stations: d.stations,
    location_supply: d.supply.map((r) => ({ location: r.location_id, capacity: r.capacity })),
    locations: d.supply.length,
    activities: d.activities.length,
    contracts: new Set(d.projects.map((p) => p.contract_number)).size,
    workload: d.activities.reduce((n, a) => n + a.work, 0),
    horizon_start: dateString(d.start),
    horizon_weeks: d.horizon,
    note: SUMMARY_NOTE,
    projects: d.projects.map((p) => ({
      id: p.contract_number,
      name: p.contract_description,
      type: p.activity_type,
      target: p.planned_completion_date,
      contract_deadline: p.contract_completion_date,
      nature: p.nature_of_activity,
      access_type: p.access_type,
      priority: p.contract_priority,
      weekly_cap: p.cap,
      workfronts: p.fronts,
    })),
    jobs: d.activities.map((a) => ({
      id: a.activity_id,
      contract: a.contract_number,
      type: a.activity_type,
      from: a.start_location_id,
      to: a.end_location_id,
      line: a.geometry.line,
      bound: a.geometry.bound,
      workload: a.work,
      priority: a.project.contract_priority,
      nature: a.project.nature_of_activity,
      access_type: a.project.access_type,
      start: a.planned_start_date,
      predecessor: a.predecessor_activity_id,
      occupied: a.geometry.occupied,
      closures: a.geometry.closed,
      buffers: a.geometry.envelope.filter((id) => !a.geometry.occupied.includes(id)),
    })),
  };
}
