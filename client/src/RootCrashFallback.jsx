// Ultimate backstop UI: shown only if a render fault escapes every in-app
// boundary. It must never normally appear — the real fixes (visible-window
// station scoping, rAF-coalesced slider drag, pill-geometry guards) prevent the
// crash; this just guarantees a recoverable view instead of a blank white page.
function RootCrashFallback() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: '14px',
      padding: '24px', textAlign: 'center', color: '#374151',
      fontFamily: 'system-ui, -apple-system, sans-serif', background: '#f5f5f7',
    }}>
      <div style={{ fontSize: '15px', fontWeight: 600 }}>Kaut kas nogāja greizi</div>
      <button
        onClick={() => window.location.reload()}
        style={{
          padding: '8px 18px', borderRadius: '10px', border: '1px solid #d1d5db',
          background: '#fff', fontSize: '14px', fontWeight: 600, color: '#111827',
          cursor: 'pointer',
        }}
      >
        Pārlādēt
      </button>
    </div>
  );
}

export default RootCrashFallback;
