/**
 * Where Blue Core and its Keycloak live: VITE_* variables (see .env) if set, otherwise the page's own origin, which
 * is where bluecore-stack serves them beside the editor. So one built image works on any of its hosts.
 */
const bluecoreUrl = withSlash(import.meta.env.VITE_BLUECORE_URL || window.location.origin)

export const config = {
  bluecoreUrl,
  keycloakUrl: withSlash(import.meta.env.VITE_KEYCLOAK_URL || `${bluecoreUrl}keycloak/`),
  keycloakRealm: 'bluecore',
  keycloakClientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'bluecore_api',
  /** QA, for authority lookups: Sinopia's proxy beside Blue Core, unless VITE_QA_URL says otherwise. */
  qaUrl: withSlash(import.meta.env.VITE_QA_URL || `${bluecoreUrl}api/qa/`),
  /** ScriptShifter, for romanization: LC's instance, unless VITE_SCRIPTSHIFTER_URL says otherwise. */
  scriptshifterUrl: withSlash(import.meta.env.VITE_SCRIPTSHIFTER_URL || 'https://bibframe.org/scriptshifter/'),
}

function withSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`
}
