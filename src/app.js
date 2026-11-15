'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { openDatabase } = require('./db');
const { HttpError } = require('./lib/errors');
const { Router } = require('./lib/router');
const { sendJson, parseCookies } = require('./lib/http');
const { createStaticServer } = require('./lib/static');
const { createSessionStore } = require('./lib/auth');
const { createAudit } = require('./lib/audit');
const {
  applySecurityHeaders, createRateLimiter, enforceLimit, checkOrigin, clientIp,
} = require('./lib/security');
const { createGuard } = require('./middleware/guards');
const { registerPublicRoutes } = require('./routes/public');
const { registerAuthRoutes } = require('./routes/auth');
const { registerAdminRoutes } = require('./routes/admin');
const { registerPageRoutes } = require('./routes/pages');

const METHODS = new Set(['GET', 'HEAD', 'POST', 'PATCH', 'DELETE']);
const UNSAFE = new Set(['POST', 'PATCH', 'DELETE']);

/**
 * Monta a aplicação (banco, sessões, rotas) e devolve o handler HTTP.
 * Não abre porta: quem chama decide (server.js, testes).
 */
function createApp(config) {
  const db = openDatabase(config.dbPath);
  const sessions = createSessionStore(db, config);
  const audit = createAudit(db);
  const guard = createGuard(audit);
  const router = new Router();

  const limiters = {
    loginIp: createRateLimiter(config.limits.loginPerIp),
    leadsIp: createRateLimiter(config.limits.leadsPerIp),
    apiIp: createRateLimiter(config.limits.apiPerIp),
  };

  const app = { config, db, sessions, audit, guard, limiters, router };
  registerPublicRoutes({ router, app });
  registerAuthRoutes({ router, app });
  registerAdminRoutes({ router, app });
  registerPageRoutes({ router, app });

  const publicFiles = createStaticServer(path.join(config.root, 'public'));
  const notFoundPage = path.join(config.root, 'public', '404.html');

  sessions.purgeExpired();
  const purge = setInterval(() => sessions.purgeExpired(), 60 * 60 * 1000);
  purge.unref();

  function attachSession(ctx) {
    const token = parseCookies(ctx.req.headers.cookie)[config.cookieName];
    const found = token ? sessions.get(token) : null;
    if (found) {
      ctx.user = found.user;
      ctx.session = found.session;
      ctx.sessionToken = token;
    }
  }

  function sendNotFoundPage(res) {
    let body;
    try {
      body = fs.readFileSync(notFoundPage);
    } catch {
      body = Buffer.from('Página não encontrada.');
    }
    res.writeHead(404, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': body.length,
      'Cache-Control': 'no-cache',
    });
    res.end(body);
  }

  function fail(res, err) {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    if (err instanceof HttpError) {
      sendJson(res, err.status, { error: err.message, ...(err.errors ? { errors: err.errors } : {}) }, err.headers);
      return;
    }
    console.error('[erro]', err);
    sendJson(res, 500, { error: 'Erro interno. Tente novamente em instantes.' });
  }

  async function handler(req, res) {
    const started = Date.now();
    const ctx = {
      req, res, app, path: '/', query: new URLSearchParams(), params: {},
      ip: clientIp(req, config.trustProxy), user: null, session: null, sessionToken: null,
    };
    applySecurityHeaders(res, config);

    try {
      // '//host/x' seria lido como URL absoluta; só aceitamos caminhos.
      if (!req.url || req.url[0] !== '/' || req.url.startsWith('//')) throw new HttpError(400, 'Endereço inválido.');
      const url = new URL(req.url, 'http://localhost');
      ctx.path = url.pathname;
      ctx.query = url.searchParams;

      if (!METHODS.has(req.method)) throw new HttpError(405, 'Método não permitido.');

      const isApi = ctx.path.startsWith('/api/');
      if (isApi || ctx.path.startsWith('/painel')) {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
      }
      if (isApi) enforceLimit(limiters.apiIp, ctx.ip, 'Muitas requisições. Aguarde um instante.');
      if (UNSAFE.has(req.method)) checkOrigin(req);

      attachSession(ctx);

      if (await router.handle(ctx)) return;
      if (isApi) throw new HttpError(404, 'Rota não encontrada.');
      if ((req.method === 'GET' || req.method === 'HEAD') && publicFiles(req, res, ctx.path)) return;
      sendNotFoundPage(res);
    } catch (err) {
      fail(res, err);
    } finally {
      if (config.logRequests && (ctx.path.startsWith('/api/') || res.statusCode >= 400)) {
        console.log(
          JSON.stringify({
            t: new Date().toISOString(), m: req.method, p: ctx.path, s: res.statusCode,
            ms: Date.now() - started, ip: ctx.ip,
          }),
        );
      }
    }
  }

  return {
    handler,
    router,
    db,
    config,
    close() {
      clearInterval(purge);
      db.close();
    },
  };
}

module.exports = { createApp };
