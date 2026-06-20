// Dependency-free helper shared by the edge middleware and its unit test.
//
// Serialize a value for safe inlining inside an inline <script>. JSON.stringify
// does NOT escape "<" (so "</script>" / "<!--" could break out of the block) nor
// the U+2028 / U+2029 line/paragraph separators (valid JSON but illegal raw in a
// JS string literal, throwing a SyntaxError). Escape all three.
//
// The separators are matched via String.fromCharCode rather than a regex literal:
// a raw U+2028/U+2029 in source IS a line terminator and would break the literal.
export function serializeForScript(value) {
  const LINE_SEP = String.fromCharCode(0x2028);
  const PARA_SEP = String.fromCharCode(0x2029);
  return JSON.stringify(value)
    .split('<').join('\\u003c')
    .split(LINE_SEP).join('\\u2028')
    .split(PARA_SEP).join('\\u2029');
}
