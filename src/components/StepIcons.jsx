import { useTheme } from '../hooks.js';
import { t } from '../lib/i18n.js';
import GlassIcons from './reactbits/GlassIcons/GlassIcons.jsx';

const icon = (d) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" d={d} />
  </svg>
);

// The three steps of how it works, each a link to the screen where that step happens.
// Colours follow the step numbers below them: info blue, marigold, verified green.
const STEPS = [
  {
    id: 'photo',
    href: '#/report',
    color: 'linear-gradient(135deg, #6aa8f5, #2f7de1)',
    d: 'M9 4h6l1.5 2H20a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3.5L9 4Zm3 4.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Zm0 2a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z',
  },
  {
    id: 'clear',
    href: '#/picker',
    color: 'linear-gradient(135deg, #ffa25c, #ff7a1a)',
    d: 'M9 3h6l-1 3h-4L9 3Zm1 4h4c3 2 5 5 5 8.5C19 19 16 21 12 21s-7-2-7-5.5C5 12 7 9 10 7Z',
  },
  {
    id: 'paid',
    href: '#/reports',
    color: 'linear-gradient(135deg, #35d183, #1b9a5a)',
    d: 'M7 4h10v2h-3.2c.5.6.9 1.3 1.1 2H17v2h-2.1c-.5 2.3-2.5 4-5 4.2L15.5 20h-2.7l-5-5.8V13h2c1.5 0 2.7-.9 3.1-2.2H7V8.8h5.9C12.5 7.7 11.4 7 10 7H7V4Z',
  },
];

export default function StepIcons() {
  const theme = useTheme();
  const items = STEPS.map((s, i) => ({
    id: s.id,
    href: s.href,
    color: s.color,
    icon: icon(s.d),
    label: t(`home.how${i + 1}.title`),
  }));
  return (
    <GlassIcons
      className="how-icons"
      items={items}
      size={64}
      gap={30}
      columns={3}
      labels="none"
      tilt={18}
      refraction={0.3}
      bevel={0.45}
      theme={theme === 'dark' ? 'dark' : 'light'}
    />
  );
}
