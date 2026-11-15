'use strict';

const path = require('node:path');
const { HttpError } = require('../lib/errors');
const { redirect } = require('../lib/http');
const { can } = require('../lib/permissions');
const { createStaticServer } = require('../lib/static');

const LOGIN_BASE = '/painel/login';
const APP_BASE = '/painel/app';

/**
 * Páginas do painel.
 *  - /painel/login      pública (não há link para ela no site)
 *  - /painel            só com sessão válida; sem sessão, vai para o login
 *  - /painel/app/*      arquivos do painel; só com sessão válida (401 sem sessão)
 */
function registerPageRoutes({ router, app }) {
  const { config } = app;
  const loginFiles = createStaticServer(path.join(config.root, 'admin', 'login'));
  const appFiles = createStaticServer(path.join(config.root, 'admin', 'app'));
  const privateHeaders = { 'Cache-Control': 'private, no-cache' };

  const found = (ok) => {
    if (!ok) throw new HttpError(404, 'Não encontrado.');
  };
  // Logado e com permissão de painel (hoje: só a função CEO).
  const mayView = (ctx) => Boolean(ctx.user && can(ctx.user.role, 'dashboard:read'));

  router.get(LOGIN_BASE, (ctx) => {
    if (mayView(ctx)) return redirect(ctx.res, '/painel');
    return found(loginFiles(ctx.req, ctx.res, '/login.html', { 'Cache-Control': 'no-cache' }));
  });

  router.get(`${LOGIN_BASE}/*`, (ctx) => {
    found(loginFiles(ctx.req, ctx.res, ctx.path.slice(LOGIN_BASE.length), { 'Cache-Control': 'no-cache' }));
  });

  router.get('/painel', (ctx) => {
    if (!ctx.user) return redirect(ctx.res, LOGIN_BASE);
    if (!mayView(ctx)) throw new HttpError(403, 'Você não tem permissão para acessar o painel.');
    return found(appFiles(ctx.req, ctx.res, '/index.html', privateHeaders));
  });

  router.get(`${APP_BASE}/*`, (ctx) => {
    if (!ctx.user) throw new HttpError(401, 'Autenticação necessária.');
    if (!mayView(ctx)) throw new HttpError(403, 'Você não tem permissão para acessar o painel.');
    found(appFiles(ctx.req, ctx.res, ctx.path.slice(APP_BASE.length), privateHeaders));
  });
}

module.exports = { registerPageRoutes };
