import type {
  MediaType,
  ProviderEpisodeList,
  ProviderSearchResult,
  StreamSource,
} from "../types.js";
import { AbstractProvider, type ProviderOptions } from "./base.js";
import { BoundedCache } from "../utils/cache.js";
import { getDefaultHeaders } from "../utils/headers.js";
import { parseSubtitles, type RawSubtitle } from "../utils/subtitles.js";

const BASE_URL = "https://novahd.cc";

interface NovaSearchResultItem {
  tmdbId: number;
  type: "movie" | "show" | string;
  title: string;
  overview?: string;
  posterPath?: string | null;
  releaseDate?: string | null;
  firstAirDate?: string | null;
}

interface NovaSearchResponse {
  results?: NovaSearchResultItem[];
}

interface NovaSourceItem {
  url: string;
  quality?: string;
  type?: "hls" | "mp4" | string;
  provider?: string;
  name?: string;
  headers?: Record<string, string>;
}

interface NovaSourcesResponse {
  sources?: NovaSourceItem[];
  subtitles?: RawSubtitle[];
}

interface NovaShowDetails {
  tmdbId: number;
  seasons?: Array<{
    seasonNumber: number;
    episodeCount: number;
    episodes?: Array<{ episodeNumber: number; title: string }>;
  }>;
}

export class NovaProvider extends AbstractProvider {
  readonly id = "nova";
  readonly name = "NovaHD";

  private searchCache = new BoundedCache<string, ProviderSearchResult[]>({
    maxSize: 300,
    ttlMs: 15 * 60 * 1000,
  });

  private showCache = new BoundedCache<string, NovaShowDetails>({
    maxSize: 200,
    ttlMs: 30 * 60 * 1000,
  });

  constructor(options?: ProviderOptions) {
    super(options);
  }

  async search(
    query: string,
    mediaType?: MediaType,
  ): Promise<ProviderSearchResult[]> {
    const cleanQuery = this.sanitizeQuery(query);
    if (!cleanQuery) return [];

    const cacheKey = `${cleanQuery}:${mediaType || "all"}`.toLowerCase();
    const cached = this.searchCache.get(cacheKey);
    if (cached) return cached;

    const data = await this.fetchJson<NovaSearchResponse>(
      `${BASE_URL}/api/search?search=${encodeURIComponent(cleanQuery)}&page=1`,
      {
        headers: getDefaultHeaders({
          Referer: `${BASE_URL}/`,
          Origin: BASE_URL,
        }),
      },
    );

    const rawResults = data?.results || [];
    const results: ProviderSearchResult[] = [];

    for (const item of rawResults) {
      const isShow = item.type === "show";
      const itemMediaType: MediaType = isShow ? "tv" : "movie";

      if (mediaType && mediaType !== itemMediaType) {
        continue;
      }

      const dateStr = item.releaseDate || item.firstAirDate;
      const year = dateStr ? parseInt(dateStr.slice(0, 4), 10) : undefined;
      const poster = item.posterPath
        ? `https://image.tmdb.org/t/p/w342${item.posterPath}`
        : undefined;

      results.push({
        identifier: `${itemMediaType}:${item.tmdbId}`,
        name: item.title,
        mediaType: itemMediaType,
        year: isNaN(year!) ? undefined : year,
        poster,
        quality: "1080p",
      });
    }

    this.searchCache.set(cacheKey, results);
    return results;
  }

  async getEpisodes(
    identifier: string,
    season: number = 1,
  ): Promise<ProviderEpisodeList> {
    const parts = identifier.split(":");
    const tmdbId = parts.length > 1 ? parts[1] : parts[0];

    let show = this.showCache.get(tmdbId);
    if (!show) {
      const fetched = await this.fetchJson<NovaShowDetails>(
        `${BASE_URL}/api/shows/${tmdbId}`,
        {
          headers: getDefaultHeaders({
            Referer: `${BASE_URL}/`,
            Origin: BASE_URL,
          }),
        },
      );
      if (fetched) {
        show = fetched;
        this.showCache.set(tmdbId, fetched);
      }
    }

    const seasons = show?.seasons?.map((s) => s.seasonNumber) || [1];
    const targetSeason = show?.seasons?.find((s) => s.seasonNumber === season);
    const episodes = targetSeason?.episodes?.map((e) => e.episodeNumber) || [1];

    return {
      episodes,
      seasons,
      servers: [
        { id: "falcon", name: "Falcon · 1080p" },
        { id: "nova-hls", name: "NovaHD HLS" },
      ],
    };
  }

  async getStream(
    identifier: string,
    episode: number = 1,
    season: number = 1,
    server?: string,
  ): Promise<StreamSource | null> {
    const parts = identifier.split(":");
    let mediaType: MediaType = "movie";
    let tmdbId = identifier;

    if (parts.length > 1) {
      mediaType = parts[0] === "tv" || parts[0] === "show" ? "tv" : "movie";
      tmdbId = parts[1];
    }

    const isTv = mediaType === "tv";
    const typeParam = isTv ? "show" : "movie";
    let url = `${BASE_URL}/api/sources?type=${typeParam}&tmdbId=${tmdbId}`;
    if (isTv) {
      url += `&season=${season}&episode=${episode}`;
    }

    const data = await this.fetchJson<NovaSourcesResponse>(url, {
      headers: getDefaultHeaders({
        Referer: `${BASE_URL}/`,
        Origin: BASE_URL,
      }),
    });

    if (!data?.sources || data.sources.length === 0) {
      return null;
    }

    let selected = data.sources[0];
    if (server) {
      const match = data.sources.find(
        (s) =>
          s.provider?.toLowerCase() === server.toLowerCase() ||
          s.name?.toLowerCase().includes(server.toLowerCase()),
      );
      if (match) selected = match;
    }

    const container: "hls" | "mp4" =
      selected.type === "hls" || selected.url.includes(".m3u8") ? "hls" : "mp4";

    const quality = selected.quality || "1080p";
    const resolution = parseInt(quality.replace(/[^0-9]/g, ""), 10) || 1080;
    const subtitles = parseSubtitles(data.subtitles);

    return {
      url: selected.url,
      container,
      quality,
      resolution,
      serverName: selected.name || selected.provider || "Falcon · 1080p",
      headers: {
        ...getDefaultHeaders(),
        ...(selected.headers || {}),
      },
      subtitles,
    };
  }
}
