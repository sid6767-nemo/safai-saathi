import { CONFIG } from './config.js';
import { locale, t } from './i18n.js';

// Rule-based estimate, driven by the AI's two labels:
//
//   picker payout   = base rate for the waste type × size multiplier, rounded to the nearest ₹5
//   reporter reward = picker payout ÷ 20
//
// Wet waste has the higher base rate: it's heavier, it smells, and it has to reach a compost
// or biogas site the same day. The reporter's reward is paid by the ward fund on top of the
// picker's payout; it is never taken out of the picker's share.
export function estimatePayout(wasteType, severity) {
  const base = CONFIG.baseRate[wasteType];
  const multiplier = CONFIG.sizeMultiplier[severity];
  const picker = Math.round((base * multiplier) / CONFIG.roundTo) * CONFIG.roundTo;
  const reporter = Math.round(picker * CONFIG.reporterShare);
  return { picker, reporter, fundTotal: picker + reporter, base, multiplier };
}

// Latin digits in every language, so amounts stay quick to read.
export const rupees = (amount) => `₹${new Intl.NumberFormat(locale(), { maximumFractionDigits: 0 }).format(amount)}`;

export const wasteLabel = (type, short = false) => t(`waste.${type}${short ? '.short' : ''}`);
export const sizeLabel = (severity) => t(`size.${severity}`);
