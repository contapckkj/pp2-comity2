'use strict';

const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function loadEnvFile() {
  try {
    // Não sobrescreve variáveis já definidas no ambiente.
    process.loadEnvFile(path.join(ROOT, '.env'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

const toInt = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

const MINUTE = 60 * 1000;

/**
 * Lê a configuração do ambiente. `overrides` existe para testes.
 */
function loadConfig(overrides = {}) {
  if (!overrides.skipEnvFile) loadEnvFile();
  const env = process.env;
  const production = env.NODE_ENV === 'production';
  const whatsapp = (env.WHATSAPP_NUMBER || '').replace(/\D/g, '');
  const cookieSecure =
    env.COOKIE_SECURE !== undefined ? ['1', 'true'].includes(env.COOKIE_SECURE) : production;

  const config = {
    root: ROOT,
    production,
    host: env.HOST || '127.0.0.1',
    port: toInt(env.PORT, 3000),
    dbPath: path.resolve(ROOT, env.DB_PATH || 'data/p2.sqlite'),
    timezone: env.APP_TIMEZONE || 'America/Sao_Paulo',
    trustProxy: toInt(env.TRUST_PROXY, 0),

    companyName: env.COMPANY_NAME || 'P2 Automações',
    whatsappNumber: /^\d{10,15}$/.test(whatsapp) ? whatsapp : '',
    contactEmail: env.CONTACT_EMAIL || '',

    cookieSecure,
    cookieName: cookieSecure ? '__Host-p2sid' : 'p2sid',
    sessionIdleMinutes: toInt(env.SESSION_IDLE_MINUTES, 120),
    sessionMaxHours: toInt(env.SESSION_MAX_HOURS, 12),

    logRequests: env.LOG_REQUESTS !== '0',

    limits: {
      loginPerIp: { windowMs: 15 * MINUTE, max: 10 },
      passwordPerUser: { windowMs: 15 * MINUTE, max: 5 },
      leadsPerIp: { windowMs: 60 * MINUTE, max: 10 },
      apiPerIp: { windowMs: MINUTE, max: 600 },
      lockout: { maxFailures: 5, lockMs: 15 * MINUTE },
    },
  };

  return Object.freeze({ ...config, ...overrides });
}

module.exports = { loadConfig };
