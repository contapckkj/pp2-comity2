/* P2 Automações — efeitos visuais.
   Sem dependências. Se este arquivo falhar, o site continua completo (veja site.js).
   Regras: respeita prefers-reduced-motion, pausa fora da tela e com a aba oculta,
   e usa menos partículas/efeitos no modo leve (classe "lite" definida em boot.js). */
(() => {
  'use strict';

  const root = document.documentElement;
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const hoverQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
  const wideQuery = window.matchMedia('(min-width: 900px)');
  const lite = root.classList.contains('lite');
  let reduce = reduceQuery.matches;
  reduceQuery.addEventListener('change', (e) => { reduce = e.matches; });

  let viewH = window.innerHeight;
  let scrollY = window.scrollY;

  /* ---------- Entrada ao rolar ---------- */
  const reveals = $$('[data-reveal]');
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('is-in'));
  }

  /* ---------- Rolagem: barra, cabeçalho, paralaxe, linha do processo ---------- */
  const bar = $('.progress');
  const header = $('.site-header');
  const hero = $('[data-hero]');
  const parallax = $$('[data-parallax]').map((el) => ({ el, f: parseFloat(el.dataset.parallax) || 0 }));
  const trails = $$('[data-progress]');
  let heroH = hero ? hero.offsetHeight : 0;
  let ticking = false;

  function updateTrails() {
    for (const el of trails) {
      const r = el.getBoundingClientRect();
      if (r.bottom < -120 || r.top > viewH + 120) continue;
      const p = reduce ? 1 : clamp((viewH * 0.85 - r.top) / (r.height + viewH * 0.3), 0, 1);
      el.style.setProperty('--prog', p.toFixed(3));
      const items = Array.from(el.children);
      items.forEach((li, i) => li.classList.toggle('is-on', p >= (i / Math.max(1, items.length - 1)) - 0.001));
    }
  }

  function update() {
    ticking = false;
    scrollY = window.scrollY;
    const max = root.scrollHeight - viewH;
    if (bar) bar.style.setProperty('--prog', max > 0 ? (scrollY / max).toFixed(4) : '0');
    if (header) header.classList.toggle('is-scrolled', scrollY > 8);
    if (!reduce && scrollY < heroH * 1.3) {
      for (const { el, f } of parallax) el.style.setProperty('--py', (scrollY * f).toFixed(1));
    }
    updateTrails();
  }

  function requestUpdate() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }
  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', () => {
    viewH = window.innerHeight;
    heroH = hero ? hero.offsetHeight : 0;
    requestUpdate();
  });
  update();

  /* ---------- Menu: seção atual ---------- */
  const links = new Map($$('.nav-links a[href^="#"]').map((a) => [a.getAttribute('href').slice(1), a]));
  if ('IntersectionObserver' in window) {
    const spy = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const link = links.get(entry.target.id);
        if (!link) continue;
        if (entry.isIntersecting) {
          links.forEach((a) => a.removeAttribute('aria-current'));
          link.setAttribute('aria-current', 'true');
        } else {
          link.removeAttribute('aria-current');
        }
      }
    }, { rootMargin: '-45% 0px -50% 0px' });
    links.forEach((_, id) => {
      const section = document.getElementById(id);
      if (section) spy.observe(section);
    });
  }

  /* ---------- Cena 3D do início + rede de pontos ---------- */
  const scene = $('[data-scene]');
  const canvas = $('[data-net]');
  const pointer = { x: 0, y: 0, nx: 0, ny: 0, active: false };

  function createNet(cv) {
    const ctx = cv.getContext('2d');
    if (!ctx) return null;
    let w = 0;
    let h = 0;
    let pts = [];

    function resize() {
      const rect = cv.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, lite ? 1 : 1.5);
      w = rect.width;
      h = rect.height;
      cv.width = Math.max(1, Math.round(w * dpr));
      cv.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(lite ? 22 : 58, (w * h) / (lite ? 24000 : 21000)));
      pts = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        z: 0.4 + Math.random() * 0.6,
      }));
    }

    function draw(dt, mouse) {
      ctx.clearRect(0, 0, w, h);
      const link = lite ? 110 : 150;
      const pull = mouse.active ? 200 : 0;
      for (const p of pts) {
        p.x += p.vx * dt * 60 * p.z;
        p.y += p.vy * dt * 60 * p.z;
        if (p.x < -20) p.x = w + 20; else if (p.x > w + 20) p.x = -20;
        if (p.y < -20) p.y = h + 20; else if (p.y > h + 20) p.y = -20;
      }
      ctx.lineWidth = 1;
      for (let i = 0; i < pts.length; i += 1) {
        const a = pts[i];
        for (let j = i + 1; j < pts.length; j += 1) {
          const b = pts[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < link * link) {
            const alpha = (1 - Math.sqrt(d2) / link) * 0.34 * Math.min(a.z, b.z);
            ctx.strokeStyle = `rgba(110,165,255,${alpha.toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
        if (pull) {
          const dx = a.x - mouse.x;
          const dy = a.y - mouse.y;
          const d = Math.hypot(dx, dy);
          if (d < pull) {
            ctx.strokeStyle = `rgba(160,210,255,${((1 - d / pull) * 0.55).toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(mouse.x, mouse.y);
            ctx.stroke();
          }
        }
      }
      for (const p of pts) {
        ctx.fillStyle = `rgba(165,205,255,${(0.35 + p.z * 0.5).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 0.9 + p.z * 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    resize();
    return { resize, draw };
  }

  if (hero && (scene || canvas)) {
    const net = canvas ? createNet(canvas) : null;
    const stage = scene ? $('.scene-stage', scene) : null;
    const sats = scene ? $$('[data-sat]', scene) : [];
    let sceneW = scene ? scene.clientWidth : 0;
    let curX = 0;
    let curY = 0;
    let visible = true;
    let running = false;
    let last = 0;

    const rad = (deg) => (deg * Math.PI) / 180;
    // R em fração da largura; a = inclinação em X; b = giro em Y (iguais aos anéis do CSS)
    const orbits = [
      { R: 0.39, a: rad(74), b: 0, speed: 0.55, phase: 0 },
      { R: 0.31, a: rad(74), b: rad(58), speed: -0.7, phase: 2.2 },
      { R: 0.39, a: rad(74), b: 0, speed: 0.55, phase: Math.PI },
    ];

    function placeSats(t) {
      sats.forEach((sat, i) => {
        const o = orbits[i % orbits.length];
        const theta = o.phase + t * o.speed;
        const r = o.R * sceneW;
        const x = r * Math.cos(theta);
        const y = r * Math.sin(theta);
        const y1 = y * Math.cos(o.a);
        const z1 = y * Math.sin(o.a);
        const x2 = x * Math.cos(o.b) + z1 * Math.sin(o.b);
        const z2 = -x * Math.sin(o.b) + z1 * Math.cos(o.b);
        sat.style.transform = `translate3d(${x2.toFixed(1)}px, ${y1.toFixed(1)}px, ${z2.toFixed(1)}px)`;
      });
    }

    function targetTilt() {
      if (hoverQuery.matches) return { x: pointer.nx, y: pointer.ny };
      // celular: a inclinação acompanha a rolagem
      const p = heroH ? clamp(scrollY / heroH, 0, 1.4) : 0;
      return { x: p * 1.2 - 0.2, y: p * 0.4 };
    }

    function pose() {
      if (!stage) return;
      stage.style.setProperty('--ry', `${(-16 + curX * 18).toFixed(2)}deg`);
      stage.style.setProperty('--rx', `${(9 - curY * 10).toFixed(2)}deg`);
    }

    function frame(now) {
      if (!visible || document.hidden || reduce) {
        running = false;
        return;
      }
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;
      const k = 1 - Math.exp(-dt * 5);
      const t = targetTilt();
      curX += (t.x - curX) * k;
      curY += (t.y - curY) * k;
      pose();
      placeSats(now / 1000);
      if (net) net.draw(dt, pointer);
      requestAnimationFrame(frame);
    }

    function start() {
      if (running || reduce || !visible || document.hidden) return;
      running = true;
      last = performance.now();
      requestAnimationFrame(frame);
    }

    function stillFrame() {
      placeSats(0.6);
      pose();
      if (net) net.draw(0, pointer);
    }

    if (net) {
      let resizeTimer = 0;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          net.resize();
          if (scene) sceneW = scene.clientWidth;
          if (reduce || !running) stillFrame();
        }, 150);
      });
    } else if (scene) {
      window.addEventListener('resize', () => { sceneW = scene.clientWidth; });
    }

    if (hoverQuery.matches) {
      window.addEventListener('pointermove', (e) => {
        if (!visible) return;
        pointer.nx = clamp((e.clientX / window.innerWidth - 0.5) * 2, -1, 1);
        pointer.ny = clamp((e.clientY / viewH - 0.5) * 2, -1, 1);
        if (canvas) {
          const r = canvas.getBoundingClientRect();
          pointer.x = e.clientX - r.left;
          pointer.y = e.clientY - r.top;
          pointer.active = e.clientY - r.top >= 0 && e.clientY - r.top <= r.height;
        }
      }, { passive: true });
      document.addEventListener('pointerleave', () => { pointer.active = false; });
    }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
        if (visible) start();
      }, { threshold: 0 }).observe(hero);
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });
    reduceQuery.addEventListener('change', () => { if (reduce) stillFrame(); else start(); });

    stillFrame();
    start();
  }

  /* ---------- Cartões: brilho que segue o mouse e inclinação leve ---------- */
  if (hoverQuery.matches) {
    const tilt = !reduce && !lite;
    const tiltables = [...$$('[data-cards] .card'), ...$$('[data-tilt]')];

    const setSpot = (el, e) => {
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      el.style.setProperty('--mx', `${x.toFixed(0)}px`);
      el.style.setProperty('--my', `${y.toFixed(0)}px`);
      if (tilt) {
        el.style.setProperty('--ty', `${((x / r.width - 0.5) * 7).toFixed(2)}deg`);
        el.style.setProperty('--tx', `${((0.5 - y / r.height) * 7).toFixed(2)}deg`);
      }
    };
    tiltables.forEach((el) => {
      el.addEventListener('pointermove', (e) => setSpot(el, e), { passive: true });
      el.addEventListener('pointerleave', () => {
        el.style.setProperty('--tx', '0deg');
        el.style.setProperty('--ty', '0deg');
      });
    });

    // Painel de chamada: luz que acompanha o cursor
    $$('[data-glow]').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${(e.clientX - r.left).toFixed(0)}px`);
        el.style.setProperty('--my', `${(e.clientY - r.top).toFixed(0)}px`);
      }, { passive: true });
    });

    // Botões principais: atração magnética discreta
    if (!reduce) {
      $$('[data-magnet]').forEach((btn) => {
        btn.addEventListener('pointermove', (e) => {
          const r = btn.getBoundingClientRect();
          const dx = clamp((e.clientX - (r.left + r.width / 2)) * 0.14, -8, 8);
          const dy = clamp((e.clientY - (r.top + r.height / 2)) * 0.2, -6, 6);
          btn.style.translate = `${dx.toFixed(1)}px ${dy.toFixed(1)}px`;
        }, { passive: true });
        btn.addEventListener('pointerleave', () => { btn.style.translate = ''; });
      });
    }
  }

  /* ---------- Na prática: telefone 3D ---------- */
  const phone = $('[data-phone]');
  const practice = $('[data-practice]');
  if (phone) {
    const items = $$('[data-step-item]');
    const dots = $$('.phone-dots [data-go]');
    let step = 1;
    let autoTimer = 0;
    let userPicked = false;
    let inView = false;

    function setStep(n) {
      if (n === step) return;
      step = n;
      phone.dataset.step = String(n);
      items.forEach((li) => li.classList.toggle('is-active', Number(li.dataset.stepItem) === n));
      dots.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.go) === n)));
    }

    dots.forEach((b) => b.addEventListener('click', () => {
      userPicked = true;
      stopAuto();
      setStep(Number(b.dataset.go));
    }));
    items.forEach((li) => li.addEventListener('click', () => {
      userPicked = true;
      stopAuto();
      setStep(Number(li.dataset.stepItem));
    }));

    function stopAuto() {
      clearInterval(autoTimer);
      autoTimer = 0;
    }
    function startAuto() {
      if (autoTimer || reduce || userPicked || wideQuery.matches || !inView) return;
      autoTimer = setInterval(() => setStep((step % 4) + 1), 3200);
    }

    let stepObserver = null;
    function watchSteps() {
      if (stepObserver) stepObserver.disconnect();
      stepObserver = null;
      if (!wideQuery.matches || !('IntersectionObserver' in window)) return;
      stepObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setStep(Number(entry.target.dataset.stepItem));
        }
      }, { rootMargin: '-42% 0px -42% 0px' });
      items.forEach((li) => stepObserver.observe(li));
    }

    if ('IntersectionObserver' in window && practice) {
      new IntersectionObserver((entries) => {
        inView = entries[0].isIntersecting;
        if (inView) startAuto(); else stopAuto();
      }, { threshold: 0.25 }).observe(practice);
    }
    wideQuery.addEventListener('change', () => {
      stopAuto();
      watchSteps();
      startAuto();
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) stopAuto(); else startAuto(); });
    watchSteps();
  }
})();
