import HomeBackdrop from '../components/HomeBackdrop.jsx';
import LanguageMenu from '../components/LanguageMenu.jsx';
import BlurText from '../components/reactbits/BlurText/BlurText.jsx';
import Magnet from '../components/reactbits/Magnet/Magnet.jsx';
import SpecularButton from '../components/reactbits/SpecularButton/SpecularButton.jsx';
import StepIcons from '../components/StepIcons.jsx';
import ThemeButton from '../components/ThemeButton.jsx';
import { useStore, useTitle } from '../hooks.js';
import { language, t, tn } from '../lib/i18n.js';

const STEPS = [1, 2, 3];

export default function Home({ onOpenDemo }) {
  useTitle('Safai Saathi');
  const { jobs } = useStore();
  const open = jobs.filter((j) => j.status === 'open').length;
  const mine = jobs.filter((j) => !j.sample).length;

  return (
    <main className="home">
      <section className="home-report">
        <HomeBackdrop />
        <div className="home-top">
          <p className="wordmark">
            <span className="wm-latin">Safai Saathi</span>
            <span className="wm-deva" lang="hi">
              सफ़ाई साथी
            </span>
          </p>
          <div className="home-controls">
            <LanguageMenu />
            <ThemeButton />
          </div>
        </div>

        {/* Keyed by language so the headline replays its reveal in the new script. */}
        <BlurText
          key={language()}
          as="h1"
          className="home-title"
          text={t('home.tagline')}
          animateBy="words"
          direction="top"
          delay={60}
          stepDuration={0.3}
          trigger="load"
        />

        <div className="home-cta">
          <Magnet padding={60} magnetStrength={4} style={{ display: 'block' }}>
            <a className="btn btn-primary btn-xl btn-block" href="#/report">
              {t('home.report')}
            </a>
          </Magnet>
          <p className="btn-help">{t('home.reportHelp')}</p>
        </div>
        {mine > 0 && (
          <a className="home-link" href="#/reports">
            {t('home.myReports', { count: mine })}
          </a>
        )}
      </section>

      <section className="how" aria-labelledby="how-title">
        <h2 className="how-title" id="how-title">
          {t('home.how')}
        </h2>
        <StepIcons />
        <ol className="how-steps">
          {STEPS.map((n) => (
            <li className="how-step" key={n} style={{ '--step': n }}>
              <span className="how-num">{n}</span>
              <span className="how-text">
                <strong>{t(`home.how${n}.title`)}</strong>
                <span>{t(`home.how${n}.body`)}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="home-picker">
        <h2>{t('home.pickerTitle')}</h2>
        <p>{open ? tn('home.openJobs', open) : t('home.noJobs')}</p>
        <SpecularButton
          className="home-picker-btn"
          size="lg"
          radius={8}
          baseColor="#1d2126"
          textColor="#ffc20e"
          lineColor="#ffc20e"
          tint="#ffc20e"
          tintOpacity={0.05}
          onClick={() => (location.hash = '#/picker')}
        >
          {t('home.openDashboard')}
        </SpecularButton>
      </section>

      <footer className="home-foot">
        <p>{t('home.footer')}</p>
        <button className="link" type="button" onClick={onOpenDemo}>
          {t('home.demo')}
        </button>
      </footer>
    </main>
  );
}
