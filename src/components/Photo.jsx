import { useEffect, useState } from 'react';
import { photoUrl } from '../lib/photos.js';

// An <img> for a stored photo: a sample's static path, or an object URL read from IndexedDB.
export default function Photo({ photo, alt = '', ...rest }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    let alive = true;
    photoUrl(photo).then((url) => alive && setSrc(url || null));
    return () => {
      alive = false;
    };
  }, [photo]);

  return <img src={src ?? undefined} alt={alt} {...rest} />;
}
