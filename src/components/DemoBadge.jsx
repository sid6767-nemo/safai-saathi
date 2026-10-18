import { useStore } from '../hooks.js';
import { t } from '../lib/i18n.js';

const BADGES = [
  ['spoofLocation', 'demo.badge.location'],
  ['clockSkew', 'demo.badge.clock'],
  ['aiOffline', 'demo.badge.ai'],
];

// A visible strip whenever a staged condition is on, so a video never passes one off as real.
export default function DemoBadge() {
  const { demo } = useStore();
  const on = BADGES.filter(([name]) => demo[name]).map(([, key]) => t(key));
  if (!on.length) return null;
  return (
    <p className="demo-badge" role="status">
      {t('demo.badge', { list: on.join(', ') })}
    </p>
  );
}
