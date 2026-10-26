import '@fontsource/atkinson-hyperlegible-next/400.css'
import '@fontsource/atkinson-hyperlegible-next/700.css'
import '@fontsource/atkinson-hyperlegible-mono/400.css'
import './ui/styles.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { startAuth } from './auth/auth'
import { App } from './ui/App'

const root = document.getElementById('root')
if (!root) throw new Error('index.html has no #root')

// Sign-in finishes before the first render, so a redirect back from Keycloak
// is handled exactly once.
void startAuth()
  .catch((error: unknown) => console.error('sign-in state unavailable', error))
  .finally(() => {
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
