// Configuração declarativa de cada cadastro. Para criar outro, adicione uma entrada aqui
// (e o equivalente em src/entities.js no servidor).
import { patch, post } from './api.js';
import {
  h, badge, demoBadge, brl, fmtDate, fmtDateTime, optionsOf, serviceOptions, SERVICES, toast, confirmDialog,
} from './dom.js';
import { entityView } from './entity.js';

const name = (row, sub) =>
  h('div', null,
    h('div', { class: 'cell-main' }, row.name || row.title || row.description, row.is_demo ? ' ' : null, row.is_demo ? demoBadge() : null),
    sub ? h('div', { class: 'cell-sub' }, sub) : null);

const filterOf = (param, label, all, options) => ({ param, label, all, options });

/* ---------- Clientes ---------- */
export const clientsView = entityView({
  api: 'clients', title: 'Clientes', singular: 'Cliente', createLabel: 'Novo cliente',
  intro: 'Quem compra, quem está em negociação e quem já comprou.',
  searchPlaceholder: 'Nome, empresa, e-mail ou telefone',
  emptyTitle: 'Nenhum cliente ainda',
  emptyText: 'Cadastre o primeiro cliente para vincular projetos, vendas e lançamentos.',
  rowName: (r) => r.name,
  defaults: { status: 'ativo' },
  filters: [filterOf('status', 'Situação', 'Todas', optionsOf('client'))],
  columns: [
    { label: 'Cliente', cell: (r) => name(r, r.company) },
    { label: 'Contato', cell: (r) => h('div', null, r.email || '—', r.phone ? h('div', { class: 'cell-sub' }, r.phone) : null) },
    { label: 'Situação', cell: (r) => badge('client', r.status) },
    { label: 'Cadastro', cell: (r) => fmtDate(r.created_at) },
  ],
  fields: [
    { name: 'name', label: 'Nome', type: 'text', required: true, max: 120, full: true },
    { name: 'company', label: 'Empresa', type: 'text', max: 120 },
    { name: 'status', label: 'Situação', type: 'select', required: true, options: optionsOf('client') },
    { name: 'email', label: 'E-mail', type: 'email', max: 160 },
    { name: 'phone', label: 'Telefone', type: 'text', max: 40 },
    { name: 'notes', label: 'Observações', type: 'textarea', full: true },
  ],
});

/* ---------- Projetos ---------- */
export const projectsView = entityView({
  api: 'projects', title: 'Projetos', singular: 'Projeto', createLabel: 'Novo projeto',
  intro: 'Acompanhe o andamento, o prazo e o valor de cada projeto.',
  searchPlaceholder: 'Nome do projeto ou cliente',
  emptyTitle: 'Nenhum projeto ainda',
  emptyText: 'Cadastre um projeto para acompanhar prazo, progresso e valor.',
  rowName: (r) => r.name,
  defaults: { status: 'proposta', service: 'outro', progress: 0 },
  filters: [
    filterOf('status', 'Situação', 'Todas', optionsOf('project')),
    filterOf('service', 'Serviço', 'Todos', serviceOptions()),
  ],
  columns: [
    { label: 'Projeto', cell: (r) => name(r, r.client_name) },
    { label: 'Serviço', cell: (r) => SERVICES[r.service] || r.service },
    { label: 'Situação', cell: (r) => badge('project', r.status) },
    { label: 'Progresso', cell: (r) => h('div', { class: 'progress' },
      h('progress', { max: 100, value: r.progress, 'aria-label': `Progresso: ${r.progress}%` }), `${r.progress}%`) },
    { label: 'Prazo', cell: (r) => fmtDate(r.due_date) },
    { label: 'Valor', num: true, cell: (r) => brl(r.budget_cents) },
  ],
  fields: [
    { name: 'name', label: 'Nome do projeto', type: 'text', required: true, max: 140, full: true },
    { name: 'client_id', label: 'Cliente', type: 'lookup', lookup: 'clients' },
    { name: 'service', label: 'Serviço', type: 'select', required: true, options: serviceOptions() },
    { name: 'status', label: 'Situação', type: 'select', required: true, options: optionsOf('project') },
    { name: 'budget_cents', label: 'Valor (R$)', type: 'money', placeholder: '0,00' },
    { name: 'progress', label: 'Progresso (%)', type: 'int', min: 0, max: 100 },
    { name: 'start_date', label: 'Início', type: 'date' },
    { name: 'due_date', label: 'Prazo', type: 'date' },
    { name: 'description', label: 'Descrição', type: 'textarea', full: true },
  ],
});

/* ---------- Vendas ---------- */
export const salesView = entityView({
  api: 'sales', title: 'Vendas', singular: 'Venda', createLabel: 'Nova venda',
  intro: 'Negociações em andamento, vendas fechadas e perdidas.',
  searchPlaceholder: 'Descrição ou cliente',
  emptyTitle: 'Nenhuma venda ainda',
  emptyText: 'Registre uma venda para acompanhar negociações e o faturamento previsto.',
  rowName: (r) => r.description,
  monthFilter: true,
  defaults: { status: 'negociacao', service: 'outro' },
  filters: [
    filterOf('status', 'Situação', 'Todas', optionsOf('sale')),
    filterOf('service', 'Serviço', 'Todos', serviceOptions()),
  ],
  columns: [
    { label: 'Venda', cell: (r) => name(r, r.client_name) },
    { label: 'Serviço', cell: (r) => SERVICES[r.service] || r.service },
    { label: 'Situação', cell: (r) => badge('sale', r.status) },
    { label: 'Data', cell: (r) => fmtDate(r.sale_date) },
    { label: 'Valor', num: true, cell: (r) => brl(r.amount_cents) },
  ],
  fields: [
    { name: 'description', label: 'Descrição', type: 'text', required: true, max: 200, full: true },
    { name: 'client_id', label: 'Cliente', type: 'lookup', lookup: 'clients' },
    { name: 'project_id', label: 'Projeto', type: 'lookup', lookup: 'projects' },
    { name: 'service', label: 'Serviço', type: 'select', required: true, options: serviceOptions() },
    { name: 'status', label: 'Situação', type: 'select', required: true, options: optionsOf('sale') },
    { name: 'amount_cents', label: 'Valor (R$)', type: 'money', required: true, placeholder: '0,00' },
    { name: 'sale_date', label: 'Data', type: 'date', required: true },
  ],
});

/* ---------- Financeiro ---------- */
export const transactionsView = entityView({
  api: 'transactions', title: 'Lançamentos', singular: 'Lançamento', createLabel: 'Novo lançamento',
  intro: 'Receitas e despesas. Só valores pagos entram no faturamento e no resultado.',
  searchPlaceholder: 'Descrição, categoria ou cliente',
  emptyTitle: 'Nenhum lançamento ainda',
  emptyText: 'Registre receitas e despesas para ver faturamento e resultado no painel.',
  rowName: (r) => r.description,
  monthFilter: true,
  defaults: { kind: 'receita', status: 'pago' },
  filters: [
    filterOf('kind', 'Tipo', 'Todos', optionsOf('kind')),
    filterOf('status', 'Pagamento', 'Todos', optionsOf('payment')),
  ],
  columns: [
    { label: 'Descrição', cell: (r) => name(r, [r.category, r.client_name].filter(Boolean).join(' · ')) },
    { label: 'Tipo', cell: (r) => badge('kind', r.kind) },
    { label: 'Pagamento', cell: (r) => badge('payment', r.status) },
    { label: 'Data', cell: (r) => fmtDate(r.date) },
    { label: 'Valor', num: true, cell: (r) => (r.kind === 'despesa' ? `− ${brl(r.amount_cents)}` : brl(r.amount_cents)) },
  ],
  fields: [
    { name: 'description', label: 'Descrição', type: 'text', required: true, max: 200, full: true },
    { name: 'kind', label: 'Tipo', type: 'select', required: true, options: optionsOf('kind') },
    { name: 'status', label: 'Pagamento', type: 'select', required: true, options: optionsOf('payment') },
    { name: 'amount_cents', label: 'Valor (R$)', type: 'money', required: true, placeholder: '0,00' },
    { name: 'date', label: 'Data', type: 'date', required: true },
    { name: 'category', label: 'Categoria', type: 'text', max: 60, help: 'Ex.: Serviços, Impostos, Ferramentas.' },
    { name: 'client_id', label: 'Cliente', type: 'lookup', lookup: 'clients' },
    { name: 'project_id', label: 'Projeto', type: 'lookup', lookup: 'projects' },
  ],
});

/* ---------- Tarefas ---------- */
export const tasksView = entityView({
  api: 'tasks', title: 'Tarefas', singular: 'Tarefa', createLabel: 'Nova tarefa',
  intro: 'O que precisa ser feito, por prioridade e prazo.',
  searchPlaceholder: 'Título ou projeto',
  emptyTitle: 'Nenhuma tarefa ainda',
  emptyText: 'Crie tarefas para não perder prazos nem entregas.',
  rowName: (r) => r.title,
  defaults: { status: 'pendente', priority: 'media' },
  filters: [
    filterOf('status', 'Situação', 'Todas', optionsOf('task')),
    filterOf('priority', 'Prioridade', 'Todas', optionsOf('priority')),
  ],
  columns: [
    { label: 'Tarefa', cell: (r) => name(r, r.project_name) },
    { label: 'Prioridade', cell: (r) => badge('priority', r.priority) },
    { label: 'Situação', cell: (r) => badge('task', r.status) },
    { label: 'Prazo', cell: (r) => fmtDate(r.due_date) },
    { label: 'Responsável', cell: (r) => r.assignee_name || '—' },
  ],
  rowActions: (row, { reload, app }) => [
    h('button', {
      type: 'button', class: 'btn btn--link',
      'aria-label': `${row.status === 'concluida' ? 'Reabrir' : 'Concluir'}: ${row.title}`,
      onClick: async () => {
        try {
          await patch(`/api/admin/tasks/${row.id}`, { status: row.status === 'concluida' ? 'pendente' : 'concluida' });
          await reload();
        } catch (err) {
          toast(err.message, 'error');
        }
      },
    }, row.status === 'concluida' ? 'Reabrir' : 'Concluir'),
  ],
  fields: [
    { name: 'title', label: 'Título', type: 'text', required: true, max: 160, full: true },
    { name: 'status', label: 'Situação', type: 'select', required: true, options: optionsOf('task') },
    { name: 'priority', label: 'Prioridade', type: 'select', required: true, options: optionsOf('priority') },
    { name: 'due_date', label: 'Prazo', type: 'date' },
    { name: 'project_id', label: 'Projeto', type: 'lookup', lookup: 'projects' },
    { name: 'assignee_id', label: 'Responsável', type: 'lookup', lookup: 'users' },
    { name: 'description', label: 'Descrição', type: 'textarea', full: true },
  ],
});

/* ---------- Contatos recebidos pelo site ---------- */
export const leadsView = entityView({
  api: 'leads', title: 'Contatos do site', singular: 'Contato', createLabel: 'Novo contato',
  intro: 'Mensagens enviadas pelo formulário do site. Responda e, se virar negócio, converta em cliente.',
  searchPlaceholder: 'Nome, e-mail, telefone ou mensagem',
  emptyTitle: 'Nenhum contato recebido ainda',
  emptyText: 'Quando alguém enviar o formulário do site, a mensagem aparece aqui.',
  rowName: (r) => r.name,
  defaults: { status: 'novo' },
  filters: [filterOf('status', 'Situação', 'Todas', optionsOf('lead'))],
  columns: [
    { label: 'Contato', cell: (r) => name(r, r.message ? (r.message.length > 90 ? `${r.message.slice(0, 90)}…` : r.message) : null) },
    { label: 'Como falar', cell: (r) => h('div', null, r.email || '—', r.phone ? h('div', { class: 'cell-sub' }, r.phone) : null) },
    { label: 'Interesse', cell: (r) => SERVICES[r.service] || '—' },
    { label: 'Situação', cell: (r) => badge('lead', r.status) },
    { label: 'Recebido', cell: (r) => fmtDateTime(r.created_at) },
  ],
  rowActions: (row, { reload }) => (row.status === 'convertido' ? [] : [
    h('button', {
      type: 'button', class: 'btn btn--link', 'aria-label': `Converter ${row.name} em cliente`,
      onClick: async () => {
        const ok = await confirmDialog({
          title: 'Converter em cliente?', message: `${row.name} será cadastrado como cliente (prospect) e o contato ficará como convertido.`,
          confirmLabel: 'Converter',
        });
        if (!ok) return;
        try {
          await post(`/api/admin/leads/${row.id}/convert`);
          toast('Contato convertido em cliente.');
          await reload();
        } catch (err) {
          toast(err.message, 'error');
        }
      },
    }, 'Converter'),
  ]),
  fields: [
    { name: 'name', label: 'Nome', type: 'text', required: true, max: 120, full: true },
    { name: 'email', label: 'E-mail', type: 'email', max: 160 },
    { name: 'phone', label: 'Telefone', type: 'text', max: 40 },
    { name: 'service', label: 'Serviço de interesse', type: 'select', blank: 'Não informado', options: serviceOptions() },
    { name: 'status', label: 'Situação', type: 'select', required: true, options: optionsOf('lead') },
    { name: 'message', label: 'Mensagem', type: 'textarea', full: true },
    { name: 'notes', label: 'Anotações internas', type: 'textarea', full: true },
  ],
});
