import { MotionConfig } from 'motion/react';
import { useEffect, useState } from 'react';
import DemoControls from './components/DemoControls.jsx';
import Toaster from './components/Toaster.jsx';
import { useHashPath, useLanguage, useTheme } from './hooks.js';
import { releaseDue } from './lib/store.js';
import Home from './views/Home.jsx';
import Report from './views/Report.jsx';
import Reports from './views/Reports.jsx';

// The reporters' website. Pickers use their own app (src/picker/), which shares the same jobs.
// `mode` picks the screen's ground: light concrete or the black camera.
const ROUTES = [
  { pattern: /^\/?$/, view: Home, mode: '' },
  { pattern: /^\/report$/, view: Report, mode: 'is-camera' },
  { pattern: /^\/reports$/, view: Reports, mode: '' },
];

function matchRoute(path) {
  for (const route of ROUTES) {
    const match = route.pattern.exec(path);
    if (match) return { ...route, param: match[1] };
  }
  return null;
}

export default function App() {
  // Subscribing here re-renders every screen when the language or theme changes.
  const lang = useLanguage();
  useTheme();
  const path = useHashPath();
  const route = matchRoute(path);
  const [demoOpen, setDemoOpen] = useState(false);

  // Releases payouts whose hold window has ended.
  useEffect(() => {
    const id = setInterval(releaseDue, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      const typing = e.target instanceof Element && e.target.closest('input, select, textarea');
      if (e.shiftKey && e.key.toLowerCase() === 'd' && !typing) setDemoOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!route) location.replace('#/');
    window.scrollTo(0, 0);
  }, [path, route]);

  if (!route) return null;
  const View = route.view;

  return (
    <MotionConfig reducedMotion="user">
      {/* Keyed by path: each screen mounts fresh, so cameras and timers never leak between them. */}
      <div key={path} className={`app ${route.mode}`} lang={lang}>
        <View param={route.param} onOpenDemo={() => setDemoOpen(true)} />
      </div>
      <DemoControls open={demoOpen} onClose={() => setDemoOpen(false)} />
      <Toaster />
    </MotionConfig>
  );
}
