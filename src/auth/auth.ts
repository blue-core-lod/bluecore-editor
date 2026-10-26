import { UserManager, type User } from 'oidc-client-ts'
import { useSyncExternalStore } from 'react'

import { config } from '../config'

/**
 * Sign-in with Blue Core's Keycloak: the authorization code flow with PKCE,
 * as a public client (for now bluecore_api, the one Sinopia uses), so the browser
 * never holds a secret.
 * Reads are public in Blue Core; the token is what lets a save through.
 */

const appUrl = new URL(import.meta.env.BASE_URL, window.location.origin).href

const userManager = new UserManager({
  authority: `${config.keycloakUrl}realms/${config.keycloakRealm}`,
  client_id: config.keycloakClientId,
  redirect_uri: appUrl,
  post_logout_redirect_uri: appUrl,
  scope: 'openid profile',
  automaticSilentRenew: true,
})

export interface AuthState {
  user: User | null
  /** Why the last sign-in failed, if it did. */
  error: string | null
}

let state: AuthState = { user: null, error: null }
const listeners = new Set<() => void>()

function set(next: Partial<AuthState>) {
  state = { ...state, ...next }
  for (const listener of listeners) listener()
}

/**
 * Finish a sign-in that Keycloak has just redirected back from, or pick up
 * the session already in this tab. Called once, before the app renders.
 */
export async function startAuth(): Promise<void> {
  userManager.events.addUserLoaded((user) => set({ user, error: null }))
  userManager.events.addUserUnloaded(() => set({ user: null }))
  userManager.events.addSilentRenewError((error) => set({ user: null, error: error.message }))

  const params = new URLSearchParams(window.location.search)
  if (params.has('state') && (params.has('code') || params.has('error'))) {
    try {
      const user = await userManager.signinRedirectCallback()
      set({ user })
      window.history.replaceState(null, '', returnTo(user.state))
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
      window.history.replaceState(null, '', appUrl)
    }
    return
  }
  const user = await userManager.getUser()
  set({ user: user && !user.expired ? user : null })
}

/** Back to where the cataloger was, so long as that is somewhere in the editor. */
function returnTo(saved: unknown): string {
  return typeof saved === 'string' && saved.startsWith(appUrl) ? saved : appUrl
}

export function signIn(): Promise<void> {
  return userManager.signinRedirect({ state: window.location.href })
}

export function signOut(): Promise<void> {
  return userManager.signoutRedirect()
}

export function useAuth(): AuthState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
  )
}

/** The current access token, for requests made outside rendering. */
export function accessToken(): string | undefined {
  return state.user?.access_token
}

/** A display name for the signed-in cataloger. */
export function displayName(user: User): string {
  const { name, preferred_username } = user.profile
  return name ?? preferred_username ?? 'Signed in'
}
