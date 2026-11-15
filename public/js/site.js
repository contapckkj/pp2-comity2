(() => {
  'use strict';

  const DEFAULT_MESSAGE =
    'Olá! Vim pelo site da P2 Automações e gostaria de conversar sobre uma solução para o meu negócio.';

  /* Rodapé: ano atual */
  const year = document.querySelector('[data-year]');
  if (year) year.textContent = String(new Date().getFullYear());

  /* Menu no celular */
  const toggle = document.querySelector('.nav-toggle');
  const menu = document.getElementById('menu');
  if (toggle && menu) {
    const label = toggle.querySelector('.sr-only');
    const setOpen = (open) => {
      toggle.setAttribute('aria-expanded', String(open));
      menu.classList.toggle('is-open', open);
      if (label) label.textContent = open ? 'Fechar menu' : 'Abrir menu';
    };
    toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
    menu.addEventListener('click', (event) => {
      if (event.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setOpen(false);
        toggle.focus();
      }
    });
  }

  /* WhatsApp e e-mail vêm da configuração do servidor (nada fixo no código) */
  async function loadConfig() {
    try {
      const res = await fetch('/api/public/config', { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(String(res.status));
      return await res.json();
    } catch {
      return {};
    }
  }

  function applyConfig(config) {
    if (config.whatsappNumber) {
      document.querySelectorAll('a[data-wa]').forEach((link) => {
        const text = link.dataset.waMsg || DEFAULT_MESSAGE;
        link.href = `https://wa.me/${config.whatsappNumber}?text=${encodeURIComponent(text)}`;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        const hint = document.createElement('span');
        hint.className = 'sr-only';
        hint.textContent = ' (abre em nova aba)';
        link.append(hint);
      });
    }
    // Sem número configurado, os botões continuam levando ao formulário (#contato).

    if (config.contactEmail) {
      const box = document.querySelector('[data-email]');
      const link = document.querySelector('[data-email-link]');
      if (box && link) {
        link.href = `mailto:${config.contactEmail}`;
        link.textContent = config.contactEmail;
        box.hidden = false;
      }
    }
  }

  loadConfig().then(applyConfig);

  /* Formulário de contato */
  const form = document.getElementById('form-contato');
  if (!form) return;
  const status = form.querySelector('[data-status]');
  const submit = form.querySelector('button[type="submit"]');

  const setStatus = (state, message) => {
    status.dataset.state = state;
    status.textContent = message;
  };

  function clearErrors() {
    form.querySelectorAll('[data-error-for]').forEach((el) => {
      el.textContent = '';
    });
    form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  }

  function showErrors(errors) {
    let first = null;
    for (const [name, message] of Object.entries(errors)) {
      const box = form.querySelector(`[data-error-for="${CSS.escape(name)}"]`);
      const input = form.elements[name];
      if (box) box.textContent = message;
      if (input) {
        input.setAttribute('aria-invalid', 'true');
        first ||= input;
      }
    }
    first?.focus();
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors();
    setStatus('', '');
    submit.disabled = true;
    setStatus('info', 'Enviando…');

    try {
      const payload = Object.fromEntries(new FormData(form));
      // Serviços sem categoria própria no cadastro (mídias, vídeo) vão no início da mensagem.
      const tag = form.elements.service?.selectedOptions[0]?.dataset.tag;
      if (tag && payload.message && payload.message.trim()) payload.message = `[${tag}] ${payload.message}`;
      const res = await fetch('/api/public/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        form.reset();
        setStatus('success', 'Mensagem enviada! Entraremos em contato em breve.');
        setTimeout(() => { window.location.href = '/obrigado.html'; }, 1200);
      } else if (res.status === 422 && data.errors) {
        showErrors(data.errors);
        setStatus('error', 'Confira os campos destacados.');
      } else if (res.status === 429) {
        setStatus('error', data.error || 'Muitas tentativas. Tente novamente mais tarde.');
      } else {
        setStatus('error', 'Não foi possível enviar agora. Tente pelo WhatsApp.');
      }
    } catch {
      setStatus('error', 'Sem conexão. Verifique sua internet e tente de novo.');
    } finally {
      submit.disabled = false;
    }
  });
})();
