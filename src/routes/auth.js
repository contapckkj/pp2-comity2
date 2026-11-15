'use strict';

const { HttpError } = require('../lib/errors');
const { readJson, sendJson, serializeCookie } = require('../lib/http');
const { verifyPassword, hashPassword, dummyHash, validatePassword } = require('../lib/auth');
const { enforceLimit, createRateLimiter } = require('../lib/security');
const { requireAuth, requireCsrf } = require('../middleware/guards');

const GENERIC_LOGIN_ERROR =
  'E-mail ou senha incorretos, ou acesso temporariamente bloqueado após várias tentativas.';

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

function registerAuthRoutes({ router, app }) {
  const { db, config, sessions, audit, limiters } = app;
  const passwordLimiter = createRateLimiter(config.limits.passwordPerUser);

  const clearCookie = () =>
    serializeCookie(config.cookieName, '', { maxAgeSeconds: 0, secure: config.cookieSecure });

  router.post('/api/auth/login', async (ctx) => {
    enforceLimit(limiters.loginIp, ctx.ip);

    const body = await readJson(ctx.req, 4096);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || !password || email.length > 160 || password.length > 256) {
      throw new HttpError(400, 'Informe e-mail e senha.');
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    const now = Date.now();
    const locked = Boolean(user && user.locked_until && user.locked_until > now);

    // Sempre calcula o hash (mesmo sem usuário) para não vazar existência de conta pelo tempo.
    const passwordOk = await verifyPassword(password, user ? user.password_hash : await dummyHash());

    if (!user || !user.active || locked || !passwordOk) {
      if (user && !locked) {
        const { maxFailures, lockMs } = config.limits.lockout;
        const failures = user.failed_attempts + 1;
        if (failures >= maxFailures) {
          db.prepare('UPDATE users SET failed_attempts = 0, locked_until = ? WHERE id = ?').run(now + lockMs, user.id);
        } else {
          db.prepare('UPDATE users SET failed_attempts = ? WHERE id = ?').run(failures, user.id);
        }
      }
      audit(ctx, 'login_falhou', { email, detail: locked ? 'conta bloqueada' : null });
      throw new HttpError(401, GENERIC_LOGIN_ERROR);
    }

    db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = ? WHERE id = ?').run(now, user.id);
    const session = sessions.create(user.id, { ip: ctx.ip, userAgent: ctx.req.headers['user-agent'] });
    limiters.loginIp.reset(ctx.ip);

    ctx.user = user;
    audit(ctx, 'login');
    sendJson(
      ctx.res,
      200,
      { user: publicUser(user), csrfToken: session.csrf },
      {
        'Set-Cookie': serializeCookie(config.cookieName, session.token, {
          maxAgeSeconds: session.maxAgeSeconds,
          secure: config.cookieSecure,
        }),
      },
    );
  });

  router.get('/api/auth/me', requireAuth, (ctx) => {
    sendJson(ctx.res, 200, { user: publicUser(ctx.user), csrfToken: ctx.session.csrf });
  });

  router.post('/api/auth/logout', requireAuth, requireCsrf, (ctx) => {
    sessions.destroy(ctx.sessionToken);
    audit(ctx, 'logout');
    sendJson(ctx.res, 200, { ok: true }, { 'Set-Cookie': clearCookie() });
  });

  router.post('/api/auth/password', requireAuth, requireCsrf, async (ctx) => {
    enforceLimit(passwordLimiter, String(ctx.user.id));

    const body = await readJson(ctx.req, 4096);
    const current = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const next = body.newPassword;

    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(ctx.user.id);
    if (!(await verifyPassword(current, row.password_hash))) {
      audit(ctx, 'senha_alteracao_falhou');
      throw new HttpError(422, 'Corrija os campos destacados.', {
        errors: { currentPassword: 'Senha atual incorreta.' },
      });
    }
    const problem = validatePassword(next, { email: ctx.user.email });
    if (problem) {
      throw new HttpError(422, 'Corrija os campos destacados.', { errors: { newPassword: problem } });
    }
    if (next === current) {
      throw new HttpError(422, 'Corrija os campos destacados.', {
        errors: { newPassword: 'A nova senha deve ser diferente da atual.' },
      });
    }

    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(next), ctx.user.id);
    sessions.destroyAllForUser(ctx.user.id, ctx.session.id); // derruba outros dispositivos
    audit(ctx, 'senha_alterada');
    sendJson(ctx.res, 200, { ok: true });
  });
}

module.exports = { registerAuthRoutes };
