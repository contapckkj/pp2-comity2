// Gráficos em SVG puro. Marcas finas, base reta, topo arredondado (4px), 2px de respiro entre barras,
// legenda sempre presente com 2+ séries, tooltip por mouse e teclado e visão em tabela equivalente.
import { h, s, clear, brl, brlCompact, int, monthLabel, monthLong } from './dom.js';

const MAX_BAR = 24;
const GAP = 2;
const RADIUS = 4;

/** Barra com os cantos de cima arredondados e a base reta. */
function barPath(x, y, w, hgt) {
  if (hgt <= 0) return '';
  const r = Math.min(RADIUS, w / 2, hgt);
  return `M${x},${y + hgt} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + hgt} Z`;
}

/** Escala "bonita": passo 1, 2, 2,5 ou 5 × 10^n. */
function niceScale(max, ticks = 4) {
  if (max <= 0) return { top: 1, step: 1 };
  const rough = max / ticks;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((c) => c >= rough);
  return { top: Math.ceil(max / step) * step, step };
}

/**
 * Faturamento × despesas por mês. `monthly`: [{ month:'YYYY-MM', revenue, expenses }] em centavos.
 * Devolve o elemento do cartão (gráfico + alternância para tabela).
 */
export function monthlyChart(monthly) {
  const hasData = monthly.some((m) => m.revenue > 0 || m.expenses > 0);
  const box = h('div', { class: 'chart-box' });
  const tableBox = h('div', { class: 'table-wrap', hidden: true });
  const toggle = h('button', { type: 'button', class: 'btn btn--secondary btn--sm', 'aria-pressed': 'false' }, 'Ver como tabela');

  const legend = h('ul', { class: 'legend', 'aria-label': 'Legenda' },
    h('li', { class: 'legend-item' }, h('span', { class: 'legend-key s1' }), 'Faturamento'),
    h('li', { class: 'legend-item' }, h('span', { class: 'legend-key s2' }), 'Despesas'));

  const card = h('section', { class: 'card', 'aria-labelledby': 'chart-monthly-title' },
    h('div', { class: 'card-head' },
      h('div', null,
        h('h2', { id: 'chart-monthly-title' }, 'Faturamento e despesas por mês'),
        h('p', { class: 'card-sub' }, 'Últimos 12 meses, somente valores pagos.')),
      hasData ? toggle : null),
    hasData ? legend : null,
    box, tableBox);

  if (!hasData) {
    box.replaceChildren(h('p', { class: 'list-empty' }, 'Ainda não há receitas ou despesas pagas nos últimos 12 meses.'));
    return card;
  }

  // Tabela equivalente
  const table = h('table', null,
    h('thead', null, h('tr', null,
      h('th', { scope: 'col' }, 'Mês'), h('th', { scope: 'col', class: 'num' }, 'Faturamento'),
      h('th', { scope: 'col', class: 'num' }, 'Despesas'), h('th', { scope: 'col', class: 'num' }, 'Resultado'))),
    h('tbody', null, ...monthly.map((m) => h('tr', null,
      h('td', { 'data-label': 'Mês' }, monthLong(m.month)),
      h('td', { class: 'num', 'data-label': 'Faturamento' }, brl(m.revenue)),
      h('td', { class: 'num', 'data-label': 'Despesas' }, brl(m.expenses)),
      h('td', { class: 'num', 'data-label': 'Resultado' }, brl(m.revenue - m.expenses))))));
  tableBox.append(table);

  toggle.addEventListener('click', () => {
    const showTable = toggle.getAttribute('aria-pressed') !== 'true';
    toggle.setAttribute('aria-pressed', String(showTable));
    toggle.textContent = showTable ? 'Ver como gráfico' : 'Ver como tabela';
    tableBox.hidden = !showTable;
    box.hidden = showTable;
    legend.hidden = showTable;
  });

  const tooltip = h('div', { class: 'tooltip', hidden: true, role: 'status' });

  function draw() {
    const width = Math.max(260, box.clientWidth);
    const compact = width < 520;
    const height = compact ? 240 : 280;
    const m = { top: 10, right: 6, bottom: 28, left: compact ? 50 : 58 };
    const innerW = width - m.left - m.right;
    const innerH = height - m.top - m.bottom;
    const max = Math.max(...monthly.flatMap((d) => [d.revenue, d.expenses]));
    const { top, step } = niceScale(max);
    const y = (v) => m.top + innerH - (v / top) * innerH;

    const svg = s('svg', { class: 'chart-svg', viewBox: `0 0 ${width} ${height}`, width, height, role: 'group', 'aria-label': 'Gráfico de barras: faturamento e despesas por mês' });

    for (let v = 0; v <= top + 1e-6; v += step) {
      svg.append(s('line', { class: v === 0 ? 'baseline' : 'grid', x1: m.left, x2: width - m.right, y1: y(v), y2: y(v) }));
      svg.append(s('text', { x: m.left - 8, y: y(v) + 4, 'text-anchor': 'end' }, v === 0 ? '0' : brlCompact(v)));
    }

    const slot = innerW / monthly.length;
    const barW = Math.max(4, Math.min(MAX_BAR, (slot * 0.7 - GAP) / 2));
    const every = compact ? 2 : 1;

    monthly.forEach((d, i) => {
      const cx = m.left + slot * i + slot / 2;
      const x1 = cx - barW - GAP / 2;
      const x2 = cx + GAP / 2;
      const hRev = (d.revenue / top) * innerH;
      const hExp = (d.expenses / top) * innerH;
      if (d.revenue > 0) svg.append(s('path', { class: 'bar-1', d: barPath(x1, y(d.revenue), barW, hRev) }));
      if (d.expenses > 0) svg.append(s('path', { class: 'bar-2', d: barPath(x2, y(d.expenses), barW, hExp) }));

      if ((monthly.length - 1 - i) % every === 0) {
        const withYear = d.month.endsWith('-01') || i === 0;
        svg.append(s('text', { x: cx, y: height - 8, 'text-anchor': 'middle' }, monthLabel(d.month, withYear)));
      }

      const hit = s('rect', {
        class: 'hit', x: cx - slot / 2, y: m.top, width: slot, height: innerH + 4, tabindex: 0,
        'aria-label': `${monthLong(d.month)}: faturamento ${brl(d.revenue)}, despesas ${brl(d.expenses)}`,
      });
      const show = () => {
        tooltip.replaceChildren(
          h('p', { class: 'tooltip-title' }, monthLong(d.month)),
          row('s1', 'Faturamento', brl(d.revenue)),
          row('s2', 'Despesas', brl(d.expenses)),
          row('none', 'Resultado', brl(d.revenue - d.expenses)));
        tooltip.hidden = false;
        const tw = tooltip.offsetWidth;
        const left = cx + tw + 16 > width ? cx - tw - 8 : cx + 8;
        tooltip.style.left = `${Math.max(0, left)}px`;
        tooltip.style.top = `${m.top}px`;
      };
      hit.addEventListener('pointerenter', show);
      hit.addEventListener('pointermove', show);
      hit.addEventListener('focus', show);
      hit.addEventListener('pointerleave', () => { tooltip.hidden = true; });
      hit.addEventListener('blur', () => { tooltip.hidden = true; });
      svg.append(hit);
    });

    clear(box).append(svg, tooltip);
    box.style.minHeight = `${height}px`;
  }

  function row(key, name, value) {
    return h('div', { class: 'tooltip-row' },
      h('span', { class: `tooltip-key ${key}` }),
      h('span', { class: 'tooltip-name' }, name),
      h('span', { class: 'tooltip-value' }, value));
  }

  let lastWidth = 0;
  const observer = new ResizeObserver(() => {
    if (box.hidden || Math.abs(box.clientWidth - lastWidth) < 2) return;
    lastWidth = box.clientWidth;
    draw();
  });
  observer.observe(box);
  // Redesenha ao voltar da tabela (a largura pode ter mudado enquanto o gráfico estava oculto).
  toggle.addEventListener('click', () => {
    if (!box.hidden) requestAnimationFrame(draw);
  });
  requestAnimationFrame(draw);

  return card;
}

/**
 * Barras horizontais de uma única série (uma cor). `items`: [{ label, value, display, hint }].
 * O valor fica na ponta de cada barra; a tabela equivalente é a própria lista (texto).
 */
export function hbars(items, { empty = 'Sem dados ainda.' } = {}) {
  if (!items.length) return h('p', { class: 'list-empty' }, empty);
  const max = Math.max(...items.map((i) => i.value), 1);
  return h('ul', { class: 'hbars' }, ...items.map((item) => {
    const fill = h('div', { class: 'hbar-fill' });
    fill.style.width = `${Math.max(1, (item.value / max) * 78)}%`;
    return h('li', null,
      h('div', { class: 'hbar-label' }, h('span', null, item.label), item.hint ? h('span', null, item.hint) : null),
      h('div', { class: 'hbar-track' }, fill, h('span', { class: 'hbar-value' }, item.display ?? int(item.value))));
  }));
}
