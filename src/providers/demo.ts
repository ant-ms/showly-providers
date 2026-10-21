import type {
  MediaType,
  ProviderEpisodeList,
  ProviderSearchResult,
  StreamSource,
} from "../types.js";
import { AbstractProvider, type ProviderOptions } from "./base.js";
import { DEFAULT_USER_AGENT } from "../utils/headers.js";

export const DEMO_STREAMS = {
  bigBuckBunny: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
  sintel:
    "https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8",
  tearsOfSteel:
    "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8",
};

export class DemoProvider extends AbstractProvider {
  readonly id = "demo";
  readonly name = "DemoStream";

  constructor(options?: ProviderOptions) {
    super(options);
  }

  async search(
    query: string,
    mediaType?: MediaType,
  ): Promise<ProviderSearchResult[]> {
    const cleanQuery = this.sanitizeQuery(query);
    if (!cleanQuery) return [];

    const isTv = mediaType === "tv";

    return [
      {
        identifier: `demo:${isTv ? "tv" : "movie"}:${encodeURIComponent(cleanQuery.toLowerCase())}`,
        name: cleanQuery,
        mediaType: isTv ? "tv" : "movie",
        year: 2024,
        quality: "1080p",
        seasonCount: isTv ? 3 : undefined,
        episodeCount: isTv ? 10 : undefined,
      },
      {
        identifier: "demo:movie:big-buck-bunny",
        name: "Big Buck Bunny",
        mediaType: "movie",
        year: 2008,
        quality: "1080p",
      },
      {
        identifier: "demo:tv:demo-series",
        name: "Demo TV Series",
        mediaType: "tv",
        year: 2023,
        quality: "1080p",
        seasonCount: 2,
        episodeCount: 12,
      },
    ];
  }

  async getEpisodes(
    _identifier: string,
    _season: number = 1,
  ): Promise<ProviderEpisodeList> {
    return {
      episodes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      seasons: [1, 2, 3],
      servers: [
        { id: "demo-cdn", name: "Demo CDN" },
        { id: "demo-backup", name: "Demo Backup HLS" },
      ],
    };
  }

  async getStream(
    _identifier: string,
    _episode: number = 1,
    _season: number = 1,
    server: string = "demo-cdn",
  ): Promise<StreamSource | null> {
    const streamUrl =
      server === "demo-backup"
        ? DEMO_STREAMS.sintel
        : DEMO_STREAMS.bigBuckBunny;

    return {
      url: streamUrl,
      container: "hls",
      quality: "1080p",
      resolution: 1080,
      serverName: server === "demo-backup" ? "Demo Backup HLS" : "Demo CDN",
      headers: {
        "User-Agent": DEFAULT_USER_AGENT,
      },
      subtitles: [
        {
          label: "English",
          language: "en",
          url: "https://test-streams.mux.dev/x36xhzz/subs/en.vtt",
          default: true,
        },
        {
          label: "Spanish",
          language: "es",
          url: "https://test-streams.mux.dev/x36xhzz/subs/es.vtt",
          default: false,
        },
      ],
    };
  }
}
