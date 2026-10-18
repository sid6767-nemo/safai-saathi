import { t } from '../lib/i18n.js';
import { theme, toggleTheme } from '../lib/theme.js';

// Moon while it's light, sun while it's dark: the icon shows what tapping will give you.
export default function ThemeButton({ dark = false }) {
  const toDark = theme() !== 'dark';
  const label = t(toDark ? 'theme.toDark' : 'theme.toLight');
  return (
    <button
      type="button"
      className={`icon-btn theme-btn${dark ? ' theme-btn-dark' : ''}`}
      onClick={toggleTheme}
      aria-label={label}
      title={label}
    >
      {toDark ? (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path fill="currentColor" d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm0-13.2a1 1 0 0 1-1-1V2a1 1 0 1 1 2 0v.8a1 1 0 0 1-1 1Zm0 18.4a1 1 0 0 1-1-1V20a1 1 0 1 1 2 0v1.2a1 1 0 0 1-1 1ZM22 13h-1.2a1 1 0 1 1 0-2H22a1 1 0 1 1 0 2ZM3.2 13H2a1 1 0 1 1 0-2h1.2a1 1 0 1 1 0 2Zm15.3-6.3a1 1 0 0 1-.7-1.7l.8-.8a1 1 0 1 1 1.4 1.4l-.8.8a1 1 0 0 1-.7.3ZM5.2 20a1 1 0 0 1-.7-1.7l.8-.8a1 1 0 1 1 1.4 1.4l-.8.8a1 1 0 0 1-.7.3Zm14.1 0a1 1 0 0 1-.7-.3l-.8-.8a1 1 0 1 1 1.4-1.4l.8.8a1 1 0 0 1-.7 1.7ZM6 6.7a1 1 0 0 1-.7-.3l-.8-.8a1 1 0 0 1 1.4-1.4l.8.8A1 1 0 0 1 6 6.7Z"
          />
        </svg>
      )}
    </button>
  );
}
