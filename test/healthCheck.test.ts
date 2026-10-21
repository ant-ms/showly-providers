import { describe, it, expect } from "vitest";
import { probeStreamHealth } from "../src/healthCheck.js";

describe("healthCheck", () => {
  it("returns false for empty stream source", async () => {
    expect(await probeStreamHealth({ url: "" })).toBe(false);
  });

  it("successfully probes HLS master -> variant -> media chunk", async () => {
    const masterM3u8 = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
variant.m3u8`;

    const variantM3u8 = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:4
#EXTINF:4.000,
segment_0.ts`;

    const dummyChunk = new Uint8Array([0x47, 0x40, 0x00, 0x10]).buffer;

    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("master.m3u8")) {
        return new Response(masterM3u8, {
          status: 200,
          headers: { "content-type": "application/vnd.apple.mpegurl" },
        });
      }
      if (url.endsWith("variant.m3u8")) {
        return new Response(variantM3u8, {
          status: 200,
          headers: { "content-type": "application/vnd.apple.mpegurl" },
        });
      }
      if (url.endsWith("segment_0.ts")) {
        return new Response(dummyChunk, {
          status: 206,
          headers: { "content-type": "video/mp2t" },
        });
      }
      return new Response("Not found", { status: 404 });
    };

    const isHealthy = await probeStreamHealth(
      { url: "https://stream.org/master.m3u8", container: "hls" },
      { fetchFn: mockFetch, timeoutMs: 1000 },
    );

    expect(isHealthy).toBe(true);
  });

  it("successfully probes direct MP4 video with range byte request", async () => {
    const dummyBuffer = new Uint8Array(4096).buffer;

    const mockFetch: typeof fetch = async (input, init) => {
      const headers = init?.headers as Record<string, string> | undefined;
      if (headers?.Range === "bytes=0-4096") {
        return new Response(dummyBuffer, {
          status: 206,
          headers: { "content-type": "video/mp4" },
        });
      }
      return new Response("OK", { status: 200 });
    };

    const isHealthy = await probeStreamHealth(
      { url: "https://video.org/file.mp4", container: "mp4" },
      { fetchFn: mockFetch, timeoutMs: 1000 },
    );

    expect(isHealthy).toBe(true);
  });

  it("returns false when stream fails with 404 or 500", async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response("Server error", { status: 500 });
    };

    const isHealthy = await probeStreamHealth(
      { url: "https://broken.org/video.m3u8", container: "hls" },
      { fetchFn: mockFetch, timeoutMs: 1000 },
    );

    expect(isHealthy).toBe(false);
  });

  it("returns false on network timeout or exception", async () => {
    const mockFetch: typeof fetch = async () => {
      throw new Error("Network timeout");
    };

    const isHealthy = await probeStreamHealth(
      { url: "https://broken.org/video.m3u8" },
      { fetchFn: mockFetch, timeoutMs: 1000 },
    );

    expect(isHealthy).toBe(false);
  });

  it("returns false when stream URL returns an HTML page instead of video (e.g. embed player)", async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response("<!DOCTYPE html><html><body><video></video></body></html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    };

    const isHealthy = await probeStreamHealth(
      { url: "https://vidfast.vc/tv/284833/1/3", container: "mp4" },
      { fetchFn: mockFetch, timeoutMs: 1000 },
    );

    expect(isHealthy).toBe(false);
  });
});
