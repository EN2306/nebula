import { randomUUID, createHash } from 'node:crypto';
export const ROLES = ['scheduler', 'supervisor', 'manager', 'worker'];
export const planFingerprint = (plan) =>
  createHash('sha256')
    .update(JSON.stringify(plan || null))
    .digest('hex');
const fail = (status, message) => {
  throw Object.assign(Error(message), { status });
};
const text = (v, name, max = 2000) => {
  if (typeof v !== 'string' || !v.trim() || v.length > max)
    fail(400, `${name} is required (up to ${max} characters).`);
  return v.trim();
};
const date = (v) => {
  if (
    typeof v !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    !Number.isFinite(Date.parse(v)) ||
    new Date(v).toISOString().slice(0, 10) !== v
  )
    fail(400, 'Choose a valid date.');
  return v;
};

export function operations(db, psGet, describePlan, auditEvent) {
  db.exec(
    'CREATE TABLE IF NOT EXISTS team_operations(id INTEGER PRIMARY KEY CHECK(id=1),body TEXT NOT NULL)',
  );
  db.prepare('INSERT OR IGNORE INTO team_operations VALUES(1,?)').run(
    JSON.stringify({ version: 0, issues: [], assignments: [], decisions: [] }),
  );
  const get = () =>
    JSON.parse(db.prepare('SELECT body FROM team_operations WHERE id=1').get().body);
  const users = () =>
    db
      .prepare('SELECT id,name,email,role FROM users')
      .all()
      .filter((u) => ROLES.includes(u.role));
  return function handle(route, method, b, u) {
    if (!route.startsWith('/api/team/')) return null;
    if (!ROLES.includes(u.role)) fail(403, 'This account has no team access.');
    const s = get(),
      ps = psGet();
    const requireRole = (...roles) => {
      if (!roles.includes(u.role)) fail(403, 'Your role cannot perform this action.');
    };
    const activeDecision = (d) =>
      d.dataset_version === ps.version && d.fingerprint === planFingerprint(ps.results[d.scenario]);
    if (route === '/api/team/state' && method === 'GET') {
      const people = users();
      const issues = s.issues.filter(
        (x) => ['manager', 'supervisor'].includes(u.role) || x.worker_id === u.id,
      );
      const assignments = s.assignments
        .filter((x) => u.role !== 'worker' || x.worker_id === u.id)
        .map((x) => ({
          ...x,
          stale:
            x.status === 'assigned' &&
            (x.dataset_version !== ps.version ||
              x.fingerprint !== planFingerprint(ps.results[x.scenario])),
        }));
      return {
        status: 200,
        data: {
          version: s.version,
          issues,
          assignments,
          decisions: ['scheduler', 'supervisor'].includes(u.role)
            ? s.decisions.map((d) => ({ ...d, stale: !activeDecision(d) }))
            : [],
          people: u.role === 'worker' ? people.filter((x) => x.id === u.id) : people,
          penalties: people
            .filter(
              (x) =>
                x.role === 'worker' &&
                (['manager', 'supervisor'].includes(u.role) || x.id === u.id),
            )
            .map((x) => ({
              worker_id: x.id,
              name: x.name,
              points: s.issues
                .filter((i) => i.worker_id === x.id && i.status === 'reviewed')
                .reduce((n, i) => n + i.points, 0),
            })),
          programme: u.role === 'worker' ? null : describePlan(ps),
          // Planners receive availability only, never private absence explanations or penalty details.
          availability: ['manager', 'scheduler', 'supervisor'].includes(u.role)
            ? s.issues
                .filter((x) => x.type === 'absence' && x.status !== 'withdrawn')
                .map((x) => ({
                  worker_id: x.worker_id,
                  name: x.worker_name,
                  date: x.date,
                  status: x.status,
                }))
            : [],
        },
      };
    }
    if (method !== 'POST') fail(404, 'Unknown team action.');
    if (b.version !== s.version) fail(409, 'The team workspace changed. Refresh and try again.');
    let action, detail, data;
    if (route === '/api/team/issues') {
      requireRole('worker');
      if (!['absence', 'safety', 'equipment', 'other'].includes(b.type))
        fail(400, 'Choose an issue type.');
      const day = date(b.date),
        description = text(b.description, 'Issue description');
      if (
        b.type === 'absence' &&
        s.issues.some(
          (x) =>
            x.worker_id === u.id &&
            x.date === day &&
            x.type === 'absence' &&
            x.status !== 'withdrawn',
        )
      )
        fail(409, 'You already reported an absence for this date.');
      const assignment = b.assignment_id
        ? s.assignments.find((x) => x.id === b.assignment_id && x.worker_id === u.id)
        : null;
      if (b.assignment_id && !assignment) fail(400, 'Choose one of your assignments.');
      data = {
        id: randomUUID(),
        worker_id: u.id,
        worker_name: u.name,
        type: b.type,
        date: day,
        description,
        assignment_id: assignment?.id || null,
        status: 'pending',
        points: 0,
        created_at: new Date().toISOString(),
      };
      s.issues.unshift(data);
      action = 'Worker issue reported';
      detail = `${u.name}: ${b.type} on ${day}`;
    } else if (route === '/api/team/review') {
      requireRole('manager');
      data = s.issues.find((x) => x.id === b.id);
      if (!data) fail(404, 'Issue not found.');
      if (data.status !== 'pending') fail(409, 'This issue has already been reviewed.');
      if (!Number.isInteger(b.points) || b.points < 0 || b.points > 10)
        fail(400, 'Penalty points must be a whole number from 0 to 10.');
      Object.assign(data, {
        status: 'reviewed',
        points: b.points,
        decision: text(b.decision, 'Review reason'),
        reviewer: u.name,
        reviewed_at: new Date().toISOString(),
      });
      action = 'Worker issue reviewed';
      detail = `${data.worker_name}: manager review recorded`;
    } else if (route === '/api/team/assign') {
      requireRole('manager');
      const worker = users().find((x) => x.id === b.worker_id && x.role === 'worker');
      const programme = describePlan(ps),
        plan = ps.results[b.scenario];
      const job = programme?.summary?.jobs.find((x) => x.id === b.activity_id);
      const day = date(b.date);
      if (!worker || !job || !plan?.report.feasible)
        fail(400, 'Choose a worker and an activity from a feasible saved plan.');
      const week =
        Math.floor((Date.parse(day) - Date.parse(programme.summary.horizon_start)) / 604800000) + 1;
      if (!plan.access.some((x) => x.activity_id === job.id && x.week === week))
        fail(400, 'This activity is not scheduled in the selected date’s week.');
      if (
        s.issues.some(
          (x) =>
            x.worker_id === worker.id &&
            x.date === day &&
            x.type === 'absence' &&
            x.status !== 'withdrawn',
        )
      )
        fail(409, 'This worker has reported an absence on that date. Choose a replacement.');
      if (
        s.assignments.some(
          (x) => x.worker_id === worker.id && x.date === day && x.status === 'assigned',
        )
      )
        fail(409, 'This worker already has an assignment on that date.');
      data = {
        id: randomUUID(),
        worker_id: worker.id,
        worker_name: worker.name,
        activity_id: job.id,
        title: job.type,
        scenario: b.scenario,
        date: day,
        week,
        location: job.from + ' → ' + job.to,
        notes: typeof b.notes === 'string' ? b.notes.trim().slice(0, 2000) : '',
        status: 'assigned',
        dataset_version: ps.version,
        fingerprint: planFingerprint(plan),
        assigned_by: u.name,
      };
      s.assignments.unshift(data);
      action = 'Worker assigned';
      detail = `${worker.name}: ${job.id} on ${day}`;
    } else if (route === '/api/team/complete-assignment') {
      requireRole('worker');
      data = s.assignments.find((x) => x.id === b.id && x.worker_id === u.id);
      if (!data || data.status !== 'assigned') fail(409, 'Assignment is no longer active.');
      if (
        data.dataset_version !== ps.version ||
        data.fingerprint !== planFingerprint(ps.results[data.scenario])
      )
        fail(409, 'The plan changed. Ask your manager to confirm this assignment.');
      data.status = 'completed';
      data.completed_at = new Date().toISOString();
      action = 'Worker task completed';
      detail = `${u.name}: ${data.activity_id}`;
    } else if (route === '/api/team/cancel-assignment') {
      requireRole('manager');
      data = s.assignments.find((x) => x.id === b.id);
      if (!data || data.status !== 'assigned') fail(409, 'Assignment is no longer active.');
      data.status = 'cancelled';
      data.cancel_reason = text(b.reason, 'Cancellation reason');
      action = 'Assignment cancelled';
      detail = `${data.worker_name}: ${data.activity_id}`;
    } else if (route === '/api/team/escalate') {
      requireRole('scheduler');
      const plan = ps.results[b.scenario];
      if (!plan) fail(400, 'Build the selected scenario first.');
      data = {
        id: randomUUID(),
        urgent: true,
        title: text(b.title, 'Emergency title', 150),
        question: text(b.question, 'Decision needed'),
        scenario: b.scenario,
        dataset_version: ps.version,
        fingerprint: planFingerprint(plan),
        summary: {
          feasible: plan.report.feasible,
          score: plan.report.soft_scores.objective_score,
          issues: plan.report.hard_violations.slice(0, 10),
        },
        status: 'pending',
        planner: u.name,
        created_at: new Date().toISOString(),
      };
      s.decisions.unshift(data);
      action = 'Decision sent to supervisor';
      detail = data.title;
    } else if (route === '/api/team/decide') {
      requireRole('supervisor');
      data = s.decisions.find((x) => x.id === b.id);
      if (!data || data.status !== 'pending') fail(409, 'This decision is no longer pending.');
      if (!activeDecision(data))
        fail(409, 'The schedule changed. Ask the planner to submit a new decision request.');
      if (!['approved', 'rejected', 'changes_requested'].includes(b.status))
        fail(400, 'Choose a decision.');
      if (b.status === 'approved' && !ps.results[data.scenario]?.report.feasible)
        fail(422, 'A plan with hard rule violations cannot be approved. Request changes instead.');
      Object.assign(data, {
        status: b.status,
        decision: text(b.decision, 'Decision reason'),
        supervisor: u.name,
        decided_at: new Date().toISOString(),
      });
      action = 'Supervisor decision recorded';
      detail = `${data.title}: ${b.status}`;
    } else fail(404, 'Unknown team action.');
    // Single synchronous transaction: prevent duplicate reviews and preserve history.
    db.exec('BEGIN IMMEDIATE');
    try {
      if (get().version !== s.version)
        fail(409, 'The team workspace changed. Refresh and try again.');
      s.version++;
      db.prepare('UPDATE team_operations SET body=? WHERE id=1').run(JSON.stringify(s));
      auditEvent(u, action, detail);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return { status: 200, data: { ...data, version: s.version } };
  };
}
