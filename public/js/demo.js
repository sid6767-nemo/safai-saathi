// Demo controls: staged conditions so judges can trigger the fraud checks from a laptop that
// can't walk 150 m away. Open with the gear button or Shift+D.

import { CONFIG } from './config.js';
import { expireCodes, getState, resetAll, setDemo, skipHolds, subscribe } from './store.js';
import { html, render, toast } from './ui.js';

let dialog;

const OVERRIDES = [
  ['spoofLocation', `Pretend I'm ${CONFIG.demo.spoofDistanceM} m from the spot`, 'location moved'],
  ['clockSkew', `Pretend my clock is ${CONFIG.demo.clockSkewMin / 60} hour behind`, 'clock behind'],
  ['aiOffline', 'AI offline mode', 'AI offline'],
];

function draw() {
  const { demo } = getState();
  render(
    dialog,
    html`<form method="dialog" class="demo-inner">
      <h2 id="demo-title">Demo controls</h2>
      <p class="demo-lede">Simulation only. These stage the conditions the fraud checks look for, so they can be tested without leaving the room.</p>
      <fieldset class="demo-group">
        <legend>Proof photo and AI</legend>
        ${OVERRIDES.map(
          ([name, label]) => html`<label class="switch">
            <input type="checkbox" name="${name}" data-key="${name}" ${demo[name] ? html`checked` : ''} />
            <span>${label}</span>
          </label>`,
        )}
      </fieldset>
      <div class="demo-actions">
        <button type="button" class="btn btn-outline" data-demo="expire" data-key="expire">Expire job codes now</button>
        <button type="button" class="btn btn-outline" data-demo="skip" data-key="skip">Skip the 24-hour hold</button>
        <button type="button" class="btn btn-danger" data-demo="reset" data-key="reset">Reset demo data</button>
      </div>
      <button class="btn btn-primary btn-block" value="close">Close</button>
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
      toast('Every issued job code is now expired.');
    } else if (action === 'skip') {
      skipHolds();
      toast('Holds skipped. Verified payouts release now.');
    } else if (action === 'reset' && confirm('Erase every report, job and photo in this browser?')) {
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
  const on = OVERRIDES.filter(([name]) => getState().demo[name]).map(([, , short]) => short);
  if (!on.length) return '';
  return html`<p class="demo-badge" role="status">Demo override on: ${on.join(', ')}</p>`;
}
