import { LANGUAGES, language, loadLanguage, t } from '../lib/i18n.js';

// Switches the whole app; App re-renders on the change, so nothing else needs telling.
export default function LanguageMenu({ dark = false }) {
  return (
    <label className={`lang${dark ? ' lang-dark' : ''}`}>
      <span className="visually-hidden">{t('lang.label')}</span>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm6.9 9h-3a15.4 15.4 0 0 0-1.2-5.2A8 8 0 0 1 18.9 11ZM12 4c.8 1.1 1.6 3.3 1.8 7h-3.6C10.4 7.3 11.2 5.1 12 4ZM4.3 13h3c.1 2 .5 3.8 1.1 5.2A8 8 0 0 1 4.3 13Zm3-2h-3a8 8 0 0 1 4.1-5.2A15.4 15.4 0 0 0 7.3 11Zm4.7 9c-.8-1.1-1.6-3.3-1.8-7h3.6c-.2 3.7-1 5.9-1.8 7Zm2.7-.8c.6-1.4 1-3.2 1.1-5.2h3a8 8 0 0 1-4.1 5.2Z"
        />
      </svg>
      <select value={language()} onChange={(e) => loadLanguage(e.target.value)}>
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
