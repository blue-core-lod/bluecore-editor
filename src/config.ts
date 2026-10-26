/** Where Blue Core and its Keycloak live, from VITE_* variables (see .env). */
export const config = {
  bluecoreUrl: withSlash(import.meta.env.VITE_BLUECORE_URL),
  keycloakUrl: withSlash(import.meta.env.VITE_KEYCLOAK_URL),
  keycloakRealm: 'bluecore',
  keycloakClientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID,
}

function withSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`
}
