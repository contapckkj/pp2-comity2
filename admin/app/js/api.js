// Cliente da API administrativa: cookie de sessão (HttpOnly) + token CSRF no cabeçalho.

let csrfToken = '';
let onUnauthorized = () => {};

export class ApiError extends Error {
  constructor(status, message, errors) {
    super(message);
    this.status = status;
    this.errors = errors || null;
  }
}

export const setCsrf = (token) => {
  csrfToken = token;
};
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

export async function api(method, path, body) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['X-CSRF-Token'] = csrfToken;

  let res;
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'Sem conexão com o servidor. Verifique a internet e tente de novo.');
  }
  const data = await res.json().catch(() => ({}));
  if (res.ok) return data;
  if (res.status === 401) onUnauthorized();
  throw new ApiError(res.status, data.error || 'Algo deu errado. Tente novamente.', data.errors);
}

export const get = (path) => api('GET', path);
export const post = (path, body = {}) => api('POST', path, body);
export const patch = (path, body) => api('PATCH', path, body);
export const del = (path) => api('DELETE', path);
