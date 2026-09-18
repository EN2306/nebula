const priorityWeight = { 1: 100, 2: 10, 3: 1 };

export function buildInsights(dataset, result) {
  const report = result.report;
  const activities = new Map(dataset.activities.map((a) => [a.activity_id, a]));
  const accessByActivity = new Map();
  for (const row of result.access) {
    if (!accessByActivity.has(row.activity_id)) accessByActivity.set(row.activity_id, []);
    accessByActivity.get(row.activity_id).push(row);
  }
  const hotspots = (report.detail.capacity_hotspots || [])
    .filter((hotspot) => hotspot.used >= hotspot.capacity)
    .sort((a, b) => b.excess - a.excess || b.used - a.used)
    .slice(0, 20)
    .map((hotspot) => ({
      ...hotspot,
      affected_activities: [
        ...new Set(
          result.occupancy
            .filter((row) => row.week === hotspot.week && row.location_id === hotspot.location)
            .map((row) => row.activity_id),
        ),
      ],
    }));
  const activityRisk = dataset.activities
    .map((activity) => {
      const rows = accessByActivity.get(activity.activity_id) || [];
      const finish = Math.max(0, ...rows.map((row) => row.week));
      const delayDays = Math.max(0, dataset.start + finish * 7 - 1 - activity.project.deadline);
      const affectedHotspots = hotspots.filter((hotspot) =>
        hotspot.affected_activities.includes(activity.activity_id),
      );
      const score =
        delayDays * priorityWeight[activity.project.contract_priority] +
        affectedHotspots.length * 5;
      return {
        activity_id: activity.activity_id,
        contract: activity.contract_number,
        priority: activity.project.contract_priority,
        finish_week: finish || null,
        delay_days: delayDays,
        score,
        predecessor: activity.predecessor_activity_id || null,
        hotspots: affectedHotspots.length,
      };
    })
    .filter((activity) => activity.score > 0)
    .sort((a, b) => b.score - a.score || a.activity_id.localeCompare(b.activity_id))
    .slice(0, 20);
  const contracts = [...new Set(dataset.activities.map((activity) => activity.contract_number))]
    .map((contract) => {
      const rows = activityRisk.filter((activity) => activity.contract === contract);
      const project = dataset.projects.find((candidate) => candidate.contract_number === contract);
      return {
        contract,
        description: project?.contract_description,
        priority: project?.contract_priority,
        delayed_activities: rows.length,
        delay_days: rows.reduce((sum, row) => sum + row.delay_days, 0),
        risk_score: rows.reduce((sum, row) => sum + row.score, 0),
      };
    })
    .filter((contract) => contract.risk_score > 0)
    .sort((a, b) => b.risk_score - a.risk_score);
  const negotiation = hotspots
    .filter((hotspot) => hotspot.excess > 0)
    .slice(0, 10)
    .map((hotspot) => ({
      location: hotspot.location,
      week: hotspot.week,
      current_capacity: hotspot.capacity,
      requested_capacity: hotspot.used,
      additional_slots: hotspot.excess,
      affected_activities: hotspot.affected_activities,
      request: `Request ${hotspot.excess} additional slot${hotspot.excess === 1 ? '' : 's'} at ${hotspot.location} for week ${hotspot.week}.`,
    }));
  return {
    scenario: result.scenario,
    generated_at: new Date().toISOString(),
    overview: {
      feasible: report.feasible,
      completed: `${report.complete_activities}/${report.total_activities}`,
      objective_score: report.soft_scores.objective_score,
      delay_days: report.soft_scores.overrun_days_total,
      extra_slots: report.soft_scores.excess_access_nights_total,
      eclo_nights: report.soft_scores.eclo_nights_total,
    },
    fragile_locations: hotspots,
    priority_risks: activityRisk,
    contractor_risks: contracts,
    negotiation,
    handover: contracts.length
      ? `Scenario ${result.scenario} is ${report.feasible ? 'internally feasible' : 'not feasible'} with ${report.soft_scores.overrun_days_total} delay days. Prioritise ${contracts
          .slice(0, 3)
          .map((contract) => contract.contract)
          .join(
            ', ',
          )} and review the listed constrained locations before the next possession meeting.`
      : `Scenario ${result.scenario} is ${report.feasible ? 'internally feasible' : 'not feasible'} with no scored priority delay risk in the current result.`,
    note: 'Heuristic decision support from the imported schedule. It does not predict failures, approve access or replace official validation.',
  };
}
