(() => {
  'use strict';

  const form = document.getElementById('login-form');
  const error = document.getElementById('login-error');
  const button = form.querySelector('.submit');
  const password = document.getElementById('password');
  const reveal = form.querySelector('.reveal');

  reveal.addEventListener('click', () => {
    const show = password.type === 'password';
    password.type = show ? 'text' : 'password';
    reveal.textContent = show ? 'Ocultar' : 'Mostrar';
    reveal.setAttribute('aria-pressed', String(show));
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.textContent = '';
    const email = form.elements.email.value.trim();
    if (!email || !password.value) {
      error.textContent = 'Informe o e-mail e a senha.';
      (email ? password : form.elements.email).focus();
      return;
    }

    button.disabled = true;
    button.textContent = 'Entrando…';
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email, password: password.value }),
      });
      if (res.ok) {
        location.replace('/painel');
        return;
      }
      const data = await res.json().catch(() => ({}));
      error.textContent =
        data.error || 'Não foi possível entrar agora. Tente novamente em instantes.';
      password.value = '';
      password.focus();
    } catch {
      error.textContent = 'Sem conexão. Verifique a internet e tente de novo.';
    } finally {
      button.disabled = false;
      button.textContent = 'Entrar';
    }
  });
})();
