'use strict';

const http = require('node:http');
const { loadConfig } = require('./config');
const { createApp } = require('./app');

const config = loadConfig();
const app = createApp(config);

const server = http.createServer(app.handler);
server.requestTimeout = 30 * 1000;
server.headersTimeout = 15 * 1000;
server.keepAliveTimeout = 5 * 1000;

server.listen(config.port, config.host, () => {
  console.log(`${config.companyName} no ar em http://${config.host}:${config.port}`);
  if (app.db.prepare('SELECT COUNT(*) AS n FROM users').get().n === 0) {
    console.warn('Nenhum CEO cadastrado. Crie o primeiro acesso com: npm run create-ceo');
  }
  if (config.production && !config.cookieSecure) {
    console.warn('Produção sem COOKIE_SECURE: o cookie de sessão não terá o atributo Secure.');
  }
  if (!config.whatsappNumber) {
    console.warn('WHATSAPP_NUMBER não definido: os botões de WhatsApp levarão ao formulário de contato.');
  }
});

function shutdown(signal) {
  console.log(`${signal} recebido. Encerrando…`);
  server.close(() => {
    app.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10 * 1000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
