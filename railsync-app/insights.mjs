const priorityWeight = { 1: 100, 2: 10, 3: 1 };

export function buildInsights(dataset, result) {
  const report = result.report;
  const accessByActivity = new Map();
  for (const row of result.access) {
    if (!accessByActivity.has(row.activity_id)) accessByActivity.set(row.activity_id, []);
    accessByActivity.get(row.activity_id).push(row);
  }
  const hotspots = (report.detail.capacity_hotspots || [])
    .filter((hotspot) => hotspot.used >= hotspot.capacity)
    .sort((a, b) => b.excess - a.excess || b.used - a.used)
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
  const deadlineWatch = dataset.activities
    .map((activity) => {
      const rows = accessByActivity.get(activity.activity_id) || [];
      const delivered = rows.reduce((sum, row) => sum + (row.eclo ? 1.5 : 1), 0);
      const completed = delivered >= activity.work;
      const finish = completed ? Math.max(0, ...rows.map((row) => row.week)) : null;
      const slackDays = completed
        ? activity.project.deadline - (dataset.start + finish * 7 - 1)
        : null;
      const delayDays = completed ? Math.max(0, -slackDays) : null;
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
        line: activity.geometry.line,
        completed,
        remaining_work: Math.max(0, activity.work - delivered),
        target_date: activity.project.planned_completion_date,
        slack_days: slackDays,
        status: !completed
          ? 'incomplete'
          : delayDays > 0
            ? 'late'
            : slackDays < 7
              ? 'tight'
              : 'on_track',
        finish_week: finish || null,
        delay_days: delayDays,
        score,
        predecessor: activity.predecessor_activity_id || null,
        hotspots: affectedHotspots.length,
      };
    })
    .sort(
      (a, b) =>
        Number(a.completed) - Number(b.completed) ||
        b.score - a.score ||
        (a.slack_days ?? 0) - (b.slack_days ?? 0) ||
        a.activity_id.localeCompare(b.activity_id),
    );
  const activityRisk = deadlineWatch.filter(
    (activity) => !activity.completed || activity.score > 0,
  );
  const contracts = [...new Set(dataset.activities.map((activity) => activity.contract_number))]
    .map((contract) => {
      const rows = deadlineWatch.filter((activity) => activity.contract === contract);
      const project = dataset.projects.find((candidate) => candidate.contract_number === contract);
      return {
        contract,
        description: project?.contract_description,
        priority: project?.contract_priority,
        delayed_activities: rows.filter((row) => row.delay_days > 0).length,
        incomplete_activities: rows.filter((row) => !row.completed).length,
        delay_days:
          report.results?.find((row) => row.contract_number === contract)?.overrun_days ?? 0,
        risk_score: rows.reduce((sum, row) => sum + row.score, 0),
      };
    })
    .filter((contract) => contract.incomplete_activities || contract.risk_score > 0)
    .sort(
      (a, b) => b.incomplete_activities - a.incomplete_activities || b.risk_score - a.risk_score,
    );
  const negotiation = hotspots
    .filter((hotspot) => hotspot.excess > 0)
    .map((hotspot) => ({
      location: hotspot.location,
      week: hotspot.week,
      current_capacity: hotspot.capacity,
      requested_capacity: hotspot.used,
      additional_slots: hotspot.excess,
      affected_activities: hotspot.affected_activities,
      request: `Request ${hotspot.excess} additional slot${hotspot.excess === 1 ? '' : 's'} at ${hotspot.location} for week ${hotspot.week}.`,
    }));
  const weeks = Array.from(
    { length: Math.max(dataset.horizon, report.detail.last_week || 0) },
    (_, index) => {
      const week = index + 1;
      const rows = result.access.filter((row) => row.week === week);
      return {
        week,
        bookings: rows.length,
        eclo: rows.filter((row) => row.eclo).length,
        activities: [...new Set(rows.map((row) => row.activity_id))],
        finishing: deadlineWatch.filter((row) => row.completed && row.finish_week === week).length,
        constrained_locations: hotspots.filter((row) => row.week === week).length,
      };
    },
  );
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
      incomplete_activities: deadlineWatch.filter((row) => !row.completed).length,
      late_activities: deadlineWatch.filter((row) => row.status === 'late').length,
      tight_activities: deadlineWatch.filter((row) => row.status === 'tight').length,
    },
    fragile_locations: hotspots,
    priority_risks: activityRisk,
    contractor_risks: contracts,
    deadline_watch: deadlineWatch,
    weeks,
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
