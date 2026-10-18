// Reads a design token's current value. Components that paint in JavaScript (ShinyText, Leaflet)
// can't use var(--…) directly, and the value changes with the light/dark theme.
export const cssVar = (name, fallback = '') =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
