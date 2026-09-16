// Demo controls: staged conditions so judges can trigger the fraud checks from a laptop that
// can't walk 150 m away. Open with the gear button or Shift+D.

import { CONFIG } from './config.js';
import { t } from './i18n.js';
import { expireCodes, getState, resetAll, setDemo, skipHolds, subscribe } from './store.js';
import { html, render, toast } from './ui.js';

let dialog;

const OVERRIDES = [
  ['spoofLocation', () => t('demo.spoof', { m: CONFIG.demo.spoofDistanceM }), 'demo.badge.location'],
  ['clockSkew', () => t('demo.clock', { hours: CONFIG.demo.clockSkewMin / 60 }), 'demo.badge.clock'],
  ['aiOffline', () => t('demo.ai'), 'demo.badge.ai'],
];

function draw() {
  const { demo } = getState();
  render(
    dialog,
    html`<form method="dialog" class="demo-inner">
      <h2 id="demo-title">${t('demo.title')}</h2>
      <p class="demo-lede">${t('demo.lede')}</p>
      <fieldset class="demo-group">
        <legend>${t('demo.group')}</legend>
        ${OVERRIDES.map(
          ([name, label]) => html`<label class="switch">
            <input type="checkbox" name="${name}" data-key="${name}" ${demo[name] ? html`checked` : ''} />
            <span>${label()}</span>
          </label>`,
        )}
      </fieldset>
      <div class="demo-actions">
        <button type="button" class="btn btn-outline" data-demo="expire" data-key="expire">${t('demo.expire')}</button>
        <button type="button" class="btn btn-outline" data-demo="skip" data-key="skip">
          ${t('demo.skip', { hours: CONFIG.holdHours })}
        </button>
        <button type="button" class="btn btn-danger" data-demo="reset" data-key="reset">${t('demo.reset')}</button>
      </div>
      <button class="btn btn-primary btn-block" value="close">${t('demo.close')}</button>
    </form>`,
  );
}

export function openDemoControls() {
  if (!dialog.open) dialog.showModal();
}

export function initDemoControls() {
  dialog = document.createElement('dialog');
  dialog.className = 'demo';
  dialog.setAttribute('aria-labelledby', 'demo-title');
  document.body.append(dialog);
  draw();
  subscribe(draw);

  dialog.addEventListener('change', (e) => {
    if (e.target.name) setDemo({ [e.target.name]: e.target.checked });
  });

  dialog.addEventListener('click', async (e) => {
    const action = e.target.closest('[data-demo]')?.dataset.demo;
    if (action === 'expire') {
      expireCodes();
      toast(t('demo.expired'));
    } else if (action === 'skip') {
      skipHolds();
      toast(t('demo.skipped'));
    } else if (action === 'reset' && confirm(t('demo.resetConfirm'))) {
      await resetAll();
      dialog.close();
      location.hash = '#/';
    }
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="demo"]')) openDemoControls();
  });

  document.addEventListener('keydown', (e) => {
    if (e.shiftKey && e.key.toLowerCase() === 'd' && !e.target.closest('input, select, textarea')) {
      openDemoControls();
    }
  });
}

// A visible strip whenever a staged condition is on, so a video never passes one off as real.
export function demoBadge() {
  const on = OVERRIDES.filter(([name]) => getState().demo[name]).map(([, , badge]) => t(badge));
  if (!on.length) return '';
  return html`<p class="demo-badge" role="status">${t('demo.badge', { list: on.join(', ') })}</p>`;
}

// Redraw the dialog when the language changes.
export { draw as redrawDemoControls };
