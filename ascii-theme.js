// Shared ember → orange → gold → cream lighting ramp for every ASCII surface.
export function createAsciiPalette(theme = getComputedStyle(document.documentElement)) {
  const stops = ['--scene-shadow', '--scene-ember', '--accent', '--gold', '--cream']
    .map(name => theme.getPropertyValue(name).trim().slice(1).match(/../g).map(hex => parseInt(hex, 16)));
  return Array.from({ length: 40 }, (_, i) => {
    const position = i / 39 * (stops.length - 1);
    const low = Math.min(stops.length - 2, Math.floor(position)), fraction = position - low;
    return `rgb(${stops[low].map((value, channel) => Math.round(value + (stops[low + 1][channel] - value) * fraction)).join(',')})`;
  });
}
export const asciiColorIndex = (light, length = 40) => Math.max(0, Math.min(length - 1, Math.floor(light * 1.4 * (length - 1))));
