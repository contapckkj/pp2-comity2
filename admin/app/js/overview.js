import { get } from './api.js';
import { monthlyChart, hbars } from './charts.js';
import {
  h, clear, brl, int, percent, fmtDate, badge, demoBadge, monthLong, STATUS, SERVICES,
} from './dom.js';

const tile = (label, value, sub, href) => {
  const body = [h('p', { class: 'tile-label' }, label), h('p', { class: 'tile-value' }, value), sub ? h('p', { class: 'tile-sub' }, sub) : null];
  return href ? h('a', { class: 'tile', href }, ...body) : h('div', { class: 'tile' }, ...body);
};

function revenueDelta(k) {
  if (!k.revenuePrevMonth) return h('span', null, 'Sem mês anterior para comparar');
  const change = (k.revenueMonth - k.revenuePrevMonth) / k.revenuePrevMonth;
  const up = change >= 0;
  return h('span', null,
    h('span', { class: `delta ${up ? 'delta--good' : 'delta--bad'}` }, `${up ? '▲ +' : '▼ −'}${Math.abs(Math.round(change * 100))}%`),
    ' vs. mês anterior inteiro (o mês atual ainda está em andamento)');
}

export async function overviewView(root, app) {
  const summary = await get('/api/admin/summary');
  const k = summary.kpis;
  app.setDemoBanner(summary.demoRecords > 0);

  const empty = k.clientsTotal === 0 && summary.monthly.every((m) => m.revenue === 0 && m.expenses === 0)
    && summary.projectsByStatus.length === 0;

  const intro = empty
    ? h('div', { class: 'empty' },
      h('h2', null, 'Seu painel está vazio'),
      h('p', null, 'Os indicadores são calculados a partir dos seus cadastros. Comece cadastrando um cliente, ou carregue dados demonstrativos (identificados com o selo Demo) para conhecer o painel.'),
      h('div', { class: 'row-actions', style: null },
        h('a', { class: 'btn btn--primary', href: '#/clientes' }, 'Cadastrar cliente'),
        h('a', { class: 'btn btn--secondary', href: '#/configuracoes' }, 'Ver dados demonstrativos')))
    : null;

  const tiles = h('div', { class: 'tiles' },
    h('div', { class: 'tile tile--hero' },
      h('p', { class: 'tile-label' }, `Faturamento de ${monthLong(summary.today.slice(0, 7))}`),
      h('p', { class: 'tile-value' }, brl(k.revenueMonth)),
      h('p', { class: 'tile-sub' }, revenueDelta(k))),
    tile('Resultado do mês', brl(k.netMonth), `Despesas: ${brl(k.expensesMonth)}`, '#/financeiro'),
    tile('A receber', brl(k.receivable), k.receivableOverdue ? `${brl(k.receivableOverdue)} em atraso` : 'Nada em atraso', '#/financeiro'),
    tile('Faturamento do ano', brl(k.revenueYear), summary.today.slice(0, 4)),
    tile('Clientes ativos', int(k.clientsActive), `${int(k.clientsTotal)} cadastrados`, '#/clientes'),
    tile('Projetos em andamento', int(k.projectsActive), k.projectsOverdue ? `${int(k.projectsOverdue)} com prazo vencido` : 'Nenhum atrasado', '#/projetos'),
    tile('Vendas em aberto', brl(k.salesOpenValue), `${int(k.salesOpenCount)} negociações`, '#/vendas'),
    tile('Vendas fechadas no mês', brl(k.salesWonMonthValue),
      k.winRate === null ? 'Sem vendas encerradas' : `Taxa de fechamento: ${percent(k.winRate)}`, '#/vendas'),
    tile('Tarefas abertas', int(k.tasksOpen), k.tasksOverdue ? `${int(k.tasksOverdue)} atrasadas` : 'Nenhuma atrasada', '#/tarefas'),
    tile('Contatos novos do site', int(k.leadsNew), k.leadsNew ? 'Aguardando resposta' : 'Tudo respondido', '#/contatos'));

  const projects = hbars(
    summary.projectsByStatus
      .map((r) => ({ label: (STATUS.project[r.status] || [r.status])[0], value: r.count }))
      .sort((a, b) => b.value - a.value),
    { empty: 'Nenhum projeto cadastrado.' });

  const services = hbars(
    summary.revenueByService.map((r) => ({
      label: SERVICES[r.service] || r.service, value: r.total, display: brl(r.total),
    })),
    { empty: 'Nenhuma receita paga nos últimos 12 meses.' });

  const salesFunnel = hbars(
    ['negociacao', 'proposta_enviada', 'fechada', 'perdida']
      .map((status) => {
        const row = summary.salesByStatus.find((r) => r.status === status);
        return row ? { label: STATUS.sale[status][0], value: row.count, display: `${row.count} · ${brl(row.total || 0)}` } : null;
      })
      .filter(Boolean),
    { empty: 'Nenhuma venda cadastrada.' });

  const tasksList = summary.upcomingTasks.length
    ? h('ul', { class: 'list' }, ...summary.upcomingTasks.map((t) => h('li', null,
      h('div', null, h('div', { class: 'cell-main' }, t.title),
        h('div', { class: 'cell-sub' }, [t.project_name, `Prazo: ${fmtDate(t.due_date)}`].filter(Boolean).join(' · '))),
      badge('priority', t.priority))))
    : h('p', { class: 'list-empty' }, 'Nenhuma tarefa aberta.');

  const leadsList = summary.recentLeads.length
    ? h('ul', { class: 'list' }, ...summary.recentLeads.map((l) => h('li', null,
      h('div', null, h('div', { class: 'cell-main' }, l.name, l.is_demo ? ' ' : null, l.is_demo ? demoBadge() : null),
        h('div', { class: 'cell-sub' }, `${SERVICES[l.service] || 'Interesse não informado'} · ${fmtDate(l.created_at)}`)),
      badge('lead', l.status))))
    : h('p', { class: 'list-empty' }, 'Nenhum contato novo.');

  const card = (title, sub, body, link) => h('section', { class: 'card' },
    h('div', { class: 'card-head' },
      h('div', null, h('h2', null, title), sub ? h('p', { class: 'card-sub' }, sub) : null),
      link ? h('a', { class: 'btn btn--link', href: link[0] }, link[1]) : null),
    body);

  clear(root).append(
    ...[intro].filter(Boolean),
    tiles,
    h('div', { class: 'grid-wide' },
      monthlyChart(summary.monthly),
      card('Receita por serviço', 'Últimos 12 meses, valores pagos vinculados a projetos.', services)),
    h('div', { class: 'grid-2' },
      card('Projetos por situação', null, projects, ['#/projetos', 'Ver projetos']),
      card('Funil de vendas', 'Quantidade e valor por situação.', salesFunnel, ['#/vendas', 'Ver vendas'])),
    h('div', { class: 'grid-2' },
      card('Próximas tarefas', null, tasksList, ['#/tarefas', 'Ver tarefas']),
      card('Contatos novos do site', null, leadsList, ['#/contatos', 'Ver contatos'])),
    h('p', { class: 'chart-note' }, `Atualizado em ${new Date(summary.generatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.`));
}
