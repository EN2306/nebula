import http from 'node:http';
import { runSolver } from './worker-runner.mjs';
import { changeSupply, comparePlans, checkBaseline } from './what-if.mjs';
import { buildInsights } from './insights.mjs';
import {
  FILES,
  INPUT_SCHEMA,
  inspectInputFiles,
  loadDataset,
  describe,
  exportsFor,
  validatePlan,
} from './ps1.mjs';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { callAI, chatSystem } from './ai.mjs';
import { deploymentConfig, requestOrigin } from './deployment.mjs';
import { operations, ROLES, planFingerprint } from './operations.mjs';
import { planningModel } from './schedule-edit.mjs';
import { scheduleRoutes } from './schedule-routes.mjs';
const base = path.dirname(fileURLToPath(import.meta.url));
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const text = (v, name, max = 200) => {
  if (typeof v !== 'string' || !v.trim() || v.length > max)
    fail(400, `${name} is required (up to ${max} characters).`);
  return v.trim();
};
const choice = (v, values, name) => {
  if (!values.includes(v)) fail(400, `Invalid ${name}.`);
  return v;
};
const digest = (s) => createHash('sha256').update(s).digest('hex');
const hash = (p) => {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(p, salt, 64).toString('hex');
};
function verify(p, h) {
  const [salt, key] = h.split(':');
  return timingSafeEqual(scryptSync(p, salt, 64), Buffer.from(key, 'hex'));
}
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });
export function createApp({
  dbPath = process.env.RAILSYNC_DB || path.join(base, 'data', 'railsync.sqlite'),
  fetcher = fetch,
  publicOrigin = process.env.RAILSYNC_PUBLIC_ORIGIN || '',
  setupToken = process.env.RAILSYNC_SETUP_TOKEN || '',
  additionalOrigins = [],
  ephemeral = false,
} = {}) {
  const deployment = deploymentConfig(publicOrigin);
  deployment.alternatives = additionalOrigins.map((origin) => deploymentConfig(origin));
  if (dbPath !== ':memory:') mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL,team_id TEXT);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),csrf TEXT,expires INTEGER);
 CREATE TABLE IF NOT EXISTS ps1_workspace(id INTEGER PRIMARY KEY CHECK(id=1),body TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS planning_workspace(id INTEGER PRIMARY KEY CHECK(id=1),body TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS planning_messages(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT,scenario TEXT,dataset_version INTEGER,role TEXT,content TEXT,created TEXT);`);
  // Keep historical track-planning events without importing the retired crew workflow.
  if (!db.prepare('SELECT id FROM planning_workspace WHERE id=1').get()) {
    const legacyTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workspace'")
      .get();
    const legacy = legacyTable ? db.prepare('SELECT body FROM workspace WHERE id=1').get() : null;
    const events = legacy ? JSON.parse(legacy.body).events || [] : [];
    const retained = events
      .filter((e) => ['PS1 dataset imported', 'PS1 scenario generated'].includes(e.action))
      .map((e) => ({
        ...e,
        action: e.action === 'PS1 dataset imported' ? 'Dataset imported' : 'Plan built',
      }));
    db.prepare('INSERT INTO planning_workspace VALUES(1,?)').run(
      JSON.stringify({ version: 0, events: retained }),
    );
  }
  const psGet = () => {
    const row = db.prepare('SELECT body FROM ps1_workspace WHERE id=1').get();
    return row ? JSON.parse(row.body) : { version: 0, files: null, results: {} };
  };
  const psSave = (s) =>
    db
      .prepare(
        'INSERT INTO ps1_workspace VALUES(1,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body',
      )
      .run(JSON.stringify(s));
  const psView = (s) => ({
    version: s.version,
    source: s.source,
    summary: s.files ? describe(loadDataset(s.files)) : null,
    results: s.results,
    plan_tokens: Object.fromEntries(
      Object.entries(s.results).map(([key, value]) => [key, planFingerprint(value)]),
    ),
  });
  const sessionCookie = 'railsync_session';
  let psBusy = false;
  const get = () => {
    const row = db.prepare('SELECT body FROM planning_workspace WHERE id=1').get();
    return row ? JSON.parse(row.body) : { version: 0, events: [] };
  };
  const save = (s) => {
    s.version++;
    db.prepare(
      'INSERT INTO planning_workspace VALUES(1,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body',
    ).run(JSON.stringify(s));
  };
  const audit = (s, u, action, jobId, detail) =>
    s.events.push({
      id: randomUUID(),
      at: new Date().toISOString(),
      actor: u.name,
      actorId: u.id,
      action,
      jobId,
      detail,
    });
  const view = (s, u) => ({
    version: s.version,
    events: ['scheduler', 'supervisor'].includes(u.role) ? s.events.slice(-100).reverse() : [],
    users: ['scheduler', 'supervisor', 'manager'].includes(u.role)
      ? db
          .prepare(
            "SELECT id,name,email,role FROM users WHERE role IN ('scheduler','supervisor','manager','worker')",
          )
          .all()
          .map(publicUser)
      : [],
    ai: {
      configured: !!config.key,
      provider: config.provider,
      model: config.model,
      verified: config.verified,
    },
    user: publicUser(u),
  });
  let config = {
    provider: process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY ? 'anthropic' : 'openai',
    key: process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || '',
    model:
      process.env.RAILSYNC_MODEL ||
      (process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY
        ? 'claude-sonnet-4-6'
        : 'gpt-4.1-mini'),
    verified: false,
  };
  const auditAction = (u, action, detail) => {
    const s = get();
    audit(s, u, action, null, detail);
    save(s);
  };
  const team = operations(db, psGet, psView, auditAction);
  const edits = scheduleRoutes({
    psGet,
    psSave,
    psView,
    auditAction,
    isBusy: () => psBusy,
    setBusy: (value) => {
      psBusy = value;
    },
  });
  const attempts = new Map(),
    aiBusy = new Set();
  function limit(key, max, ms) {
    const now = Date.now(),
      l = attempts.get(key) || { n: 0, until: now + ms };
    if (l.until < now) {
      l.n = 0;
      l.until = now + ms;
    }
    if (++l.n > max) fail(429, 'Too many attempts. Try again shortly.');
    attempts.set(key, l);
  }
  function userCreate(b) {
    const name = text(b.name, 'Name', 80),
      email = text(b.email, 'Email', 150).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid email address.');
    const password = text(b.password, 'Password', 200);
    if (password.length < 12) fail(400, 'Use a password with at least 12 characters.');
    choice(b.role, ROLES, 'account role');
    if (db.prepare('SELECT id FROM users WHERE email=?').get(email))
      fail(409, 'An account with this email already exists.');
    const u = {
      id: randomUUID(),
      name,
      email,
      password: hash(password),
      role: b.role,
      team_id: null,
    };
    db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(
      u.id,
      name,
      email,
      u.password,
      u.role,
      u.team_id,
    );
    return u;
  }
  function login(u, res) {
    const token = randomBytes(32).toString('hex'),
      csrf = randomBytes(24).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
    db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(
      digest(token),
      u.id,
      csrf,
      Date.now() + 8 * 3600000,
    );
    res.setHeader(
      'Set-Cookie',
      `${sessionCookie}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${deployment.secure ? '; Secure' : ''}`,
    );
    return { user: publicUser(u), csrf };
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    const send = (status, obj) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(obj));
    };
    try {
      const host = req.headers.host || '',
        origin = requestOrigin(host, deployment);
      if (!origin) fail(403, 'Host not allowed.');
      const url = new URL(req.url, origin),
        route = url.pathname;
      if (!route.startsWith('/api/')) {
        const files = {
          '/': 'index.html',
          '/app.js': 'app.js',
          '/style.css': 'style.css',
          '/workspace.css': 'workspace.css',
          '/ps1-ui.js': 'ps1-ui.js',
          '/team-ui.js': 'team-ui.js',
          '/schedule-ui.js': 'schedule-ui.js',
          '/features.css': 'features.css',
          '/overview-ui.js': 'overview-ui.js',
          '/design.css': 'design.css',
        };
        if (!files[route]) fail(404, 'Not found');
        res.setHeader(
          'Content-Type',
          route.endsWith('.js')
            ? 'text/javascript'
            : route.endsWith('.css')
              ? 'text/css'
              : 'text/html',
        );
        res.end(readFileSync(path.join(base, 'public', files[route])));
        return;
      }
      if (req.method === 'GET' && route === '/api/health') {
        send(200, {
          ok: true,
          setupRequired: !db.prepare('SELECT id FROM users LIMIT 1').get(),
          setupTokenRequired: !!setupToken || deployment.secure,
          hosted: deployment.secure,
          ephemeral,
        });
        return;
      }
      let b = {};
      if (req.method !== 'GET') {
        if (req.headers.origin && req.headers.origin !== origin)
          fail(403, 'Request origin rejected.');
        if (!String(req.headers['content-type']).startsWith('application/json'))
          fail(415, 'JSON required.');
        const maxBytes = route.startsWith('/api/ps1/') ? 8500000 : 40000;
        let raw = '',
          parsed;
        try {
          parsed = req.body;
        } catch {
          fail(400, 'Invalid JSON.');
        }
        if (parsed !== undefined) {
          raw = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
          if (Buffer.byteLength(raw) > maxBytes) fail(413, 'Request too large.');
        } else {
          const chunks = [];
          let bytes = 0;
          for await (const chunk of req) {
            bytes += Buffer.byteLength(chunk);
            if (bytes > maxBytes) fail(413, 'Request too large.');
            chunks.push(Buffer.from(chunk));
          }
          raw = Buffer.concat(chunks).toString('utf8');
        }
        try {
          b = JSON.parse(raw || '{}');
        } catch {
          fail(400, 'Invalid JSON.');
        }
        if (!b || Array.isArray(b) || typeof b !== 'object') fail(400, 'JSON object required.');
      }
      if (req.method === 'POST' && route === '/api/setup') {
        if (db.prepare('SELECT id FROM users LIMIT 1').get())
          fail(409, 'Workspace already initialized. Sign in.');
        limit('setup:' + req.socket.remoteAddress, 10, 60000);
        if (
          (deployment.secure || setupToken) &&
          (!setupToken ||
            typeof b.setupToken !== 'string' ||
            !timingSafeEqual(Buffer.from(digest(b.setupToken)), Buffer.from(digest(setupToken))))
        )
          fail(403, 'Enter the setup token configured by the host administrator.');
        const s = get(),
          u = userCreate({ ...b, role: 'scheduler' }, s);
        audit(s, u, 'Workspace created', null, 'Planner account created.');
        save(s);
        send(201, login(u, res));
        return;
      }
      if (req.method === 'POST' && route === '/api/login') {
        limit('login:' + req.socket.remoteAddress, 30, 60000);
        const email = text(b.email, 'Email', 150).toLowerCase(),
          password = text(b.password, 'Password', 200),
          u = db.prepare('SELECT * FROM users WHERE email=?').get(email);
        if (!u || !verify(password, u.password)) fail(401, 'Email or password is incorrect.');
        send(200, login(u, res));
        return;
      }
      const cookieName = sessionCookie + '=';
      const token = (req.headers.cookie || '')
        .split('; ')
        .find((x) => x.startsWith(cookieName))
        ?.slice(cookieName.length);
      const session =
        token &&
        db
          .prepare('SELECT * FROM sessions WHERE token=? AND expires>?')
          .get(digest(token), Date.now());
      if (!session) fail(401, 'Please sign in.');
      const u = db.prepare('SELECT * FROM users WHERE id=?').get(session.user_id);
      if (req.method !== 'GET' && req.headers['x-csrf-token'] !== session.csrf)
        fail(403, 'Session verification failed. Refresh and retry.');
      const scheduler = () => {
        if (u.role !== 'scheduler') fail(403, 'This action requires a planner account.');
      };
      if (route.startsWith('/api/ps1/')) {
        if (!(req.method === 'GET' && route === '/api/ps1/state' && u.role === 'supervisor'))
          scheduler();
        const edited = await edits(route, req.method, b, u);
        if (edited) {
          send(200, edited);
          return;
        }
        if (route === '/api/ps1/schema' && req.method === 'GET') {
          send(200, { files: FILES.map((name, i) => ({ name, columns: INPUT_SCHEMA[i] })) });
          return;
        }
        if (route === '/api/ps1/state' && req.method === 'GET') {
          send(200, psView(psGet()));
          return;
        }
        if (route === '/api/ps1/what-if' && req.method === 'POST') {
          const snapshot = psGet();
          if (b.version !== snapshot.version)
            fail(409, 'The dataset changed. Refresh the planner.');
          choice(b.scenario, ['A', 'B', 'C'], 'scenario');
          const baseline = snapshot.results[b.scenario];
          if (!baseline) fail(400, 'Build this scenario before previewing a change.');
          if (psBusy) fail(409, 'A plan is already being built.');
          limit('preview:' + u.id, 10, 60000);
          let changed;
          try {
            changed = changeSupply(snapshot.files, b.location, b.capacity);
          } catch (error) {
            fail(400, error.message);
          }
          psBusy = true;
          try {
            const baselineReport = validatePlan(
              planningModel(changed.files, baseline),
              b.scenario,
              baseline.access,
              baseline.occupancy,
            );
            const result = baselineReport.feasible
              ? { ...baseline, report: baselineReport }
              : await runSolver(changed.files, b.scenario, {
                  disruptions: baseline.disruptions || [],
                });
            if (psGet().version !== snapshot.version)
              fail(409, 'The dataset changed during preview. Try again.');
            send(200, {
              change: changed.change,
              retained_baseline: baselineReport.feasible,
              baseline_report: baselineReport,
              baseline_score: baseline.report.soft_scores.objective_score,
              result,
              comparison: comparePlans(baseline, result),
            });
          } finally {
            psBusy = false;
          }
          return;
        }
        if (route === '/api/ps1/insights' && req.method === 'GET') {
          const scenario = choice(url.searchParams.get('scenario'), ['A', 'B', 'C'], 'scenario');
          const snapshot = psGet();
          const result = snapshot.results[scenario];
          if (!snapshot.files || !result)
            fail(404, 'Build this scenario before opening risk insights.');
          send(200, {
            ...buildInsights(planningModel(snapshot.files, result), result),
            dataset_version: snapshot.version,
            plan_token: planFingerprint(result),
          });
          return;
        }
        if (route === '/api/ps1/import' && req.method === 'POST') {
          const previous = psGet();
          if (b.version !== previous.version)
            fail(409, 'The dataset changed. Refresh the planner.');
          let files;
          if (b.sample)
            files = Object.fromEntries(
              FILES.map((f) => [
                f,
                readFileSync(
                  path.join(base, '..', 'problem-statement', 'PS1', '01_data', f),
                  'utf8',
                ),
              ]),
            );
          else {
            const uploadIssues = inspectInputFiles(b.files);
            if (uploadIssues.length) {
              const error = Object.assign(new Error('Upload format needs attention.'), {
                status: 400,
                uploadIssues,
              });
              throw error;
            }
            files = Object.fromEntries(FILES.map((f) => [f, b.files[f]]));
          }
          try {
            loadDataset(files);
          } catch (e) {
            const error = Object.assign(new Error(`Input data is invalid: ${e.message}`), {
              status: 400,
              uploadIssues: [e.message],
            });
            throw error;
          }
          const next = {
            version: previous.version + 1,
            source: b.sample ? 'NebulaX public PS1 dataset · 966c976' : 'Uploaded instance',
            files,
            results: {},
          };
          psSave(next);
          const s = get();
          audit(s, u, 'Dataset imported', null, next.source);
          save(s);
          send(200, psView(next));
          return;
        }
        if (route === '/api/ps1/solve' && req.method === 'POST') {
          const snapshot = psGet();
          if (!snapshot.files) fail(400, 'Load the sample or upload eight CSV files first.');
          if (b.version !== snapshot.version)
            fail(409, 'The dataset changed. Refresh the planner.');
          choice(b.scenario, ['A', 'B', 'C'], 'scenario');
          if (psBusy) fail(409, 'A plan is already being built.');
          psBusy = true;
          try {
            const result = await runSolver(snapshot.files, b.scenario, {
              disruptions: snapshot.results[b.scenario]?.disruptions || [],
            });
            const latest = psGet();
            if (latest.version !== snapshot.version)
              fail(409, 'Dataset changed during planning. Discarded the stale result.');
            latest.results[b.scenario] = result;
            psSave(latest);
            const s = get();
            audit(
              s,
              u,
              'Plan built',
              null,
              b.scenario +
                ': ' +
                result.report.complete_activities +
                '/' +
                result.report.total_activities +
                ' activities; ' +
                result.report.hard_violations.length +
                ' internal rule violations.',
            );
            save(s);
            send(200, result);
          } finally {
            psBusy = false;
          }
          return;
        }
        if (route === '/api/ps1/export' && req.method === 'GET') {
          const scenario = url.searchParams.get('scenario'),
            filename = url.searchParams.get('file');
          choice(scenario, ['A', 'B', 'C'], 'scenario');
          choice(
            filename,
            ['SCHEDULE_ACCESS.csv', 'SCHEDULE_OCCUPANCY.csv', 'RESULTS.csv', 'VALIDATION.json'],
            'file',
          );
          const s = psGet(),
            result = s.results[scenario];
          if (!result) fail(404, 'Generate this scenario first.');
          const report = validatePlan(
            planningModel(s.files, result),
            scenario,
            result.access,
            result.occupancy,
          );
          if (filename !== 'VALIDATION.json' && !report.feasible)
            fail(
              422,
              'This candidate has hard violations. Download its validation report and resolve the input or planning constraints before exporting a submission.',
            );
          res.setHeader(
            'Content-Type',
            filename.endsWith('.csv') ? 'text/csv; charset=utf-8' : 'application/json',
          );
          res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
          res.end(
            filename === 'VALIDATION.json'
              ? JSON.stringify(report, null, 2)
              : exportsFor({ ...result, report })[filename],
          );
          return;
        }
        fail(404, 'Unknown planner action');
      }
      if (route === '/api/me' && req.method === 'GET') {
        send(200, { user: publicUser(u), csrf: session.csrf });
        return;
      }
      const teamResult = team(route, req.method, b, u);
      if (teamResult) {
        send(teamResult.status, teamResult.data);
        return;
      }
      if (route === '/api/logout' && req.method === 'POST') {
        db.prepare('DELETE FROM sessions WHERE token=?').run(session.token);
        res.setHeader(
          'Set-Cookie',
          sessionCookie + '=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0',
        );
        send(200, { ok: true });
        return;
      }
      if (route === '/api/state' && req.method === 'GET') {
        send(200, view(get(), u));
        return;
      }
      if (route === '/api/chat/history' && req.method === 'GET') {
        scheduler();
        const scenario = choice(url.searchParams.get('scenario'), ['A', 'B', 'C'], 'scenario');
        send(
          200,
          db
            .prepare(
              'SELECT role,content,created FROM planning_messages WHERE user_id=? AND scenario=? AND dataset_version=? ORDER BY id DESC LIMIT 30',
            )
            .all(u.id, scenario, psGet().version)
            .reverse(),
        );
        return;
      }
      if (route === '/api/ai/config' && req.method === 'POST') {
        scheduler();
        if (b.disconnect) {
          config = { ...config, key: '', verified: false };
          send(200, { ok: true });
          return;
        }
        choice(b.provider, ['openai', 'anthropic'], 'provider');
        const model = text(b.model, 'Model', 100);
        if (!/^[a-zA-Z0-9._:-]+$/.test(model)) fail(400, 'Invalid model identifier.');
        const key = b.key
          ? text(b.key, 'API key', 500)
          : config.provider === b.provider
            ? config.key
            : '';
        if (!key) fail(400, 'Enter an API key.');
        config = { provider: b.provider, model, key, verified: false };
        send(200, { ok: true });
        return;
      }
      if (route === '/api/ai/test' && req.method === 'POST') {
        scheduler();
        limit('test:' + u.id, 5, 60000);
        const current = config;
        await callAI(
          current,
          [{ role: 'user', content: 'Reply with: Connected' }],
          'You are testing an API connection. Reply briefly.',
          fetcher,
        );
        if (current === config) config.verified = true;
        send(200, { ok: true, provider: current.provider, model: current.model });
        return;
      }
      if (route === '/api/chat' && req.method === 'POST') {
        scheduler();
        const prompt = text(b.message, 'Message', 4000),
          scenario = choice(b.scenario, ['A', 'B', 'C'], 'scenario');
        if (!config.key)
          fail(503, 'Connect an API key in Settings to ask questions. Planning works without it.');
        limit('chat:' + u.id, 12, 60000);
        if (aiBusy.has(u.id)) fail(429, 'Wait for your current response.');
        aiBusy.add(u.id);
        try {
          const ps = psGet(),
            result = ps.results[scenario];
          const context = {
            selected_scenario: scenario,
            dataset_version: ps.version,
            source: ps.source || null,
            dataset: ps.files ? describe(loadDataset(ps.files)) : null,
            plan: result
              ? { report: result.report, activities: result.explanations, access: result.access }
              : null,
          };
          const history = db
            .prepare(
              'SELECT role,content FROM planning_messages WHERE user_id=? AND scenario=? AND dataset_version=? ORDER BY id DESC LIMIT 8',
            )
            .all(u.id, scenario, ps.version)
            .reverse();
          const reply = await callAI(
            config,
            [...history, { role: 'user', content: prompt }],
            chatSystem + '\nAUTHORIZED DATA:\n' + JSON.stringify(context),
            fetcher,
          );
          if (psGet().version !== ps.version)
            fail(409, 'The dataset changed while answering. Ask again using the current dataset.');
          const at = new Date().toISOString(),
            insert = db.prepare(
              'INSERT INTO planning_messages(user_id,scenario,dataset_version,role,content,created) VALUES(?,?,?,?,?,?)',
            );
          insert.run(u.id, scenario, ps.version, 'user', prompt, at);
          insert.run(u.id, scenario, ps.version, 'assistant', reply, at);
          send(200, { reply });
        } finally {
          aiBusy.delete(u.id);
        }
        return;
      }
      if (
        [
          '/api/profile',
          '/api/absence',
          '/api/seed',
          '/api/jobs',
          '/api/job/action',
          '/api/proposals',
          '/api/approve',
          '/api/notifications/read',
          '/api/ai/draft',
        ].includes(route)
      )
        fail(
          410,
          'The daily crew workflow has been retired. Use the weekly track planner and contract dataset.',
        );
      if (route === '/api/users' && req.method === 'POST') {
        if (!['scheduler', 'supervisor', 'manager'].includes(u.role))
          fail(403, 'Your role cannot create accounts.');
        if (u.role === 'manager' && b.role !== 'worker')
          fail(403, 'Managers can create worker accounts only.');
        const s = get();
        if (b.version !== s.version) fail(409, 'The workspace changed. Refresh and try again.');
        const created = userCreate(b);
        audit(s, u, 'Team account created', null, created.name + ' · ' + created.role);
        save(s);
        send(201, { user: publicUser(created) });
        return;
      }
      fail(404, 'Not found');
    } catch (error) {
      send(error.status || 500, {
        error: error.status ? error.message : 'Unexpected server error. No action was confirmed.',
        ...(error.uploadIssues ? { uploadIssues: error.uploadIssues } : {}),
      });
      if (!error.status) console.error('Server error:', error.code || error.name);
    }
  });
  return {
    server,
    db,
    close: () =>
      new Promise((resolve) =>
        server.close(() => {
          db.close();
          resolve();
        }),
      ),
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createApp(),
    port = Number(process.env.PORT || 3001),
    host = process.env.HOST || '127.0.0.1';
  app.server.listen(port, host, () =>
    console.log(
      `Trackwork running at ${process.env.RAILSYNC_PUBLIC_ORIGIN || 'http://' + host + ':' + port}`,
    ),
  );
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, async () => {
      await app.close();
      process.exit(0);
    });
}
