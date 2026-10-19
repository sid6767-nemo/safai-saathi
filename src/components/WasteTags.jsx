import { t } from '../lib/i18n.js';
import { sizeLabel, wasteLabel } from '../lib/payout.js';

// Filled tag for the waste type (bin colours), outlined for size, and a flag for new jobs.
export default function WasteTags({ analysis, short = false, isNew = false }) {
  return (
    <div className="tags">
      <span className={`tag tag-${analysis.wasteType}`}>{wasteLabel(analysis.wasteType, short)}</span>
      <span className="tag tag-outline">{sizeLabel(analysis.severity)}</span>
      {isNew && <span className="tag tag-new">{t('picker.new')}</span>}
    </div>
  );
}
