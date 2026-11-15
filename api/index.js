'use strict';

const { loadConfig } = require('../src/config');
const { createApp } = require('../src/app');

// No Vercel o sistema de arquivos é read-only exceto /tmp.
// O banco fica em /tmp — dados são voláteis entre invocações frias.
const config = loadConfig({
  skipEnvFile: false,
  dbPath: '/tmp/p2.sqlite',
  host: '0.0.0.0',
  trustProxy: 1,
});

const app = createApp(config);

module.exports = app.handler;
