import { offsetM } from './geo.js';

// Nine simulated waste pickers. Offsets are metres north/east of the anchor point (the first
// location the app reads). Once placed, their coordinates stay fixed for the whole session.
export const PICKER_ROSTER = [
  { id: 'p1', name: 'Lakshmi Devi', north: 140, east: -60 },
  { id: 'p2', name: 'Ravi Kumar', north: -220, east: 180 },
  { id: 'p3', name: 'Salma Begum', north: 420, east: 310 },
  { id: 'p4', name: 'Murugan S.', north: -610, east: -380 },
  { id: 'p5', name: 'Anita Kamble', north: 880, east: -520 },
  { id: 'p6', name: "Joseph D'Souza", north: -1150, east: 760 },
  { id: 'p7', name: 'Parvati Naik', north: 1400, east: 1120 },
  { id: 'p8', name: 'Imran Shaikh', north: -1720, east: -1300 },
  { id: 'p9', name: 'Kamala R.', north: 2100, east: -1250 },
];

export function placePickers(anchor) {
  return PICKER_ROSTER.map(({ id, name, north, east }) => ({
    id,
    name,
    ...offsetM(anchor, north, east),
  }));
}
