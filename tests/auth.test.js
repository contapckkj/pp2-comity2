'use strict';

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, PASSWORD } = require('./helpers');

describe('autenticação e permissões', () => {
  let t;
  before(async () => {
    t = await startServer();
    await t.createUser({ email: 'ceo@teste.local' });
    await t.createUser({ email: 'equipe@teste.local', role: 'equipe' });
    await t.createUser({ email: 'inativo@teste.local', active: 0 });
  });
  after(() => t.close());

  test('TODAS as rotas /api/admin exigem login (401 sem sessão)', async () => {
    const anon = t.client();
    const routes = t.app.router.routes.filter((r) => r.pattern.startsWith('/api/admin'));
    assert.ok(routes.length >= 25, `esperava muitas rotas admin, achei ${routes.length}`);
    for (const r of routes) {
      const url = r.pattern.replace(':id', '1');
      const res = await anon.request(r.method, url, { body: r.method === 'GET' ? undefined : {} });
      assert.equal(res.status, 401, `${r.method} ${r.pattern} deveria dar 401, deu ${res.status}`);
    }
  });

  test('login com senha errada e e-mail inexistente dão a mesma resposta', async () => {
    const a = await t.client().login('ceo@teste.local', 'senha-errada-123');
    const b = await t.client().login('ninguem@teste.local', 'senha-errada-123');
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.equal(a.json.error, b.json.error);
  });

  test('usuário inativo não entra', async () => {
    assert.equal((await t.client().login('inativo@teste.local')).status, 401);
  });

  test('login válido: cookie HttpOnly + SameSite=Strict, sem vazar hash', async () => {
    const c = t.client();
    const res = await c.login('ceo@teste.local');
    assert.equal(res.status, 200);
    assert.equal(res.json.user.role, 'ceo');
    assert.ok(res.json.csrfToken.length >= 40);
    assert.ok(!JSON.stringify(res.json).includes('scrypt'));
    const cookie = res.headers.getSetCookie()[0];
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);
    assert.equal((await c.get('/api/auth/me')).json.user.email, 'ceo@teste.local');
  });

  test('o banco guarda só o hash do token de sessão', async () => {
    const c = t.client();
    await c.login('ceo@teste.local');
    const token = decodeURIComponent(c.state.cookie.split('=')[1]);
    const rows = t.db.prepare('SELECT id FROM sessions').all();
    assert.ok(rows.length > 0);
    assert.ok(rows.every((r) => r.id !== token));
  });

  test('logout encerra a sessão; reutilizar o cookie antigo falha', async () => {
    const c = t.client();
    await c.login('ceo@teste.local');
    const oldCookie = c.state.cookie;
    assert.equal((await c.post('/api/auth/logout', {})).status, 200);
    const replay = t.client();
    replay.state.cookie = oldCookie;
    assert.equal((await replay.get('/api/auth/me')).status, 401);
  });

  test('CSRF: escrita sem token ou com token errado é recusada', async () => {
    const c = t.client();
    await c.login('ceo@teste.local');
    const none = await c.post('/api/admin/clients', { name: 'X' }, { csrf: false });
    assert.equal(none.status, 403);
    const wrong = await c.post('/api/admin/clients', { name: 'X' }, { headers: { 'x-csrf-token': 'errado' } });
    assert.equal(wrong.status, 403);
    assert.equal((await c.post('/api/admin/clients', { name: 'X' })).status, 201);
  });

  test('Origin de outro site é recusada', async () => {
    const c = t.client();
    await c.login('ceo@teste.local');
    const res = await c.post('/api/admin/clients', { name: 'X' }, { headers: { origin: 'https://evil.example' } });
    assert.equal(res.status, 403);
  });

  test('função sem permissão recebe 403 em tudo (API e páginas)', async () => {
    const c = t.client();
    assert.equal((await c.login('equipe@teste.local')).status, 200);
    assert.equal((await c.get('/api/admin/summary')).status, 403);
    assert.equal((await c.get('/api/admin/clients')).status, 403);
    assert.equal((await c.post('/api/admin/clients', { name: 'X' })).status, 403);
    assert.equal((await c.get('/painel')).status, 403);
    assert.equal((await c.get('/painel/app/js/main.js')).status, 403);
    const denied = t.db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'acesso_negado'").get().n;
    assert.ok(denied >= 3);
  });

  test('sessão expirada no banco é recusada', async () => {
    const c = t.client();
    await c.login('ceo@teste.local');
    t.db.prepare('UPDATE sessions SET expires_at = ?').run(Date.now() - 1000);
    assert.equal((await c.get('/api/auth/me')).status, 401);
  });

  test('troca de senha: valida, derruba outras sessões e a nova senha funciona', async () => {
    await t.createUser({ email: 'troca@teste.local' });
    const a = t.client();
    const b = t.client();
    await a.login('troca@teste.local');
    await b.login('troca@teste.local');

    const wrongCurrent = await a.post('/api/auth/password', { currentPassword: 'x', newPassword: 'Outra-Senha-456' });
    assert.equal(wrongCurrent.status, 422);
    assert.ok(wrongCurrent.json.errors.currentPassword);

    const weak = await a.post('/api/auth/password', { currentPassword: PASSWORD, newPassword: 'curta1' });
    assert.equal(weak.status, 422);
    assert.ok(weak.json.errors.newPassword);

    const ok = await a.post('/api/auth/password', { currentPassword: PASSWORD, newPassword: 'Outra-Senha-456' });
    assert.equal(ok.status, 200);
    assert.equal((await a.get('/api/auth/me')).status, 200, 'sessão atual continua');
    assert.equal((await b.get('/api/auth/me')).status, 401, 'outras sessões caem');
    assert.equal((await t.client().login('troca@teste.local', PASSWORD)).status, 401);
    assert.equal((await t.client().login('troca@teste.local', 'Outra-Senha-456')).status, 200);
  });

  test('login e logout ficam registrados na auditoria', async () => {
    const actions = t.db.prepare('SELECT DISTINCT action FROM audit_log').all().map((r) => r.action);
    for (const a of ['login', 'login_falhou', 'logout']) assert.ok(actions.includes(a), `faltou ${a}`);
    const dump = JSON.stringify(t.db.prepare('SELECT * FROM audit_log').all());
    assert.ok(!dump.includes(PASSWORD), 'senha nunca pode aparecer na auditoria');
  });
});

describe('bloqueio e limite de tentativas', () => {
  test('5 senhas erradas bloqueiam a conta, mesmo com a senha certa depois', async () => {
    const t = await startServer();
    try {
      await t.createUser({ email: 'alvo@teste.local' });
      for (let i = 0; i < 5; i += 1) {
        assert.equal((await t.client().login('alvo@teste.local', `errada-${i}-xyz`)).status, 401);
      }
      assert.equal((await t.client().login('alvo@teste.local')).status, 401);
      // Desbloqueio após o prazo
      t.db.prepare('UPDATE users SET locked_until = ?').run(Date.now() - 1);
      assert.equal((await t.client().login('alvo@teste.local')).status, 200);
    } finally {
      await t.close();
    }
  });

  test('limite por IP responde 429 com Retry-After', async () => {
    const t = await startServer({ limits: { loginPerIp: { windowMs: 60_000, max: 3 } } });
    try {
      for (let i = 0; i < 3; i += 1) await t.client().login('x@teste.local', 'qualquer-coisa-1');
      const res = await t.client().login('x@teste.local', 'qualquer-coisa-1');
      assert.equal(res.status, 429);
      assert.ok(Number(res.headers.get('retry-after')) > 0);
    } finally {
      await t.close();
    }
  });
});
