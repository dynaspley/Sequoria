/* ==========================================================================
   Séquoria — animations & interactions
   JavaScript natif, sans dépendance. Tout est désactivé proprement si
   l'utilisateur préfère réduire les animations.
   ========================================================================== */
(() => {
  'use strict';

  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const $ = (selector, context = document) => context.querySelector(selector);
  const $$ = (selector, context = document) => [...context.querySelectorAll(selector)];
  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const debounce = (fn, delay) => {
    let timer = 0;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  };
  const pageTop = (el) => el.getBoundingClientRect().top + window.scrollY;

  /* ------------------------------------------------------------------------
     Boucle d'animation partagée : un seul requestAnimationFrame pour tout.
     ------------------------------------------------------------------------ */
  const scroll = { y: window.scrollY, vh: window.innerHeight, vw: window.innerWidth, velocity: 0 };
  const tickers = new Set();
  const measures = new Set();

  const measure = () => {
    scroll.vh = window.innerHeight;
    scroll.vw = window.innerWidth;
    scroll.y = window.scrollY;
    measures.forEach((fn) => fn());
  };

  let previousY = scroll.y;
  let previousTime = performance.now();

  const frame = (now) => {
    const dt = clamp((now - previousTime) / 1000, 0.001, 0.064);
    previousTime = now;
    scroll.y = window.scrollY;
    scroll.velocity = lerp(scroll.velocity, (scroll.y - previousY) / dt, 0.1);
    previousY = scroll.y;
    tickers.forEach((fn) => fn(now / 1000, dt));
    requestAnimationFrame(frame);
  };

  /* ------------------------------------------------------------------------
     Découpage du texte en mots (masques d'apparition ou remplissage).
     La ponctuation collée à un mot reste avec lui pour éviter les retours
     à la ligne orphelins.
     ------------------------------------------------------------------------ */
  function splitWords(el, { mask = true } = {}) {
    const words = [];
    let joinable = false;

    const makeWord = (text) => {
      const word = document.createElement('span');
      word.className = mask ? 'w' : 'fw';
      if (mask) {
        const inner = document.createElement('span');
        inner.className = 'w__i';
        inner.textContent = text;
        word.append(inner);
      } else {
        word.textContent = text;
      }
      word.style.setProperty('--wi', words.length);
      words.push(word);
      return word;
    };

    const walk = (node) => {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          const fragment = document.createDocumentFragment();
          child.textContent.split(/([ \t\n\r]+)/).forEach((part) => {
            if (!part) return;
            if (/^[ \t\n\r]+$/.test(part)) {
              fragment.append(' ');
              joinable = false;
              return;
            }
            const previous = words[words.length - 1];
            if (mask && joinable && previous && /^[,.;:!?…)»]+$/.test(part)) {
              (previous.firstElementChild || previous).append(part);
              return;
            }
            fragment.append(makeWord(part));
            joinable = true;
          });
          child.replaceWith(fragment);
        } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName !== 'BR') {
          walk(child);
        } else if (child.nodeName === 'BR') {
          joinable = false;
        }
      });
    };

    walk(el);
    return words;
  }

  /* Texte qui roule au survol : on duplique le libellé. */
  function initRoll() {
    $$('[data-roll]').forEach((el) => {
      const text = el.textContent.trim();
      const wrap = document.createElement('span');
      const front = document.createElement('span');
      const back = document.createElement('span');
      wrap.className = 'roll';
      front.className = 'roll__a';
      back.className = 'roll__b';
      front.textContent = text;
      back.textContent = text;
      back.setAttribute('aria-hidden', 'true');
      wrap.append(front, back);
      el.textContent = '';
      el.append(wrap);
    });
  }

  /* ------------------------------------------------------------------------
     Le ruban : une forme organique faite de fils, comme les cannelures
     d'un carton ondulé qui ondulent dans la lumière.
     ------------------------------------------------------------------------ */
  // fold : position (0 → 1, de gauche à droite) du pli, là où les fils se
  // resserrent ; twist : vitesse de torsion. Dans le hero clair, le pli reste
  // hors champ : seules de fines fibres passent derrière le titre.
  const RIBBON_PRESETS = {
    hero: {
      strands: 64, steps: 140, y: 0.36, tilt: 0.08, amp: 0.08, width: 0.34,
      fold: 1.3, twist: 1.2, speed: 0.8, alpha: 0.16, halo: 0,
      blend: 'multiply',
      colors: ['#9b7248', '#c29a6b', '#7fa785', '#4f8059'],
      small: { y: 0.6, tilt: -0.04, amp: 0.04, width: 0.14 },
    },
    footer: {
      strands: 46, steps: 120, y: 0.46, tilt: 0.12, amp: 0.08, width: 0.34,
      fold: 0.18, twist: 3, speed: 0.6, alpha: 0.16, halo: 0.08,
      blend: 'lighter',
      colors: ['#9a6b3f', '#e2bf84', '#a8e6ad', '#5fa06f'],
    },
  };

  class Ribbon {
    constructor(canvas, options) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.o = options;
      this.active = true;
      this.started = reduceMotion;
      this.startTime = 0;
      this.reveal = reduceMotion ? 1 : 0;
      this.scroll = 0;
      this.mouse = { x: 0, y: 0, tx: 0, ty: 0 };
      this.resize();
    }

    begin() {
      if (this.started) return;
      this.started = true;
      this.startTime = performance.now();
    }

    resize() {
      const w = this.canvas.clientWidth;
      const h = this.canvas.clientHeight;
      if (!w || !h || (w === this.w && h === this.h)) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.w = w;
      this.h = h;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Du brun kraft au vert : le carton qui rejoint la nature.
      const gradient = this.ctx.createLinearGradient(0, h * 0.15, w, h * 0.85);
      [0, 0.32, 0.62, 1].forEach((stop, i) => gradient.addColorStop(stop, this.o.colors[i]));
      this.gradient = gradient;

      const small = w < 720;
      this.layout = small && this.o.small ? { ...this.o, ...this.o.small } : this.o;
      this.strands = small ? Math.round(this.o.strands * 0.6) : this.o.strands;
      this.steps = small ? 96 : this.o.steps;
      if (reduceMotion) this.draw(9);
    }

    tick(time) {
      if (!this.active || !this.started || !this.w) return;
      const m = this.mouse;
      m.x = lerp(m.x, m.tx, 0.035);
      m.y = lerp(m.y, m.ty, 0.035);
      if (this.reveal < 1) this.reveal = clamp((performance.now() - this.startTime) / 2600);
      this.draw(time);
    }

    draw(time) {
      const { ctx, w, h } = this;
      const o = this.layout;
      if (!w) return;
      const t = time * o.speed;
      const reveal = 1 - Math.pow(1 - this.reveal, 3);
      const { x: mx, y: my } = this.mouse;
      const s = this.scroll;
      const TAU = Math.PI * 2;

      ctx.clearRect(0, 0, w, h);

      // Halo diffus derrière le ruban (fonds sombres uniquement).
      if (o.halo) {
        const gx = w * (0.6 + mx * 0.06);
        const gy = h * (o.y + 0.02);
        const halo = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(w, h) * 0.55);
        halo.addColorStop(0, `rgba(226, 191, 132, ${o.halo * reveal})`);
        halo.addColorStop(1, 'rgba(226, 191, 132, 0)');
        ctx.fillStyle = halo;
        ctx.fillRect(0, 0, w, h);
      }

      // Sur fond sombre, les fils s'additionnent : là où le ruban se tord, la
      // lumière s'intensifie. Sur fond clair, ils se multiplient comme de l'encre.
      ctx.globalCompositeOperation = o.blend;
      ctx.strokeStyle = this.gradient;
      ctx.lineWidth = 1;
      const N = this.strands;
      const M = this.steps;
      const uMax = reveal * 1.15;

      for (let j = 0; j < N; j++) {
        const v = j / (N - 1) - 0.5;
        const edge = 1 - Math.pow(Math.abs(v) * 2, 3);
        ctx.globalAlpha = o.alpha * (0.2 + 0.8 * edge) * reveal;
        ctx.beginPath();
        for (let k = 0; k <= M; k++) {
          const u = k / M;
          if (u > uMax) break;
          const a = u * TAU;
          const cy = h * (o.y + o.tilt * (u - 0.5)
            + o.amp * Math.sin(a * 0.55 + t * 0.32 + mx * 0.9)
            + o.amp * 0.4 * Math.sin(a * 1.25 - t * 0.47 + 1.3)
            - s * 0.14);
          const th = (u - o.fold) * o.twist + Math.PI / 2 + 0.28 * Math.sin(t * 0.3)
            + my * 0.35 + s * 0.4 + v * 0.35 * Math.sin(t * 0.27 + a * 0.7);
          const wd = h * o.width * (0.72 + 0.28 * Math.sin(a * 0.8 - t * 0.21));
          const x = w * (-0.08 + 1.16 * u) + v * wd * 0.42 * Math.sin(th);
          const y = cy + v * wd * Math.cos(th);
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  const ribbons = {};

  function initRibbons() {
    $$('[data-ribbon]').forEach((canvas) => {
      const preset = RIBBON_PRESETS[canvas.dataset.ribbon];
      if (!preset || !canvas.getContext) return;
      ribbons[canvas.dataset.ribbon] = new Ribbon(canvas, preset);
    });

    const list = Object.values(ribbons);
    if (!list.length) return;

    measures.add(() => list.forEach((r) => r.resize()));
    if (reduceMotion) return;

    tickers.add((time) => list.forEach((r) => r.tick(time)));
    if (finePointer) {
      window.addEventListener('pointermove', (event) => {
        const tx = event.clientX / scroll.vw - 0.5;
        const ty = event.clientY / scroll.vh - 0.5;
        list.forEach((r) => {
          r.mouse.tx = tx;
          r.mouse.ty = ty;
        });
      }, { passive: true });
    }
  }

  /* ------------------------------------------------------------------------
     Hero : la feuille de contenu glisse par-dessus, le hero recule.
     ------------------------------------------------------------------------ */
  function initHero() {
    const hero = $('[data-hero]');
    if (!hero) return;
    let height = 0;
    let overflow = 0;
    let last = -1;
    measures.add(() => {
      height = hero.offsetHeight;
      // Hero plus haut que l'écran (petits mobiles) : on le laisse défiler
      // jusqu'à son bas avant de l'épingler.
      overflow = Math.max(0, height - scroll.vh);
      hero.style.setProperty('--hero-top', `${-overflow}px`);
    });
    tickers.add(() => {
      const p = clamp((scroll.y - overflow) / ((height - overflow) || scroll.vh));
      if (p === last) return;
      last = p;
      if (!reduceMotion) hero.style.setProperty('--hp', p.toFixed(4));
      hero.classList.toggle('is-covered', p >= 1);
      if (ribbons.hero) {
        ribbons.hero.active = p < 1;
        ribbons.hero.scroll = p;
      }
    });
  }

  /* ------------------------------------------------------------------------
     Manifeste : les mots s'allument au fil du défilement.
     ------------------------------------------------------------------------ */
  function initFill() {
    $$('[data-fill]').forEach((el) => {
      const words = splitWords(el, { mask: false });
      const marks = $$('mark', el).map((mark) => {
        const inside = $$('.fw', mark);
        return { mark, index: words.indexOf(inside[inside.length - 1]) };
      });

      if (reduceMotion) {
        words.forEach((w) => { w.style.opacity = 1; });
        marks.forEach(({ mark }) => mark.classList.add('is-lit'));
        return;
      }

      let top = 0;
      let height = 0;
      let last = -1;
      measures.add(() => {
        top = pageTop(el);
        height = el.offsetHeight;
      });
      tickers.add(() => {
        const start = top - scroll.vh * 0.82;
        const end = top + height - scroll.vh * 0.42;
        const p = clamp((scroll.y - start) / (end - start));
        if (Math.abs(p - last) < 0.0005) return;
        last = p;
        const lit = p * (words.length + 1);
        words.forEach((word, i) => {
          word.style.opacity = (0.14 + 0.86 * clamp(lit - i)).toFixed(3);
        });
        marks.forEach(({ mark, index }) => mark.classList.toggle('is-lit', lit - index >= 1));
      });
    });
  }

  /* ------------------------------------------------------------------------
     Bandeau : défilement infini, accéléré et incliné par la vitesse de scroll.
     ------------------------------------------------------------------------ */
  function initMarquee() {
    $$('[data-marquee]').forEach((row) => {
      const track = $('.band__track', row);
      const direction = Number(row.dataset.marquee) || -1;
      const speed = Number(row.dataset.marqueeSpeed) || 30;
      const originals = [...track.children];
      let unit = 0;
      let top = 0;
      let height = 0;
      let offset = 0;
      let skew = 0;
      let builtFor = 0;

      const build = () => {
        if (builtFor === row.clientWidth && unit) return;
        builtFor = row.clientWidth;
        $$('[data-clone]', track).forEach((node) => node.remove());
        unit = track.getBoundingClientRect().width;
        if (!unit) return;
        const copies = Math.ceil((row.clientWidth * 2) / unit);
        for (let i = 0; i < copies; i++) {
          originals.forEach((node) => {
            const clone = node.cloneNode(true);
            clone.setAttribute('aria-hidden', 'true');
            clone.dataset.clone = '';
            track.append(clone);
          });
        }
      };

      measures.add(() => {
        build();
        top = pageTop(row);
        height = row.offsetHeight;
      });

      tickers.add((time, dt) => {
        if (!unit || scroll.y + scroll.vh < top || scroll.y > top + height) return;
        const velocity = reduceMotion ? 0 : scroll.velocity;
        if (!reduceMotion) offset += dt * speed * (1 + Math.min(Math.abs(velocity) / 900, 3));
        const position = (((offset + (reduceMotion ? 0 : scroll.y * 0.3)) % unit) + unit) % unit;
        const x = direction < 0 ? -position : position - unit;
        skew = lerp(skew, clamp(velocity / 260, -6, 6) * -direction, 0.12);
        track.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0) skewX(${skew.toFixed(2)}deg)`;
      });
    });
  }

  /* Parallaxe légère sur les éléments [data-speed]. */
  function initParallax() {
    if (reduceMotion) return;
    const items = $$('[data-speed]').map((el) => ({
      el, speed: parseFloat(el.dataset.speed) || 0, top: 0, height: 0, current: 0,
    }));
    if (!items.length) return;
    measures.add(() => items.forEach((item) => {
      item.top = pageTop(item.el) - item.current;
      item.height = item.el.offsetHeight;
    }));
    tickers.add(() => {
      const middle = scroll.y + scroll.vh / 2;
      items.forEach((item) => {
        if (item.top > scroll.y + scroll.vh * 1.5 || item.top + item.height < scroll.y - scroll.vh * 0.5) return;
        const offset = (middle - (item.top + item.height / 2)) * item.speed;
        if (Math.abs(offset - item.current) < 0.05) return;
        item.current = offset;
        item.el.style.translate = `0 ${offset.toFixed(2)}px`;
      });
    });
  }

  /* Mode d'emploi : la ligne de progression suit le défilement. */
  function initUsage() {
    const body = $('.usage__body');
    if (!body) return;
    const steps = $$('.step', body);
    let top = 0;
    let height = 0;
    let last = -1;
    measures.add(() => {
      top = pageTop(body);
      height = body.offsetHeight;
    });
    tickers.add(() => {
      const start = top - scroll.vh * 0.8;
      const end = top + height - scroll.vh * 0.5;
      const p = reduceMotion ? 1 : clamp((scroll.y - start) / (end - start));
      if (p === last) return;
      last = p;
      body.style.setProperty('--p', p.toFixed(4));
      steps.forEach((step, i) => step.classList.toggle('is-active', p >= (i + 0.2) / steps.length));
    });
  }

  /* Pied de page : dévoilé sous la feuille, grand logotype qui se lève. */
  function initFooter() {
    const footer = $('[data-footer]');
    const main = $('main');
    if (!footer || !main) return;

    const brand = $('.footer__brand', footer);
    if (brand) {
      const text = brand.textContent.trim();
      brand.textContent = '';
      [...text].forEach((char, i) => {
        const span = document.createElement('span');
        span.className = 'ch';
        span.textContent = char;
        span.style.setProperty('--ci', i);
        brand.append(span);
      });
    }

    let top = 0;
    let height = 0;
    let entered = false;
    let last = -1;
    measures.add(() => {
      height = footer.offsetHeight;
      footer.classList.toggle('is-static', height > scroll.vh - 40);
      top = main.getBoundingClientRect().bottom + window.scrollY;
    });
    tickers.add(() => {
      const p = clamp((scroll.y + scroll.vh - top) / (height || 1));
      if (p !== last) {
        last = p;
        if (!reduceMotion) footer.style.setProperty('--fp', p.toFixed(4));
      }
      if (!entered && p > 0.25) {
        entered = true;
        footer.classList.add('is-in');
        if (ribbons.footer) ribbons.footer.begin();
      }
      if (ribbons.footer) ribbons.footer.active = p > 0;
    });
  }

  /* ------------------------------------------------------------------------
     Navigation : barre toujours visible, lien actif, menu plein écran.
     ------------------------------------------------------------------------ */
  function initNav() {
    const nav = $('[data-nav]');
    if (!nav) return;

    const sections = new Map();
    $$('.nav__link', nav).forEach((link) => {
      const href = link.getAttribute('href');
      const section = href.startsWith('#') && href.length > 1 ? $(href) : null;
      if (section) sections.set(section, link);
    });
    if (!sections.size || !('IntersectionObserver' in window)) return;
    const links = [...sections.values()];
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const link = sections.get(entry.target);
        if (entry.isIntersecting) {
          links.forEach((l) => l.removeAttribute('aria-current'));
          link.setAttribute('aria-current', 'true');
        } else {
          link.removeAttribute('aria-current');
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach((_, section) => spy.observe(section));
  }

  function initMenu() {
    const toggle = $('.nav__toggle');
    const menu = $('#menu');
    if (!toggle || !menu) return;
    const outside = [$('main'), $('.footer')].filter(Boolean);
    let open = false;
    let timer = 0;

    const setOpen = (value, { restoreFocus = true } = {}) => {
      if (value === open) return;
      open = value;
      clearTimeout(timer);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
      root.classList.toggle('menu-open', open);
      outside.forEach((el) => { el.inert = open; });
      if (open) {
        menu.hidden = false;
        menu.getBoundingClientRect();
        menu.classList.add('is-open');
      } else {
        menu.classList.remove('is-open');
        timer = setTimeout(() => { menu.hidden = true; }, reduceMotion ? 0 : 900);
        if (restoreFocus) toggle.focus();
      }
    };

    toggle.addEventListener('click', () => setOpen(!open));

    // « Séquoria » et « Haut de page » ramènent à l'accueil. L'ancre #top seule
    // ne suffit pas : le hero est collant, le navigateur le croit déjà affiché.
    $$('a[href="#top"]').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        setOpen(false, { restoreFocus: false });
        window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
        if (location.hash) history.replaceState(null, '', location.pathname + location.search);
      });
    });
    menu.addEventListener('click', (event) => {
      if (event.target.closest('a')) setOpen(false, { restoreFocus: false });
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && open) setOpen(false);
    });
  }

  /* FAQ en accordéon. */
  function initFaq() {
    $$('.faq__q').forEach((button) => {
      const panel = document.getElementById(button.getAttribute('aria-controls'));
      const item = button.closest('.faq__item');
      if (!panel || !item) return;
      panel.inert = true;
      button.addEventListener('click', () => {
        const open = button.getAttribute('aria-expanded') !== 'true';
        button.setAttribute('aria-expanded', String(open));
        item.classList.toggle('is-open', open);
        panel.inert = !open;
      });
    });
  }

  /* Estimateur de quantités (page « Litière chevaux »). Mêmes repères que la
     FAQ : 6 à 8 balles par box à la mise en place, puis 1 à 2 par semaine. */
  function initEstimator() {
    const estimator = $('[data-estimator]');
    if (!estimator) return;
    const range = $('input[type="range"]', estimator);
    const output = $('output', estimator);
    const rhythms = $$('input[name="rythme"]', estimator);
    const outs = {
      setup: $('[data-out="setup"]', estimator),
      month: $('[data-out="month"]', estimator),
      kg: $('[data-out="kg"]', estimator),
    };
    const number = (value) => value.toLocaleString('fr-FR').replace(/\u202f/g, '\u00a0');
    const write = (el, text) => {
      if (el.textContent === text) return;
      el.textContent = text;
      if (reduceMotion) return;
      el.classList.remove('is-bump');
      void el.offsetWidth;
      el.classList.add('is-bump');
    };
    const update = () => {
      const boxes = Number(range.value);
      const rate = Number((rhythms.find((r) => r.checked) || rhythms[0]).value);
      const month = Math.round((boxes * rate * 52) / 12);
      output.textContent = boxes;
      write(outs.setup, `${number(boxes * 6)} à ${number(boxes * 8)}`);
      write(outs.month, number(month));
      write(outs.kg, `${number(month * 20)}\u00a0kg`);
    };
    range.addEventListener('input', update);
    rhythms.forEach((radio) => radio.addEventListener('change', update));
    update();
  }

  /* Formulaire de devis : validation, puis envoi vers un service de formulaire
     (attribut data-endpoint) ou, à défaut, ouverture de la messagerie du
     visiteur avec la demande pré-remplie. */
  function initContactForm() {
    const form = $('[data-form]');
    if (!form) return;
    const status = $('[data-form-status]', form);
    const products = {
      chevaux: 'Litière chevaux (20 kg)',
      nac: 'Litière petits animaux (2 kg)',
      'les-deux': 'Litière chevaux et petits animaux',
    };

    const setStatus = (message, isError = false) => {
      status.textContent = message;
      status.classList.toggle('is-error', isError);
    };

    // Produit présélectionné depuis le lien (ex. : contact/?produit=nac).
    const wanted = new URLSearchParams(window.location.search).get('produit');
    if (wanted && products[wanted]) {
      const radio = $(`input[name="produit"][value="${wanted}"]`, form);
      if (radio) radio.checked = true;
    }

    const errorFor = (field) => {
      const v = field.validity;
      if (v.valid) return '';
      if (v.valueMissing) {
        if (field.type === 'checkbox') return 'Merci de cocher cette case pour envoyer votre demande.';
        if (field.type === 'radio') return 'Choisissez un produit.';
        return 'Ce champ est obligatoire.';
      }
      if (v.typeMismatch || v.patternMismatch) return 'Adresse e-mail invalide (ex. : nom@domaine.fr).';
      if (v.rangeUnderflow || v.badInput) return 'Indiquez un nombre valide.';
      return 'Valeur invalide.';
    };

    const check = (field) => {
      const message = errorFor(field);
      const wrap = field.closest('.field');
      const output = wrap && $('.field__error', wrap);
      if (output) output.textContent = message;
      const group = field.type === 'radio' ? $$(`input[name="${field.name}"]`, form) : [field];
      group.forEach((el) => el.setAttribute('aria-invalid', message ? 'true' : 'false'));
      return !message;
    };

    // Une erreur affichée disparaît dès que le champ est corrigé.
    ['input', 'change'].forEach((type) => form.addEventListener(type, (event) => {
      if (event.target.getAttribute('aria-invalid') === 'true') check(event.target);
    }));
    form.addEventListener('focusout', (event) => {
      const field = event.target;
      if (field.matches('input[type="email"], input[type="number"]') && field.value) check(field);
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const seen = new Set();
      const invalid = [...form.elements].filter((field) => {
        if (!field.willValidate || field.name === '_gotcha') return false;
        if (field.type === 'radio') {
          if (seen.has(field.name)) return false;
          seen.add(field.name);
        }
        return !check(field);
      });
      if (invalid.length) {
        setStatus('Merci de compléter les champs indiqués.', true);
        invalid[0].focus();
        return;
      }

      const data = new FormData(form);
      if (data.get('_gotcha')) return;
      const endpoint = form.dataset.endpoint;

      if (endpoint) {
        const button = $('button[type="submit"]', form);
        button.disabled = true;
        setStatus('Envoi en cours…');
        try {
          const response = await fetch(endpoint, { method: 'POST', body: data, headers: { Accept: 'application/json' } });
          if (!response.ok) throw new Error(String(response.status));
          form.reset();
          setStatus('Merci ! Votre demande est bien partie : nous revenons vers vous rapidement.');
        } catch {
          setStatus(`L’envoi n’a pas abouti. Écrivez-nous directement à ${form.dataset.email}.`, true);
        } finally {
          button.disabled = false;
        }
        return;
      }

      const product = products[data.get('produit')] || '';
      const body = [
        `Nom : ${data.get('nom')}`,
        `E-mail : ${data.get('email')}`,
        `Téléphone : ${data.get('telephone') || '—'}`,
        `Code postal : ${data.get('code_postal')}`,
        `Profil : ${data.get('profil') || '—'}`,
        `Produit : ${product}`,
        `Nombre d’animaux : ${data.get('animaux') || '—'}`,
        '',
        String(data.get('message') || ''),
      ].join('\r\n');
      const mail = document.createElement('a');
      mail.href = `mailto:${form.dataset.email}?subject=${encodeURIComponent(`Demande de devis — ${product}`)}&body=${encodeURIComponent(body)}`;
      mail.hidden = true;
      document.body.append(mail);
      mail.click();
      mail.remove();
      setStatus('Votre messagerie s’ouvre avec votre demande pré-remplie : il ne reste qu’à l’envoyer.');
    });
  }

  /* Compteurs des chiffres clés. */
  function initCounters() {
    const counters = $$('[data-count]');
    if (reduceMotion || !counters.length || !('IntersectionObserver' in window)) return;
    const format = (value, decimals) => value.toLocaleString('fr-FR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        const el = entry.target;
        const target = parseFloat(el.dataset.count);
        const decimals = (el.dataset.count.split('.')[1] || '').length;
        const delay = counters.indexOf(el) * 90 + 150;
        setTimeout(() => {
          const start = performance.now();
          const step = (now) => {
            const k = clamp((now - start) / 1800);
            el.textContent = format(target * (1 - Math.pow(1 - k, 4)), decimals);
            if (k < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }, delay);
      });
    }, { threshold: 0.6 });
    counters.forEach((el) => {
      el.textContent = format(0, (el.dataset.count.split('.')[1] || '').length);
      observer.observe(el);
    });
  }

  /* ------------------------------------------------------------------------
     Effets au survol.
     ------------------------------------------------------------------------ */
  function initPointerEffects() {
    // Remplissage des boutons depuis le point d'entrée (et de sortie) du curseur.
    $$('.btn').forEach((btn) => {
      const place = (event) => {
        const r = btn.getBoundingClientRect();
        btn.style.setProperty('--x', `${event.clientX - r.left}px`);
        btn.style.setProperty('--y', `${event.clientY - r.top}px`);
      };
      btn.addEventListener('pointerenter', place);
      btn.addEventListener('pointerleave', place);
    });

    // Lignes « Pour qui » : le fond arrive du côté par lequel on entre.
    $$('.audience__item').forEach((item) => {
      const origin = (event) => {
        const r = item.getBoundingClientRect();
        item.style.setProperty('--o', event.clientY < r.top + r.height / 2 ? '0%' : '100%');
      };
      item.addEventListener('pointerenter', origin);
      item.addEventListener('pointerleave', origin);
    });

    if (!finePointer || reduceMotion) return;

    // Boutons magnétiques.
    $$('[data-magnetic]').forEach((el) => {
      let rect = null;
      el.addEventListener('pointerenter', () => { rect = el.getBoundingClientRect(); });
      el.addEventListener('pointermove', (event) => {
        if (!rect) rect = el.getBoundingClientRect();
        const x = event.clientX - (rect.left + rect.width / 2);
        const y = event.clientY - (rect.top + rect.height / 2);
        el.style.translate = `${(x * 0.22).toFixed(2)}px ${(y * 0.32).toFixed(2)}px`;
      });
      el.addEventListener('pointerleave', () => {
        rect = null;
        el.style.translate = '';
      });
    });

    // Spécimens : l'image glisse doucement à l'opposé du curseur.
    $$('.specimen').forEach((card) => {
      const img = $('.specimen__img', card);
      card.addEventListener('pointermove', (event) => {
        const r = card.getBoundingClientRect();
        const x = (event.clientX - r.left) / r.width - 0.5;
        const y = (event.clientY - r.top) / r.height - 0.5;
        img.style.setProperty('--tx', `${(-x * 18).toFixed(2)}px`);
        img.style.setProperty('--ty', `${(-y * 18).toFixed(2)}px`);
      });
      card.addEventListener('pointerleave', () => {
        img.style.setProperty('--tx', '0px');
        img.style.setProperty('--ty', '0px');
      });
    });
  }

  /* Apparitions au défilement. */
  function initReveal() {
    const targets = $$('[data-reveal], [data-split], [data-photo], .specimen');
    if (reduceMotion || !('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('is-in'));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.15 });
    targets.forEach((el) => observer.observe(el));
  }

  /* ------------------------------------------------------------------------
     Démarrage
     ------------------------------------------------------------------------ */
  function init() {
    window.siteReady = true;
    $$('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });

    initRoll();
    $$('[data-split]').forEach((el) => splitWords(el));
    initRibbons();
    initHero();
    initFill();
    initMarquee();
    initParallax();
    initUsage();
    initFooter();
    initNav();
    initMenu();
    initFaq();
    initEstimator();
    initContactForm();
    initCounters();
    initPointerEffects();
    initReveal();

    measure();
    requestAnimationFrame(frame);

    const fontsReady = document.fonts && document.fonts.ready
      ? Promise.race([document.fonts.ready, wait(1500)])
      : Promise.resolve();
    fontsReady.then(() => {
      measure();
      root.classList.add('is-loaded');
      if (ribbons.hero) ribbons.hero.begin();
    });

    window.addEventListener('load', measure);
    window.addEventListener('resize', debounce(measure, 150));
    if ('ResizeObserver' in window) new ResizeObserver(debounce(measure, 120)).observe(document.body);
  }

  init();
})();
