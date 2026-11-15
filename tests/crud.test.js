'use strict';

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers');

describe('cadastros (CRUD) do painel', () => {
  let t;
  let c;
  before(async () => {
    t = await startServer();
    await t.createUser({ email: 'ceo@teste.local' });
    c = t.client();
    await c.login('ceo@teste.local');
  });
  after(() => t.close());

  test('cria, lê, edita, lista e exclui um cliente', async () => {
    const created = await c.post('/api/admin/clients', { name: '  Maria Silva ', email: 'MARIA@Exemplo.com', status: 'ativo' });
    assert.equal(created.status, 201);
    assert.equal(created.json.name, 'Maria Silva', 'trim');
    assert.equal(created.json.email, 'maria@exemplo.com', 'e-mail minúsculo');
    const id = created.json.id;

    assert.equal((await c.get(`/api/admin/clients/${id}`)).json.name, 'Maria Silva');

    const edited = await c.patch(`/api/admin/clients/${id}`, { status: 'inativo' });
    assert.equal(edited.json.status, 'inativo');
    assert.equal(edited.json.name, 'Maria Silva', 'campos não enviados ficam como estavam');

    const list = await c.get('/api/admin/clients?q=maria');
    assert.equal(list.json.total, 1);

    assert.equal((await c.delete(`/api/admin/clients/${id}`)).status, 200);
    assert.equal((await c.get(`/api/admin/clients/${id}`)).status, 404);
  });

  test('validação devolve 422 com erros por campo', async () => {
    const res = await c.post('/api/admin/clients', { name: '', email: 'sem-arroba', status: 'xpto' });
    assert.equal(res.status, 422);
    assert.ok(res.json.errors.name && res.json.errors.email && res.json.errors.status);
  });

  test('campos não declarados são ignorados (sem mass assignment)', async () => {
    const res = await c.post('/api/admin/clients', { name: 'Fulano', is_demo: 1, id: 9999, created_at: '2000-01-01' });
    assert.equal(res.status, 201);
    assert.equal(res.json.is_demo, 0);
    assert.notEqual(res.json.id, 9999);
    assert.notEqual(res.json.created_at, '2000-01-01');
  });

  test('busca resiste a injeção de SQL e a curingas', async () => {
    await c.post('/api/admin/clients', { name: '100% Teste' });
    const inj = await c.get(`/api/admin/clients?q=${encodeURIComponent("' OR 1=1 --")}`);
    assert.equal(inj.status, 200);
    assert.equal(inj.json.total, 0);
    const wild = await c.get(`/api/admin/clients?q=${encodeURIComponent('%')}`);
    assert.equal(wild.json.total, 1, '% é tratado como texto, não como curinga');
    const filter = await c.get(`/api/admin/clients?status=${encodeURIComponent("ativo' OR '1'='1")}`);
    assert.equal(filter.json.total, 0);
  });

  test('paginação respeita limites', async () => {
    for (let i = 0; i < 5; i += 1) await c.post('/api/admin/leads', { name: `Lead ${i}` });
    const page = await c.get('/api/admin/leads?pageSize=2&page=2');
    assert.equal(page.json.items.length, 2);
    assert.equal(page.json.pageSize, 2);
    assert.ok(page.json.total >= 5);
    assert.equal((await c.get('/api/admin/leads?pageSize=100000')).json.pageSize, 100);
  });

  test('projetos, vendas e lançamentos validam tipos, datas, valores e vínculos', async () => {
    const client = (await c.post('/api/admin/clients', { name: 'Cliente P' })).json;

    const badRef = await c.post('/api/admin/projects', { name: 'P', client_id: 99999 });
    assert.equal(badRef.status, 422);
    assert.ok(badRef.json.errors.client_id);

    const badDate = await c.post('/api/admin/sales', { description: 'V', amount_cents: 1000, sale_date: '2026-02-31' });
    assert.equal(badDate.status, 422);
    assert.ok(badDate.json.errors.sale_date);

    for (const amount of [-5, 10.5, '100', 1e15]) {
      const r = await c.post('/api/admin/transactions', { kind: 'receita', description: 'T', amount_cents: amount, date: '2026-01-10' });
      assert.equal(r.status, 422, `amount_cents=${amount}`);
    }

    const project = await c.post('/api/admin/projects', {
      name: 'Cardápio', client_id: client.id, service: 'cardapio_digital', budget_cents: 150000, progress: 40,
      start_date: '2026-01-05', due_date: '2026-02-05',
    });
    assert.equal(project.status, 201);
    assert.equal(project.json.client_name, 'Cliente P');
    assert.equal((await c.post('/api/admin/projects', { name: 'Q', progress: 101 })).status, 422);

    const sale = await c.post('/api/admin/sales', {
      description: 'Venda', client_id: client.id, project_id: project.json.id, amount_cents: 150000, sale_date: '2026-01-05', status: 'fechada',
    });
    assert.equal(sale.status, 201);
  });

  test('excluir cliente preserva projetos e lançamentos (vínculo vira nulo)', async () => {
    const client = (await c.post('/api/admin/clients', { name: 'Efêmero' })).json;
    const project = (await c.post('/api/admin/projects', { name: 'Proj', client_id: client.id })).json;
    await c.delete(`/api/admin/clients/${client.id}`);
    const after = (await c.get(`/api/admin/projects/${project.id}`)).json;
    assert.equal(after.client_id, null);
  });

  test('tarefa concluída recebe completed_at e perde ao reabrir', async () => {
    const task = (await c.post('/api/admin/tasks', { title: 'Fazer algo' })).json;
    assert.equal(task.completed_at, null);
    const done = (await c.patch(`/api/admin/tasks/${task.id}`, { status: 'concluida' })).json;
    assert.ok(done.completed_at);
    const reopened = (await c.patch(`/api/admin/tasks/${task.id}`, { status: 'pendente' })).json;
    assert.equal(reopened.completed_at, null);
  });

  test('converter contato em cliente (uma única vez)', async () => {
    const lead = (await c.post('/api/admin/leads', { name: 'Contato Novo', email: 'novo@exemplo.com', message: 'Oi' })).json;
    const conv = await c.post(`/api/admin/leads/${lead.id}/convert`, {});
    assert.equal(conv.status, 201);
    const client = (await c.get(`/api/admin/clients/${conv.json.clientId}`)).json;
    assert.equal(client.name, 'Contato Novo');
    assert.equal(client.status, 'prospect');
    assert.equal((await c.get(`/api/admin/leads/${lead.id}`)).json.status, 'convertido');
    assert.equal((await c.post(`/api/admin/leads/${lead.id}/convert`, {})).status, 409);
  });

  test('corpo inválido: JSON quebrado, tipo errado, grande demais, ids estranhos', async () => {
    assert.equal((await c.request('POST', '/api/admin/clients', { rawBody: '{quebrado' })).status, 400);
    assert.equal((await c.request('POST', '/api/admin/clients', { rawBody: '[]' })).status, 400);
    assert.equal(
      (await c.request('POST', '/api/admin/clients', { rawBody: 'name=x', headers: { 'content-type': 'text/plain' } })).status,
      415,
    );
    const big = await c.request('POST', '/api/admin/clients', { rawBody: JSON.stringify({ name: 'x'.repeat(200_000) }) });
    assert.equal(big.status, 413);
    assert.equal((await c.get('/api/admin/clients/abc')).status, 404);
    assert.equal((await c.get('/api/admin/clients/999999')).status, 404);
    assert.equal((await c.request('PUT', '/api/admin/clients/1', { body: {} })).status, 405);
  });

  test('alterações de dados ficam na auditoria', async () => {
    const rows = (await c.get('/api/admin/audit')).json.items;
    const actions = rows.map((r) => r.action);
    assert.ok(actions.includes('clients.criar'));
    assert.ok(actions.includes('clients.excluir'));
  });
});
