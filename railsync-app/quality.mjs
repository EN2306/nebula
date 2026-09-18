// A capacity-relaxed lower bound, not an official-validator certificate.
// Removing capacity, workfront and sharing constraints can only reduce cost.
export function lowerBound(dataset, scenario) {
  const fastest = new Map();
  const weight = (a) =>
    ({ 1: 100, 2: 10, 3: 1 })[a.project.contract_priority] *
    (1 + { 1: 0.3, 2: 0.2, 3: 0 }[a.activity_priority]);
  function choices(a) {
    const max = scenario === 'A' ? 0 : scenario === 'C' ? Math.min(2, a.work) : a.work;
    return Array.from({ length: max + 1 }, (_, eclo) => ({
      eclo,
      nights: Math.max(eclo, Math.ceil(a.work - eclo * 0.5)),
    }));
  }
  function earliest(a) {
    if (fastest.has(a.activity_id)) return fastest.get(a.activity_id);
    const start = Math.max(
      a.earliest,
      a.predecessor_activity_id ? earliest(dataset.am.get(a.predecessor_activity_id)) + 1 : 1,
    );
    const end = start + Math.min(...choices(a).map((c) => c.nights)) - 1;
    fastest.set(a.activity_id, end);
    return end;
  }
  let bound = 0;
  const activities = [];
  for (const a of dataset.activities) {
    const start = Math.max(
      a.earliest,
      a.predecessor_activity_id ? earliest(dataset.am.get(a.predecessor_activity_id)) + 1 : 1,
    );
    let best = Infinity;
    for (const { eclo, nights } of choices(a)) {
      const late = Math.max(0, dataset.start + (start + nights - 1) * 7 - 1 - a.project.deadline);
      if (scenario === 'B' && late) continue;
      best = Math.min(best, (scenario === 'B' ? 0 : late * weight(a)) + 5 * eclo);
    }
    if (!Number.isFinite(best))
      return {
        score: null,
        impossible_activity: a.activity_id,
        note: 'Even without capacity or workfront limits, this activity cannot meet its target.',
      };
    bound += best;
    if (best)
      activities.push({ activity_id: a.activity_id, minimum_penalty: Math.round(best * 10) / 10 });
  }
  return {
    score: Math.round(bound * 10) / 10,
    activities,
    note: 'Lower bound under the app’s weekly model, relaxing capacity, sharing, workfront limits and shared ECLO windows. Not official validation.',
  };
}
