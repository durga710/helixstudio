/** Cookie carrying the user's own Anthropic API key (BYOK).
 * httpOnly + secure; read transiently per request, never persisted server-side. */
export const BYOK_COOKIE = "helix_anthropic_key";
