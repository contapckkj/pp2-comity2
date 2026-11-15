'use strict';

/**
 * Cria (ou redefine a senha de) um acesso de CEO.
 *   npm run create-ceo -- --name "Nome" --email nome@empresa.com
 * A senha é pedida no terminal (oculta). Em pipe, a 1ª linha do stdin é a senha.
 * Para redefinir a senha de um CEO existente, use --reset.
 */

const readline = require('node:readline/promises');
const { loadConfig } = require('../config');
const { openDatabase } = require('../db');
const { hashPassword, validatePassword } = require('../lib/auth');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function readHidden(label) {
  return new Promise((resolve) => {
    process.stdout.write(label);
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      let data = '';
      stdin.setEncoding('utf8');
      stdin.on('data', (chunk) => (data += chunk));
      stdin.on('end', () => resolve(data.split(/\r?\n/)[0]));
      return;
    }
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') process.exit(130);
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  let name = arg('name');
  let email = arg('email');
  const reset = process.argv.includes('--reset');

  if ((!name || !email) && process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    name ||= (await rl.question('Nome: ')).trim();
    email ||= (await rl.question('E-mail: ')).trim();
    rl.close();
  }
  email = (email || '').trim().toLowerCase();
  name = (name || '').trim();
  if (!email || (!name && !reset)) {
    console.error('Informe --name e --email.');
    process.exit(1);
  }

  const password = await readHidden('Senha (mín. 12 caracteres, com letras e números): ');
  if (process.stdin.isTTY) {
    const again = await readHidden('Repita a senha: ');
    if (again !== password) {
      console.error('As senhas não conferem.');
      process.exit(1);
    }
  }
  const problem = validatePassword(password, { email });
  if (problem) {
    console.error(problem);
    process.exit(1);
  }

  const db = openDatabase(loadConfig().dbPath);
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  const hash = await hashPassword(password);

  if (existing && !reset) {
    console.error('Já existe um usuário com este e-mail. Use --reset para trocar a senha.');
    process.exit(1);
  }
  if (existing) {
    db.prepare('UPDATE users SET password_hash = ?, failed_attempts = 0, locked_until = NULL, active = 1 WHERE id = ?').run(hash, existing.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(existing.id);
    console.log(`Senha redefinida para ${email}. Sessões anteriores foram encerradas.`);
  } else {
    db.prepare(
      `INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, 'ceo', ?)`,
    ).run(name, email, hash, Date.now());
    console.log(`CEO criado: ${name} <${email}>`);
  }
  db.close();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
