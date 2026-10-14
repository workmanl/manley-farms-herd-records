// SPDX-License-Identifier: AGPL-3.0-only
// Original 24px icons. One stroke, one grid. Not a third-party set.
const SVG = 'http://www.w3.org/2000/svg';
export const ICON_STROKE = '1.75';
export const ICONS = {
  home: 'M4 11.2 12 4.2l8 7V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z',
  animals: 'M8 14c0-3 1.6-5 4-5s4 2 4 5c0 2.2-1.2 3.6-4 5-2.8-1.4-4-2.8-4-5zM7.2 10.2 5 7.2M16.8 10.2 19 7.2M9.2 13.2h.01M14.8 13.2h.01M9.5 16.2h5',
  cow: 'M7 13c0-3.2 2-5.5 5-5.5s5 2.3 5 5.5c0 2.6-1.5 4.2-5 5.6-3.5-1.4-5-3-5-5.6zM6.2 9.4 4 6.2M17.8 9.4 20 6.2M9 12.6h.01M15 12.6h.01M9.2 15.6h5.6',
  plus: 'M12 5v14M5 12h14',
  backup: 'M5 4.5h14v15H5zM8 4.5v5.5h8V4.5M9 19.5v-5h6v5',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13M15.2 15.2 20 20',
  calf: 'M6 9.2 4.2 5.5M17.8 5.5 16 9.2M6 9.2h12v8.2l-6 2.6-6-2.6zM9 13h.01M15 13h.01M9.2 16.4h5.6',
  health: 'M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z',
  weight: 'M5 8h14l1.6 12H3.4zM9 8a3 3 0 0 1 6 0M12 12v4',
  move: 'M4 12h15M14 7l5 5-5 5',
  milk: 'M9 3.5h6v4.5l2.5 3.2V20H6.5v-8.8L9 8zM6.5 14h11',
  check: 'M4.5 12.5 9.2 17 19.5 6.5',
  breed: 'M8 18c0-4 1.5-6 4-8 2.5 2 4 4 4 8M12 10V6M9 7.5h6',
  sale: 'M5 8h14v11H5zM8 8V6.5A2.5 2.5 0 0 1 10.5 4h3A2.5 2.5 0 0 1 16 6.5V8M9 13h6',
  hold: 'M12 4.5 20.5 19H3.5zM12 10v4.2M12 16.8h.01',
  alert: 'M12 8v5M12 16.5h.01M5 19h14L12 5z',
  calendar: 'M5 6.5h14v12.5H5zM5 10.5h14M8 4.5v3.5M16 4.5v3.5',
  person: 'M12 12a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM5.5 19.5c1.2-3 3.4-4.5 6.5-4.5s5.3 1.5 6.5 4.5',
  tag: 'M4 12.2 11.8 4.4h6.8v6.8L11 19.8zM16.2 8h.01',
  group: 'M8 11a2.4 2.4 0 1 0 0-4.8A2.4 2.4 0 0 0 8 11zM16 11a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8zM3.5 18.5c.8-2.4 2.4-3.6 4.5-3.6s3.7 1.2 4.5 3.6M11.5 18.5c.8-2.4 2.4-3.6 4.5-3.6s3.7 1.2 4.5 3.6',
  chart: 'M4 19V5M4 19h16M8 15l3.2-4 3 2.2L18 8',
  print: 'M7 8V4h10v4M6 16H4.5A1.5 1.5 0 0 1 3 14.5v-4A1.5 1.5 0 0 1 4.5 9h15A1.5 1.5 0 0 1 21 10.5v4a1.5 1.5 0 0 1-1.5 1.5H17M7 13h10v7H7z',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  empty: 'M7 14c0-3 2.1-5.2 5-5.2s5 2.2 5 5.2c0 2.4-1.4 4-5 5.4-3.6-1.4-5-3-5-5.4zM12 8.8V5',
};
export function icon(name) {
  const svg = document.createElementNS(SVG, 'svg');
  for (const [key, value] of Object.entries({
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': ICON_STROKE,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  })) svg.setAttribute(key, value);
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', ICONS[name] || ICONS.tag);
  svg.append(path);
  return svg;
}
