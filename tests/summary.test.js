'use strict';

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers');

describe('indicadores do painel', () => {
  let t;
  let c;
  before(async () => {
    t = await startServer();
    await t.createUser({ email: 'ceo@teste.local' });
    c = t.client();
    await c.login('ceo@teste.local');
  });
  after(() => t.close());

  const summary = async () => (await c.get('/api/admin/summary')).json;

  test('banco vazio: tudo zerado, sem inventar números', async () => {
    const s = await summary();
    assert.equal(s.kpis.clientsTotal, 0);
    assert.equal(s.kpis.revenueMonth, 0);
    assert.equal(s.kpis.winRate, null);
    assert.equal(s.demoRecords, 0);
    assert.equal(s.monthly.length, 12);
    assert.ok(s.monthly.every((m) => m.revenue === 0 && m.expenses === 0));
    assert.deepEqual(s.projectsByStatus, []);
  });

  test('faturamento, despesas, resultado e a receber batem com os lançamentos', async () => {
    const { today, monthly } = await summary();
    const prev = `${monthly[10].month}-15`;
    const tx = (body) => c.post('/api/admin/transactions', { description: 'Teste', ...body });

    await tx({ kind: 'receita', amount_cents: 100000, date: today, status: 'pago' });
    await tx({ kind: 'receita', amount_cents: 50000, date: today, status: 'pago' });
    await tx({ kind: 'despesa', amount_cents: 30000, date: today, status: 'pago' });
    await tx({ kind: 'receita', amount_cents: 20000, date: prev, status: 'pago' });
    await tx({ kind: 'receita', amount_cents: 70000, date: today, status: 'pendente' });
    await tx({ kind: 'receita', amount_cents: 5000, date: '2000-01-01', status: 'pendente' });

    const { kpis, monthly: series } = await summary();
    assert.equal(kpis.revenueMonth, 150000, 'só receitas pagas do mês');
    assert.equal(kpis.expensesMonth, 30000);
    assert.equal(kpis.netMonth, 120000);
    assert.equal(kpis.revenuePrevMonth, 20000);
    assert.equal(kpis.receivable, 75000, 'pendentes não entram no faturamento');
    assert.equal(kpis.receivableOverdue, 5000);
    assert.equal(series[11].revenue, 150000);
    assert.equal(series[10].revenue, 20000);
  });

  test('vendas, projetos, tarefas e contatos', async () => {
    const { today } = await summary();
    const sale = (status, cents) =>
      c.post('/api/admin/sales', { description: 'V', status, amount_cents: cents, sale_date: today });
    await sale('fechada', 100000);
    await sale('fechada', 50000);
    await sale('perdida', 10000);
    await sale('negociacao', 40000);
    await sale('proposta_enviada', 60000);

    await c.post('/api/admin/projects', { name: 'A', status: 'em_andamento', due_date: '2000-01-01' });
    await c.post('/api/admin/projects', { name: 'B', status: 'concluido', due_date: '2000-01-01' });
    await c.post('/api/admin/tasks', { title: 'Atrasada', due_date: '2000-01-01' });
    await c.post('/api/admin/tasks', { title: 'Feita', status: 'concluida' });
    await c.post('/api/admin/leads', { name: 'Novo contato' });

    const { kpis } = await summary();
    assert.equal(kpis.salesWonMonthValue, 150000);
    assert.equal(kpis.salesWonMonthCount, 2);
    assert.equal(kpis.salesOpenValue, 100000);
    assert.equal(kpis.salesOpenCount, 2);
    assert.ok(Math.abs(kpis.winRate - 2 / 3) < 1e-9);
    assert.equal(kpis.projectsActive, 1);
    assert.equal(kpis.projectsOverdue, 1, 'concluído não conta como atrasado');
    assert.equal(kpis.tasksOpen, 1);
    assert.equal(kpis.tasksOverdue, 1);
    assert.equal(kpis.tasksDoneMonth, 1);
    assert.equal(kpis.leadsNew, 1);
  });

  test('dados demonstrativos: carregam marcados, não duplicam e saem sem tocar nos reais', async () => {
    const real = (await c.post('/api/admin/clients', { name: 'Cliente Real' })).json;

    const load = await c.post('/api/admin/demo/load', {});
    assert.equal(load.status, 201);
    assert.ok(load.json.created > 50);
    assert.equal((await c.post('/api/admin/demo/load', {})).status, 409);

    const s = await summary();
    assert.equal(s.demoRecords, load.json.created);
    assert.ok(s.monthly.some((m) => m.revenue > 0));

    const clients = (await c.get('/api/admin/clients?pageSize=100')).json.items;
    const demo = clients.filter((x) => x.is_demo);
    assert.ok(demo.length >= 10);
    assert.ok(demo.every((x) => x.name.startsWith('[Demo]') && x.email.endsWith('.invalid')));
    assert.equal(clients.find((x) => x.id === real.id).is_demo, 0);

    const clear = await c.post('/api/admin/demo/clear', {});
    assert.equal(clear.json.removed, load.json.created);
    assert.equal((await summary()).demoRecords, 0);
    assert.equal((await c.get(`/api/admin/clients/${real.id}`)).status, 200, 'registro real permanece');
  });

  test('lookups trazem clientes, projetos e usuários para os formulários', async () => {
    const res = (await c.get('/api/admin/lookups')).json;
    assert.ok(Array.isArray(res.clients) && Array.isArray(res.projects) && Array.isArray(res.users));
    assert.ok(res.users.length >= 1);
    assert.ok(!JSON.stringify(res).includes('password'));
  });
});
