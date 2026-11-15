'use strict';

/**
 * Definição declarativa das entidades administrativas.
 * Para criar um novo cadastro: crie a tabela (migração), declare a entidade aqui
 * e adicione-a em `ENTITIES`. As rotas, validação e auditoria vêm de `lib/crud.js`.
 */

const SERVICES = ['cardapio_digital', 'site_comercial', 'nfc', 'automacao', 'outro'];

const nowIso = () => new Date().toISOString();

const clients = {
  name: 'clients',
  table: 'clients',
  alias: 'c',
  permission: 'clients',
  select: 'SELECT c.* FROM clients c',
  fields: {
    name: { type: 'string', required: true, max: 120 },
    company: { type: 'string', max: 120 },
    email: { type: 'email' },
    phone: { type: 'string', max: 40 },
    status: { type: 'enum', values: ['prospect', 'ativo', 'inativo'], default: 'ativo' },
    notes: { type: 'text', max: 2000 },
  },
  search: ['c.name', 'c.company', 'c.email', 'c.phone'],
  filters: { status: 'c.status' },
  orderBy: 'c.name COLLATE NOCASE ASC, c.id ASC',
};

const projects = {
  name: 'projects',
  table: 'projects',
  alias: 'p',
  permission: 'projects',
  select: `SELECT p.*, c.name AS client_name
             FROM projects p LEFT JOIN clients c ON c.id = p.client_id`,
  fields: {
    name: { type: 'string', required: true, max: 140 },
    client_id: { type: 'ref', table: 'clients' },
    service: { type: 'enum', values: SERVICES, default: 'outro' },
    status: {
      type: 'enum',
      values: ['proposta', 'em_andamento', 'pausado', 'concluido', 'cancelado'],
      default: 'proposta',
    },
    budget_cents: { type: 'cents', default: 0 },
    progress: { type: 'int', min: 0, max: 100, default: 0 },
    start_date: { type: 'date' },
    due_date: { type: 'date' },
    description: { type: 'text', max: 2000 },
  },
  search: ['p.name', 'c.name'],
  filters: { status: 'p.status', service: 'p.service', client_id: 'p.client_id' },
  orderBy: `CASE p.status WHEN 'em_andamento' THEN 0 WHEN 'proposta' THEN 1 WHEN 'pausado' THEN 2 ELSE 3 END,
            p.due_date IS NULL, p.due_date ASC, p.id DESC`,
};

const sales = {
  name: 'sales',
  table: 'sales',
  alias: 's',
  permission: 'sales',
  select: `SELECT s.*, c.name AS client_name
             FROM sales s LEFT JOIN clients c ON c.id = s.client_id`,
  fields: {
    description: { type: 'string', required: true, max: 200 },
    client_id: { type: 'ref', table: 'clients' },
    project_id: { type: 'ref', table: 'projects' },
    service: { type: 'enum', values: SERVICES, default: 'outro' },
    status: {
      type: 'enum',
      values: ['negociacao', 'proposta_enviada', 'fechada', 'perdida'],
      default: 'negociacao',
    },
    amount_cents: { type: 'cents', required: true },
    sale_date: { type: 'date', required: true },
  },
  search: ['s.description', 'c.name'],
  filters: { status: 's.status', service: 's.service' },
  monthColumn: 's.sale_date',
  orderBy: 's.sale_date DESC, s.id DESC',
};

const transactions = {
  name: 'transactions',
  table: 'transactions',
  alias: 't',
  permission: 'transactions',
  select: `SELECT t.*, c.name AS client_name, p.name AS project_name
             FROM transactions t
             LEFT JOIN clients c ON c.id = t.client_id
             LEFT JOIN projects p ON p.id = t.project_id`,
  fields: {
    kind: { type: 'enum', values: ['receita', 'despesa'], required: true },
    description: { type: 'string', required: true, max: 200 },
    category: { type: 'string', max: 60 },
    amount_cents: { type: 'cents', required: true },
    date: { type: 'date', required: true },
    status: { type: 'enum', values: ['pendente', 'pago'], default: 'pendente' },
    client_id: { type: 'ref', table: 'clients' },
    project_id: { type: 'ref', table: 'projects' },
  },
  search: ['t.description', 't.category', 'c.name'],
  filters: { kind: 't.kind', status: 't.status' },
  monthColumn: 't.date',
  orderBy: 't.date DESC, t.id DESC',
};

const tasks = {
  name: 'tasks',
  table: 'tasks',
  alias: 't',
  permission: 'tasks',
  select: `SELECT t.*, p.name AS project_name, u.name AS assignee_name
             FROM tasks t
             LEFT JOIN projects p ON p.id = t.project_id
             LEFT JOIN users u ON u.id = t.assignee_id`,
  fields: {
    title: { type: 'string', required: true, max: 160 },
    description: { type: 'text', max: 2000 },
    status: { type: 'enum', values: ['pendente', 'em_andamento', 'concluida'], default: 'pendente' },
    priority: { type: 'enum', values: ['baixa', 'media', 'alta'], default: 'media' },
    due_date: { type: 'date' },
    project_id: { type: 'ref', table: 'projects' },
    assignee_id: { type: 'ref', table: 'users' },
  },
  search: ['t.title', 'p.name'],
  filters: { status: 't.status', priority: 't.priority' },
  orderBy: `CASE t.status WHEN 'concluida' THEN 1 ELSE 0 END, t.due_date IS NULL, t.due_date ASC, t.id DESC`,
  beforeSave(values, existing) {
    if ('status' in values) {
      values.completed_at = values.status === 'concluida' ? existing?.completed_at || nowIso() : null;
    }
  },
};

const leads = {
  name: 'leads',
  table: 'leads',
  alias: 'l',
  permission: 'leads',
  select: 'SELECT l.* FROM leads l',
  fields: {
    name: { type: 'string', required: true, max: 120 },
    email: { type: 'email' },
    phone: { type: 'string', max: 40 },
    service: { type: 'enum', values: SERVICES },
    message: { type: 'text', max: 2000 },
    notes: { type: 'text', max: 2000 },
    status: { type: 'enum', values: ['novo', 'contatado', 'convertido', 'descartado'], default: 'novo' },
  },
  search: ['l.name', 'l.email', 'l.phone', 'l.message'],
  filters: { status: 'l.status' },
  orderBy: `CASE l.status WHEN 'novo' THEN 0 WHEN 'contatado' THEN 1 ELSE 2 END, l.created_at DESC, l.id DESC`,
};

const ENTITIES = [clients, projects, sales, transactions, tasks, leads];

module.exports = { ENTITIES, SERVICES };
