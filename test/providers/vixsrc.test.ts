import { describe, it, expect } from "vitest";
import {
  VixSrcProvider,
  resolveVixSrcStream,
} from "../../src/providers/vixsrc.js";

describe("VixSrcProvider", () => {
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
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("Not found", { status: 404 });
    };

    const provider = new VixSrcProvider({ fetchFn: mockFetch });
    const results = await provider.search("Avatar");

    expect(results).toHaveLength(1);
    expect(results[0].identifier).toBe("movie:19995");
  });

  it("resolves stream by extracting token and master playlist", async () => {
    const mockHtml = `
      <html>
        <script>
          window.masterPlaylist = {
            params: {
              token: 'test_token_123',
              expires: '1799999999',
            },
            url: 'https://vixsrc.to/playlist/262404'
          };
        </script>
      </html>
    `;

    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/api/movie/19995")) {
        return new Response(JSON.stringify({ src: "/embed/262404" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/embed/262404")) {
        return new Response(mockHtml, {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      return new Response("Not found", { status: 404 });
    };

    const provider = new VixSrcProvider({ fetchFn: mockFetch });
    const stream = await provider.getStream("movie:19995");

    expect(stream).toBeDefined();
    expect(stream?.url).toContain("https://vixsrc.to/playlist/262404");
    expect(stream?.url).toContain("token=test_token_123");
    expect(stream?.url).toContain("expires=1799999999");
    expect(stream?.url).toContain("h=1");
    expect(stream?.serverName).toBe("VixCloud · 1080p");
    expect(stream?.headers?.Referer).toBe("https://vixsrc.to/");
  });

  it("resolveVixSrcStream helper parses embed URLs directly", async () => {
    const mockHtml = `
      window.masterPlaylist = {
        params: {
          token: "abc_token",
          expires: "1800000000",
        },
        url: "https:\\/\\/vixsrc.to\\/playlist\\/793535"
      };
    `;

    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/api/tv/284833/1/1")) {
        return new Response(JSON.stringify({ src: "/embed/793535" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/embed/793535")) {
        return new Response(mockHtml, {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      return new Response("Not found", { status: 404 });
    };

    const stream = await resolveVixSrcStream(
      "https://vixsrc.to/tv/284833/1/1",
      mockFetch,
    );
    expect(stream).toBeDefined();
    expect(stream?.url).toBe(
      "https://vixsrc.to/playlist/793535?token=abc_token&expires=1800000000&h=1",
    );
  });
});
