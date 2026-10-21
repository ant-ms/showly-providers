import type {
  MediaType,
  ProviderEpisodeList,
  ProviderSearchResult,
  StreamSource,
} from "../types.js";
import { AbstractProvider, type ProviderOptions } from "./base.js";
import { BoundedCache } from "../utils/cache.js";
import { getDefaultHeaders } from "../utils/headers.js";

const SEARCH_BASE_URL = "https://novahd.cc";
const API_URL = "https://streamdata.vaplayer.ru/api.php";
const IFRAME_ORIGIN = "https://brightpathsignals.com";

interface VidApiResponse {
  status_code: string;
  data?: {
    title?: string;
    imdb_id?: string;
    season?: string;
    episode?: string;
    file_name?: string;
    backdrop?: string;
    stream_urls?: string[];
  };
  default_subs?: Array<{
    lang: string;
    code: string;
    url: string;
  }>;
  thumbnails_url?: string;
}

interface SearchResponseItem {
  tmdbId: number;
  type: "movie" | "show" | string;
  title: string;
  overview?: string;
  posterPath?: string | null;
  releaseDate?: string | null;
  firstAirDate?: string | null;
}

export class VidApiProvider extends AbstractProvider {
  readonly id = "vidapi";
  readonly name = "VidApi";

  private searchCache = new BoundedCache<string, ProviderSearchResult[]>({
    maxSize: 300,
    ttlMs: 15 * 60 * 1000,
  });

  constructor(options?: ProviderOptions) {
    super(options);
  }

  async search(
    query: string,
    mediaType?: MediaType,
  ): Promise<ProviderSearchResult[]> {
    const trimmed = (query || "").trim();
    if (!trimmed) return [];

    // Direct identifier support (e.g. "tv:284833" or "284833" or "imdb:tt35854736")
    const idMatch = trimmed.match(/^(?:(movie|tv|show):)?(\d+)$/);
    if (idMatch) {
      const explicitType =
        idMatch[1] === "show"
          ? "tv"
          : (idMatch[1] as MediaType) || mediaType || "movie";
      const tmdbId = idMatch[2];
      return [
        {
          identifier: `${explicitType}:${tmdbId}`,
          name: `${explicitType.toUpperCase()} ${tmdbId}`,
          mediaType: explicitType,
          quality: "1080p",
        },
      ];
    }

    if (trimmed.startsWith("imdb:") || trimmed.startsWith("tt")) {
      const imdbId = trimmed.replace(/^imdb:/, "");
      return [
        {
          identifier: `imdb:${imdbId}`,
          name: imdbId,
          mediaType: mediaType || "movie",
          quality: "1080p",
        },
      ];
    }

    const cleanQuery = this.sanitizeQuery(trimmed);
    if (!cleanQuery) return [];

    const cacheKey = `${cleanQuery}:${mediaType || "all"}`.toLowerCase();
    const cached = this.searchCache.get(cacheKey);
    if (cached) return cached;

    const results: ProviderSearchResult[] = [];

    // Try primary TMDB search proxy
    const data = await this.fetchJson<{ results?: SearchResponseItem[] }>(
      `${SEARCH_BASE_URL}/api/search?search=${encodeURIComponent(cleanQuery)}&page=1`,
      {
        headers: getDefaultHeaders({
          Referer: `${SEARCH_BASE_URL}/`,
          Origin: SEARCH_BASE_URL,
        }),
      },
    );

    if (data?.results && data.results.length > 0) {
      for (const item of data.results) {
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
    }

    // Fallback to Cinemeta if primary search yielded nothing
    if (results.length === 0) {
      const cinemetaType = mediaType === "tv" ? "series" : "movie";
      const cinemeta = await this.fetchJson<{
        metas?: Array<{
          id: string;
          name: string;
          type: string;
          releaseInfo?: string;
          poster?: string;
        }>;
      }>(
        `https://v3-cinemeta.strem.io/catalog/${cinemetaType}/top/search=${encodeURIComponent(cleanQuery)}.json`,
        { headers: getDefaultHeaders() },
      );

      if (cinemeta?.metas) {
        for (const meta of cinemeta.metas) {
          const itemMediaType: MediaType =
            meta.type === "series" ? "tv" : "movie";
          const year = meta.releaseInfo
            ? parseInt(meta.releaseInfo.slice(0, 4), 10)
            : undefined;
          results.push({
            identifier: `imdb:${meta.id}`,
            name: meta.name,
            mediaType: itemMediaType,
            year: isNaN(year!) ? undefined : year,
            poster: meta.poster,
            quality: "1080p",
          });
        }
      }
    }

    this.searchCache.set(cacheKey, results);
    return results;
  }

  async getEpisodes(
    _identifier: string,
    _season: number = 1,
  ): Promise<ProviderEpisodeList> {
    return {
      episodes: Array.from({ length: 100 }, (_, i) => i + 1),
      seasons: Array.from({ length: 30 }, (_, i) => i + 1),
      servers: [
        { id: "vidapi-primary", name: "VidApi · 1080p" },
        { id: "vidapi-backup", name: "VidApi Backup · 1080p" },
      ],
    };
  }

  async getStream(
    identifier: string,
    episode: number = 1,
    season: number = 1,
    server?: string,
  ): Promise<StreamSource | null> {
    const isImdb =
      identifier.startsWith("imdb:") || identifier.startsWith("tt");
    let mediaType: MediaType = "movie";
    let idParam = identifier;

    if (isImdb) {
      idParam = identifier.replace(/^imdb:/, "");
    } else {
      const parts = identifier.split(":");
      if (parts.length > 1) {
        mediaType = parts[0] === "tv" || parts[0] === "show" ? "tv" : "movie";
        idParam = parts[1];
      }
    }

    const isTv = mediaType === "tv";
    const typeParam = isTv ? "tv" : "movie";
    const idQuery = isImdb
      ? `imdb=${encodeURIComponent(idParam)}`
      : `tmdb=${encodeURIComponent(idParam)}`;
    let url = `${API_URL}?${idQuery}&type=${typeParam}`;
    if (isTv) {
      url += `&season=${season}&episode=${episode}`;
    }

    const data = await this.fetchJson<VidApiResponse>(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: `${IFRAME_ORIGIN}/`,
        Origin: IFRAME_ORIGIN,
        Accept: "*/*",
      },
    });

    if (
      data?.status_code !== "200" ||
      !data?.data?.stream_urls ||
      data.data.stream_urls.length === 0
    ) {
      return null;
    }

    let streamUrl = data.data.stream_urls[0];
    if (server === "vidapi-backup" && data.data.stream_urls.length > 1) {
      streamUrl = data.data.stream_urls[1];
    }

    const subtitles = (data.default_subs || []).map((sub) => ({
      label: sub.lang,
      language: sub.code || "en",
      url: sub.url,
      default: (sub.code || "").toLowerCase().startsWith("en"),
    }));

    return {
      url: streamUrl,
      container: "hls",
      quality: "1080p",
      resolution: 1080,
      serverName:
        server === "vidapi-backup" ? "VidApi Backup · 1080p" : "VidApi · 1080p",
      headers: {
        ...getDefaultHeaders(),
      },
      subtitles,
    };
  }
}
