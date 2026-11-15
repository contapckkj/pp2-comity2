'use strict';

const { HttpError } = require('./errors');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Executa a cadeia de handlers `(ctx, next)`. */
async function run(handlers, ctx) {
  let index = -1;
  const next = async () => {
    index += 1;
    if (index < handlers.length) await handlers[index](ctx, next);
  };
  await next();
}

class Router {
  constructor() {
    /** Lista pública de rotas (usada nos testes para checar proteção). */
    this.routes = [];
  }

  add(method, pattern, handlers) {
    const keys = [];
    // ':nome' casa um segmento; '*' no fim casa o resto do caminho (sem decodificar).
    const source = escapeRegex(pattern)
      .replace(/:([A-Za-z_]+)/g, (_, key) => {
        keys.push(key);
        return '([^/]+)';
      })
      .replace(/\\\*/g, () => {
        keys.push('rest');
        return '(.*)';
      });
    this.routes.push({
      method,
      pattern,
      regex: new RegExp(`^${source}/?$`),
      keys,
      handlers: handlers.flat(),
    });
  }

  get(pattern, ...handlers) {
    this.add('GET', pattern, handlers);
  }

  post(pattern, ...handlers) {
    this.add('POST', pattern, handlers);
  }

  patch(pattern, ...handlers) {
    this.add('PATCH', pattern, handlers);
  }

  delete(pattern, ...handlers) {
    this.add('DELETE', pattern, handlers);
  }

  /** @returns {Promise<boolean>} true se alguma rota tratou a requisição */
  async handle(ctx) {
    const method = ctx.req.method;
    let pathMatched = false;
    for (const route of this.routes) {
      const match = route.regex.exec(ctx.path);
      if (!match) continue;
      pathMatched = true;
      if (route.method !== method && !(route.method === 'GET' && method === 'HEAD')) continue;
      ctx.params = {};
      try {
        route.keys.forEach((key, i) => {
          ctx.params[key] = decodeURIComponent(match[i + 1]);
        });
      } catch {
        throw new HttpError(400, 'Endereço inválido.');
      }
      await run(route.handlers, ctx);
      return true;
    }
    if (pathMatched) throw new HttpError(405, 'Método não permitido.');
    return false;
  }
}

module.exports = { Router };
