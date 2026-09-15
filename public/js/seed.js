// Sample jobs so the picker dashboard isn't empty on the first take. Each one is tagged
// "Sample" in the UI.
//
// To swap in real photos: put a JPEG in public/assets/samples/, point `photo` at it, set
// `illustration: false` (so verification also checks the proof photo is the same place),
// and update the labels to match what the photo shows.
export const SAMPLE_JOBS = [
  {
    id: 'SS-SMP1',
    photo: 'assets/samples/sample-1.svg',
    illustration: true,
    wasteType: 'dry',
    severity: 'medium',
    north: 380,
    east: -240,
    minutesAgo: 18,
    itemsSeen: ['plastic bottles', 'chip packets', 'paper cups'],
    reasoning: 'Mostly plastic bottles and wrappers spread along a painted kerb, a few bags of work.',
  },
  {
    id: 'SS-SMP2',
    photo: 'assets/samples/sample-2.svg',
    illustration: true,
    wasteType: 'wet',
    severity: 'large',
    north: -760,
    east: 420,
    minutesAgo: 41,
    itemsSeen: ['vegetable peels', 'banana leaves', 'food scraps'],
    reasoning: 'A heap of vegetable and food waste against a wall, large enough to need a cart.',
  },
  {
    id: 'SS-SMP3',
    photo: 'assets/samples/sample-3.svg',
    illustration: true,
    wasteType: 'dry',
    severity: 'small',
    north: 150,
    east: 610,
    minutesAgo: 6,
    itemsSeen: ['tea cups', 'paper plates'],
    reasoning: 'A handful of paper tea cups and plates by a lamp post, one bag clears it.',
  },
];
