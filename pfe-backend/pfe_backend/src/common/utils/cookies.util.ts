/**
 * Name of the HttpOnly cookie that carries the session JWT.
 * Shared by AuthTokenUtils (writer), AuthGuard and the collaboration gateway
 * (readers) so the name is declared exactly once.
 */
export const AUTH_COOKIE_NAME = 'auth_token';

/**
 * Parse a raw `Cookie` request header into a name -> value map.
 *
 * Splits on the *first* `=` only, so base64 / JSON cookie values that contain
 * `=` survive intact, and tolerates malformed segments instead of throwing.
 */
export function parseCookieHeader(
  header: string | undefined,
): Record<string, string> {
  if (!header) return {};

  const cookies: Record<string, string> = {};

  for (const segment of header.split(';')) {
    const separator = segment.indexOf('=');
    if (separator === -1) continue;

    const name = segment.slice(0, separator).trim();
    if (!name) continue;

    const rawValue = segment.slice(separator + 1).trim();
    try {
      cookies[name] = decodeURIComponent(rawValue);
    } catch {
      // A value that isn't valid percent-encoding is still a usable string.
      cookies[name] = rawValue;
    }
  }

  return cookies;
}

/** Read a single cookie out of a raw `Cookie` header. */
export function readCookie(
  header: string | undefined,
  name: string,
): string | null {
  return parseCookieHeader(header)[name] ?? null;
}
