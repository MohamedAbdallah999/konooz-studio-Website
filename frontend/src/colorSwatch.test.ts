import { describe, expect, it } from 'vitest';
import { colorSwatch } from './colorSwatch';

describe('colorSwatch', () => {
  it('maps common fashion colours consistently', () => {
    expect(colorSwatch('Burgundy')).toBe('#800020');
    expect(colorSwatch('navy blue')).toBe('#000080');
  });

  it('gives unknown entered colours a stable visible colour', () => {
    expect(colorSwatch('Custom shade')).toMatch(/^hsl\(/);
    expect(colorSwatch('Custom shade')).toBe(colorSwatch('custom-shade'));
  });
});
