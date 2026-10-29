/** Where Blue Core and its Keycloak live, from VITE_* variables (see .env). */
const bluecoreUrl = withSlash(import.meta.env.VITE_BLUECORE_URL)

export const config = {
  bluecoreUrl,
  keycloakUrl: withSlash(import.meta.env.VITE_KEYCLOAK_URL),
  keycloakRealm: 'bluecore',
  keycloakClientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID,
  /** QA, for authority lookups: Sinopia's proxy beside Blue Core, unless VITE_QA_URL says otherwise. */
  qaUrl: withSlash(import.meta.env.VITE_QA_URL || `${bluecoreUrl}api/qa/`),
}

function withSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`
}
