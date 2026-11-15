'use strict';

const path = require('node:path');
const { loadConfig } = require('../src/config');
const { createApp } = require('../src/app');

const config = loadConfig({
  skipEnvFile: false,
  dbPath: '/tmp/p2.sqlite',
  host: '0.0.0.0',
  trustProxy: 1,
  root: path.resolve(__dirname, '..'),
});

const app = createApp(config);

module.exports = app.handler;
