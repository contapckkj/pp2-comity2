'use strict';

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers');

describe('API pública (site)', () => {
  let t;
  before(async () => {
    t = await startServer();
    await t.createUser({ email: 'ceo@teste.local' });
  });
  after(() => t.close());

  test('config pública traz só o necessário', async () => {
    const res = await t.client().get('/api/public/config');
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.json).sort(), ['companyName', 'contactEmail', 'whatsappNumber']);
    assert.equal(res.json.whatsappNumber, '5511999990000');
  });

  test('sem WHATSAPP_NUMBER a config devolve null (o site usa o formulário)', async () => {
    const t2 = await startServer({ whatsappNumber: '' });
    try {
      assert.equal((await t2.client().get('/api/public/config')).json.whatsappNumber, null);
    } finally {
      await t2.close();
    }
  });

  test('formulário de contato grava o contato e ele aparece no painel', async () => {
    const anon = t.client();
    const res = await anon.post('/api/public/leads', {
      name: 'Ana Souza', email: 'ana@exemplo.com', phone: '(62) 90000-0000',
      service: 'cardapio_digital', message: 'Quero um cardápio digital.',
    });
    assert.equal(res.status, 201);

    const ceo = t.client();
    await ceo.login('ceo@teste.local');
    const leads = (await ceo.get('/api/admin/leads?q=Ana')).json.items;
    assert.equal(leads.length, 1);
    assert.equal(leads[0].status, 'novo');
    assert.equal(leads[0].source, 'site');
    assert.equal(leads[0].is_demo, 0);
  });

  test('exige nome, mensagem e ao menos um meio de contato', async () => {
    const anon = t.client();
    const none = await anon.post('/api/public/leads', { name: '', message: '' });
    assert.equal(none.status, 422);
    assert.ok(none.json.errors.name && none.json.errors.message);

    const noContact = await anon.post('/api/public/leads', { name: 'Bia', message: 'Oi' });
    assert.equal(noContact.status, 422);
    assert.ok(noContact.json.errors.email);

    assert.equal((await anon.post('/api/public/leads', { name: 'Bia', message: 'Oi', email: 'ruim' })).status, 422);
    assert.equal((await anon.post('/api/public/leads', { name: 'Bia', message: 'Oi', phone: '1', service: 'x' })).status, 422);
  });

  test('campo isca: robô recebe sucesso, mas nada é gravado', async () => {
    const before = t.db.prepare('SELECT COUNT(*) AS n FROM leads').get().n;
    const res = await t.client().post('/api/public/leads', {
      name: 'Robô', email: 'bot@exemplo.com', message: 'spam', website: 'http://spam.example',
    });
    assert.equal(res.status, 201);
    assert.equal(t.db.prepare('SELECT COUNT(*) AS n FROM leads').get().n, before);
  });

  test('texto com HTML é guardado como texto (a interface nunca interpreta)', async () => {
    const payload = '<img src=x onerror=alert(1)>';
    await t.client().post('/api/public/leads', { name: payload, email: 'x@exemplo.com', message: payload });
    const row = t.db.prepare('SELECT name, message FROM leads ORDER BY id DESC LIMIT 1').get();
    assert.equal(row.name, payload);
  });

  test('GET no endpoint de contatos não é permitido', async () => {
    assert.equal((await t.client().get('/api/public/leads')).status, 405);
  });

  test('limite de envios por IP responde 429', async () => {
    const t2 = await startServer({ limits: { leadsPerIp: { windowMs: 60_000, max: 2 } } });
    try {
      const send = () => t2.client().post('/api/public/leads', { name: 'A', email: 'a@b.co', message: 'oi' });
      assert.equal((await send()).status, 201);
      assert.equal((await send()).status, 201);
      const blocked = await send();
      assert.equal(blocked.status, 429);
      assert.ok(blocked.headers.get('retry-after'));
    } finally {
      await t2.close();
    }
  });
});
