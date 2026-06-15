import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './i18n';
import { Analytics } from '@vercel/analytics/react';
import ErrorBoundary from './ErrorBoundary';
import RootCrashFallback from './RootCrashFallback';
import posthog from 'posthog-js';

if (import.meta.env.PROD) {
  posthog.init('phc_mGRzF8BAsyYJo8ckgzQuGLupg3EyfsPavWDx83Uo4bfJ', {
    api_host: 'https://eu.i.posthog.com',
    person_profiles: 'identified_only',
  });
}

// Ultimate backstop: should a render fault ever escape the in-app boundaries,
// show a minimal recover affordance instead of a blank white page. The real fix
// lives in App (stable boundary reset keys so a transient chart throw can't
// escalate here, plus a deferred chart slice). `autoResetMs` makes even this
// last resort self-heal: any escaped fault clears after a moment instead of
// leaving a permanently dead screen requiring a manual reload.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary fallback={<RootCrashFallback />} autoResetMs={2000} name="root">
      <App />
    </ErrorBoundary>
    <Analytics />
  </React.StrictMode>,
)
