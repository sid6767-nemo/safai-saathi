// The picker app: job board, proof photo and job result, installed on a picker's phone.
// It shares the job list with the reporters' website through /api/state (lib/sync.js).

import { MotionConfig } from 'motion/react';
import { useEffect, useState } from 'react';
import DemoControls from '../components/DemoControls.jsx';
import Toaster from '../components/Toaster.jsx';
import { useHashPath, useLanguage, useTheme } from '../hooks.js';
import { isNativeApp } from '../lib/api.js';
import { loadProfile } from '../lib/profile.js';
import { releaseDue } from '../lib/store.js';
import Job from '../views/Job.jsx';
import Picker from '../views/Picker.jsx';
import Proof from '../views/Proof.jsx';
import InstallBanner from './InstallBanner.jsx';
import Setup from './Setup.jsx';

const ROUTES = [
  { pattern: /^\/?$/, view: Picker, mode: 'is-dark' },
  { pattern: /^\/proof\/([\w-]+)$/, view: Proof, mode: 'is-camera' },
  { pattern: /^\/job\/([\w-]+)$/, view: Job, mode: 'is-dark' },
];

function matchRoute(path) {
  for (const route of ROUTES) {
    const match = route.pattern.exec(path);
    if (match) return { ...route, param: match[1] };
  }
  return null;
}

export default function PickerApp() {
  const lang = useLanguage();
  useTheme();
  const path = useHashPath();
  const route = matchRoute(path);
  const [profile, setProfile] = useState(loadProfile);
  const [editing, setEditing] = useState(false);
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

  const finishSetup = (next) => {
    setProfile(next);
    setEditing(false);
  };

  let screen;
  if (!profile || editing) {
    screen = (
      <div className="app is-dark" lang={lang}>
        <Setup current={profile} onDone={finishSetup} />
      </div>
    );
  } else if (route) {
    const View = route.view;
    screen = (
      // Keyed by path: each screen mounts fresh, so cameras and timers never leak between them.
      <div key={path} className={`app ${route.mode}`} lang={lang}>
        {route.view === Picker && !isNativeApp && <InstallBanner />}
        <View
          param={route.param}
          profile={profile}
          onOpenDemo={() => setDemoOpen(true)}
          onChangeName={() => setEditing(true)}
        />
      </div>
    );
  } else {
    screen = null;
  }

  return (
    <MotionConfig reducedMotion="user">
      {screen}
      <DemoControls open={demoOpen} onClose={() => setDemoOpen(false)} />
      <Toaster />
    </MotionConfig>
  );
}
