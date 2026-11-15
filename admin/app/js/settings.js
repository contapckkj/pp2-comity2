import { get, post, ApiError } from './api.js';
import { h, clear, toast, confirmDialog, fmtDateTime } from './dom.js';

const ROLE_LABEL = { ceo: 'CEO' };

function passwordCard(app) {
  const error = h('p', { class: 'form-error', role: 'alert' });
  const submit = h('button', { type: 'submit', class: 'btn btn--primary' }, 'Alterar senha');
  const field = (id, label, autocomplete, help) => h('div', { class: 'field' },
    h('label', { for: id }, label),
    h('input', { id, name: id, type: 'password', autocomplete, required: true, 'aria-describedby': `${id}-err` }),
    help ? h('p', { class: 'field-help' }, help) : null,
    h('p', { class: 'field-error', id: `${id}-err` }));

  const form = h('form', { class: 'stack', novalidate: true },
    field('currentPassword', 'Senha atual', 'current-password'),
    field('newPassword', 'Nova senha', 'new-password', 'Mínimo de 12 caracteres, com letras e números.'),
    field('confirmPassword', 'Repita a nova senha', 'new-password'),
    error, h('div', null, submit));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    form.querySelectorAll('.field-error').forEach((el) => { el.textContent = ''; });
    form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
    error.textContent = '';
    const e = form.elements;
    if (e.newPassword.value !== e.confirmPassword.value) {
      form.querySelector('#confirmPassword-err').textContent = 'As senhas não conferem.';
      e.confirmPassword.setAttribute('aria-invalid', 'true');
      e.confirmPassword.focus();
      return;
    }
    submit.disabled = true;
    try {
      await post('/api/auth/password', { currentPassword: e.currentPassword.value, newPassword: e.newPassword.value });
      form.reset();
      toast('Senha alterada. Os outros dispositivos foram desconectados.');
    } catch (err) {
      if (err instanceof ApiError && err.errors) {
        for (const [name, message] of Object.entries(err.errors)) {
          const box = form.querySelector(`#${CSS.escape(name)}-err`);
          if (box) box.textContent = message;
          form.elements[name]?.setAttribute('aria-invalid', 'true');
        }
        form.querySelector('[aria-invalid]')?.focus();
      } else {
        error.textContent = err.message;
      }
    } finally {
      submit.disabled = false;
    }
  });

  return h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('div', null, h('h2', null, 'Alterar senha'),
      h('p', { class: 'card-sub' }, 'Ao trocar a senha, as outras sessões abertas são encerradas.'))),
    form);
}

function demoCard(app, count, reload) {
  const body = count > 0
    ? [
      h('p', null, `Há ${count} registros demonstrativos no sistema (clientes, projetos, vendas, lançamentos, tarefas e contatos). Eles têm o selo Demo e nomes iniciados por [Demo].`),
      h('p', { class: 'muted' }, 'Remover apaga somente os registros demonstrativos. Seus dados reais não são alterados.'),
      h('div', null, h('button', {
        type: 'button', class: 'btn btn--danger',
        onClick: async () => {
          const ok = await confirmDialog({
            title: 'Remover dados demonstrativos?', message: 'Todos os registros marcados como Demo serão apagados. Os dados reais permanecem.',
            confirmLabel: 'Remover', danger: true,
          });
          if (!ok) return;
          try {
            const res = await post('/api/admin/demo/clear');
            toast(`${res.removed} registros demonstrativos removidos.`);
            await reload();
          } catch (err) { toast(err.message, 'error'); }
        },
      }, 'Remover dados demonstrativos')),
    ]
    : [
      h('p', null, 'Carregue exemplos fictícios para conhecer o painel e ver os gráficos funcionando. Todos ficam identificados com o selo Demo e podem ser removidos de uma vez.'),
      h('p', { class: 'muted' }, 'Não são dados reais da P2: nomes, valores e datas são inventados.'),
      h('div', null, h('button', {
        type: 'button', class: 'btn btn--secondary',
        onClick: async () => {
          try {
            const res = await post('/api/admin/demo/load');
            toast(`${res.created} registros demonstrativos criados.`);
            await reload();
          } catch (err) { toast(err.message, 'error'); }
        },
      }, 'Carregar dados demonstrativos')),
    ];
  return h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('div', null, h('h2', null, 'Dados demonstrativos'))), h('div', { class: 'stack' }, ...body));
}

function auditCard(items) {
  return h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('div', null, h('h2', null, 'Atividade recente'),
      h('p', { class: 'card-sub' }, 'Acessos e alterações registrados (últimos 60).'))),
    items.length === 0 ? h('p', { class: 'list-empty' }, 'Sem atividade registrada.')
      : h('div', { class: 'table-wrap' }, h('table', null,
        h('caption', { class: 'sr-only' }, 'Atividade recente'),
        h('thead', null, h('tr', null, ...['Quando', 'Quem', 'Ação', 'Origem'].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', null, ...items.map((a) => h('tr', null,
          h('td', { 'data-label': 'Quando' }, fmtDateTime(a.created_at)),
          h('td', { 'data-label': 'Quem' }, a.email || '—'),
          h('td', { 'data-label': 'Ação' }, h('span', { class: 'mono' }, a.action), a.detail ? h('div', { class: 'cell-sub' }, a.detail) : null),
          h('td', { 'data-label': 'Origem' }, h('span', { class: 'mono' }, a.ip || '—'))))))));
}

export async function settingsView(root, app) {
  const [summary, audit] = await Promise.all([get('/api/admin/summary'), get('/api/admin/audit')]);
  app.setDemoBanner(summary.demoRecords > 0);

  const reload = () => settingsView(root, app);
  const user = app.user;

  clear(root).append(
    h('div', { class: 'settings-grid' },
      h('section', { class: 'card' },
        h('div', { class: 'card-head' }, h('div', null, h('h2', null, 'Minha conta'))),
        h('dl', { class: 'stack' },
          h('div', null, h('dt', { class: 'muted' }, 'Nome'), h('dd', { style: null }, user.name)),
          h('div', null, h('dt', { class: 'muted' }, 'E-mail'), h('dd', null, user.email)),
          h('div', null, h('dt', { class: 'muted' }, 'Função'), h('dd', null, ROLE_LABEL[user.role] || user.role)))),
      passwordCard(app),
      demoCard(app, summary.demoRecords, reload)),
    auditCard(audit.items));
}
