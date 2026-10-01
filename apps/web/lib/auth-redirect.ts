export function authRedirect(next: string | null, origin: string) {
  const fallback = new URL("/dashboard", origin);
  if (!next || !next.startsWith("/") || /[\\\x00-\x1f\x7f]/.test(next)) return fallback;
  try {
    const destination = new URL(next, origin);
    return destination.origin === origin ? destination : fallback;
  } catch { return fallback; }
}
