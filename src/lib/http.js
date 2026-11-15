'use strict';

const { HttpError } = require('./errors');

function sendJson(res, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    ...headers,
  });
  res.end(payload);
}

function redirect(res, location, status = 302) {
  res.writeHead(status, { Location: location, 'Content-Length': 0 });
  res.end();
}

/** Lê o corpo como JSON (somente application/json, com limite de tamanho). */
async function readJson(req, limit = 64 * 1024) {
  const type = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') {
    throw new HttpError(415, 'Envie o corpo da requisição como application/json.');
  }
  const tooBig = () =>
    new HttpError(413, 'Corpo da requisição grande demais.', {
      headers: { Connection: 'close' },
    });
  if (Number(req.headers['content-length']) > limit) throw tooBig();

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw tooBig();
    chunks.push(chunk);
  }
  if (size === 0) return {};

  let data;
  try {
    data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'JSON inválido.');
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new HttpError(400, 'O corpo deve ser um objeto JSON.');
  }
  return data;
}

function parseCookies(header = '') {
  const cookies = Object.create(null);
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    const raw = part.slice(i + 1).trim();
    if (!name || name in cookies) continue;
    try {
      cookies[name] = decodeURIComponent(raw);
    } catch {
      cookies[name] = raw;
    }
  }
  return cookies;
}

function serializeCookie(name, value, { maxAgeSeconds, secure, sameSite = 'Strict' } = {}) {
  const attrs = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', `SameSite=${sameSite}`];
  if (secure) attrs.push('Secure');
  if (maxAgeSeconds !== undefined) attrs.push(`Max-Age=${Math.floor(maxAgeSeconds)}`);
  return attrs.join('; ');
}

module.exports = { sendJson, redirect, readJson, parseCookies, serializeCookie };
