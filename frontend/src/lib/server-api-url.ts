const DEFAULT_API_ORIGIN = "http://127.0.0.1:8080";
const SUPPORTED_BASE_PATHS = new Set(["", "/api", "/api/v1"]);

function configurationError() {
  return new Error("API_URL은 AWS 백엔드 원본 주소여야 합니다. 예: https://api.example.com");
}

/**
 * Turns the Vercel server-side API_URL into the Spring API base.
 *
 * The deployment setting intentionally accepts an origin-only URL because that
 * is what Elastic Beanstalk exposes. Older `/api` and `/api/v1` values remain
 * compatible, but arbitrary paths are rejected so a typo cannot be forwarded
 * to an unrelated upstream endpoint.
 */
export function normalizeBackendApiBase(configuredUrl?: string) {
  const configured = configuredUrl?.trim() || DEFAULT_API_ORIGIN;
  let url: URL;

  try {
    url = new URL(configured);
  } catch {
    throw configurationError();
  }

  if (
    !["http:", "https:"].includes(url.protocol)
    || url.username
    || url.password
    || url.search
    || url.hash
  ) {
    throw configurationError();
  }

  const configuredPath = url.pathname.replace(/\/+$/, "");
  if (!SUPPORTED_BASE_PATHS.has(configuredPath)) throw configurationError();

  return `${url.origin}/api/v1`;
}
