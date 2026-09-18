// Collect actionable cell errors before constructing the scheduling model.
export function inspectRows(tables, names) {
  const issues = [];
  const add = (i, row, column, message) =>
    issues.push(
      `${names[i]} · row ${tables[i].rowNumbers?.[row] ?? row + 2} · ${column}: ${message}`,
    );
  const numeric = {
    1: { seq: [1, 10000], is_interchange: [0, 1] },
    2: { seq: [1, 10000], is_shared: [0, 1] },
    3: { supply_capacity: [0, 100] },
    4: { up_to_buffer_sectors: [0, 20], opposite_bound_required: [0, 1] },
    6: {
      contract_priority: [1, 3],
      number_of_workfronts: [1, 20],
      number_of_maximum_access_per_week: [1, 7],
    },
    7: { total_accesses: [1, 100], activity_priority: [1, 3] },
  };
  const keys = [
    ['line_code'],
    ['line_code', 'station_id'],
    ['sector_id'],
    ['location_id'],
    ['nature_of_works'],
    ['key'],
    ['contract_number', 'activity_type'],
    ['activity_id'],
  ];
  const validDate = (v) =>
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    Number.isFinite(Date.parse(v)) &&
    new Date(v).toISOString().slice(0, 10) === v;
  for (const [i, table] of tables.entries()) {
    if (!table.rows.length)
      issues.push(`${names[i]}: no data rows. Add at least one record below the header.`);
    const seen = new Map();
    table.rows.forEach((r, row) => {
      for (const col of table.header) {
        if (!r[col] && col !== 'predecessor_activity_id')
          add(i, row, col, 'required value is missing.');
        else if (numeric[i]?.[col]) {
          const [min, max] = numeric[i][col];
          if (!/^\d+$/.test(r[col]) || +r[col] < min || +r[col] > max)
            add(
              i,
              row,
              col,
              `expected a whole number from ${min} to ${max}; received “${r[col]}”.`,
            );
        } else if (col.endsWith('_date') && !validDate(r[col]))
          add(i, row, col, `expected a real date in YYYY-MM-DD format; received “${r[col]}”.`);
      }
      const key = keys[i].map((k) => r[k]).join('|');
      if (seen.has(key))
        add(
          i,
          row,
          keys[i].join(' + '),
          `duplicate identifier; first used at row ${seen.get(key) + 2}.`,
        );
      seen.set(key, row);
      if (i === 3) {
        if (!['EB', 'WB'].includes(r.bound)) add(i, row, 'bound', 'use EB or WB.');
        if (!['SEC', 'PLAT', 'tunnel sector', 'platform sector'].includes(r.location_kind))
          add(i, row, 'location_kind', 'use SEC / tunnel sector or PLAT / platform sector.');
      }
      if (i === 6 && !['PM', 'PC', 'C'].includes(r.access_type))
        add(i, row, 'access_type', 'use PM, PC or C.');
      if (i === 7 && !/^[A-Za-z0-9_.-]+$/.test(r.activity_id))
        add(i, row, 'activity_id', 'use letters, digits, dots, hyphens or underscores.');
    });
  }
  const has = (i, predicate) => tables[i].rows.some(predicate);
  tables[1].rows.forEach((r, row) => {
    if (!has(0, (x) => x.line_code === r.line_code))
      add(1, row, 'line_code', 'does not exist in 01_LINES.csv.');
  });
  tables[2].rows.forEach((r, row) => {
    for (const col of ['from_station_id', 'to_station_id'])
      if (!has(1, (x) => x.station_id === r[col] && x.line_code === r.line_code))
        add(2, row, col, 'station does not exist on this line in 02_STATIONS.csv.');
  });
  tables[6].rows.forEach((r, row) => {
    if (!has(4, (x) => x.nature_of_works === r.nature_of_activity))
      add(6, row, 'nature_of_activity', 'does not match a work nature in 05_BUFFER_LOCATION.csv.');
  });
  tables[7].rows.forEach((r, row) => {
    if (
      !has(6, (x) => x.contract_number === r.contract_number && x.activity_type === r.activity_type)
    )
      add(
        7,
        row,
        'contract_number + activity_type',
        'does not match a project in 07_PROJECT_DETAILS.csv.',
      );
    for (const col of ['start_location_id', 'end_location_id'])
      if (!has(3, (x) => x.location_id === r[col]))
        add(7, row, col, 'does not exist in 04_LOCATION_SUPPLY.csv.');
    if (r.predecessor_activity_id && !has(7, (x) => x.activity_id === r.predecessor_activity_id))
      add(7, row, 'predecessor_activity_id', 'does not exist in this activity file.');
    const visited = new Set([r.activity_id]);
    let prev = r.predecessor_activity_id;
    while (prev) {
      if (visited.has(prev)) {
        add(7, row, 'predecessor_activity_id', 'creates a circular dependency.');
        break;
      }
      visited.add(prev);
      prev = tables[7].rows.find((x) => x.activity_id === prev)?.predecessor_activity_id;
    }
  });
  for (const key of ['horizon_start', 'horizon_weeks'])
    if (!has(5, (x) => x.key === key))
      issues.push(`${names[5]} · key: missing required parameter “${key}”.`);
  tables[5].rows.forEach((r, row) => {
    if (r.key === 'horizon_start' && (!validDate(r.value) || new Date(r.value).getUTCDay() !== 1))
      add(5, row, 'value', 'horizon_start must be a Monday in YYYY-MM-DD format.');
    if (r.key === 'horizon_weeks' && (!/^\d+$/.test(r.value) || +r.value < 1 || +r.value > 260))
      add(5, row, 'value', 'horizon_weeks must be a whole number from 1 to 260.');
  });
  return issues
    .slice(0, 200)
    .concat(
      issues.length > 200
        ? ['More than 200 issues found. Fix the listed issues and upload again.']
        : [],
    );
}
