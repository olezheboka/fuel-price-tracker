import { describe, it, expect } from 'vitest';
import { hexToRgba, formatPrice, formatCents } from '../../src/lib/format.js';

describe('hexToRgba', () => {
  it('should_convert_hex_to_rgba_with_alpha', () => {
    expect(hexToRgba('#16a34a', 0.5)).toBe('rgba(22, 163, 74, 0.5)');
  });
  it('should_tolerate_missing_hash', () => {
    expect(hexToRgba('44D62C', 1)).toBe('rgba(68, 214, 44, 1)');
  });
});

describe('formatPrice', () => {
  it('should_render_three_decimals', () => {
    expect(formatPrice(1.7)).toBe('1.700');
    expect(formatPrice(0.9715)).toBe('0.972');
  });
  it('should_render_em_dash_for_missing_values', () => {
    expect(formatPrice(undefined)).toBe('—');
    expect(formatPrice(NaN)).toBe('—');
  });
});

describe('formatCents', () => {
  it('should_render_signed_cents_with_one_decimal', () => {
    expect(formatCents(0.025)).toBe('+2.5');
    expect(formatCents(-0.012)).toBe('-1.2');
  });
  it('should_render_em_dash_for_missing_values', () => {
    expect(formatCents(null)).toBe('—');
  });
});
