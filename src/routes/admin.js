'use strict';

const { HttpError } = require('../lib/errors');
const { sendJson } = require('../lib/http');
const { registerCrud } = require('../lib/crud');
const { todayLocal, monthKeys } = require('../lib/dates');
const { insertDemoData, clearDemoData, countDemo } = require('../lib/demo');
const { ENTITIES } = require('../entities');

const OPEN_PROJECT = "('proposta','em_andamento','pausado')";

/** Indicadores e séries do painel. Valores monetários em centavos. */
function buildSummary(db, config) {
  const today = todayLocal(config.timezone);
  const month = today.slice(0, 7);
  const year = today.slice(0, 4);
  const months = monthKeys(today, 12);
  const prevMonth = months[months.length - 2];

  const one = (sql, ...params) => db.prepare(sql).get(...params);
  const all = (sql, ...params) => db.prepare(sql).all(...params);
  const sumTx = (kind, status, whereDate, ...params) =>
    one(
      `SELECT COALESCE(SUM(amount_cents), 0) AS v FROM transactions
        WHERE kind = ? AND status = ? AND ${whereDate}`,
      kind, status, ...params,
    ).v;

  const revenueMonth = sumTx('receita', 'pago', 'substr(date,1,7) = ?', month);
  const revenuePrev = sumTx('receita', 'pago', 'substr(date,1,7) = ?', prevMonth);
  const expensesMonth = sumTx('despesa', 'pago', 'substr(date,1,7) = ?', month);

  const won = one("SELECT COUNT(*) AS n FROM sales WHERE status = 'fechada'").n;
  const lost = one("SELECT COUNT(*) AS n FROM sales WHERE status = 'perdida'").n;

  const monthlyRows = all(
    `SELECT substr(date,1,7) AS month, kind, SUM(amount_cents) AS total
       FROM transactions
      WHERE status = 'pago' AND substr(date,1,7) >= ?
      GROUP BY month, kind`,
    months[0],
  );
  const monthly = months.map((m) => ({
    month: m,
    revenue: monthlyRows.find((r) => r.month === m && r.kind === 'receita')?.total ?? 0,
    expenses: monthlyRows.find((r) => r.month === m && r.kind === 'despesa')?.total ?? 0,
  }));

  return {
    generatedAt: new Date().toISOString(),
    today,
    kpis: {
      clientsActive: one("SELECT COUNT(*) AS n FROM clients WHERE status = 'ativo'").n,
      clientsTotal: one('SELECT COUNT(*) AS n FROM clients').n,
      projectsActive: one("SELECT COUNT(*) AS n FROM projects WHERE status = 'em_andamento'").n,
      projectsOverdue: one(
        `SELECT COUNT(*) AS n FROM projects WHERE status IN ${OPEN_PROJECT} AND due_date < ?`, today,
      ).n,
      salesOpenValue: one(
        "SELECT COALESCE(SUM(amount_cents),0) AS v FROM sales WHERE status IN ('negociacao','proposta_enviada')",
      ).v,
      salesOpenCount: one("SELECT COUNT(*) AS n FROM sales WHERE status IN ('negociacao','proposta_enviada')").n,
      salesWonMonthValue: one(
        "SELECT COALESCE(SUM(amount_cents),0) AS v FROM sales WHERE status = 'fechada' AND substr(sale_date,1,7) = ?",
        month,
      ).v,
      salesWonMonthCount: one(
        "SELECT COUNT(*) AS n FROM sales WHERE status = 'fechada' AND substr(sale_date,1,7) = ?", month,
      ).n,
      winRate: won + lost > 0 ? won / (won + lost) : null,
      revenueMonth,
      revenuePrevMonth: revenuePrev,
      revenueYear: sumTx('receita', 'pago', 'substr(date,1,4) = ?', year),
      expensesMonth,
      netMonth: revenueMonth - expensesMonth,
      receivable: sumTx('receita', 'pendente', '1 = 1'),
      receivableOverdue: sumTx('receita', 'pendente', 'date < ?', today),
      tasksOpen: one("SELECT COUNT(*) AS n FROM tasks WHERE status != 'concluida'").n,
      tasksOverdue: one(
        "SELECT COUNT(*) AS n FROM tasks WHERE status != 'concluida' AND due_date < ?", today,
      ).n,
      tasksDoneMonth: one(
        "SELECT COUNT(*) AS n FROM tasks WHERE status = 'concluida' AND substr(completed_at,1,7) = ?", month,
      ).n,
      leadsNew: one("SELECT COUNT(*) AS n FROM leads WHERE status = 'novo'").n,
    },
    monthly,
    projectsByStatus: all('SELECT status, COUNT(*) AS count FROM projects GROUP BY status'),
    salesByStatus: all('SELECT status, COUNT(*) AS count, SUM(amount_cents) AS total FROM sales GROUP BY status'),
    tasksByStatus: all('SELECT status, COUNT(*) AS count FROM tasks GROUP BY status'),
    revenueByService: all(
      `SELECT COALESCE(p.service, 'sem_projeto') AS service, SUM(t.amount_cents) AS total
         FROM transactions t LEFT JOIN projects p ON p.id = t.project_id
        WHERE t.kind = 'receita' AND t.status = 'pago' AND substr(t.date,1,7) >= ?
        GROUP BY service ORDER BY total DESC`,
      months[0],
    ),
    upcomingTasks: all(
      `SELECT t.id, t.title, t.priority, t.status, t.due_date, p.name AS project_name
         FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
        WHERE t.status != 'concluida'
        ORDER BY t.due_date IS NULL, t.due_date ASC, t.id DESC LIMIT 6`,
    ),
    recentLeads: all(
      `SELECT id, name, service, status, created_at, is_demo FROM leads
        WHERE status = 'novo' ORDER BY created_at DESC, id DESC LIMIT 5`,
    ),
    demoRecords: countDemo(db),
  };
}

function registerAdminRoutes({ router, app }) {
  const { db, config, guard, audit } = app;

  for (const entity of ENTITIES) registerCrud({ router, db, guard, audit, entity });

  router.get('/api/admin/summary', ...guard('dashboard:read'), (ctx) => {
    sendJson(ctx.res, 200, buildSummary(db, config));
  });

  // Listas curtas para os campos de seleção dos formulários.
  router.get('/api/admin/lookups', ...guard('dashboard:read'), (ctx) => {
    sendJson(ctx.res, 200, {
      clients: db.prepare('SELECT id, name FROM clients ORDER BY name COLLATE NOCASE LIMIT 500').all(),
      projects: db.prepare('SELECT id, name, client_id FROM projects ORDER BY name COLLATE NOCASE LIMIT 500').all(),
      users: db.prepare('SELECT id, name FROM users WHERE active = 1 ORDER BY name COLLATE NOCASE').all(),
    });
  });

  // Converte um contato recebido em cliente (prospect).
  router.post('/api/admin/leads/:id/convert', ...guard('clients:write'), (ctx) => {
    const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(Number(ctx.params.id));
    if (!lead) throw new HttpError(404, 'Registro não encontrado.');
    if (lead.status === 'convertido') throw new HttpError(409, 'Este contato já foi convertido em cliente.');

    const result = db
      .prepare(`INSERT INTO clients (name, email, phone, status, notes, is_demo) VALUES (?, ?, ?, 'prospect', ?, ?)`)
      .run(lead.name, lead.email, lead.phone, lead.message, lead.is_demo);
    db.prepare(
      `UPDATE leads SET status = 'convertido', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
    ).run(lead.id);
    audit(ctx, 'leads.converter', { entity: 'leads', entityId: lead.id });
    sendJson(ctx.res, 201, { clientId: Number(result.lastInsertRowid) });
  });

  router.get('/api/admin/audit', ...guard('audit:read'), (ctx) => {
    sendJson(ctx.res, 200, {
      items: db
        .prepare(
          `SELECT id, email, action, entity, entity_id, detail, ip, created_at
             FROM audit_log ORDER BY id DESC LIMIT 60`,
        )
        .all(),
    });
  });

  router.post('/api/admin/demo/load', ...guard('demo:manage'), (ctx) => {
    const created = insertDemoData(db, summaryToday(config));
    if (created === 0) throw new HttpError(409, 'Os dados demonstrativos já estão carregados.');
    audit(ctx, 'demo.carregar', { detail: `${created} registros` });
    sendJson(ctx.res, 201, { created });
  });

  router.post('/api/admin/demo/clear', ...guard('demo:manage'), (ctx) => {
    const removed = clearDemoData(db);
    audit(ctx, 'demo.remover', { detail: `${removed} registros` });
    sendJson(ctx.res, 200, { removed });
  });
}

const summaryToday = (config) => todayLocal(config.timezone);

module.exports = { registerAdminRoutes, buildSummary };
