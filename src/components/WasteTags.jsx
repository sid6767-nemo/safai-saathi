import { t } from '../lib/i18n.js';
import { sizeLabel, wasteLabel } from '../lib/payout.js';

// Filled tag for the waste type (bin colours), outlined for size, dashed for sample data.
export default function WasteTags({ analysis, short = false, sample = false, isNew = false }) {
  return (
    <div className="tags">
      <span className={`tag tag-${analysis.wasteType}`}>{wasteLabel(analysis.wasteType, short)}</span>
      <span className="tag tag-outline">{sizeLabel(analysis.severity)}</span>
      {sample && <span className="tag tag-sample">{t('picker.sample')}</span>}
      {isNew && <span className="tag tag-new">{t('picker.new')}</span>}
    </div>
  );
}
