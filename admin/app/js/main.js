import { get, post, setCsrf, setUnauthorizedHandler } from './api.js';
import { h, clear, toast } from './dom.js';
import { overviewView } from './overview.js';
import { settingsView } from './settings.js';
import {
  clientsView, projectsView, salesView, transactionsView, tasksView, leadsView,
} from './entities.js';

const LOGIN = '/painel/login';

const ROUTES = {
  'visao-geral': { title: 'Visão geral', view: overviewView },
  clientes: { title: 'Clientes', view: clientsView },
  projetos: { title: 'Projetos', view: projectsView },
  vendas: { title: 'Vendas', view: salesView },
  financeiro: { title: 'Financeiro', view: transactionsView },
  tarefas: { title: 'Tarefas', view: tasksView },
  contatos: { title: 'Contatos do site', view: leadsView },
  configuracoes: { title: 'Configurações', view: settingsView },
};
const DEFAULT_ROUTE = 'visao-geral';

const $ = (id) => document.getElementById(id);
const main = $('main');
const sidebar = $('sidebar');
const scrim = $('scrim');
const menuToggle = $('menu-toggle');

const app = {
  user: null,
  setDemoBanner(show) {
    $('demo-banner').hidden = !show;
  },
  async refreshBadges() {
    try {
      const res = await get('/api/admin/leads?status=novo&pageSize=1');
      const badge = $('leads-count');
      badge.textContent = String(res.total);
      badge.hidden = res.total === 0;
      badge.setAttribute('aria-label', `${res.total} contatos novos`);
    } catch {
      /* indicador é opcional */
    }
  },
};

let redirecting = false;
setUnauthorizedHandler(() => {
  if (redirecting) return;
  redirecting = true;
  location.replace(LOGIN);
});

/* ---------- Menu lateral no celular ---------- */
function setMenu(open) {
  sidebar.classList.toggle('is-open', open);
  scrim.hidden = !open;
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.querySelector('.sr-only').textContent = open ? 'Fechar menu' : 'Abrir menu';
  if (open) sidebar.querySelector('a')?.focus();
}
menuToggle.addEventListener('click', () => setMenu(!sidebar.classList.contains('is-open')));
scrim.addEventListener('click', () => { setMenu(false); menuToggle.focus(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sidebar.classList.contains('is-open')) {
    setMenu(false);
    menuToggle.focus();
  }
});

/* ---------- Roteamento por hash ---------- */
let renderId = 0;
async function navigate() {
  const key = location.hash.replace(/^#\/?/, '').split('?')[0] || DEFAULT_ROUTE;
  const route = ROUTES[key];
  if (!route) {
    location.hash = `#/${DEFAULT_ROUTE}`;
    return;
  }
  setMenu(false);
  const mine = ++renderId;

  document.querySelectorAll('.menu a').forEach((a) => {
    if (a.dataset.route === key) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  $('page-title').textContent = route.title;
  document.title = `${route.title} | P2 Painel`;
  main.setAttribute('aria-busy', 'true');
  clear(main).append(h('p', { class: 'list-empty' }, 'Carregando…'));

  try {
    const body = h('div', { class: 'stack-page', style: null });
    body.style.display = 'grid';
    body.style.gap = '1.5rem';
    await route.view(body, app);
    if (mine !== renderId) return;
    clear(main).append(body);
    if (key !== 'visao-geral' && key !== 'configuracoes') app.setDemoBanner(await demoPresent());
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  } catch (err) {
    if (mine !== renderId) return;
    clear(main).append(h('div', { class: 'empty' },
      h('h2', null, 'Não foi possível carregar esta tela'),
      h('p', null, err.message),
      h('button', { type: 'button', class: 'btn btn--secondary', onClick: navigate }, 'Tentar de novo')));
  } finally {
    if (mine === renderId) main.removeAttribute('aria-busy');
  }
  app.refreshBadges();
}

let demoCache = { at: 0, value: false };
async function demoPresent() {
  if (Date.now() - demoCache.at < 15000) return demoCache.value;
  try {
    const s = await get('/api/admin/summary');
    demoCache = { at: Date.now(), value: s.demoRecords > 0 };
  } catch {
    /* mantém o valor anterior */
  }
  return demoCache.value;
}

/* ---------- Início ---------- */
async function start() {
  try {
    const me = await get('/api/auth/me');
    app.user = me.user;
    setCsrf(me.csrfToken);
  } catch {
    location.replace(LOGIN);
    return;
  }

  $('user-name').textContent = app.user.name;
  $('user-role').textContent = app.user.role === 'ceo' ? 'CEO' : app.user.role;
  $('today').textContent = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' }).format(new Date());

  $('logout').addEventListener('click', async () => {
    try {
      await post('/api/auth/logout');
    } catch {
      /* mesmo com erro, saímos da tela */
    }
    location.replace(LOGIN);
  });

  window.addEventListener('hashchange', navigate);
  navigate();
}

start().catch((err) => {
  console.error(err);
  toast('Erro ao iniciar o painel.', 'error');
});
