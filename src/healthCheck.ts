import { Parser } from "m3u8-parser";
import type { StreamSource } from "./types.js";
import { getLogger } from "./utils/logger.js";
import { DEFAULT_USER_AGENT } from "./utils/headers.js";

export interface ProbeOptions {
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

function parseM3u8Manifest(text: string) {
  const parser = new Parser();
  parser.push(text);
  parser.end();
  return parser.manifest;
}

/**
 * Probes the health of a stream source.
 * Verifies that the master playlist or MP4 header is reachable, returns 200/206,
 * and if HLS, verifies that variant playlists and initial media segments can be downloaded.
 */
export async function probeStreamHealth(
  streamSource: StreamSource,
  optionsOrTimeout: number | ProbeOptions = 3000,
): Promise<boolean> {
  if (!streamSource?.url) return false;

  const log = getLogger();
  const options: ProbeOptions =
    typeof optionsOrTimeout === "number"
      ? { timeoutMs: optionsOrTimeout }
      : optionsOrTimeout;

  const timeoutMs = options.timeoutMs ?? 3000;
  const customFetch = options.fetchFn ?? globalThis.fetch;

  const headers: Record<string, string> = {
    "User-Agent": DEFAULT_USER_AGENT,
    ...(streamSource.headers || {}),
  };

  try {
    const res = await customFetch(streamSource.url, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      log.debug(
        { status: res.status, url: streamSource.url },
        "Stream probe master request failed",
      );
      return false;
    }

    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("text/html")) {
      log.debug(
        { contentType, url: streamSource.url },
        "Stream probe returned HTML page instead of playable media",
      );
      return false;
    }

    const isM3U8 =
      streamSource.container === "hls" ||
      contentType.includes("mpegurl") ||
      contentType.includes("application/x-mpegurl") ||
      streamSource.url.includes(".m3u8");

    if (isM3U8) {
      const text = await res.text();
      const manifest = parseM3u8Manifest(text);

      if (manifest.playlists && manifest.playlists.length > 0) {
        const variantUri = manifest.playlists[0]?.uri;
        if (!variantUri) return false;

        const mediaUrl = new URL(variantUri, streamSource.url).toString();
        const variantRes = await customFetch(mediaUrl, {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(Math.min(timeoutMs, 2000)),
        });

        if (!variantRes.ok) {
          log.debug(
            { status: variantRes.status, mediaUrl },
            "Variant playlist probe failed",
          );
          return false;
        }

        const variantText = await variantRes.text();
        return await probeSegmentChunk(
          variantText,
          mediaUrl,
          headers,
          timeoutMs,
          customFetch,
        );
      } else {
        return await probeSegmentChunk(
          text,
          streamSource.url,
          headers,
          timeoutMs,
          customFetch,
        );
      }
    } else {
      // Direct MP4 / binary stream probe
      const probeRes = await customFetch(streamSource.url, {
        method: "GET",
        headers: {
          ...headers,
          Range: "bytes=0-4096",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!probeRes.ok && probeRes.status !== 206) return false;
      const probeContentType = (
        probeRes.headers.get("content-type") || ""
      ).toLowerCase();
      if (probeContentType.includes("text/html")) return false;
      const buf = await probeRes.arrayBuffer();
      return buf.byteLength > 0;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.debug(
      { err: message, url: streamSource.url },
      "Probe stream health exception",
    );
    return false;
  }
}

async function probeSegmentChunk(
  playlistText: string,
  baseUrl: string,
  headers: Record<string, string>,
  timeoutMs: number,
  customFetch: typeof fetch,
): Promise<boolean> {
  const log = getLogger();
  const manifest = parseM3u8Manifest(playlistText);
  const firstSegUri =
    manifest.segments?.[0]?.uri ||
    playlistText
      .split("\n")
      .find((l) => {
        const t = l.trim();
        return t.length > 0 && !t.startsWith("#");
      })
      ?.trim();

  if (!firstSegUri) {
    log.debug({ baseUrl }, "No media segment found in playlist");
    // If it's a valid empty manifest or live window without segments yet, fallback to true if header was 200
    return playlistText.includes("#EXTM3U");
  }

  const segUrl = new URL(firstSegUri, baseUrl).toString();

  try {
    const segRes = await customFetch(segUrl, {
      method: "GET",
      headers: {
        ...headers,
        Range: "bytes=0-4096",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (segRes.status < 200 || segRes.status >= 400) {
      log.debug(
        { status: segRes.status, segUrl },
        "Segment probe returned non-2xx status",
      );
      return false;
    }

    const chunk = await segRes.arrayBuffer();
    return chunk.byteLength > 0;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.debug({ err: message, segUrl }, "Segment probe timed out or stalled");
    return false;
  }
}
