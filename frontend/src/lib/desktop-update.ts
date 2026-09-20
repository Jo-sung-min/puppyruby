import publishedRelease from "./generated/desktop-update-release.json";

export type DesktopUpdateRelease = {
  schemaVersion: 1;
  version: string;
  release: string;
  publishedAt: string;
  notes: string;
  installer: { url: string; sha256: string; size: number };
};

const maxInstallerBytes = 200 * 1024 * 1024;
export const desktopUpdatePointerUrl = "https://cdn.puppyruby.com/site-downloads/latest-desktop-update.json";
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Only verified, immutable public installer metadata is exposed to Windows clients. */
export function readDesktopUpdateRelease(value: unknown = publishedRelease): DesktopUpdateRelease | null {
  if (!object(value) || value.schemaVersion !== 1 || typeof value.version !== "string"
    || !/^(?:0|[1-9]\d{0,4})(?:\.(?:0|[1-9]\d{0,4})){3}$/.test(value.version)
    || value.version.split(".").some(part => Number(part) > 65535)
    || typeof value.release !== "string" || !/^[a-f0-9]{16}$/.test(value.release)
    || typeof value.publishedAt !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(value.publishedAt)
    || !Number.isFinite(Date.parse(value.publishedAt))
    || typeof value.notes !== "string" || value.notes.length > 500 || /[\u0000-\u001f\u007f<>]/.test(value.notes)
    || !object(value.installer)) return null;
  const { installer } = value;
  if (installer.url !== `https://cdn.puppyruby.com/site-downloads/${value.release}/downloads/PuppyRuby-Setup.exe`
    || typeof installer.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(installer.sha256)
    || typeof installer.size !== "number" || !Number.isSafeInteger(installer.size)
    || installer.size < 1 || installer.size > maxInstallerBytes) return null;
  return {
    schemaVersion: 1, version: value.version, release: value.release,
    // .NET Framework DateTimeOffset accepts at most seven fractional digits;
    // normalize earlier Java nanosecond timestamps to the shared millisecond format.
    publishedAt: new Date(value.publishedAt).toISOString(), notes: value.notes,
    installer: { url: installer.url, sha256: installer.sha256, size: installer.size },
  };
}

export function compareDesktopVersions(left: string, right: string): number {
  const a = left.split(".").map(Number), b = right.split(".").map(Number);
  for (let index = 0; index < 4; index++) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

/** Never let an older or conflicting mutable pointer replace the verified build-time fallback. */
export function preferredDesktopUpdateRelease(remoteValue: unknown, bundledValue: unknown = publishedRelease): DesktopUpdateRelease | null {
  const remote = readDesktopUpdateRelease(remoteValue), bundled = readDesktopUpdateRelease(bundledValue);
  if (!remote) return bundled;
  if (!bundled) return remote;
  const order = compareDesktopVersions(remote.version, bundled.version);
  const samePayload = remote.release === bundled.release && remote.notes === bundled.notes
    && remote.installer.url === bundled.installer.url && remote.installer.sha256 === bundled.installer.sha256
    && remote.installer.size === bundled.installer.size;
  return order > 0 || (order === 0 && samePayload) ? remote : bundled;
}

export function desktopUpdateResponse(value: unknown = publishedRelease): Response {
  const release = readDesktopUpdateRelease(value);
  return Response.json(release ?? { message: "업데이트 정보를 준비하고 있어요." }, {
    status: release ? 200 : 503,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "CDN-Cache-Control": "no-store",
      "Vercel-CDN-Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Resolve the mutable CDN pointer at request time, with the bundled verified release as an outage fallback. */
export async function latestDesktopUpdateRelease(): Promise<DesktopUpdateRelease | null> {
  const bundled = readDesktopUpdateRelease(publishedRelease);
  try {
    const response = await fetch(desktopUpdatePointerUrl, {
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000),
      headers: { Accept: "application/json" },
    });
    const declared = Number(response.headers.get("content-length"));
    if (!response.ok || (Number.isFinite(declared) && declared > 16 * 1024)) throw new Error("Invalid update pointer");
    const text = await response.text();
    if (text.length > 16 * 1024) throw new Error("Invalid update pointer");
    return preferredDesktopUpdateRelease(JSON.parse(text), bundled);
  } catch { /* The bundled manifest keeps downloads and existing clients available during a CDN outage. */ }
  return bundled;
}
