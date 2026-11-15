'use strict';

/**
 * Carrega ou remove os dados DEMONSTRATIVOS (marcados com is_demo = 1).
 *   npm run demo:load
 *   npm run demo:clear
 */

const { loadConfig } = require('../config');
const { openDatabase } = require('../db');
const { todayLocal } = require('../lib/dates');
const { insertDemoData, clearDemoData } = require('../lib/demo');

const config = loadConfig();
const db = openDatabase(config.dbPath);

if (process.argv.includes('--clear')) {
  console.log(`${clearDemoData(db)} registros demonstrativos removidos.`);
} else {
  const created = insertDemoData(db, todayLocal(config.timezone));
  console.log(created ? `${created} registros demonstrativos criados.` : 'Os dados demonstrativos já estão carregados.');
}
db.close();
