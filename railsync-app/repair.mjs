// Bounded deterministic neighbourhood search. Every accepted change is checked
// against the complete plan; never trade a hard violation for a lower penalty.
export function repairPlan(d, scenario, initial, validate, bound, maxChecks = 1500) {
  maxChecks = Math.min(
    maxChecks,
    Math.max(12, Math.floor(288000 / Math.max(1, initial.access.length))),
  );
  let best = initial,
    checks = 0,
    improvements = 0;
  const score = (r) => r.report.soft_scores.objective_score;
  const pressure = (report, occupancy) => {
    const hot = new Set(
      report.detail.capacity_hotspots.filter((x) => x.excess).map((x) => x.week + '|' + x.location),
    );
    return occupancy.filter((r) => hot.has(r.week + '|' + r.location_id)).length;
  };
  if (!best.report.feasible) return { result: best, checks, improvements };
  function consider(access, occupancy) {
    if (checks >= maxChecks) return false;
    const grouped = new Map();
    for (const r of access) {
      if (!grouped.has(r.activity_id)) grouped.set(r.activity_id, []);
      grouped.get(r.activity_id).push(r);
    }
    for (const rows of grouped.values())
      rows
        .sort((a, b) => a.week - b.week)
        .forEach((r, i) => {
          r.access_seq = i + 1;
        });
    access.sort((a, b) => a.week - b.week || a.activity_id.localeCompare(b.activity_id));
    const report = validate(d, scenario, access, occupancy);
    checks++;
    if (!report.feasible || report.soft_scores.objective_score > score(best) + 1e-8) return false;
    if (
      Math.abs(report.soft_scores.objective_score - score(best)) < 1e-8 &&
      pressure(report, occupancy) >= pressure(best.report, best.occupancy)
    )
      return false;
    best = { ...best, access, occupancy, report };
    improvements++;
    return true;
  }
  for (let pass = 0; pass < 4 && checks < maxChecks; pass++) {
    if (bound !== null && score(best) <= bound + 1e-8) break;
    let changed = false;
    // Removing redundant ECLO is a cheap, safe first neighbourhood.
    for (let i = 0; i < best.access.length && checks < maxChecks; i++)
      if (best.access[i].eclo) {
        const access = best.access.map((r) => ({ ...r }));
        access[i].eclo = 0;
        if (consider(access, best.occupancy)) changed = true;
      }
    const excess = new Set(
      best.report.detail.capacity_hotspots
        .filter((x) => x.excess)
        .map((x) => x.week + '|' + x.location),
    );
    const targets = best.access
      .filter((r) => {
        const a = d.am.get(r.activity_id);
        return (
          a.geometry.occupied.some((id) => excess.has(r.week + '|' + id)) ||
          d.start + r.week * 7 - 1 > a.project.deadline
        );
      })
      .sort((a, b) => b.week - a.week || a.activity_id.localeCompare(b.activity_id));
    for (const target of targets) {
      if (checks >= maxChecks || (bound !== null && score(best) <= bound + 1e-8)) break;
      const current = best.access.find(
        (r) => r.activity_id === target.activity_id && r.week === target.week,
      );
      if (!current) continue;
      const a = d.am.get(target.activity_id),
        own = best.access.filter((r) => r.activity_id === a.activity_id);
      const predecessor = best.access.filter((r) => r.activity_id === a.predecessor_activity_id);
      const first = Math.max(a.earliest, 1 + Math.max(0, ...predecessor.map((r) => r.week)));
      const successors = d.activities
        .filter((x) => x.predecessor_activity_id === a.activity_id)
        .map((x) => x.activity_id);
      const successorRows = best.access.filter((r) => successors.includes(r.activity_id));
      const last = Math.min(
        scenario === 'B' ? Math.floor((a.project.deadline - d.start + 1) / 7) : target.week,
        successorRows.length ? Math.min(...successorRows.map((r) => r.week)) - 1 : 1040,
      );
      let accepted = false;
      for (let week = first; week <= last && !accepted && checks < maxChecks; week++) {
        if (week !== target.week && own.some((r) => r.week === week)) continue;
        const peers = best.access.filter((r) => r.week === week && r !== current),
          counts = Array(a.project.cap).fill(0);
        for (const r of peers) {
          const p = d.am.get(r.activity_id);
          if (p.contract_number === a.contract_number && p.activity_type === a.activity_type)
            counts[r.access_night - 1]++;
        }
        const night = counts.findIndex((n) => n < a.project.fronts);
        if (night < 0) continue;
        const labels = [
          ...new Set(best.occupancy.filter((r) => r.week === week).map((r) => r.co_share_group)),
        ];
        let fresh = 'repair';
        while (labels.includes(fresh)) fresh += 'x';
        labels.push(fresh);
        for (const label of labels) {
          const access = best.access.map((r) =>
            r === current ? { ...r, week, access_night: night + 1 } : { ...r },
          );
          const occupancy = best.occupancy
            .filter((r) => !(r.activity_id === a.activity_id && r.week === target.week))
            .concat(
              a.geometry.occupied.map((location_id) => ({
                activity_id: a.activity_id,
                week,
                location_id,
                co_share_group: label,
              })),
            );
          if (consider(access, occupancy)) {
            accepted = true;
            changed = true;
            break;
          }
          if (checks >= maxChecks) break;
        }
      }
    }
    if (!changed) break;
  }
  return { result: best, checks, improvements };
}
