import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './i18n';
import { Analytics } from '@vercel/analytics/react';
import ErrorBoundary from './ErrorBoundary';
import RootCrashFallback from './RootCrashFallback';

// Ultimate backstop: should a render fault ever escape the in-app boundaries,
// show a minimal recover affordance instead of a blank white page. The real
// fixes live in App (visible-window station scoping, rAF-coalesced slider drag,
// pill-geometry guards); this only exists so a white screen is impossible.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary fallback={<RootCrashFallback />}>
      <App />
    </ErrorBoundary>
    <Analytics />
  </React.StrictMode>,
)
