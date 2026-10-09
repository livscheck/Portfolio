document.getElementById('year').textContent = new Date().getFullYear();

// Sims-style skill menu. Branches (with "items") open a sub-menu; leaves are skills.
const skillTree = {
  label: 'Skills',
  items: [
    { label: 'Programming Languages', items: [
      { label: 'Systems', items: [{ label: 'C' }, { label: 'C++' }] },
      { label: 'Object-Oriented', items: [{ label: 'C#' }, { label: 'Java' }, { label: 'VB' }] },
      { label: 'Web & Scripting', items: [{ label: 'JavaScript' }, { label: 'TypeScript' }, { label: 'Python' }, { label: 'Dart' }] },
      { label: 'Query', items: [{ label: 'SQL' }] },
      { label: 'CAD Scripting', items: [{ label: 'AutoLISP' }] },
    ] },
    { label: 'Frameworks', items: [{ label: '.NET' }, { label: 'React' }, { label: 'Node.js' }, { label: 'Flutter' }] },
    { label: 'Web & APIs', items: [{ label: 'HTML & CSS' }, { label: 'REST APIs' }] },
    { label: 'Databases', items: [{ label: 'SQL' }, { label: 'NoSQL' }] },
    { label: 'Dev Tools', items: [{ label: 'Git' }] },
    { label: 'Design', items: [{ label: 'Figma' }, { label: 'UI / UX' }, { label: 'Wireframing' }, { label: 'Prototyping' }] },
  ],
};

const simMenu = document.getElementById('sim-menu');
const simTrail = [skillTree];
let simBubbles = [];

function simBubble(item, onClick, extraClass = '') {
  const el = document.createElement(onClick ? 'button' : 'span');
  el.className = `sim-bubble is-hidden ${extraClass}`;
  if (onClick) {
    el.type = 'button';
    el.addEventListener('click', onClick);
  }
  el.insertAdjacentHTML('beforeend', `<span class="sim-label"></span>`);
  el.querySelector('.sim-label').textContent = item.label + (item.items ? '...' : '');
  simMenu.appendChild(el);
  return el;
}

function simRender() {
  const level = simTrail[simTrail.length - 1];
  simBubbles = level.items.map((item) =>
    simBubble(item, item.items ? () => simGo(() => simTrail.push(item)) : null, item.items ? '' : 'sim-bubble--leaf')
  );
  if (simTrail.length > 1) {
    simBubbles.push(simBubble({ label: level.label }, () => simGo(() => simTrail.pop()), 'sim-bubble--back'));
  }
  simLayout();
  void simMenu.offsetWidth; // let the hidden state paint before animating out
  simBubbles.forEach((el, i) => {
    el.style.transitionDelay = `${i * 45}ms`;
    el.classList.remove('is-hidden');
  });
}

// Place bubbles around the sim. Three layouts, picked by what fits without overlapping:
//   split: columns on both sides of the sim (wide screens)
//   side:  sim slides left, all bubbles in one column on the right (medium screens)
//   stack: sim on top, bubbles stacked underneath (phones)
// Bubbles and the sim both transition, so switching layouts animates smoothly.
function simLayout() {
  const W = simMenu.clientWidth;
  const items = simBubbles.filter((el) => !el.classList.contains('sim-bubble--back'));
  const back = simBubbles.find((el) => el.classList.contains('sim-bubble--back'));
  const widths = items.map((el) => el.offsetWidth);
  const maxW = Math.max(0, ...widths);

  const figure = simMenu.querySelector('.sim-figure img');
  const figW = (figure.naturalWidth / figure.naturalHeight || 0.355) * 380;
  const gap = 40;
  const stagger = 28;

  const leftCount = Math.ceil(items.length / 2);
  const sideNeed = (from, to) => figW / 2 + gap + stagger + Math.max(0, ...widths.slice(from, to));
  const splitFits = Math.max(sideNeed(0, leftCount), sideNeed(leftCount, items.length)) <= W / 2 - 4;
  const sideGroupW = figW + gap + stagger + maxW;
  const mode = splitFits ? 'split' : sideGroupW <= W - 8 ? 'side' : 'stack';

  simMenu.dataset.layout = mode;
  simMenu.classList.toggle('is-narrow', mode === 'stack');
  const figH = mode === 'stack' ? 300 : 380;
  const cy = 80 + figH / 2;
  simMenu.style.setProperty('--cy', `${cy}px`);

  const place = (el, x, y) => {
    el.style.setProperty('--tx', `${x}px`);
    el.style.setProperty('--ty', `${y}px`);
  };
  let fx = 0;
  let bottom = figH / 2 + 30;

  if (mode === 'stack') {
    const start = figH / 2 + 36;
    if (back) place(back, 0, start);
    items.forEach((el, i) => place(el, 0, start + (i + (back ? 1 : 0)) * 50));
    bottom = start + (items.length + (back ? 1 : 0)) * 50;
  } else if (mode === 'side') {
    // Centre the sim + bubble column as one group, sim on the left
    fx = -sideGroupW / 2 + figW / 2;
    const colLeft = fx + figW / 2 + gap;
    const gapY = 54;
    items.forEach((el, i) => {
      const y = (i - (items.length - 1) / 2) * gapY - 20;
      place(el, colLeft + (i % 2 ? stagger : 0) + el.offsetWidth / 2, y);
      bottom = Math.max(bottom, y + 40);
    });
    if (back) {
      place(back, fx, figH / 2 + 34);
      bottom = Math.max(bottom, figH / 2 + 70);
    }
  } else {
    // First half on the left, the rest on the right, staggered so it feels hand-placed
    const gapY = 62;
    items.forEach((el, i) => {
      const side = i < leftCount ? -1 : 1;
      const j = side < 0 ? i : i - leftCount;
      const count = side < 0 ? leftCount : items.length - leftCount;
      const half = el.offsetWidth / 2;
      const y = (j - (count - 1) / 2) * gapY - 20;
      place(el, side * (figW / 2 + gap + half + (j % 2 ? stagger : 0)), y);
      bottom = Math.max(bottom, y + 40);
    });
    if (back) {
      place(back, 0, figH / 2 + 34);
      bottom = Math.max(bottom, figH / 2 + 70);
    }
  }
  simMenu.style.setProperty('--fx', `${fx}px`);
  simMenu.style.height = `${cy + bottom + 10}px`;
}

function simGo(change) {
  simBubbles.forEach((el) => {
    el.style.transitionDelay = '0ms';
    el.classList.add('is-hidden');
  });
  setTimeout(() => {
    simBubbles.forEach((el) => el.remove());
    change();
    simRender();
  }, 220);
}

new IntersectionObserver((entries, observer) => {
  if (entries[0].isIntersecting) {
    simRender();
    observer.disconnect();
  }
}, { threshold: 0.3 }).observe(simMenu);
window.addEventListener('resize', () => simBubbles.length && simLayout());
simMenu.querySelector('.sim-figure img').addEventListener('load', () => simBubbles.length && simLayout());

// Envelope: open the flap, then slide the letter out, tied to scroll position
const envelope = document.getElementById('envelope');
const clamp01 = (n) => Math.min(1, Math.max(0, n));
function updateEnvelope() {
  const vh = window.innerHeight;
  const top = envelope.getBoundingClientRect().top;
  // 0 when the envelope enters the bottom of the screen, 1 once it reaches ~35% from the top
  const p = clamp01((vh - top) / (vh * 0.45));
  const open = clamp01(p / 0.45);
  const lift = clamp01((p - 0.4) / 0.6);
  envelope.style.setProperty('--open', open);
  envelope.style.setProperty('--lift', lift);
  envelope.classList.toggle('is-open', open > 0.5);
}
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  envelope.style.setProperty('--open', 1);
  envelope.style.setProperty('--lift', 1);
  envelope.classList.add('is-open');
} else {
  window.addEventListener('scroll', updateEnvelope, { passive: true });
  window.addEventListener('resize', updateEnvelope);
  updateEnvelope();
}

// Changelog: reveal releases one by one and tick each version number up from 0.0.0
const changelog = document.getElementById('changelog');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function tickVersion(el, delay) {
  const target = el.dataset.version.split('.').map(Number);
  const steps = 14;
  let step = 0;
  setTimeout(() => {
    const timer = setInterval(() => {
      step++;
      const t = step / steps;
      el.textContent = 'v' + target.map((n) => Math.round(n * t)).join('.');
      if (step >= steps) clearInterval(timer);
    }, 35);
  }, delay);
}

if (reduceMotion) {
  changelog.classList.add('is-visible');
} else {
  changelog.querySelectorAll('[data-version]').forEach((el) => (el.textContent = 'v0.0.0'));
  new IntersectionObserver((entries, observer) => {
    if (!entries[0].isIntersecting) return;
    changelog.classList.add('is-visible');
    changelog.querySelectorAll('.release').forEach((release, i) => {
      const version = release.querySelector('[data-version]');
      if (version) tickVersion(version, i * 220 + 150);
    });
    observer.disconnect();
  }, { threshold: 0.25 }).observe(changelog);
}

// Number the vibe check questions like a printed form: 01. 02. ...
document.querySelectorAll('.tg-field > .tg-label, .tg-row-label').forEach((label, i) => {
  label.insertAdjacentHTML('afterbegin', `<span class="tg-qnum">${String(i + 1).padStart(2, '0')}.</span>`);
});

// Vibe check on phones: flip through the form like pages in a book (buttons or swipe)
const vibeBook = document.getElementById('vibe-book');
const vibePages = [...vibeBook.querySelectorAll('.tg-page')];
const vibePrev = document.querySelector('.tg-prev');
const vibeNext = document.querySelector('.tg-next');
const vibeCount = document.querySelector('.tg-page-count');
const vibePaged = window.matchMedia('(max-width: 640px)');
let vibeCurrent = 0;

function showVibePage(index) {
  vibeCurrent = Math.max(0, Math.min(vibePages.length - 1, index));
  vibePages.forEach((page, i) => {
    page.style.setProperty('--n', i);
    page.classList.toggle('is-turned', i < vibeCurrent);
    // Only hide off-screen pages from screen readers when the paged (phone) layout is active
    if (vibePaged.matches && i !== vibeCurrent) page.setAttribute('aria-hidden', 'true');
    else page.removeAttribute('aria-hidden');
  });
  vibePrev.disabled = vibeCurrent === 0;
  vibeNext.disabled = vibeCurrent === vibePages.length - 1;
  vibeCount.textContent = `page ${vibeCurrent + 1} of ${vibePages.length}`;
}

vibePrev.addEventListener('click', () => showVibePage(vibeCurrent - 1));
vibeNext.addEventListener('click', () => showVibePage(vibeCurrent + 1));

let vibeTouchX = null;
vibeBook.addEventListener('touchstart', (e) => (vibeTouchX = e.touches[0].clientX), { passive: true });
vibeBook.addEventListener('touchend', (e) => {
  if (vibeTouchX === null) return;
  const dx = e.changedTouches[0].clientX - vibeTouchX;
  if (Math.abs(dx) > 40) showVibePage(vibeCurrent + (dx < 0 ? 1 : -1));
  vibeTouchX = null;
});

vibePaged.addEventListener('change', () => showVibePage(vibeCurrent));
showVibePage(0);

// "View as text": a draggable, closable window listing every skill from skillTree
const textWin = document.getElementById('skills-text');
const textBtn = document.querySelector('.sim-text-btn');
const textBody = textWin.querySelector('.text-window-body');
const textBar = textWin.querySelector('.text-window-bar');

function renderSkillText(node, depth = 0) {
  const leaves = node.items.filter((item) => !item.items);
  const groups = node.items.filter((item) => item.items);
  let html = leaves.length ? `<ul>${leaves.map((item) => `<li>${item.label}</li>`).join('')}</ul>` : '';
  groups.forEach((group) => {
    const tag = depth === 0 ? 'h3' : 'h4';
    html += `<${tag}>${group.label}</${tag}>` + renderSkillText(group, depth + 1);
  });
  return depth > 0 && groups.length ? `<div style="padding-left:1rem">${html}</div>` : html;
}
textBody.innerHTML = renderSkillText(skillTree);

function placeTextWindow(x, y) {
  const maxX = window.innerWidth - textWin.offsetWidth - 8;
  const maxY = window.innerHeight - textWin.offsetHeight - 8;
  textWin.style.left = `${Math.max(8, Math.min(maxX, x))}px`;
  textWin.style.top = `${Math.max(8, Math.min(maxY, y))}px`;
}

function openTextWindow() {
  textWin.hidden = false;
  const r = textBtn.getBoundingClientRect();
  placeTextWindow(r.right - textWin.offsetWidth, r.bottom + 10);
  textWin.querySelector('.text-window-close').focus();
}

function closeTextWindow() {
  textWin.hidden = true;
  textBtn.focus();
}

textBtn.addEventListener('click', () => (textWin.hidden ? openTextWindow() : closeTextWindow()));
textWin.querySelector('.text-window-close').addEventListener('click', closeTextWindow);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !textWin.hidden) closeTextWindow();
});
window.addEventListener('resize', () => !textWin.hidden && placeTextWindow(textWin.offsetLeft, textWin.offsetTop));

// Drag by the title bar (mouse, pen or touch)
textBar.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button')) return;
  const startX = e.clientX - textWin.offsetLeft;
  const startY = e.clientY - textWin.offsetTop;
  textBar.setPointerCapture(e.pointerId);
  textWin.classList.add('is-dragging');
  const move = (ev) => placeTextWindow(ev.clientX - startX, ev.clientY - startY);
  const up = () => {
    textWin.classList.remove('is-dragging');
    textBar.removeEventListener('pointermove', move);
    textBar.removeEventListener('pointerup', up);
  };
  textBar.addEventListener('pointermove', move);
  textBar.addEventListener('pointerup', up);
});
