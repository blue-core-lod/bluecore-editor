/**
 * The context every description the editor reads must name. The editor never
 * processes JSON-LD; it relies on the compact names this context gives
 * (mainTitle, bflc:marcKey), so a document with any other context is refused
 * rather than misread.
 */
export const contextUrl = 'https://bibframe-json.org/v0.1/context/bibframe.jsonld'
