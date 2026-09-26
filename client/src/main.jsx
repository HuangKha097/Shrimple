import './polyfills';
import './i18n';
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './reset.css'
import './index.css'
import { GoogleOAuthProvider } from '@react-oauth/google'
import App from './App.jsx'
import { GOOGLE_CLIENT_ID } from './config/env.js'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <App />
    </GoogleOAuthProvider>
  </StrictMode>,
)
