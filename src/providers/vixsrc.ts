import type {
  MediaType,
  ProviderEpisodeList,
  ProviderSearchResult,
  StreamSource,
} from "../types.js";
import { AbstractProvider, type ProviderOptions } from "./base.js";
import { BoundedCache } from "../utils/cache.js";
import { getDefaultHeaders } from "../utils/headers.js";

const BASE_URL = "https://vixsrc.to";
const SEARCH_BASE_URL = "https://novahd.cc";

interface VixSrcApiResponse {
  src?: string;
  error?: string;
}

interface SearchResponseItem {
  tmdbId: number;
  type: "movie" | "show" | string;
  title: string;
  posterPath?: string | null;
  releaseDate?: string | null;
  firstAirDate?: string | null;
}

export async function resolveVixSrcStream(
  linkOrApiPath: string,
  fetchFn: typeof fetch = globalThis.fetch,
  timeoutMs: number = 8000,
): Promise<StreamSource | null> {
  try {
    let apiPath = linkOrApiPath;
    if (apiPath.startsWith("http")) {
      const urlObj = new URL(apiPath);
      apiPath = urlObj.pathname;
    }
    if (!apiPath.startsWith("/api/")) {
      apiPath = `/api${apiPath.startsWith("/") ? "" : "/"}${apiPath}`;
    }

    const apiUrl = `${BASE_URL}${apiPath}`;
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/json, text/javascript, */*; q=0.01",
      Referer: `${BASE_URL}/`,
      Origin: BASE_URL,
    };

    const apiRes = await fetchFn(apiUrl, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!apiRes.ok) return null;

    const sublink = (await apiRes.json()) as VixSrcApiResponse;
    if (!sublink?.src) return null;

    const embedUrl = sublink.src.startsWith("http")
      ? sublink.src
      : `${BASE_URL}${sublink.src}`;

    const embedRes = await fetchFn(embedUrl, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!embedRes.ok) return null;

    const html = await embedRes.text();
    const token = html.match(/['"]?token['"]?\s*:\s*['"]([^'"]+)['"]/)?.[1];
    const expires = html.match(/['"]?expires['"]?\s*:\s*['"]([^'"]+)['"]/)?.[1];
    const rawPlaylist = html.match(/['"]?url['"]?\s*:\s*['"]([^'"]+)['"]/)?.[1];

    if (!token || !expires || !rawPlaylist) return null;

    const playlist = rawPlaylist.replace(/\\/g, "");
    const sep = playlist.includes("?") ? "&" : "?";
    const masterUrl = `${playlist}${sep}token=${token}&expires=${expires}&h=1`;

    return {
      url: masterUrl,
      container: "hls",
      quality: "1080p",
      resolution: 1080,
      serverName: "VixCloud · 1080p",
      headers: {
        ...getDefaultHeaders(),
        Referer: `${BASE_URL}/`,
      },
    };
  } catch {
    return null;
  }
}

export class VixSrcProvider extends AbstractProvider {
  readonly id = "vixsrc";
  readonly name = "VixSrc";

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
      servers: [{ id: "vixcloud", name: "VixCloud · 1080p" }],
    };
  }

  async getStream(
    identifier: string,
    episode: number = 1,
    season: number = 1,
    _server?: string,
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
    const apiPath = isTv
      ? `/api/tv/${encodeURIComponent(idParam)}/${season}/${episode}`
      : `/api/movie/${encodeURIComponent(idParam)}`;

    return await resolveVixSrcStream(apiPath, this.fetchFn, this.timeoutMs);
  }
}
