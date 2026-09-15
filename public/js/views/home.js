import { getState, subscribe } from '../store.js';
import { html, render } from '../ui.js';

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
          <p class="wordmark">
            <span class="wm-latin">Safai Saathi</span>
            <span class="wm-deva" lang="hi">सफ़ाई साथी</span>
          </p>
          <h1 class="home-title">Seen a garbage spot? Photograph it, and a local waste picker gets paid to clear it.</h1>
          <a class="btn btn-primary btn-xl" href="#/report">Report waste</a>
          ${mine ? html`<a class="home-link" href="#/reports">My reports (${mine})</a>` : ''}
        </section>
        <section class="home-picker">
          <h2>For waste pickers</h2>
          <p>
            ${open
              ? `${open} open ${open === 1 ? 'job' : 'jobs'} nearby, paid from the ward cleanup fund.`
              : 'Jobs appear here the moment someone reports a spot. Each one is paid from the ward cleanup fund.'}
          </p>
          <a class="btn btn-outline" href="#/picker">Open picker dashboard</a>
        </section>
        <footer class="home-foot">
          <p>A prototype for a school STEM pitch. The pickers and payments are simulated.</p>
          <button class="link" type="button" data-action="demo">Demo controls</button>
        </footer>
      </main>`,
    );
  };

  draw();
  return subscribe(draw);
}
