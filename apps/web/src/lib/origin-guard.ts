/** CSRF mitigation for state-changing requests: origin header must match the request's own host. */
export function isSameOrigin(request: Request) {
  const host = request.headers.get("host");
  const origin = request.headers.get("origin");
  if (!host || !origin) return false;
  return origin === `${new URL(request.url).protocol}//${host}`;
}
