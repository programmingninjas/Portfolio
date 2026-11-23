import { achievements } from './achievements.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const byId = new Map(achievements.map((entry, index) => [entry.id, {entry, index}]));
const firstExhibitId = achievements[0]?.id;
const entrance = $('#entrance-view');
const indexView = $('#index-view');
const walkView = $('#walk-view');
const canvas = $('#hall-canvas');
const detail = $('#exhibit-dialog');
const about = $('#about-dialog');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const audio = new Audio();
audio.preload = 'none';
audio.loop = true;
audio.volume = .23;

let section = '';
let detailId = null;
let walkId = firstExhibitId;
let focusId = null;
let destination = null;
let hall = null;
let hallPromise = null;
let ready = false;
let walkFailed = false;
let muted = true;
let soundRequest = 0;
let menuOpen = false;
let lastFocused = null;
let drag = null;
const heldKeys = new Set();

$('.skip-link').addEventListener('click', event => {
  event.preventDefault();
  $('#main').focus();
});

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS(svg.namespaceURI, 'use');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  use.setAttribute('href', '#i-' + name);
  svg.append(use);
  return svg;
}
function element(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
}
function announce(text) {
  $('#announcer').textContent = text;
}
function renderFeatured() {
  const list = $('#featured-list');
  for (const item of achievements.filter(entry => entry.featured)) {
    const btn = element('button', 'exhibit-card');
    btn.type = 'button';
    btn.dataset.exhibit = item.id;
    const imageBox = element('span', 'card-art');
    const img = element('img');
    img.src = item.artwork || item.image;
    img.alt = '';
    img.loading = 'lazy';
    img.width = 724;
    img.height = 724;
    const date = element('span', 'card-date', item.date);
    const description = element('span', 'card-details');
    const title = element('span', 'card-title', item.title);
    description.append(title, icon('right'));
    imageBox.append(img, date);
    btn.append(imageBox, description);
    list.append(btn);
  }
}
const years = [...new Set(achievements.map(entry => entry.date.split(' ').at(-1)))].sort();
for (const year of years) $('#year-filter').add(new Option(year, year));
$('#index-range').textContent = years[0] + ' — ' + years.at(-1);
function renderIndex() {
  const term = $('#query').value.trim().toLowerCase();
  const year = $('#year-filter').value;
  const results = achievements.filter(entry =>
    (!year || entry.date.endsWith(year)) &&
    [entry.title, entry.date, entry.summary].some(value => value.toLowerCase().includes(term))
  );
  const rows = document.createDocumentFragment();
  for (const item of results) {
    const btn = element('button', 'index-row');
    btn.type = 'button';
    btn.dataset.exhibit = item.id;
    const number = element('span', 'row-number', String(byId.get(item.id).index + 1).padStart(2, '0'));
    number.setAttribute('aria-hidden', 'true');
    btn.append(number, element('span', 'row-name', item.title), element('span', 'row-date', item.date), icon('right'));
    rows.append(btn);
  }
  $('#index-count').textContent = results.length + (results.length === 1 ? ' exhibit' : ' exhibits');
  if (!results.length) rows.append(element('p', 'empty-results', 'No exhibits match. Try another search or year.'));
  $('#index-list').replaceChildren(rows);
}
$('#query').addEventListener('input', renderIndex);
$('#year-filter').addEventListener('change', renderIndex);

function setMenu(open) {
  menuOpen = open;
  $('#primary-nav').toggleAttribute('data-open', open);
  $('#menu-toggle').setAttribute('aria-expanded', String(open));
  $('#menu-toggle').setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  $('#menu-toggle use').setAttribute('href', open ? '#i-cross' : '#i-menu');
}
$('#menu-toggle').addEventListener('click', () => setMenu(!menuOpen));
document.addEventListener('click', event => {
  if (menuOpen && !event.target.closest('.mast-inner')) setMenu(false);
});
function presentDialog(dialog) {
  setMenu(false);
  if (dialog.open) return;
  lastFocused = document.activeElement;
  stopMovement();
  if (section === 'walk') hall?.setMode('paused');
  dialog.showModal();
}
function showExhibit(id) {
  const record = byId.get(id);
  if (!record) return;
  detailId = id;
  const {entry, index} = record;
  $('#detail-position').textContent = 'Exhibit ' + String(index + 1).padStart(2, '0') + ' of ' + achievements.length;
  $('#detail-title').textContent = entry.title;
  $('#detail-date').textContent = entry.date;
  $('#detail-summary').textContent = entry.summary;
  $('#detail-image').src = entry.image;
  $('#detail-image').alt = 'Original ' + entry.title + ' exhibit poster';
  $('#detail-source').href = entry.url;
  $('#detail-source span').textContent = entry.sourceLabel || 'Original source';
  const certificate = $('#detail-certificate');
  certificate.hidden = !entry.certificateUrl;
  if (entry.certificateUrl) certificate.href = entry.certificateUrl;
  else certificate.removeAttribute('href');
  const linked = byId.get(entry.relatedId)?.entry;
  $('#detail-related').hidden = !linked;
  if (linked) $('#detail-related-title').textContent = linked.title;
  presentDialog(detail);
  detail.scrollTop = 0;
}
for (const dialog of [detail, about]) {
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    if (section === 'walk' && !walkFailed && !detail.open && !about.open) hall?.setMode('walk');
    if (lastFocused?.isConnected && lastFocused.offsetParent !== null) lastFocused.focus({preventScroll: true});
    lastFocused = null;
  });
}
document.addEventListener('click', event => {
  const trigger = event.target.closest('[data-exhibit], [data-about], [data-sound]');
  if (!trigger) return;
  if (trigger.hasAttribute('data-exhibit')) showExhibit(trigger.dataset.exhibit);
  else if (trigger.hasAttribute('data-about')) presentDialog(about);
  else toggleSound();
});
$('#detail-related').addEventListener('click', () => showExhibit(byId.get(detailId)?.entry.relatedId));
$('#detail-visit').addEventListener('click', () => {
  const id = detailId;
  detail.close();
  if (section === 'walk' && !walkFailed) {
    setLocation(id);
    hall?.goTo(id);
    canvas.focus({preventScroll: true});
  } else {
    destination = id;
    location.hash = 'walk';
  }
});
$('#about-enter').addEventListener('click', () => about.close());

function updateSound() {
  for (const button of $$('[data-sound]')) {
    const label = muted ? 'Sound off' : 'Sound on';
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(!muted));
    button.querySelector('span').textContent = label;
  }
}
async function toggleSound() {
  const request = ++soundRequest;
  muted = !muted;
  updateSound();
  if (muted) {
    audio.pause();
    return;
  }
  if (!audio.getAttribute('src')) audio.src = './static/models/Hall.mp3';
  try {
    await audio.play();
  } catch {
    if (soundRequest !== request) return;
    muted = true;
    updateSound();
    announce('The soundtrack could not play.');
  }
}
function setLocation(id) {
  if (byId.has(id)) walkId = id;
  focusId = null;
  updateWalkInfo();
}
function updateWalkInfo() {
  const record = byId.get(focusId || walkId);
  if (!record) return;
  const {entry, index} = record;
  $('#walk-date').textContent = 'Exhibit ' + String(index + 1).padStart(2, '0') + '  /  ' + entry.date;
  $('#walk-title').textContent = entry.title;
  const related = byId.get(entry.relatedId);
  const visit = $('#walk-portal');
  visit.hidden = !related;
  if (related) {
    visit.querySelector('span').textContent = entry.relatedAction || 'Visit linked exhibit';
    visit.title = related.entry.title;
  }
}
function unavailable() {
  walkFailed = true;
  ready = false;
  $('#walk-status').textContent = '3D view unavailable';
  $('#walk-message-text').textContent = 'You can still visit every exhibit and its connected stories in the index.';
  $('#walk-message').hidden = false;
}
async function createWalk() {
  try {
    const {createHall} = await import('./hall-scene.js');
    hall = await createHall({
      canvas, achievements, startId: destination || firstExhibitId, reducedMotion: reducedMotion.matches,
      onSelect: showExhibit,
      onFocus(id) {
        focusId = id;
        updateWalkInfo();
      },
      onArrive(id) {
        setLocation(id);
        if (byId.has(id)) announce(byId.get(id).entry.title);
      },
      onReady() {
        ready = true;
        $('#walk-message').hidden = true;
      },
      onError: unavailable
    });
    if (hall) {
      hall.setMode(section === 'walk' && !detail.open && !about.open ? 'walk' : 'paused');
      if (section === 'walk' && !walkFailed && destination) {
        hall.goTo(destination);
        destination = null;
      }
    }
    return hall;
  } catch {
    unavailable();
    return null;
  }
}
function enterWalk() {
  setLocation(destination || firstExhibitId);
  if (!hallPromise) {
    $('#walk-message').hidden = false;
    hallPromise = createWalk();
  } else if (hall && !walkFailed) {
    hall.setMode('walk');
    hall.goTo(walkId, {faceExhibit: Boolean(destination)});
    destination = null;
    $('#walk-message').hidden = ready;
  }
  updateWalkInfo();
  canvas.focus({preventScroll: true});
}
function route() {
  const hash = location.hash.slice(1);
  const next = hash === 'exhibits' ? 'exhibits' : hash === 'walk' ? 'walk' : 'entrance';
  const changed = next !== section;
  const initialLoad = section === '';
  setMenu(false);
  if (changed) {
    stopMovement();
    if (section === 'walk') {
      hall?.setMode('paused');
      destination = null;
    }
    section = next;
    if (detail.open) detail.close();
    if (about.open) about.close();
    entrance.hidden = next !== 'entrance';
    indexView.hidden = next !== 'exhibits';
    walkView.hidden = next !== 'walk';
    document.body.classList.toggle('in-walk', next === 'walk');
    for (const link of $$('[data-nav]')) {
      if (link.dataset.nav === next) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    if (next === 'exhibits') renderIndex();
    if (next === 'walk') enterWalk();
    else {
      if (!initialLoad) $('#main').focus({preventScroll: true});
      window.scrollTo(0, 0);
    }
    document.title = (next === 'exhibits' ? 'Exhibit index' : next === 'walk' ? 'Inside the hall' : 'The Infinite Hall of Fame') + ' — Ayan Khan';
  }
  if (next === 'entrance' && hash === 'selected') $('#selected').scrollIntoView({behavior: reducedMotion.matches ? 'instant' : 'smooth'});
  if (next === 'entrance' && hash === 'entrance') window.scrollTo({top: 0,behavior: 'instant'});
}
window.addEventListener('hashchange', route);

function stopMovement() {
  for (const key of heldKeys) hall?.move(key, false);
  heldKeys.clear();
  drag = null;
}
function activeWalk() {
  return section === 'walk' && ready && !walkFailed && !detail.open && !about.open;
}
function move(key, pressed) {
  if (pressed) heldKeys.add(key);
  else heldKeys.delete(key);
  hall?.move(key, pressed);
}
const movement = new Map([['KeyW','forward'],['ArrowUp','forward'],['KeyS','backward'],['ArrowDown','backward'],['KeyA','left'],['KeyD','right'],['ShiftLeft','shift'],['ShiftRight','shift']]);
document.addEventListener('keydown', event => {
  if (menuOpen && event.key === 'Escape') {
    setMenu(false);
    $('#menu-toggle').focus();
    return;
  }
  if (section === 'walk' && event.key === 'Escape' && !detail.open && !about.open) {
    location.hash = 'entrance';
    return;
  }
  if (!activeWalk()) return;
  if (movement.has(event.code)) {
    event.preventDefault();
    move(movement.get(event.code), true);
  } else if (['ArrowLeft','ArrowRight'].includes(event.code)) {
    event.preventDefault();
    hall.look(event.code === 'ArrowLeft' ? -24 : 24, 0);
  } else if (event.code === 'KeyE' && !event.repeat) {
    event.preventDefault();
    showExhibit(focusId || walkId);
  } else if (event.code === 'Enter' && event.target === canvas && !event.repeat) {
    hall.interact();
  }
});
document.addEventListener('keyup', event => {
  if (movement.has(event.code)) move(movement.get(event.code), false);
});
window.addEventListener('blur', stopMovement);
document.addEventListener('visibilitychange', () => {
  stopMovement();
  if (section === 'walk' && hall && !walkFailed) hall.setMode(document.hidden || detail.open || about.open ? 'paused' : 'walk');
  if (document.hidden) audio.pause();
  else if (!muted) audio.play().catch(() => { muted = true; updateSound(); });
});
canvas.addEventListener('pointerdown', event => {
  if (!activeWalk() || !event.isPrimary || event.button !== 0) return;
  canvas.setPointerCapture(event.pointerId);
  drag = {id:event.pointerId, x:event.clientX, y:event.clientY, distance:0};
});
canvas.addEventListener('pointermove', event => {
  if (!drag || event.pointerId !== drag.id || !activeWalk()) return;
  const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
  drag.distance += Math.hypot(dx, dy);
  hall.look(dx, dy);
  drag.x = event.clientX;
  drag.y = event.clientY;
});
canvas.addEventListener('pointerup', event => {
  if (!drag || event.pointerId !== drag.id) return;
  const tap = drag.distance < 6;
  drag = null;
  if (tap && activeWalk()) hall.interact(event.clientX, event.clientY);
});
canvas.addEventListener('lostpointercapture', () => { drag = null; });
for (const button of $$('[data-move]')) {
  const direction = button.dataset.move;
  button.addEventListener('pointerdown', event => {
    if (!activeWalk()) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    move(direction, true);
  });
  button.addEventListener('lostpointercapture', () => move(direction, false));
  button.addEventListener('keydown', event => {
    if (!activeWalk() || !['Space', 'Enter'].includes(event.code)) return;
    event.preventDefault();
    move(direction, true);
  });
  button.addEventListener('keyup', event => {
    if (!['Space', 'Enter'].includes(event.code)) return;
    move(direction, false);
  });
  button.addEventListener('blur', () => move(direction, false));
}
$('#walk-read').addEventListener('click', () => showExhibit(focusId || walkId));
$('#walk-portal').addEventListener('click', () => {
  if (!activeWalk()) return;
  hall.stepThrough();
  canvas.focus({preventScroll:true});
});
renderFeatured();
route();
