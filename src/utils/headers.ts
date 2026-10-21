export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export function getDefaultHeaders(
  extra?: Record<string, string>,
): Record<string, string> {
  return {
    "User-Agent": DEFAULT_USER_AGENT,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    ...(extra || {}),
  };
}

export function getRefererHeaders(
  referer: string,
  extra?: Record<string, string>,
): Record<string, string> {
  let origin = "";
  try {
    const parsed = new URL(referer);
    origin = parsed.origin;
  } catch {}

  return getDefaultHeaders({
    Referer: referer,
    ...(origin ? { Origin: origin } : {}),
    ...(extra || {}),
  });
}
