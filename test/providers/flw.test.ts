import { describe, it, expect } from "vitest";
import { MoviesJoyProvider } from "../../src/providers/moviesjoy.js";
import { ZoechipProvider } from "../../src/providers/zoechip.js";
import { HiMoviesProvider } from "../../src/providers/himovies.js";

const SAMPLE_SEARCH_HTML = `
<div class="flw-item">
  <div class="film-poster">
    <div class="pick film-poster-quality">HD</div>
    <img src="https://wsrv.nl/?url=poster.jpg" />
    <a href="/movie/oppenheimer-X00dkfabo5E4" title="Oppenheimer"></a>
  </div>
  <div class="film-detail">
    <h3 class="film-name"><a href="/movie/oppenheimer-X00dkfabo5E4" title="Oppenheimer">Oppenheimer</a></h3>
    <div class="fd-infor">
      <span class="fdi-item">2023</span>
      <span class="float-right fdi-type">Movie</span>
    </div>
  </div>
</div>
<div class="flw-item">
  <div class="film-poster">
    <div class="pick film-poster-quality">HD</div>
    <img src="https://wsrv.nl/?url=poster2.jpg" />
    <a href="/tv/breaking-bad-Mw5SAl3nLb" title="Breaking Bad"></a>
  </div>
  <div class="film-detail">
    <h3 class="film-name"><a href="/tv/breaking-bad-Mw5SAl3nLb" title="Breaking Bad">Breaking Bad</a></h3>
    <div class="fd-infor">
      <span class="fdi-item">2008</span>
      <span class="float-right fdi-type">TV</span>
    </div>
  </div>
</div>
`;

const SAMPLE_MOVIE_SERVERS_HTML = `
<ul class="nav">
  <li class="nav-item">
    <a data-id="upcloud_1" class="link-item" title="Server UpCloud"><span>UpCloud</span></a>
  </li>
  <li class="nav-item">
    <a data-id="mega_2" class="link-item" title="Server MegaCloud"><span>MegaCloud</span></a>
  </li>
</ul>
`;

const SAMPLE_SEASONS_HTML = `
<div class="dropdown-menu">
  <a data-id="ss_1" class="ss-item">Season 1</a>
  <a data-id="ss_2" class="ss-item">Season 2</a>
</div>
`;

const SAMPLE_EPISODES_HTML = `
<ul class="nav">
  <li><a data-id="ep_1" class="eps-item">Eps 1: Pilot</a></li>
  <li><a data-id="ep_2" class="eps-item">Eps 2: Cat's in the Bag</a></li>
</ul>
`;

const SAMPLE_TV_SERVERS_HTML = `
<ul class="nav">
  <li><a data-id="mega_tv_1" class="link-item">MegaCloud</a></li>
</ul>
`;

describe("FLW CMS Providers (MoviesJoy, Zoechip, HiMovies)", () => {
  const mockFetch: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes("/search/")) {
      return new Response(SAMPLE_SEARCH_HTML, { status: 200 });
    }
    if (url.includes("/ajax/episode/list/")) {
      return new Response(SAMPLE_MOVIE_SERVERS_HTML, { status: 200 });
    }
    if (url.includes("/ajax/season/list/")) {
      return new Response(SAMPLE_SEASONS_HTML, { status: 200 });
    }
    if (url.includes("/ajax/season/episodes/")) {
      return new Response(SAMPLE_EPISODES_HTML, { status: 200 });
    }
    if (url.includes("/ajax/episode/servers/")) {
      return new Response(SAMPLE_TV_SERVERS_HTML, { status: 200 });
    }
    if (url.includes("/ajax/episode/sources/")) {
      return new Response(
        JSON.stringify({ link: "https://vidfast.vc/movie/872585" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("Not found", { status: 404 });
  };

  it("MoviesJoy provider parses search and resolves movie stream", async () => {
    const provider = new MoviesJoyProvider({ fetchFn: mockFetch });
    expect(provider.id).toBe("moviesjoy");

    const results = await provider.search("Oppenheimer");
    expect(results).toHaveLength(2);
    expect(results[0].name).toBe("Oppenheimer");
    expect(results[0].mediaType).toBe("movie");
    expect(results[0].year).toBe(2023);

    const stream = await provider.getStream(
      "movie/oppenheimer-X00dkfabo5E4",
      1,
      1,
      "MegaCloud",
    );
    expect(stream).toBeDefined();
    expect(stream?.url).toBe("https://vidfast.vc/movie/872585");
    expect(stream?.serverName).toBe("MegaCloud");
  });

  it("Zoechip provider parses TV episodes and servers", async () => {
    const provider = new ZoechipProvider({ fetchFn: mockFetch });
    expect(provider.id).toBe("zoechip");

    const epData = await provider.getEpisodes("tv/breaking-bad-Mw5SAl3nLb", 1);
    expect(epData.seasons).toEqual([1, 2]);
    expect(epData.episodes).toEqual([1, 2]);
    expect(epData.servers[0].name).toBe("MegaCloud");
  });

  it("HiMovies provider resolves TV show stream", async () => {
    const provider = new HiMoviesProvider({ fetchFn: mockFetch });
    expect(provider.id).toBe("himovies");

    const stream = await provider.getStream("tv/breaking-bad-Mw5SAl3nLb", 1, 1);
    expect(stream).toBeDefined();
    expect(stream?.url).toBe("https://vidfast.vc/movie/872585");
  });
});
