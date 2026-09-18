export function explainPlan(d, result) {
  const rowsByActivity = new Map(
    d.activities.map((a) => [
      a.activity_id,
      result.access.filter((r) => r.activity_id === a.activity_id).sort((a, b) => a.week - b.week),
    ]),
  );
  return result.explanations.map((previous) => {
    const a = d.am.get(previous.activity_id),
      rows = rowsByActivity.get(a.activity_id);
    const predecessorRows = rowsByActivity.get(a.predecessor_activity_id) || [];
    const predecessorFinish = predecessorRows.at(-1)?.week ?? null;
    const earliest = Math.max(a.earliest, predecessorFinish === null ? 1 : predecessorFinish + 1);
    const finish = rows.at(-1)?.week ?? null;
    const late =
      finish === null ? null : Math.max(0, d.start + finish * 7 - 1 - a.project.deadline);
    const cost =
      late === null
        ? null
        : Math.round(
            late *
              { 1: 100, 2: 10, 3: 1 }[a.project.contract_priority] *
              (1 + { 1: 0.3, 2: 0.2, 3: 0 }[a.activity_priority]) *
              10,
          ) / 10;
    const bookings = result.occupancy.filter((r) => r.activity_id === a.activity_id);
    const keys = new Set(bookings.map((r) => `${r.week}|${r.location_id}|${r.co_share_group}`));
    const sharing = [
      ...new Set(
        result.occupancy
          .filter(
            (r) =>
              r.activity_id !== a.activity_id &&
              keys.has(`${r.week}|${r.location_id}|${r.co_share_group}`),
          )
          .map((r) => r.activity_id),
      ),
    ];
    const messages = [
      `Requires ${a.work} work units; ${rows.reduce((n, r) => n + (r.eclo ? 1.5 : 1), 0)} scheduled across ${rows.length} weeks.`,
    ];
    if (a.predecessor_activity_id)
      messages.push(
        `${a.predecessor_activity_id} ${predecessorFinish === null ? 'has not completed' : `finishes in week ${predecessorFinish}; this activity must start in week ${earliest} or later`}.`,
      );
    else messages.push(`Input start date permits week ${a.earliest} or later.`);
    if (late)
      messages.push(
        `Finishes ${late} days beyond target; contributes ${result.scenario === 'B' ? 'a hard deadline violation' : cost + ' delay penalty points'}.`,
      );
    else if (finish !== null) messages.push('Finishes within the planned target.');
    if (sharing.length)
      messages.push(`Shares at least one booked location/night with ${sharing.join(', ')}.`);
    return {
      ...previous,
      first_week: rows[0]?.week ?? null,
      last_week: finish,
      evidence: messages,
      sharing_with: sharing,
      delay_days: late,
      delay_penalty: cost,
      predecessor_finish_week: predecessorFinish,
    };
  });
}
