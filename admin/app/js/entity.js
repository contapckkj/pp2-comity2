// Tela genérica de cadastro: lista com busca/filtros/paginação + formulário em diálogo.
// Cada cadastro (clientes, projetos…) é só uma configuração em entities.js.
import { get, post, patch, del, ApiError } from './api.js';
import { h, clear, toast, confirmDialog, parseMoney, moneyInput } from './dom.js';

const PAGE_SIZE = 20;

/* ---------- Formulário em diálogo ---------- */
function fieldControl(field, value, lookups) {
  const id = `f-${field.name}`;
  const common = { id, name: field.name, 'aria-describedby': `${id}-err` };
  if (field.required) common.required = true;

  let control;
  if (field.type === 'textarea') {
    control = h('textarea', { ...common, rows: 3, maxlength: field.max || 2000 });
    control.value = value ?? '';
  } else if (field.type === 'select' || field.type === 'lookup') {
    const options = field.type === 'lookup'
      ? (lookups[field.lookup] || []).map((o) => ({ value: String(o.id), label: o.name }))
      : field.options.map((o) => ({ value: o.value, label: o.label }));
    control = h('select', common,
      field.required ? null : h('option', { value: '' }, field.blank || 'Nenhum'),
      ...options.map((o) => h('option', { value: o.value }, o.label)));
    control.value = value === null || value === undefined ? (field.required ? options[0]?.value ?? '' : '') : String(value);
  } else {
    const type = { money: 'text', int: 'number', date: 'date', email: 'email' }[field.type] || 'text';
    control = h('input', {
      ...common, type, maxlength: field.max, min: field.min, max: field.type === 'int' ? field.max : null,
      inputmode: field.type === 'money' ? 'decimal' : null, placeholder: field.placeholder,
      autocomplete: 'off',
    });
    control.value = field.type === 'money' ? moneyInput(value) : value ?? '';
  }

  return h('div', { class: `field${field.full ? ' full' : ''}` },
    h('label', { for: id }, field.label, field.required ? h('span', { class: 'req' }, ' (obrigatório)') : null),
    control,
    field.help ? h('p', { class: 'field-help' }, field.help) : null,
    h('p', { class: 'field-error', id: `${id}-err` }));
}

function readForm(form, fields) {
  const values = {};
  const errors = {};
  for (const field of fields) {
    const raw = form.elements[field.name].value;
    if (field.type === 'money') {
      const cents = parseMoney(raw);
      if (Number.isNaN(cents)) errors[field.name] = 'Valor inválido. Exemplo: 1.500,00';
      else values[field.name] = cents;
    } else if (field.type === 'int') {
      values[field.name] = raw === '' ? null : Number(raw);
    } else if (field.type === 'lookup') {
      values[field.name] = raw === '' ? null : Number(raw);
    } else {
      values[field.name] = raw.trim();
    }
  }
  return { values, errors };
}

function showFieldErrors(form, errors) {
  let first = null;
  for (const [name, message] of Object.entries(errors)) {
    const input = form.elements[name];
    const box = form.querySelector(`#f-${CSS.escape(name)}-err`);
    if (box) box.textContent = message;
    if (input) {
      input.setAttribute('aria-invalid', 'true');
      first ||= input;
    }
  }
  first?.focus();
}

async function openForm({ title, fields, record, onSave }) {
  let lookups = {};
  if (fields.some((f) => f.type === 'lookup')) {
    try {
      lookups = await get('/api/admin/lookups');
    } catch (err) {
      toast(err.message, 'error');
      return false;
    }
  }

  return new Promise((resolve) => {
    const formError = h('p', { class: 'form-error', role: 'alert' });
    const submit = h('button', { type: 'submit', class: 'btn btn--primary' }, 'Salvar');
    const form = h('form', { novalidate: true },
      h('div', { class: 'form-grid' }, ...fields.map((f) => fieldControl(f, record?.[f.name], lookups))),
      formError,
      h('div', { class: 'dialog-actions' },
        h('button', { type: 'button', class: 'btn btn--secondary', onClick: () => close(false) }, 'Cancelar'),
        submit));
    const dialog = h('dialog', { 'aria-labelledby': 'form-title' }, h('div', { class: 'dialog-body' }, h('h2', { id: 'form-title' }, title), form));

    function close(saved) {
      dialog.close();
      dialog.remove();
      resolve(saved);
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      form.querySelectorAll('.field-error').forEach((el) => { el.textContent = ''; });
      form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
      formError.textContent = '';

      const { values, errors } = readForm(form, fields);
      if (Object.keys(errors).length) {
        showFieldErrors(form, errors);
        return;
      }
      submit.disabled = true;
      submit.textContent = 'Salvando…';
      try {
        await onSave(values);
        close(true);
      } catch (err) {
        if (err instanceof ApiError && err.errors) showFieldErrors(form, err.errors);
        formError.textContent = err.message;
      } finally {
        submit.disabled = false;
        submit.textContent = 'Salvar';
      }
    });
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      close(false);
    });

    document.body.append(dialog);
    dialog.showModal();
    form.querySelector('input, select, textarea')?.focus();
  });
}

/* ---------- Tela de lista ---------- */
export function entityView(cfg) {
  return async function render(root, app) {
    const state = { q: '', page: 1, month: '', filters: {} };
    const tableHost = h('div', { 'aria-live': 'polite' });
    const footHost = h('div');

    const openCreate = async () => {
      const saved = await openForm({
        title: `Novo: ${cfg.singular}`,
        fields: cfg.fields,
        record: cfg.defaults,
        onSave: (values) => post(`/api/admin/${cfg.api}`, values),
      });
      if (saved) {
        toast(`${cfg.singular} cadastrado.`);
        await load();
        app.refreshBadges();
      }
    };

    const openEdit = async (row) => {
      const saved = await openForm({
        title: `Editar: ${cfg.singular}`,
        fields: cfg.fields,
        record: row,
        onSave: (values) => patch(`/api/admin/${cfg.api}/${row.id}`, values),
      });
      if (saved) {
        toast('Alterações salvas.');
        await load();
        app.refreshBadges();
      }
    };

    const remove = async (row) => {
      const ok = await confirmDialog({
        title: `Excluir ${cfg.singular.toLowerCase()}?`,
        message: `${cfg.rowName(row)} será removido. Esta ação não pode ser desfeita.`,
        confirmLabel: 'Excluir',
        danger: true,
      });
      if (!ok) return;
      try {
        await del(`/api/admin/${cfg.api}/${row.id}`);
        toast('Registro excluído.');
        await load();
        app.refreshBadges();
      } catch (err) {
        toast(err.message, 'error');
      }
    };

    const helpers = { reload: async () => { await load(); app.refreshBadges(); }, edit: openEdit, remove, app };

    function actionsFor(row) {
      const extra = cfg.rowActions ? cfg.rowActions(row, helpers) : [];
      return h('div', { class: 'row-actions' },
        ...extra,
        h('button', { type: 'button', class: 'btn btn--link', onClick: () => openEdit(row), 'aria-label': `Editar ${cfg.rowName(row)}` }, 'Editar'),
        h('button', { type: 'button', class: 'btn btn--link is-danger', onClick: () => remove(row), 'aria-label': `Excluir ${cfg.rowName(row)}` }, 'Excluir'));
    }

    function renderTable(data) {
      if (data.items.length === 0) {
        const filtered = state.q || state.month || Object.values(state.filters).some(Boolean);
        return h('div', { class: 'empty' },
          h('h2', null, filtered ? 'Nada encontrado' : cfg.emptyTitle),
          h('p', null, filtered ? 'Nenhum registro corresponde à busca ou aos filtros. Ajuste e tente de novo.' : cfg.emptyText),
          filtered ? null : h('button', { type: 'button', class: 'btn btn--primary', onClick: openCreate }, cfg.createLabel));
      }
      return h('div', { class: 'table-wrap' }, h('table', null,
        h('caption', { class: 'sr-only' }, cfg.title),
        h('thead', null, h('tr', null,
          ...cfg.columns.map((c) => h('th', { scope: 'col', class: c.num ? 'num' : null }, c.label)),
          h('th', { scope: 'col', class: 'num' }, h('span', { class: 'sr-only' }, 'Ações')))),
        h('tbody', null, ...data.items.map((row) => h('tr', null,
          ...cfg.columns.map((c) => h('td', { class: c.num ? 'num' : null, 'data-label': c.label }, c.cell(row))),
          h('td', { class: 'num', 'data-label': '' }, actionsFor(row)))))));
    }

    function renderFoot(data) {
      clear(footHost);
      if (data.total === 0) return;
      const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
      const from = (data.page - 1) * PAGE_SIZE + 1;
      const to = Math.min(data.total, data.page * PAGE_SIZE);
      footHost.append(h('div', { class: 'table-foot' },
        h('p', null, `Mostrando ${from}–${to} de ${data.total}`),
        pages > 1 ? h('div', { class: 'pager' },
          h('button', { type: 'button', class: 'btn btn--secondary btn--sm', disabled: data.page <= 1, onClick: () => { state.page -= 1; load(); } }, 'Anterior'),
          h('button', { type: 'button', class: 'btn btn--secondary btn--sm', disabled: data.page >= pages, onClick: () => { state.page += 1; load(); } }, 'Próxima')) : null));
    }

    let requestId = 0;
    async function load() {
      const mine = ++requestId;
      const params = new URLSearchParams({ page: state.page, pageSize: PAGE_SIZE });
      if (state.q) params.set('q', state.q);
      if (state.month) params.set('month', state.month);
      for (const [k, v] of Object.entries(state.filters)) if (v) params.set(k, v);

      tableHost.classList.add('loading');
      try {
        const data = await get(`/api/admin/${cfg.api}?${params}`);
        if (mine !== requestId) return; // chegou resposta mais nova
        if (data.items.length === 0 && state.page > 1) {
          state.page = 1;
          await load();
          return;
        }
        clear(tableHost).append(renderTable(data));
        renderFoot(data);
        cfg.onLoaded?.(data, root);
      } catch (err) {
        if (mine !== requestId) return;
        clear(tableHost).append(h('div', { class: 'empty' }, h('h2', null, 'Não foi possível carregar'), h('p', null, err.message),
          h('button', { type: 'button', class: 'btn btn--secondary', onClick: load }, 'Tentar de novo')));
      } finally {
        if (mine === requestId) tableHost.classList.remove('loading');
      }
    }

    // Filtros: uma linha acima da lista.
    let timer;
    const search = h('input', { id: 'flt-q', type: 'search', placeholder: cfg.searchPlaceholder, autocomplete: 'off', maxlength: 100 });
    search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => { state.q = search.value.trim(); state.page = 1; load(); }, 300);
    });
    const filterFields = (cfg.filters || []).map((f) => {
      const select = h('select', { id: `flt-${f.param}` },
        h('option', { value: '' }, f.all), ...f.options.map((o) => h('option', { value: o.value }, o.label)));
      select.addEventListener('change', () => { state.filters[f.param] = select.value; state.page = 1; load(); });
      return h('div', { class: 'field' }, h('label', { for: `flt-${f.param}` }, f.label), select);
    });
    let monthField = null;
    if (cfg.monthFilter) {
      const month = h('input', { id: 'flt-month', type: 'month' });
      month.addEventListener('change', () => { state.month = month.value; state.page = 1; load(); });
      monthField = h('div', { class: 'field' }, h('label', { for: 'flt-month' }, 'Mês'), month);
    }

    clear(root).append(
      h('div', { class: 'page-head' },
        h('p', null, cfg.intro),
        h('button', { type: 'button', class: 'btn btn--primary', onClick: openCreate }, cfg.createLabel)),
      h('div', { class: 'filters', role: 'search' },
        h('div', { class: 'field field--search' }, h('label', { for: 'flt-q' }, 'Buscar'), search),
        ...filterFields, monthField),
      tableHost, footHost);

    await load();
  };
}
