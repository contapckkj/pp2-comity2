'use strict';

const { HttpError } = require('../lib/errors');
const { can } = require('../lib/permissions');
const { safeEqual } = require('../lib/security');

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

async function requireAuth(ctx, next) {
  if (!ctx.user) throw new HttpError(401, 'Autenticação necessária.');
  await next();
}

/** Valida o token CSRF (vinculado à sessão) em métodos que alteram dados. */
async function requireCsrf(ctx, next) {
  if (UNSAFE.has(ctx.req.method)) {
    const sent = ctx.req.headers['x-csrf-token'];
    if (!sent || !ctx.session || !safeEqual(sent, ctx.session.csrf)) {
      throw new HttpError(403, 'Sessão inválida ou expirada. Recarregue a página.');
    }
  }
  await next();
}

function requirePermission(permission, audit) {
  return async (ctx, next) => {
    if (!can(ctx.user.role, permission)) {
      audit(ctx, 'acesso_negado', { detail: `${ctx.req.method} ${ctx.path} (${permission})` });
      throw new HttpError(403, 'Você não tem permissão para esta ação.');
    }
    await next();
  };
}

/**
 * Cadeia padrão das rotas administrativas: autenticado → autorizado → CSRF.
 * Toda rota em /api/admin deve ser registrada com `guard(...)`.
 */
function createGuard(audit) {
  return (permission) => [requireAuth, requirePermission(permission, audit), requireCsrf];
}

module.exports = { requireAuth, requireCsrf, createGuard };
