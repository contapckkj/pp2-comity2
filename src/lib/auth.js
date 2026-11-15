'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);

// Parâmetros do scrypt (OWASP: N >= 2^15 com r=8, p=1). Ficam gravados no hash.
const PARAMS = { N: 2 ** 15, r: 8, p: 1, keyLen: 64 };
const maxmem = 128 * PARAMS.N * PARAMS.r * 2;

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, PARAMS.keyLen, { N: PARAMS.N, r: PARAMS.r, p: PARAMS.p, maxmem });
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), key.toString('base64')].join('$');
}

async function verifyPassword(password, stored) {
  const [scheme, N, r, p, salt, hash] = String(stored).split('$');
  if (scheme !== 'scrypt' || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem,
  });
  return crypto.timingSafeEqual(key, expected);
}

let dummy;
/** Hash descartável: gasta o mesmo tempo quando o e-mail não existe (evita enumeração por tempo). */
function dummyHash() {
  dummy ||= hashPassword(crypto.randomBytes(24).toString('hex'));
  return dummy;
}

/** @returns {string|null} mensagem de erro ou null se a senha for aceitável */
function validatePassword(password, { email = '' } = {}) {
  if (typeof password !== 'string') return 'Informe a senha.';
  if (password.length < 12) return 'A senha deve ter pelo menos 12 caracteres.';
  if (password.length > 128) return 'A senha deve ter no máximo 128 caracteres.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'Use letras e números na senha.';
  }
  if (new Set(password).size < 5) return 'A senha é simples demais. Misture mais caracteres.';
  const local = email.split('@')[0].toLowerCase();
  if (local.length >= 4 && password.toLowerCase().includes(local)) {
    return 'A senha não pode conter o seu e-mail.';
  }
  return null;
}

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

/** Sessões no banco. O cookie guarda o token; o banco guarda só o hash dele. */
function createSessionStore(db, config) {
  const idleMs = config.sessionIdleMinutes * 60 * 1000;
  const maxMs = config.sessionMaxHours * 60 * 60 * 1000;

  const insert = db.prepare(
    `INSERT INTO sessions (id, user_id, csrf, created_at, last_seen_at, expires_at, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const find = db.prepare(
    `SELECT s.id, s.user_id, s.csrf, s.created_at, s.last_seen_at, s.expires_at,
            u.name, u.email, u.role, u.active
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ?`,
  );
  const touch = db.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?');
  const remove = db.prepare('DELETE FROM sessions WHERE id = ?');

  return {
    create(userId, { ip, userAgent }) {
      const token = crypto.randomBytes(32).toString('base64url');
      const csrf = crypto.randomBytes(32).toString('base64url');
      const now = Date.now();
      insert.run(sha256(token), userId, csrf, now, now, now + Math.min(idleMs, maxMs), ip || null, (userAgent || '').slice(0, 200));
      return { token, csrf, maxAgeSeconds: Math.min(idleMs, maxMs) / 1000 };
    },

    /** @returns {{ user, session } | null} */
    get(token) {
      if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
      const id = sha256(token);
      const row = find.get(id);
      if (!row) return null;
      const now = Date.now();
      if (row.expires_at <= now || !row.active) {
        remove.run(id);
        return null;
      }
      // Renovação deslizante (no máximo 1x por minuto), limitada à duração absoluta.
      if (now - row.last_seen_at > 60 * 1000) {
        touch.run(now, Math.min(now + idleMs, row.created_at + maxMs), id);
      }
      return {
        user: { id: row.user_id, name: row.name, email: row.email, role: row.role },
        session: { id, csrf: row.csrf },
      };
    },

    destroy(token) {
      if (typeof token === 'string') remove.run(sha256(token));
    },

    /** Encerra todas as sessões do usuário, exceto (opcionalmente) a atual. */
    destroyAllForUser(userId, exceptId = null) {
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND id IS NOT ?').run(userId, exceptId);
    },

    purgeExpired() {
      db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
    },
  };
}

module.exports = { hashPassword, verifyPassword, dummyHash, validatePassword, createSessionStore };
