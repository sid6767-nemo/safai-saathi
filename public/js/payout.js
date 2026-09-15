import { CONFIG } from './config.js';

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

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

export const rupees = (amount) => `₹${inr.format(amount)}`;

export const WASTE_LABEL = { dry: 'Dry waste', wet: 'Wet waste' };
export const SIZE_LABEL = { small: 'Small', medium: 'Medium pile', large: 'Large dump' };
