'use strict';

const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { loadConfig } = require('../src/config');
const { createApp } = require('../src/app');
const { hashPassword } = require('../src/lib/auth');

const PASSWORD = 'Senha-Forte-123';

/** Sobe a aplicação real numa porta aleatória, com banco temporário. */
async function startServer(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p2-test-'));
  const base = loadConfig({ skipEnvFile: true });
  const config = loadConfig({
    skipEnvFile: true,
    dbPath: path.join(dir, 'test.sqlite'),
    logRequests: false,
    whatsappNumber: '5511999990000',
    ...overrides,
    limits: {
      ...base.limits,
      loginPerIp: { windowMs: 60_000, max: 10_000 },
      leadsPerIp: { windowMs: 60_000, max: 10_000 },
      ...overrides.limits,
    },
  });
  const app = createApp(config);
  const server = http.createServer(app.handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;

  return {
    app,
    url,
    db: app.db,
    async createUser({ email, role = 'ceo', password = PASSWORD, name = 'Pessoa de Teste', active = 1 }) {
      app.db
        .prepare('INSERT INTO users (name, email, password_hash, role, active, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(name, email, await hashPassword(password), role, active, Date.now());
    },
    client: () => createClient(url),
    async close() {
      await new Promise((resolve) => server.close(resolve));
      server.closeAllConnections?.();
      app.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Cliente HTTP mínimo com cookie jar e token CSRF automático. */
function createClient(baseUrl) {
  const state = { cookie: '', csrf: '' };

  async function request(method, urlPath, { body, headers = {}, rawBody, csrf = true } = {}) {
    const h = { ...headers };
    if (state.cookie) h.cookie = state.cookie;
    if (body !== undefined || rawBody !== undefined) h['content-type'] ||= 'application/json';
    if (csrf && state.csrf && !['GET', 'HEAD'].includes(method) && h['x-csrf-token'] === undefined) {
      h['x-csrf-token'] = state.csrf;
    }
    const res = await fetch(baseUrl + urlPath, {
      method,
      headers: h,
      body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
      redirect: 'manual',
    });
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const [name, ...rest] = pair.split('=');
      if (/max-age=0/i.test(line)) state.cookie = '';
      else state.cookie = `${name}=${rest.join('=')}`;
    }
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* resposta não é JSON */
    }
    return { status: res.status, headers: res.headers, json, text };
  }

  return {
    state,
    request,
    get: (p, o) => request('GET', p, o),
    post: (p, body, o) => request('POST', p, { body, ...o }),
    patch: (p, body, o) => request('PATCH', p, { body, ...o }),
    delete: (p, o) => request('DELETE', p, o),
    async login(email, password = PASSWORD) {
      const res = await request('POST', '/api/auth/login', { body: { email, password } });
      if (res.status === 200) state.csrf = res.json.csrfToken;
      return res;
    },
  };
}

module.exports = { startServer, PASSWORD };
