import React from 'react';

// Generic error boundary. Catches render-time exceptions in its subtree so a
// single misbehaving widget (e.g. the Recharts timeline chart throwing during a
// rapid brush-slider drag) degrades to a small inline fallback instead of
// unmounting the whole React tree and leaving a blank white page.
//
// `resetKeys` lets the boundary recover automatically: whenever any key changes
// (we pass the brush window + active fuels), a previously-caught error is
// cleared and the subtree re-renders. So a transient render glitch self-heals
// the moment the user interacts again, with no reload required.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Surface in the console for debugging; never rethrow.
    console.error('[ErrorBoundary] caught render error:', error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    if (!this.state.hasError) return;
    const prev = prevProps.resetKeys || [];
    const next = this.props.resetKeys || [];
    const changed = prev.length !== next.length || next.some((k, i) => !Object.is(k, prev[i]));
    if (changed) this.setState({ hasError: false });
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
