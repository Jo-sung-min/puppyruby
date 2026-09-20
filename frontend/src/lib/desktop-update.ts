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
