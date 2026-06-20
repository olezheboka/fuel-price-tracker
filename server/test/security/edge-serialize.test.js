import { describe, it, expect } from 'vitest';
import { serializeForScript } from '../../../edge-serialize.js';

const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

// The edge middleware inlines the latest prices into the HTML as
// `window.__INITIAL_PRICES__ = <json>`. If a price `location` ever contained
// "</script>" or a U+2028/U+2029, an unescaped value could break out of the
// <script> block (XSS) or throw a JS SyntaxError. This guards the escaper —
// and that it is valid JS at all (a raw separator in a regex literal, the
// original bug, would not even parse).
describe('serializeForScript', () => {
  it('should_escape_the_less_than_sign_to_neutralize_script_breakout', () => {
    const out = serializeForScript({ location: '</script><img src=x onerror=alert(1)>' });
    expect(out).not.toContain('<');
    expect(out).toContain('\\u003c');
  });

  it('should_escape_U2028_and_U2029_line_separators', () => {
    const out = serializeForScript({ a: `x${LS}y${PS}z` });
    expect(out).not.toContain(LS);
    expect(out).not.toContain(PS);
    expect(out).toContain('\\u2028');
    expect(out).toContain('\\u2029');
  });

  it('should_remain_valid_parseable_javascript_when_inlined', () => {
    const out = serializeForScript({ location: `</script>${LS}${PS}`, price: 1.717 });
    // Simulate the inline-script assignment and ensure it parses + round-trips.
    const value = new Function(`return ${out};`)();
    expect(value.price).toBe(1.717);
    expect(value.location).toContain('</script>');
  });

  it('should_leave_ordinary_data_intact', () => {
    const out = serializeForScript({ type: '95', price: 1.717, source: 'Neste' });
    expect(JSON.parse(out)).toEqual({ type: '95', price: 1.717, source: 'Neste' });
  });
});
