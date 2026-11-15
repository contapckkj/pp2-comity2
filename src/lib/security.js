'use strict';

const crypto = require('node:crypto');
const { HttpError } = require('./errors');

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];

function applySecurityHeaders(res, { production }) {
  res.setHeader('Content-Security-Policy', (production ? [...CSP, 'upgrade-insecure-requests'] : CSP).join('; '));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  if (production) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

/**
 * Limitador de janela deslizante, em memória. Suficiente para uma instância única;
 * com várias instâncias, mova para um armazenamento compartilhado.
 */
function createRateLimiter({ windowMs, max, maxKeys = 10000 }) {
  const hits = new Map();

  const sweep = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, stamps] of hits) {
      if (stamps[stamps.length - 1] <= cutoff) hits.delete(key);
    }
  }, Math.min(windowMs, 60 * 1000));
  sweep.unref();

  return {
    /** Registra uma tentativa. */
    hit(key) {
      const now = Date.now();
      const cutoff = now - windowMs;
      const stamps = (hits.get(key) || []).filter((t) => t > cutoff);
      if (stamps.length >= max) {
        hits.set(key, stamps);
        return { allowed: false, retryAfter: Math.max(1, Math.ceil((stamps[0] + windowMs - now) / 1000)) };
      }
      stamps.push(now);
      hits.delete(key); // reinsere para manter a ordem de uso (LRU simples)
      hits.set(key, stamps);
      if (hits.size > maxKeys) hits.delete(hits.keys().next().value);
      return { allowed: true, retryAfter: 0 };
    },
    reset(key) {
      hits.delete(key);
    },
  };
}

/** Aplica o limitador ou lança 429 com Retry-After. */
function enforceLimit(limiter, key, message = 'Muitas tentativas. Aguarde alguns minutos e tente novamente.') {
  const result = limiter.hit(key);
  if (!result.allowed) {
    throw new HttpError(429, message, { headers: { 'Retry-After': String(result.retryAfter) } });
  }
}

/** Rejeita requisições de escrita vindas de outra origem. */
function checkOrigin(req) {
  const origin = req.headers.origin;
  if (origin) {
    let host;
    try {
      host = new URL(origin).host;
    } catch {
      throw new HttpError(403, 'Origem inválida.');
    }
    if (host !== req.headers.host) throw new HttpError(403, 'Origem não permitida.');
    return;
  }
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') {
    throw new HttpError(403, 'Origem não permitida.');
  }
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** IP do cliente. Só confia em X-Forwarded-For quando TRUST_PROXY > 0. */
function clientIp(req, trustProxy) {
  if (trustProxy > 0) {
    const forwarded = String(req.headers['x-forwarded-for'] || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (forwarded.length) return forwarded[Math.max(0, forwarded.length - trustProxy)];
  }
  return (req.socket.remoteAddress || 'desconhecido').replace(/^::ffff:/, '');
}

module.exports = { applySecurityHeaders, createRateLimiter, enforceLimit, checkOrigin, safeEqual, clientIp };
