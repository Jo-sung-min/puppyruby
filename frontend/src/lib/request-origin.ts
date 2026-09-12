type OriginRequest = {
  headers: Pick<Headers, "get">;
  nextUrl: Pick<URL, "host" | "protocol">;
};

export function requestOrigin(request: OriginRequest): string {
  // NextURL normalizes loopback IPs to localhost. Host retains the browser's
  // actual destination, so distinct origins and their cookies stay distinct.
  const host = request.headers.get("host") || request.nextUrl.host;
  if (!host || /[\s/@\\?#,]/.test(host)) throw new Error("Invalid request host");
  const protocol = request.nextUrl.protocol;
  if (protocol !== "http:" && protocol !== "https:") throw new Error("Invalid request protocol");
  const origin = new URL(`${protocol}//${host}`);
  if (origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw new Error("Invalid request host");
  return origin.origin;
}

export function isSameOrigin(request: OriginRequest, requireOrigin = false): boolean {
  try {
    if (request.headers.get("sec-fetch-site") === "cross-site") return false;
    const origin = request.headers.get("origin");
    if (!origin) return !requireOrigin;
    const supplied = new URL(origin);
    return supplied.origin === origin && supplied.origin === requestOrigin(request);
  } catch { return false; }
}
