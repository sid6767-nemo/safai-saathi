import { useEffect, useMemo, useState } from 'react';
import { formatDistance } from '../lib/geo.js';
import { rupees } from '../lib/payout.js';
import { photoUrl } from '../lib/photos.js';
import CircularCarousel from './reactbits/CircularCarousel/CircularCarousel.jsx';

// Resolves each job photo to something an <img> can show (stored photos become object URLs).
function usePhotoUrls(refs) {
  const key = refs.join('|');
  const [urls, setUrls] = useState(null);
  useEffect(() => {
    let alive = true;
    Promise.all(refs.map(photoUrl)).then((list) => alive && setUrls(list));
    return () => {
      alive = false;
    };
    // `key` stands in for `refs`, which is a new array on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return urls;
}

// Open jobs as a ring of photos, nearest first. The carousel tells us which job is in front;
// the dashboard shows that job's details and Accept button underneath.
export default function JobRing({ jobs, onFocus }) {
  const urls = usePhotoUrls(jobs.map(({ job }) => job.photo));

  // The carousel tracks cards by image address, so each gets the job id as a fragment: two jobs
  // that share a photo still count as two cards.
  const items = useMemo(
    () =>
      urls &&
      jobs.map(({ job, distance }, i) => ({
        src: `${urls[i]}#${job.id}`,
        alt: `${rupees(job.payout.picker)}, ${formatDistance(distance)}`,
        title: rupees(job.payout.picker),
      })),
    // Rebuilt only when the jobs or their photos change, not on every clock tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [urls, jobs.map(({ job }) => job.id).join('|')],
  );

  return (
    <div className="job-ring">
      {items && (
        <CircularCarousel
          items={items}
          preset="orbit"
          autoplay="off"
          cardWidth={132}
          gap={18}
          fadeColor="#14161a"
          depthFade={0.5}
          cornerRadius={8}
          onChange={onFocus}
        />
      )}
    </div>
  );
}
