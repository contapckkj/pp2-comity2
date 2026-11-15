'use strict';

const { transaction } = require('../db');
const { addDays, monthKeys } = require('./dates');

/**
 * Dados DEMONSTRATIVOS. Todo registro é gravado com is_demo = 1, nome iniciado por "[Demo]"
 * e e-mails no domínio reservado .invalid. A interface mostra o selo "Demo" e permite remover tudo.
 */

const DEMO_TABLES = ['tasks', 'transactions', 'sales', 'projects', 'leads', 'clients'];

function rng(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BUSINESSES = [
  'Padaria', 'Pizzaria', 'Clínica', 'Barbearia', 'Loja de Roupas', 'Academia',
  'Restaurante', 'Cafeteria', 'Oficina', 'Estúdio', 'Mercado', 'Hamburgueria',
];
const SERVICES = ['cardapio_digital', 'site_comercial', 'nfc', 'automacao'];
const SERVICE_LABEL = {
  cardapio_digital: 'Cardápio digital',
  site_comercial: 'Site comercial',
  nfc: 'Solução com NFC',
  automacao: 'Automação',
};
const EXPENSES = ['Hospedagem e domínios', 'Ferramentas e licenças', 'Impostos', 'Marketing', 'Internet e telefonia'];

function countDemo(db) {
  return DEMO_TABLES.reduce(
    (sum, table) => sum + db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE is_demo = 1`).get().n,
    0,
  );
}

function clearDemoData(db) {
  return transaction(db, () => {
    let removed = 0;
    for (const table of DEMO_TABLES) {
      removed += Number(db.prepare(`DELETE FROM ${table} WHERE is_demo = 1`).run().changes);
    }
    return removed;
  });
}

/** @returns {number} quantidade de registros criados (0 se já havia demo) */
function insertDemoData(db, today) {
  if (countDemo(db) > 0) return 0;
  const rand = rng(20260);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const between = (min, max) => Math.round(min + rand() * (max - min));
  const cents = (reaisMin, reaisMax) => between(reaisMin, reaisMax) * 100;

  return transaction(db, () => {
    let created = 0;
    const clientIds = [];
    const projectRows = [];

    const insertClient = db.prepare(
      `INSERT INTO clients (name, company, email, status, notes, is_demo) VALUES (?, ?, ?, ?, ?, 1)`,
    );
    BUSINESSES.forEach((kind, i) => {
      const status = i < 8 ? 'ativo' : i < 10 ? 'prospect' : 'inativo';
      const result = insertClient.run(
        `[Demo] ${kind} Exemplo`,
        `${kind} Exemplo Ltda (demonstrativo)`,
        `contato${i + 1}@exemplo.invalid`,
        status,
        'Registro demonstrativo. Pode ser removido em Configurações.',
      );
      clientIds.push(Number(result.lastInsertRowid));
      created += 1;
    });

    const insertProject = db.prepare(
      `INSERT INTO projects (client_id, name, service, status, budget_cents, progress, start_date, due_date, description, is_demo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    );
    const projectStatuses = [
      'em_andamento', 'em_andamento', 'em_andamento', 'em_andamento', 'proposta', 'proposta',
      'concluido', 'concluido', 'concluido', 'concluido', 'pausado', 'cancelado',
    ];
    projectStatuses.forEach((status, i) => {
      const service = SERVICES[i % SERVICES.length];
      const clientId = clientIds[i % clientIds.length];
      const done = status === 'concluido';
      const start = addDays(today, -between(done ? 60 : 5, done ? 200 : 70));
      const due = done ? addDays(start, between(20, 50)) : addDays(today, between(i === 2 ? -8 : 5, 60));
      const progress = done ? 100 : status === 'em_andamento' ? between(15, 90) : status === 'pausado' ? 40 : 0;
      const result = insertProject.run(
        clientId,
        `[Demo] ${SERVICE_LABEL[service]} — projeto ${i + 1}`,
        service,
        status,
        cents(900, 9000),
        progress,
        start,
        due,
        'Projeto demonstrativo.',
      );
      projectRows.push({ id: Number(result.lastInsertRowid), clientId });
      created += 1;
    });

    const insertSale = db.prepare(
      `INSERT INTO sales (client_id, description, service, status, amount_cents, sale_date, is_demo)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
    );
    const saleStatuses = [
      ...Array(11).fill('fechada'), ...Array(3).fill('perdida'),
      ...Array(3).fill('negociacao'), ...Array(3).fill('proposta_enviada'),
    ];
    saleStatuses.forEach((status, i) => {
      const open = status === 'negociacao' || status === 'proposta_enviada';
      const service = pick(SERVICES);
      insertSale.run(
        pick(clientIds),
        `[Demo] ${SERVICE_LABEL[service]}`,
        service,
        status,
        cents(700, 8000),
        open ? addDays(today, between(0, 20)) : addDays(today, -between(3, 330)),
      );
      created += 1;
      return i;
    });

    const insertTx = db.prepare(
      `INSERT INTO transactions (kind, description, category, amount_cents, date, status, client_id, project_id, is_demo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    );
    const months = monthKeys(today, 12);
    months.forEach((month, index) => {
      const last = index === months.length - 1;
      const monthDay = (day) => `${month}-${String(day).padStart(2, '0')}`;
      const maxDay = last ? Number(today.slice(8, 10)) : 28;
      const revenues = between(3, 5);
      for (let n = 0; n < revenues; n += 1) {
        const project = pick(projectRows);
        insertTx.run(
          'receita', '[Demo] Recebimento de projeto', 'Serviços',
          cents(600, 3500), monthDay(between(1, Math.max(1, maxDay))), 'pago',
          project.clientId, project.id,
        );
        created += 1;
      }
      for (let n = 0; n < between(2, 4); n += 1) {
        insertTx.run(
          'despesa', '[Demo] Despesa operacional', pick(EXPENSES),
          cents(120, 900), monthDay(between(1, Math.max(1, maxDay))), 'pago', null, null,
        );
        created += 1;
      }
    });
    // A receber (um vencido, outros futuros).
    [[-6, 'pendente'], [4, 'pendente'], [12, 'pendente']].forEach(([offset, status]) => {
      const project = pick(projectRows);
      insertTx.run(
        'receita', '[Demo] Parcela a receber', 'Serviços',
        cents(500, 2500), addDays(today, offset), status, project.clientId, project.id,
      );
      created += 1;
    });

    const insertTask = db.prepare(
      `INSERT INTO tasks (title, description, status, priority, due_date, project_id, completed_at, is_demo)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    );
    const taskTitles = [
      'Enviar proposta comercial', 'Revisar layout do cardápio', 'Configurar fluxo de automação',
      'Gravar tags NFC', 'Publicar site no domínio do cliente', 'Reunião de acompanhamento',
      'Emitir cobrança', 'Testar formulário de contato', 'Treinar equipe do cliente',
      'Atualizar catálogo de produtos', 'Ajustar integração com WhatsApp', 'Backup mensal',
    ];
    taskTitles.forEach((title, i) => {
      const status = i < 4 ? 'concluida' : i < 7 ? 'em_andamento' : 'pendente';
      const due = addDays(today, status === 'concluida' ? -between(1, 15) : between(i === 5 ? -3 : 0, 20));
      insertTask.run(
        `[Demo] ${title}`, 'Tarefa demonstrativa.', status, pick(['baixa', 'media', 'alta']), due,
        pick(projectRows).id, status === 'concluida' ? `${due}T12:00:00.000Z` : null,
      );
      created += 1;
    });

    const insertLead = db.prepare(
      `INSERT INTO leads (name, email, message, service, status, source, is_demo) VALUES (?, ?, ?, ?, ?, 'demo', 1)`,
    );
    [
      ['novo', 'cardapio_digital'], ['novo', 'automacao'], ['contatado', 'site_comercial'],
      ['convertido', 'nfc'], ['descartado', 'outro'],
    ].forEach(([status, service], i) => {
      insertLead.run(
        `[Demo] Contato ${i + 1}`, `lead${i + 1}@exemplo.invalid`,
        'Mensagem demonstrativa recebida pelo formulário.', service, status,
      );
      created += 1;
    });

    return created;
  });
}

module.exports = { insertDemoData, clearDemoData, countDemo };
