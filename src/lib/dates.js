'use strict';

/** Data de hoje (YYYY-MM-DD) no fuso da empresa, não no do servidor. */
function todayLocal(timezone, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function parts(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return { y, m, d };
}

function addDays(dateStr, days) {
  const { y, m, d } = parts(dateStr);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Últimos `count` meses ('YYYY-MM'), do mais antigo ao mês atual. */
function monthKeys(dateStr, count) {
  const { y, m } = parts(dateStr);
  const keys = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    keys.push(new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7));
  }
  return keys;
}

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const { y, m, d } = parts(value);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

module.exports = { todayLocal, addDays, monthKeys, isValidDate };
