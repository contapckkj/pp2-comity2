'use strict';

/**
 * Erro com status HTTP. `errors` leva mensagens por campo (validação);
 * `headers` permite, por exemplo, Retry-After.
 */
class HttpError extends Error {
  constructor(status, message, { errors, headers } = {}) {
    super(message);
    this.status = status;
    this.errors = errors;
    this.headers = headers;
  }
}

module.exports = { HttpError };
