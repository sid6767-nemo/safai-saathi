import { useEffect, useRef, useState } from 'react';
import { formatCoords } from '../lib/geo.js';
import { t } from '../lib/i18n.js';
import { mapConfig, mountGoogle, mountLeaflet, walkFromHere } from '../lib/maps.js';

// Mounts Google Maps or Leaflet into `ref` and tears it down again. `handle` holds the Leaflet
// map, which the walking route draws on.
function useMap(ref, point, big) {
  const [state, setState] = useState({ mode: null, failed: false });
  const handle = useRef(null);

  useEffect(() => {
    let alive = true;
    let destroy = null;
    (async () => {
      const cfg = await mapConfig();
      if (!alive) return;
      if (cfg.mapsEmbedKey) {
        destroy = mountGoogle(ref.current, point, cfg.mapsEmbedKey, { big });
        setState({ mode: 'google', failed: false });
        return;
      }
      const mounted = await mountLeaflet(ref.current, point, { big });
      if (!alive) return mounted.destroy();
      handle.current = mounted;
      destroy = mounted.destroy;
      setState({ mode: 'leaflet', failed: false });
    })().catch(() => alive && setState({ mode: null, failed: true }));
    return () => {
      alive = false;
      handle.current = null;
      destroy?.();
    };
    // Only the coordinates matter; `point` is a fresh object on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point.lat, point.lng, big]);

  return { ...state, handle };
}

function Fallback({ point }) {
  return <p className="map-fallback mono">{t('map.unavailable', { coords: formatCoords(point) })}</p>;
}

// Full screen, clear of the action buttons, with the walking route.
function BigMap({ point, autoWalk, onClose }) {
  const dialog = useRef(null);
  const canvas = useRef(null);
  const [status, setStatus] = useState('');
  const [routing, setRouting] = useState(false);

  // Declared before useMap so the dialog is open (and sized) before the map measures it.
  useEffect(() => {
    const d = dialog.current;
    d.showModal();
    return () => d.open && d.close();
  }, []);

  const { mode, failed, handle } = useMap(canvas, point, true);

  async function showWalk() {
    if (!handle.current) return;
    setRouting(true);
    setStatus(t('map.routeBusy'));
    setStatus(await walkFromHere(handle.current, point));
  }

  // Opened from "Show the walk": draw the route as soon as the map is ready.
  useEffect(() => {
    if (autoWalk && mode === 'leaflet') showWalk();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoWalk, mode]);

  return (
    <dialog ref={dialog} className="map-dialog" onClose={onClose}>
      <div className="map-big-wrap">
        <div className="map-big" ref={canvas} />
        {failed && <Fallback point={point} />}
      </div>
      <div className="map-bar">
        <p className="map-status" role="status">
          {mode === 'google' ? t('map.googleWalking') : status}
        </p>
        {mode === 'leaflet' && (
          <button type="button" className="btn btn-outline map-route" disabled={routing} onClick={showWalk}>
            {t('map.route')}
          </button>
        )}
        <button type="button" className="btn btn-quiet map-close" onClick={() => dialog.current.close()}>
          {t('map.close')}
        </button>
      </div>
    </dialog>
  );
}

export default function SpotMap({ lat, lng, walk = true }) {
  const point = { lat, lng };
  const canvas = useRef(null);
  const { failed } = useMap(canvas, point, false);
  const [big, setBig] = useState(false);

  return (
    <>
      <div className="map-box">
        <div className="map-canvas" ref={canvas} role="img" aria-label={t('map.title')} />
        {failed && <Fallback point={point} />}
        <button
          type="button"
          className="map-expand"
          onClick={() => setBig('view')}
          aria-label={t('map.expand')}
          title={t('map.expand')}
        >
          ⤢
        </button>
      </div>
      {walk && (
        <button type="button" className="btn btn-outline btn-block map-walk" onClick={() => setBig('walk')}>
          {t('map.route')}
        </button>
      )}
      {big && <BigMap point={point} autoWalk={big === 'walk'} onClose={() => setBig(false)} />}
    </>
  );
}
