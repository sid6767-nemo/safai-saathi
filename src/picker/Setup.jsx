import { useState } from 'react';
import { useTitle } from '../hooks.js';
import { LANGUAGES, loadLanguage, t } from '../lib/i18n.js';
import { saveProfile } from '../lib/profile.js';

// Bengaluru first: Kannada and Tamil, then Hindi and English.
const ORDER = ['kn', 'ta', 'hi', 'en'];

// First run of the picker app: the language first, so everything after it is readable, then a
// name, once. Opened again from the name in the header to change either.
export default function Setup({ current, onDone }) {
  useTitle('Safai Saathi');
  const [step, setStep] = useState(current ? 'name' : 'language');
  const [name, setName] = useState(current?.name ?? '');

  async function chooseLanguage(code) {
    await loadLanguage(code);
    setStep('name');
  }

  function submit(e) {
    e.preventDefault();
    if (name.trim()) onDone(saveProfile(name));
  }

  if (step === 'language') {
    return (
      <main className="setup">
        <p className="setup-mark" lang="hi">
          सफ़ाई साथी
        </p>
        <h1 className="setup-title">{t('setup.language')}</h1>
        <div className="setup-langs">
          {ORDER.map((code) => {
            const lang = LANGUAGES.find((l) => l.code === code);
            return (
              <button
                key={code}
                type="button"
                className="setup-lang"
                lang={code}
                onClick={() => chooseLanguage(code)}
              >
                {lang.label}
              </button>
            );
          })}
        </div>
      </main>
    );
  }

  return (
    <main className="setup">
      <p className="setup-mark" lang="hi">
        सफ़ाई साथी
      </p>
      <form className="setup-form" onSubmit={submit}>
        <label className="setup-title" htmlFor="picker-name">
          {t('setup.name')}
        </label>
        <p className="setup-why">{t('setup.why')}</p>
        <input
          id="picker-name"
          className="setup-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('setup.namePlaceholder')}
          autoComplete="name"
          maxLength={40}
          autoFocus
          required
        />
        <button className="btn btn-primary btn-xl btn-block" disabled={!name.trim()}>
          {t('setup.start')}
        </button>
        <button type="button" className="btn btn-quiet btn-block" onClick={() => setStep('language')}>
          {t('setup.changeLanguage')}
        </button>
        {current && (
          <button type="button" className="btn btn-quiet btn-block" onClick={() => onDone(current)}>
            {t('action.cancel')}
          </button>
        )}
      </form>
    </main>
  );
}
