import { parseCSV, csv, loadDataset, validatePlan } from './ps1.mjs';

export function changeSupply(files, location, capacity) {
  if (typeof location !== 'string' || !Number.isInteger(capacity) || capacity < 0 || capacity > 100)
    throw Error('Choose a location and an integer capacity from 0 to 100');
  const table = parseCSV(files['04_LOCATION_SUPPLY.csv']);
  const row = table.rows.find((r) => r.location_id === location);
  if (!row) throw Error('Unknown location');
  const before = Number(row.supply_capacity);
  row.supply_capacity = String(capacity);
  const next = { ...files, '04_LOCATION_SUPPLY.csv': csv(table.rows, table.header) };
  loadDataset(next);
  return {
    files: next,
    change: { location, before, after: capacity, scope: 'Every week (flat input supply)' },
  };
}

export function comparePlans(before, after) {
  const ids = new Set([...before.access, ...after.access].map((r) => r.activity_id));
  const changes = [];
  const pattern = (rows) =>
    rows
      .map((r) => `${r.week}:${r.eclo}`)
      .sort()
      .join(',');
  for (const id of ids) {
    const oldRows = before.access.filter((r) => r.activity_id === id),
      newRows = after.access.filter((r) => r.activity_id === id);
    if (pattern(oldRows) !== pattern(newRows))
      changes.push({
        activity_id: id,
        before_weeks: oldRows.map((r) => r.week).sort((a, b) => a - b),
        after_weeks: newRows.map((r) => r.week).sort((a, b) => a - b),
        before_eclo: oldRows.filter((r) => r.eclo).length,
        after_eclo: newRows.filter((r) => r.eclo).length,
      });
  }
  return {
    changed_activities: changes.length,
    unchanged_activities: ids.size - changes.length,
    changes,
    note: 'Change counts compare activity weeks and ECLO; possession labels and local night indices are excluded. Minimum churn is not guaranteed.',
  };
}

export function checkBaseline(files, scenario, baseline) {
  return validatePlan(loadDataset(files), scenario, baseline.access, baseline.occupancy);
}
