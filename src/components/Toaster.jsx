import { useSyncExternalStore } from 'react';
import { currentToast, onToast } from '../lib/toast.js';

export default function Toaster() {
  const item = useSyncExternalStore(onToast, currentToast);
  if (!item) return null;
  return (
    <p key={item.id} className="toast" role="status">
      {item.message}
    </p>
  );
}
