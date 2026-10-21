import { describe, it, expect } from "vitest";
import { NovaProvider } from "../../src/providers/nova.js";

describe("NovaProvider", () => {
  it("searches and parses TMDB movies and shows", async () => {
    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/api/search")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                tmdbId: 872585,
                type: "movie",
                title: "Oppenheimer",
                releaseDate: "2023-07-19",
                posterPath: "/poster.jpg",
              },
              {
                tmdbId: 1396,
                type: "show",
                title: "Breaking Bad",
                firstAirDate: "2008-01-20",
                posterPath: "/bb.jpg",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("Not found", { status: 404 });
    };

    const provider = new NovaProvider({ fetchFn: mockFetch });
    const results = await provider.search("Oppenheimer");

    expect(results).toHaveLength(2);
    expect(results[0].name).toBe("Oppenheimer");
    expect(results[0].mediaType).toBe("movie");
    expect(results[0].year).toBe(2023);
    expect(results[0].identifier).toBe("movie:872585");
    expect(results[0].poster).toContain("image.tmdb.org");

    expect(results[1].name).toBe("Breaking Bad");
    expect(results[1].mediaType).toBe("tv");
    expect(results[1].year).toBe(2008);
  });

  it("fetches episodes and seasons for TV show", async () => {
    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/api/shows/1396")) {
        return new Response(
          JSON.stringify({
            tmdbId: 1396,
            seasons: [
              {
                seasonNumber: 1,
                episodeCount: 7,
                episodes: [{ episodeNumber: 1, title: "Pilot" }, { episodeNumber: 2, title: "Cats in the Bag" }],
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("Not found", { status: 404 });
    };

    const provider = new NovaProvider({ fetchFn: mockFetch });
    const epData = await provider.getEpisodes("tv:1396", 1);

    expect(epData.seasons).toContain(1);
    expect(epData.episodes).toEqual([1, 2]);
    expect(epData.servers.some((s) => s.id === "falcon")).toBe(true);
  });

  it("resolves stream and parses subtitles", async () => {
    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/api/sources")) {
        return new Response(
          JSON.stringify({
            sources: [
              {
                url: "https://novahd.cc/api/hls/index.m3u8?token=xyz",
                quality: "1080p",
                type: "hls",
                provider: "Falcon",
                name: "Falcon · 1080p",
              },
            ],
            subtitles: [
              {
                url: "https://novahd.cc/subs/en.vtt",
                lang: "English",
                default: true,
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("Not found", { status: 404 });
    };

    const provider = new NovaProvider({ fetchFn: mockFetch });
    const stream = await provider.getStream("movie:872585", 1, 1, "Falcon");

    expect(stream).toBeDefined();
    expect(stream?.url).toContain("index.m3u8");
    expect(stream?.container).toBe("hls");
    expect(stream?.quality).toBe("1080p");
    expect(stream?.resolution).toBe(1080);
    expect(stream?.subtitles).toHaveLength(1);
    expect(stream?.subtitles?.[0].language).toBe("en");
  });
});
