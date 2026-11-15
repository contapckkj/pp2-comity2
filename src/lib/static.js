'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { HttpError } = require('./errors');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.mjs', '.json', '.svg', '.txt', '.xml', '.webmanifest']);

/**
 * Servidor de arquivos estáticos com ETag, gzip em cache e proteção contra path traversal.
 * Retorna uma função `serve(req, res, urlPath, extraHeaders)` → true se respondeu.
 */
function createStaticServer(rootDir) {
  const root = path.resolve(rootDir);
  const cache = new Map();

  function locate(urlPath) {
    let rel;
    try {
      rel = decodeURIComponent(urlPath);
    } catch {
      throw new HttpError(400, 'Endereço inválido.');
    }
    if (rel.includes('\0') || rel.includes('\\')) throw new HttpError(400, 'Endereço inválido.');
    if (rel.endsWith('/')) rel += 'index.html';

    const segments = path.posix.normalize(rel).split('/').filter(Boolean);
    // Sem arquivos ocultos (.env, .git…) nem subida de diretório.
    if (segments.some((s) => s.startsWith('.'))) return null;

    const file = path.resolve(root, ...segments);
    if (file !== root && !file.startsWith(root + path.sep)) return null;
    return file;
  }

  function load(file, stat) {
    const hit = cache.get(file);
    if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return hit;
    const ext = path.extname(file).toLowerCase();
    const body = fs.readFileSync(file);
    const entry = {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      body,
      gzip: COMPRESSIBLE.has(ext) && body.length > 512 ? zlib.gzipSync(body, { level: 9 }) : null,
      etag: `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`,
      type: TYPES[ext] || 'application/octet-stream',
      isHtml: ext === '.html',
    };
    cache.set(file, entry);
    return entry;
  }

  return function serve(req, res, urlPath, extraHeaders = {}) {
    const file = locate(urlPath);
    if (!file) return false;

    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      return false;
    }
    if (!stat.isFile()) return false;

    const entry = load(file, stat);
    const headers = {
      'Content-Type': entry.type,
      ETag: entry.etag,
      'Cache-Control': entry.isHtml ? 'no-cache' : 'public, max-age=3600',
      Vary: 'Accept-Encoding',
      ...extraHeaders,
    };

    if (req.headers['if-none-match'] === entry.etag) {
      res.writeHead(304, headers);
      res.end();
      return true;
    }

    let body = entry.body;
    if (entry.gzip && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
      body = entry.gzip;
      headers['Content-Encoding'] = 'gzip';
    }
    headers['Content-Length'] = body.length;
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : body);
    return true;
  };
}

module.exports = { createStaticServer };
