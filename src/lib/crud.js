'use strict';

const { HttpError } = require('./errors');
const { readJson } = require('./http');
const { sendJson } = require('./http');
const { isValidDate } = require('./dates');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const isEmpty = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
const clean = (v) => v.replace(CONTROL_CHARS, '').trim();

/**
 * Valida um campo conforme sua especificação.
 * @returns {{ value?: any, error?: string }}
 */
function validateField(spec, raw, db) {
  if (isEmpty(raw)) {
    if (spec.required) return { error: 'Campo obrigatório.' };
    return { value: spec.default ?? null };
  }

  switch (spec.type) {
    case 'string':
    case 'text': {
      if (typeof raw !== 'string') return { error: 'Valor inválido.' };
      const value = clean(raw);
      if (value.length > (spec.max ?? 200)) return { error: `Use no máximo ${spec.max ?? 200} caracteres.` };
      return { value };
    }
    case 'email': {
      if (typeof raw !== 'string') return { error: 'Valor inválido.' };
      const value = clean(raw).toLowerCase();
      if (value.length > 160 || !EMAIL_RE.test(value)) return { error: 'E-mail inválido.' };
      return { value };
    }
    case 'enum':
      return spec.values.includes(raw) ? { value: raw } : { error: 'Opção inválida.' };
    case 'int': {
      if (!Number.isInteger(raw)) return { error: 'Informe um número inteiro.' };
      if (raw < (spec.min ?? 0) || raw > (spec.max ?? 1e9)) {
        return { error: `Informe um valor entre ${spec.min ?? 0} e ${spec.max ?? 1e9}.` };
      }
      return { value: raw };
    }
    case 'cents': {
      if (!Number.isSafeInteger(raw) || raw < 0 || raw > 1e12) return { error: 'Valor inválido.' };
      return { value: raw };
    }
    case 'date':
      return isValidDate(raw) ? { value: raw } : { error: 'Data inválida (use AAAA-MM-DD).' };
    case 'ref': {
      if (!Number.isInteger(raw) || raw < 1) return { error: 'Seleção inválida.' };
      const exists = db.prepare(`SELECT 1 FROM ${spec.table} WHERE id = ?`).get(raw);
      return exists ? { value: raw } : { error: 'Registro não encontrado.' };
    }
    default:
      throw new Error(`Tipo de campo desconhecido: ${spec.type}`);
  }
}

/**
 * Valida o corpo contra `entity.fields`. Só campos declarados passam (sem mass assignment).
 * Em `partial` (PATCH) só os campos enviados são validados.
 */
function validateBody(entity, body, db, { partial }) {
  const values = {};
  const errors = {};
  for (const [name, spec] of Object.entries(entity.fields)) {
    if (partial && !(name in body)) continue;
    const result = validateField(spec, body[name], db);
    if (result.error) errors[name] = result.error;
    else values[name] = result.value;
  }
  return { values, errors };
}

const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const clampInt = (value, min, max, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

function buildWhere(entity, query) {
  const where = [];
  const params = [];

  const q = (query.get('q') || '').trim().slice(0, 100);
  if (q && entity.search?.length) {
    const like = `%${escapeLike(q)}%`;
    where.push(`(${entity.search.map((col) => `${col} LIKE ? ESCAPE '\\'`).join(' OR ')})`);
    entity.search.forEach(() => params.push(like));
  }
  for (const [param, column] of Object.entries(entity.filters || {})) {
    const value = query.get(param);
    if (value) {
      where.push(`${column} = ?`);
      params.push(value);
    }
  }
  const month = query.get('month');
  if (entity.monthColumn && /^\d{4}-\d{2}$/.test(month || '')) {
    where.push(`substr(${entity.monthColumn}, 1, 7) = ?`);
    params.push(month);
  }
  return { clause: where.length ? ` WHERE ${where.join(' AND ')}` : '', params };
}

/**
 * Registra list/get/create/update/delete de uma entidade.
 * Leitura exige `<permissão>:read`; escrita exige `<permissão>:write`.
 */
function registerCrud({ router, db, guard, audit, entity }) {
  const base = `/api/admin/${entity.name}`;
  const selectOne = `${entity.select} WHERE ${entity.alias}.id = ?`;
  const fetchOne = (id) => db.prepare(selectOne).get(id);

  const loadOr404 = (ctx) => {
    const id = Number.parseInt(ctx.params.id, 10);
    const row = Number.isInteger(id) ? fetchOne(id) : undefined;
    if (!row) throw new HttpError(404, 'Registro não encontrado.');
    return row;
  };

  router.get(base, ...guard(`${entity.permission}:read`), (ctx) => {
    const { clause, params } = buildWhere(entity, ctx.query);
    const pageSize = clampInt(ctx.query.get('pageSize'), 1, 100, 25);
    const page = clampInt(ctx.query.get('page'), 1, 100000, 1);

    const total = db
      .prepare(`SELECT COUNT(*) AS n FROM (${entity.select}${clause})`)
      .get(...params).n;
    const items = db
      .prepare(`${entity.select}${clause} ORDER BY ${entity.orderBy} LIMIT ? OFFSET ?`)
      .all(...params, pageSize, (page - 1) * pageSize);

    sendJson(ctx.res, 200, { items, total, page, pageSize });
  });

  router.get(`${base}/:id`, ...guard(`${entity.permission}:read`), (ctx) => {
    sendJson(ctx.res, 200, loadOr404(ctx));
  });

  router.post(base, ...guard(`${entity.permission}:write`), async (ctx) => {
    const body = await readJson(ctx.req);
    const { values, errors } = validateBody(entity, body, db, { partial: false });
    if (Object.keys(errors).length) throw new HttpError(422, 'Corrija os campos destacados.', { errors });
    entity.beforeSave?.(values, null);

    const columns = Object.keys(values);
    const result = db
      .prepare(
        `INSERT INTO ${entity.table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      )
      .run(...columns.map((c) => values[c]));
    const id = Number(result.lastInsertRowid);
    audit(ctx, `${entity.name}.criar`, { entity: entity.name, entityId: id });
    sendJson(ctx.res, 201, fetchOne(id));
  });

  router.patch(`${base}/:id`, ...guard(`${entity.permission}:write`), async (ctx) => {
    const existing = loadOr404(ctx);
    const body = await readJson(ctx.req);
    const { values, errors } = validateBody(entity, body, db, { partial: true });
    if (Object.keys(errors).length) throw new HttpError(422, 'Corrija os campos destacados.', { errors });
    entity.beforeSave?.(values, existing);

    const columns = Object.keys(values);
    if (columns.length) {
      db.prepare(
        `UPDATE ${entity.table}
            SET ${columns.map((c) => `${c} = ?`).join(', ')},
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
          WHERE id = ?`,
      ).run(...columns.map((c) => values[c]), existing.id);
      audit(ctx, `${entity.name}.editar`, { entity: entity.name, entityId: existing.id });
    }
    sendJson(ctx.res, 200, fetchOne(existing.id));
  });

  router.delete(`${base}/:id`, ...guard(`${entity.permission}:write`), (ctx) => {
    const existing = loadOr404(ctx);
    db.prepare(`DELETE FROM ${entity.table} WHERE id = ?`).run(existing.id);
    audit(ctx, `${entity.name}.excluir`, { entity: entity.name, entityId: existing.id });
    sendJson(ctx.res, 200, { ok: true });
  });
}

module.exports = { registerCrud, validateBody };
