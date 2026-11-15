// Utilitários de DOM e formatação. Nada aqui usa innerHTML: todo texto entra via textContent,
// então dados vindos do banco (nomes, mensagens do site) nunca são interpretados como HTML.

const PROP_KEYS = new Set(['value', 'disabled', 'hidden', 'checked', 'selected', 'required', 'readOnly']);

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** Cria um elemento HTML. `props`: class, dataset, on<Evento>, atributos. */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (PROP_KEYS.has(key)) el[key] = value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  append(el, children);
  return el;
}

/** Cria um elemento SVG. */
export function s(tag, attrs, ...children) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined) continue;
    el.setAttribute(key, String(value));
  }
  append(el, children);
  return el;
}

export function clear(el) {
  el.replaceChildren();
  return el;
}

/* ---------- Formatação (pt-BR) ---------- */
const brlFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brlCompactFmt = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1,
});
const intFmt = new Intl.NumberFormat('pt-BR');

export const brl = (cents) => brlFmt.format((cents || 0) / 100);
export const brlCompact = (cents) => brlCompactFmt.format((cents || 0) / 100);
export const int = (n) => intFmt.format(n || 0);
export const percent = (ratio) => `${Math.round(ratio * 100)}%`;

export function fmtDate(value) {
  if (!value) return '—';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function fmtDateTime(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** 'YYYY-MM' → 'out. 2026' / 'out.' */
export function monthLabel(key, withYear = false) {
  const [y, m] = key.split('-').map(Number);
  const short = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, 1))).replace('.', '');
  return withYear ? `${short}/${String(y).slice(2)}` : short;
}

export function monthLong(key) {
  const [y, m] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

/** Texto digitado em reais ("1.500,50") → centavos, ou NaN se inválido. Vazio → null. */
export function parseMoney(text) {
  let t = String(text).replace(/R\$|\s/g, '');
  if (t === '') return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
  return Math.round(Number(t) * 100);
}

export const moneyInput = (cents) =>
  cents === null || cents === undefined ? '' : (cents / 100).toFixed(2).replace('.', ',');

/* ---------- Rótulos e tons (status) ---------- */
export const SERVICES = {
  cardapio_digital: 'Cardápio digital',
  site_comercial: 'Site comercial',
  nfc: 'Solução com NFC',
  automacao: 'Automação',
  outro: 'Outro',
  sem_projeto: 'Sem projeto vinculado',
};

export const STATUS = {
  client: { prospect: ['Prospect', 'info'], ativo: ['Ativo', 'good'], inativo: ['Inativo', 'neutral'] },
  project: {
    proposta: ['Proposta', 'neutral'], em_andamento: ['Em andamento', 'info'], pausado: ['Pausado', 'warn'],
    concluido: ['Concluído', 'good'], cancelado: ['Cancelado', 'bad'],
  },
  sale: {
    negociacao: ['Em negociação', 'info'], proposta_enviada: ['Proposta enviada', 'warn'],
    fechada: ['Fechada', 'good'], perdida: ['Perdida', 'bad'],
  },
  kind: { receita: ['Receita', 'good'], despesa: ['Despesa', 'bad'] },
  payment: { pendente: ['Pendente', 'warn'], pago: ['Pago', 'good'] },
  task: { pendente: ['Pendente', 'neutral'], em_andamento: ['Em andamento', 'info'], concluida: ['Concluída', 'good'] },
  priority: { baixa: ['Baixa', 'neutral'], media: ['Média', 'info'], alta: ['Alta', 'bad'] },
  lead: { novo: ['Novo', 'info'], contatado: ['Contatado', 'warn'], convertido: ['Convertido', 'good'], descartado: ['Descartado', 'neutral'] },
};

export function badge(group, value) {
  const [label, tone] = STATUS[group][value] || [value, 'neutral'];
  return h('span', { class: `badge badge--${tone}` }, label);
}

export const demoBadge = () => h('span', { class: 'badge badge--demo', title: 'Registro demonstrativo' }, 'Demo');

export const optionsOf = (group) => Object.entries(STATUS[group]).map(([value, [label]]) => ({ value, label }));
export const serviceOptions = () =>
  Object.entries(SERVICES).filter(([k]) => k !== 'sem_projeto').map(([value, label]) => ({ value, label }));

/* ---------- Avisos e confirmação ---------- */
export function toast(message, kind = 'ok') {
  const box = document.getElementById('toasts');
  const el = h('p', { class: `toast toast--${kind}` }, message);
  box.append(el);
  setTimeout(() => el.remove(), kind === 'error' ? 6000 : 3500);
}

export function confirmDialog({ title, message, confirmLabel = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    const dialog = h('dialog', { 'aria-labelledby': 'dlg-title' });
    const done = (result) => {
      dialog.close();
      dialog.remove();
      resolve(result);
    };
    const confirm = h('button', { type: 'button', class: `btn ${danger ? 'btn--danger' : 'btn--primary'}`, onClick: () => done(true) }, confirmLabel);
    dialog.append(
      h('div', { class: 'dialog-body' },
        h('h2', { id: 'dlg-title' }, title),
        h('p', null, message),
        h('div', { class: 'dialog-actions' },
          h('button', { type: 'button', class: 'btn btn--secondary', onClick: () => done(false) }, 'Cancelar'),
          confirm)),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      done(false);
    });
    document.body.append(dialog);
    dialog.showModal();
    (danger ? dialog.querySelector('.btn--secondary') : confirm).focus();
  });
}
