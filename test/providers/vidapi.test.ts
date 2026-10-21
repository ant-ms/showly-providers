import { describe, it, expect } from "vitest";
import { VidApiProvider } from "../../src/providers/vidapi.js";

describe("VidApiProvider", () => {
  it("searches and parses TMDB movies and shows", async () => {
    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/api/search")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                tmdbId: 19995,
                type: "movie",
                title: "Avatar",
                releaseDate: "2009-12-16",
                posterPath: "/avatar.jpg",
              },
              {
                tmdbId: 284833,
                type: "show",
                title: "Avatar: Seven Havens",
                firstAirDate: "2026-10-09",
                posterPath: "/ash.jpg",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("Not found", { status: 404 });
    };

    const provider = new VidApiProvider({ fetchFn: mockFetch });
    const results = await provider.search("Avatar");

    expect(results).toHaveLength(2);
    expect(results[0].name).toBe("Avatar");
    expect(results[0].mediaType).toBe("movie");
    expect(results[0].identifier).toBe("movie:19995");
    expect(results[1].name).toBe("Avatar: Seven Havens");
    expect(results[1].mediaType).toBe("tv");
    expect(results[1].identifier).toBe("tv:284833");
  });

  it("handles direct TMDB and IMDb identifier search directly", async () => {
    const provider = new VidApiProvider();
    const res1 = await provider.search("tv:284833");
    expect(res1).toHaveLength(1);
    expect(res1[0].identifier).toBe("tv:284833");

    const res2 = await provider.search("imdb:tt35854736");
    expect(res2).toHaveLength(1);
    expect(res2[0].identifier).toBe("imdb:tt35854736");
  });

  it("fetches servers list in getEpisodes", async () => {
    const provider = new VidApiProvider();
    const epData = await provider.getEpisodes("tv:284833", 1);
    expect(epData.episodes.length).toBeGreaterThanOrEqual(50);
    expect(epData.servers).toEqual([
      { id: "vidapi-primary", name: "VidApi · 1080p" },
      { id: "vidapi-backup", name: "VidApi Backup · 1080p" },
    ]);
  });

  it("resolves stream and subtitles from api.php", async () => {
    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("api.php")) {
        return new Response(
          JSON.stringify({
            status_code: "200",
            data: {
              title: "Avatar: Seven Havens 2026",
              imdb_id: "tt35854736",
              stream_urls: [
                "https://engine.site/pl/1/master.m3u8",
                "https://engine.site/pl/2/master.m3u8",
              ],
            },
            default_subs: [
              {
                lang: "English-SDH",
                code: "en",
                url: "https://vidapi.cloud/subs/en.srt",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("Not found", { status: 404 });
    };

    const provider = new VidApiProvider({ fetchFn: mockFetch });
    const stream = await provider.getStream(
      "tv:284833",
      1,
      1,
      "vidapi-primary",
    );

    expect(stream).toBeDefined();
    expect(stream?.url).toBe("https://engine.site/pl/1/master.m3u8");
    expect(stream?.container).toBe("hls");
    expect(stream?.serverName).toBe("VidApi · 1080p");
    expect(stream?.subtitles).toHaveLength(1);
    expect(stream?.subtitles?.[0].language).toBe("en");

    // Backup server
    const backupStream = await provider.getStream(
      "tv:284833",
      1,
      1,
      "vidapi-backup",
    );
    expect(backupStream?.url).toBe("https://engine.site/pl/2/master.m3u8");
    expect(backupStream?.serverName).toBe("VidApi Backup · 1080p");
  });

  it("returns null if stream is not found", async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(JSON.stringify({ status_code: "404" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const provider = new VidApiProvider({ fetchFn: mockFetch });
    const stream = await provider.getStream("movie:99999999");
    expect(stream).toBeNull();
  });
});
