'use strict';

/**
 * Migrações em ordem. NUNCA edite uma migração já aplicada: adicione uma nova ao fim.
 * Datas de negócio: TEXT 'YYYY-MM-DD'. Valores em centavos (INTEGER).
 * Campos de segurança (sessões, bloqueio): epoch em milissegundos.
 */
module.exports = [
  /* 1 — esquema inicial */
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER,
    last_login_at INTEGER,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    ip TEXT,
    user_agent TEXT
  );
  CREATE INDEX idx_sessions_user ON sessions(user_id);
  CREATE INDEX idx_sessions_expires ON sessions(expires_at);

  CREATE TABLE clients (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    company TEXT,
    email TEXT,
    phone TEXT,
    status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('prospect','ativo','inativo')),
    notes TEXT,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX idx_clients_status ON clients(status);

  CREATE TABLE projects (
    id INTEGER PRIMARY KEY,
    client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    service TEXT NOT NULL DEFAULT 'outro'
      CHECK (service IN ('cardapio_digital','site_comercial','nfc','automacao','outro')),
    status TEXT NOT NULL DEFAULT 'proposta'
      CHECK (status IN ('proposta','em_andamento','pausado','concluido','cancelado')),
    budget_cents INTEGER NOT NULL DEFAULT 0 CHECK (budget_cents >= 0),
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    start_date TEXT,
    due_date TEXT,
    description TEXT,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX idx_projects_client ON projects(client_id);
  CREATE INDEX idx_projects_status ON projects(status);

  CREATE TABLE sales (
    id INTEGER PRIMARY KEY,
    client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    service TEXT NOT NULL DEFAULT 'outro'
      CHECK (service IN ('cardapio_digital','site_comercial','nfc','automacao','outro')),
    status TEXT NOT NULL DEFAULT 'negociacao'
      CHECK (status IN ('negociacao','proposta_enviada','fechada','perdida')),
    amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
    sale_date TEXT NOT NULL,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX idx_sales_status ON sales(status);
  CREATE INDEX idx_sales_date ON sales(sale_date);

  CREATE TABLE transactions (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('receita','despesa')),
    description TEXT NOT NULL,
    category TEXT,
    amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
    date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','pago')),
    client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX idx_transactions_date ON transactions(date);
  CREATE INDEX idx_transactions_kind_status ON transactions(kind, status);

  CREATE TABLE tasks (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','em_andamento','concluida')),
    priority TEXT NOT NULL DEFAULT 'media' CHECK (priority IN ('baixa','media','alta')),
    due_date TEXT,
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    completed_at TEXT,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX idx_tasks_status ON tasks(status);
  CREATE INDEX idx_tasks_due ON tasks(due_date);

  CREATE TABLE leads (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    service TEXT,
    message TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'novo' CHECK (status IN ('novo','contatado','convertido','descartado')),
    source TEXT NOT NULL DEFAULT 'site',
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX idx_leads_status ON leads(status);

  CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY,
    user_id INTEGER,
    email TEXT,
    action TEXT NOT NULL,
    entity TEXT,
    entity_id INTEGER,
    detail TEXT,
    ip TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX idx_audit_created ON audit_log(created_at);
  `,
];
