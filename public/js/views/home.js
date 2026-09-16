import { LANGUAGES, language, t, tn } from '../i18n.js';
import { getState, subscribe } from '../store.js';
import { html, render } from '../ui.js';

// The language menu appears on both entry screens, so either user can switch.
export const languageMenu = (dark = false) =>
  html`<label class="lang${dark ? ' lang-dark' : ''}">
    <span class="visually-hidden">${t('lang.label')}</span>
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm6.9 9h-3a15.4 15.4 0 0 0-1.2-5.2A8 8 0 0 1 18.9 11ZM12 4c.8 1.1 1.6 3.3 1.8 7h-3.6C10.4 7.3 11.2 5.1 12 4ZM4.3 13h3c.1 2 .5 3.8 1.1 5.2A8 8 0 0 1 4.3 13Zm3-2h-3a8 8 0 0 1 4.1-5.2A15.4 15.4 0 0 0 7.3 11Zm4.7 9c-.8-1.1-1.6-3.3-1.8-7h3.6c-.2 3.7-1 5.9-1.8 7Zm2.7-.8c.6-1.4 1-3.2 1.1-5.2h3a8 8 0 0 1-4.1 5.2Z"
      />
    </svg>
    <select data-lang data-key="lang">
      ${LANGUAGES.map((l) => html`<option value="${l.code}" ${l.code === language() ? html`selected` : ''}>${l.label}</option>`)}
    </select>
  </label>`;

const STEPS = [1, 2, 3];

export function mount(root) {
  document.title = 'Safai Saathi';

  const draw = () => {
    const { jobs } = getState();
    const open = jobs.filter((j) => j.status === 'open').length;
    const mine = jobs.filter((j) => !j.sample).length;
    render(
      root,
      html`<main class="home">
        <section class="home-report">
          <div class="home-top">
            <p class="wordmark">
              <span class="wm-latin">Safai Saathi</span>
              <span class="wm-deva" lang="hi">सफ़ाई साथी</span>
            </p>
            ${languageMenu()}
          </div>
          <h1 class="home-title">${t('home.tagline')}</h1>
          <div class="home-cta">
            <a class="btn btn-primary btn-xl btn-block" href="#/report">${t('home.report')}</a>
            <p class="btn-help">${t('home.reportHelp')}</p>
          </div>
          ${mine ? html`<a class="home-link" href="#/reports">${t('home.myReports', { count: mine })}</a>` : ''}
        </section>

        <section class="how" aria-labelledby="how-title">
          <h2 class="how-title" id="how-title">${t('home.how')}</h2>
          <ol class="how-steps">
            ${STEPS.map(
              (n) => html`<li class="how-step">
                <span class="how-num">${n}</span>
                <span class="how-text">
                  <strong>${t(`home.how${n}.title`)}</strong>
                  <span>${t(`home.how${n}.body`)}</span>
                </span>
              </li>`,
            )}
          </ol>
        </section>

        <section class="home-picker">
          <h2>${t('home.pickerTitle')}</h2>
          <p>${open ? tn('home.openJobs', open) : t('home.noJobs')}</p>
          <a class="btn btn-outline btn-block" href="#/picker">${t('home.openDashboard')}</a>
        </section>

        <footer class="home-foot">
          <p>${t('home.footer')}</p>
          <button class="link" type="button" data-action="demo">${t('home.demo')}</button>
        </footer>
      </main>`,
    );
  };

  draw();
  return subscribe(draw);
}
