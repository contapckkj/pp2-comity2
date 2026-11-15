'use strict';

const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers');

const ROOT = path.resolve(__dirname, '..');

describe('páginas, arquivos e cabeçalhos', () => {
  let t;
  before(async () => {
    t = await startServer();
    await t.createUser({ email: 'ceo@teste.local' });
  });
  after(() => t.close());

  test('site público abre sem login', async () => {
    const res = await t.client().get('/');
    assert.equal(res.status, 200);
    assert.match(res.text, /P2 Automações/);
    for (const p of ['/css/site.css', '/js/site.js', '/img/mark.svg', '/robots.txt']) {
      assert.equal((await t.client().get(p)).status, 200, p);
    }
  });

  test('o painel NÃO aparece no menu público nem no robots/HTML do site', async () => {
    const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
    assert.ok(!/painel|dashboard|admin|login/i.test(html), 'HTML público não deve citar o painel');
    const js = fs.readFileSync(path.join(ROOT, 'public', 'js', 'site.js'), 'utf8');
    assert.ok(!/painel|dashboard|admin/i.test(js));
    const robots = (await t.client().get('/robots.txt')).text;
    assert.ok(!/painel/i.test(robots), 'robots.txt não deve revelar o endereço');
  });

  test('sem sessão: /painel redireciona ao login e os arquivos do painel dão 401', async () => {
    const anon = t.client();
    const home = await anon.get('/painel');
    assert.equal(home.status, 302);
    assert.equal(home.headers.get('location'), '/painel/login');
    for (const p of ['/painel/app/js/main.js', '/painel/app/css/admin.css', '/painel/app/index.html', '/painel/app/js/api.js']) {
      assert.equal((await anon.get(p)).status, 401, p);
    }
    assert.equal((await anon.get('/painel/login')).status, 200, 'tela de login é pública');
    assert.equal((await anon.get('/painel/login/login.js')).status, 200);
  });

  test('o código do painel não é servido pelo site público (nem por caminhos alternativos)', async () => {
    const anon = t.client();
    for (const p of ['/admin/app/js/main.js', '/admin/app/index.html', '/../admin/app/js/main.js', '/painel/app/../../src/config.js']) {
      const res = await anon.get(p);
      assert.ok([400, 401, 404].includes(res.status), `${p} → ${res.status}`);
      assert.ok(!res.text.includes('overviewView'));
    }
  });

  test('com sessão de CEO: painel abre, login redireciona ao painel', async () => {
    const c = t.client();
    await c.login('ceo@teste.local');
    const home = await c.get('/painel');
    assert.equal(home.status, 200);
    assert.match(home.text, /Painel/);
    assert.equal((await c.get('/painel/app/js/main.js')).status, 200);
    assert.equal((await c.get('/painel/app/css/admin.css')).status, 200);
    const login = await c.get('/painel/login');
    assert.equal(login.status, 302);
    assert.equal(login.headers.get('location'), '/painel');
  });

  test('traversal e arquivos ocultos/sensíveis são recusados', async () => {
    const anon = t.client();
    const attempts = [
      '/..%2f..%2fpackage.json', '/%2e%2e/%2e%2e/src/config.js', '/..%5c..%5cpackage.json',
      '/.env', '/.git/config', '/%00', '/data/p2.sqlite', '/src/config.js', '/package.json', '/node_modules/x',
    ];
    for (const p of attempts) {
      const res = await anon.get(p);
      assert.ok([400, 404].includes(res.status), `${p} → ${res.status}`);
      assert.ok(!/"name": "p2-automacoes"|loadConfig/.test(res.text), `${p} vazou conteúdo`);
    }
  });

  test('cabeçalhos de segurança em páginas e na API', async () => {
    for (const p of ['/', '/painel/login', '/api/public/config']) {
      const res = await t.client().get(p);
      const csp = res.headers.get('content-security-policy');
      assert.match(csp, /default-src 'self'/);
      assert.match(csp, /script-src 'self'(;|$)/, 'sem unsafe-inline em scripts');
      assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
      assert.match(csp, /frame-ancestors 'none'/);
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(res.headers.get('x-frame-options'), 'DENY');
      assert.ok(res.headers.get('referrer-policy'));
    }
    const api = await t.client().get('/api/public/config');
    assert.equal(api.headers.get('cache-control'), 'public, max-age=300');
    const me = await t.client().get('/api/auth/me');
    assert.equal(me.headers.get('cache-control'), 'no-store');
    assert.match(me.headers.get('x-robots-tag'), /noindex/);
  });

  test('todos os scripts e estilos do site e do painel cumprem a CSP (sem inline)', () => {
    const pages = [
      path.join(ROOT, 'public', 'index.html'), path.join(ROOT, 'public', '404.html'),
      path.join(ROOT, 'admin', 'login', 'login.html'), path.join(ROOT, 'admin', 'app', 'index.html'),
    ];
    for (const file of pages) {
      const html = fs.readFileSync(file, 'utf8');
      assert.ok(!/<style[\s>]/i.test(html), `${file}: <style> inline`);
      assert.ok(!/\sstyle\s*=/i.test(html), `${file}: atributo style`);
      assert.ok(!/\son[a-z]+\s*=/i.test(html), `${file}: manipulador inline`);
      for (const m of html.matchAll(/<script\b([^>]*)>/gi)) assert.match(m[1], /\bsrc=/, `${file}: script inline`);
    }
  });

  test('404 de página e método inválido', async () => {
    const miss = await t.client().get('/nao-existe');
    assert.equal(miss.status, 404);
    assert.match(miss.text, /Página não encontrada/);
    assert.equal((await t.client().request('PUT', '/', { body: {} })).status, 405);
    assert.equal((await t.client().get('/api/naoexiste')).status, 404);
  });

  test('requisição com alvo absoluto ou "//" é recusada', async () => {
    const raw = (target) => new Promise((resolve, reject) => {
      const port = new URL(t.url).port;
      const sock = net.connect(Number(port), '127.0.0.1', () => sock.write(`GET ${target} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`));
      let data = '';
      sock.on('data', (d) => { data += d; });
      sock.on('end', () => resolve(data.split('\r\n')[0]));
      sock.on('error', reject);
    });
    assert.match(await raw('//evil.example/x'), / 400 /);
  });
});

describe('cookies em produção', () => {
  test('com COOKIE_SECURE o cookie usa prefixo __Host- e atributo Secure', async () => {
    const t = await startServer({ cookieSecure: true, cookieName: '__Host-p2sid', production: true });
    try {
      await t.createUser({ email: 'ceo@teste.local' });
      const res = await t.client().login('ceo@teste.local');
      const cookie = res.headers.getSetCookie()[0];
      assert.match(cookie, /^__Host-p2sid=/);
      assert.match(cookie, /; Secure/);
      assert.match(cookie, /Path=\//);
      assert.doesNotMatch(cookie, /Domain=/);
      const page = await t.client().get('/');
      assert.match(page.headers.get('strict-transport-security'), /max-age=\d+/);
    } finally {
      await t.close();
    }
  });
});
