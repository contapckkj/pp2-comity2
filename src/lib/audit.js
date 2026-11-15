'use strict';

/**
 * Trilha de auditoria: login, logout, falhas, mudanças de senha e alterações de dados.
 * Nunca grave senhas, tokens ou corpos de requisição aqui.
 */
function createAudit(db) {
  const insert = db.prepare(
    `INSERT INTO audit_log (user_id, email, action, entity, entity_id, detail, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  return function audit(ctx, action, { entity = null, entityId = null, detail = null, email } = {}) {
    insert.run(
      ctx.user?.id ?? null,
      (email ?? ctx.user?.email ?? null)?.slice(0, 160) ?? null,
      action,
      entity,
      entityId,
      detail ? String(detail).slice(0, 300) : null,
      ctx.ip ?? null,
    );
  };
}

module.exports = { createAudit };
