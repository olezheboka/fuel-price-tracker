import React from 'react';
import posthog from 'posthog-js';

// Generic error boundary. Catches render-time exceptions in its subtree so a
// single misbehaving widget (e.g. the Recharts timeline chart throwing during a
// rapid brush-slider drag) degrades to a small inline fallback instead of
// unmounting the whole React tree and leaving a blank white page.
//
// Two independent recovery paths:
//
// 1. `resetKeys` — whenever any key changes a previously-caught error is cleared
//    and the subtree re-renders. IMPORTANT: pass only keys that change on a
//    *settle* boundary (data/filter change, drag end), NOT per-frame values like
//    live brush indices. A key that changes every frame turns this reset into a
//    catch->reset->rethrow loop, which React eventually escalates as "Maximum
//    update depth exceeded" — thrown from React's own machinery and therefore
//    caught by the NEXT boundary up, not this one. That escalation is exactly what
//    blanked the whole app before, so keep these keys stable.
//
// 2. `autoResetMs` — a time-based backstop for boundaries that have no natural
//    resetKey (e.g. the root one). After a short delay the error is cleared once,
//    so a transient fault self-heals instead of leaving a permanently dead screen.
//    Capped at `maxAutoResets` (default 3) so a *deterministic* boot-time error
//    still settles on the fallback instead of flickering forever.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
    this._autoResetTimer = null;
    this._autoResetCount = 0;
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Surface in the console for debugging; never rethrow.
    console.error('[ErrorBoundary] caught render error:', error, info?.componentStack);
    // Permanent telemetry: report the exact error + component stack to PostHog so
    // any recurrence in production is captured with a full stack and no repro is
    // needed. Guarded so telemetry can never itself throw.
    try {
      if (posthog && typeof posthog.captureException === 'function') {
        posthog.captureException(error, {
          componentStack: info?.componentStack,
          boundary: this.props.name || 'unnamed',
        });
      }
    } catch { /* ignore */ }

    // Time-based backstop self-heal (see class comment).
    const maxAuto = this.props.maxAutoResets ?? 3;
    if (this.props.autoResetMs && this._autoResetCount < maxAuto) {
      this._autoResetCount += 1;
      if (this._autoResetTimer) clearTimeout(this._autoResetTimer);
      this._autoResetTimer = setTimeout(() => {
        this._autoResetTimer = null;
        this.setState({ hasError: false });
      }, this.props.autoResetMs);
    }
  }

  componentDidUpdate(prevProps) {
    if (!this.state.hasError) return;
    const prev = prevProps.resetKeys || [];
    const next = this.props.resetKeys || [];
    const changed = prev.length !== next.length || next.some((k, i) => !Object.is(k, prev[i]));
    if (changed) {
      this._autoResetCount = 0; // a genuine settle resets the auto-recovery budget
      this.setState({ hasError: false });
    }
  }

  componentWillUnmount() {
    if (this._autoResetTimer) clearTimeout(this._autoResetTimer);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
