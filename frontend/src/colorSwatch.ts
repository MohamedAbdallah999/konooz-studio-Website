const namedColors: Record<string, string> = {
  beige: '#d8c3a5', burgundy: '#800020', cream: '#fffdd0', gold: '#d4af37',
  grey: '#808080', gray: '#808080', khaki: '#c3b091', maroon: '#800000',
  mustard: '#d6a400', navy: '#000080', navyblue: '#000080', nude: '#e3bc9a', offwhite: '#faf9f6',
  olive: '#808000', rose: '#d98c9f', silver: '#c0c0c0', tan: '#d2b48c',
  turquoise: '#40e0d0', wine: '#722f37',
};

export function colorSwatch(color: string) {
  const normalized = color.trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (!normalized) return '#ded5c5';
  if (namedColors[normalized]) return namedColors[normalized];
  if (typeof CSS !== 'undefined' && CSS.supports('color', color.trim()))
    return color.trim();
  let hash = 0;
  for (const character of normalized)
    hash = character.charCodeAt(0) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360} 52% 48%)`;
}
