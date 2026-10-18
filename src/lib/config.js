// Every tunable number in the prototype lives here, so the pitch can point at one file.
export const CONFIG = {
  // Payout formula inputs (see payout.js). Rupees. Illustrative, not official ward rates.
  baseRate: { dry: 120, wet: 200 },
  sizeMultiplier: { small: 1, medium: 2.5, large: 5 },
  roundTo: 5,
  reporterShare: 1 / 20,

  notifyRadiusM: 2000, // pickers within this distance are sent a new job
  proofRadiusM: 30, // the proof photo must be taken this close to the reported spot
  maxFixAgeMs: 15_000, // a GPS fix older than this is read again before it's used
  codeTtlMin: 10, // how long a one-time job code stays valid
  holdHours: 24, // the reporter can flag a cleanup during this window

  // Used only on the reporting side, only when the user chooses it after location fails.
  fallbackLocation: { lat: 12.97599, lng: 77.60292, label: 'MG Road, Bengaluru' },

  // Demo controls: how far the fake location moves and how far the fake clock slips.
  demo: { spoofDistanceM: 150, clockSkewMin: 60 },
};
