import * as cheerio from "cheerio";
import type {
  MediaType,
  ProviderEpisodeList,
  ProviderSearchResult,
  StreamSource,
} from "../types.js";
import { AbstractProvider, type ProviderOptions } from "./base.js";
import { BoundedCache } from "../utils/cache.js";
import { getDefaultHeaders } from "../utils/headers.js";
import { decodeHtmlEntities } from "../utils/html.js";
import { parseSubtitles } from "../utils/subtitles.js";

interface FlwSourceResponse {
  type?: string;
  link?: string;
  sources?: Array<{ file: string; type: string }>;
  tracks?: Array<{
    file: string;
    label: string;
    kind: string;
    default?: boolean;
  }>;
}

export abstract class FlwBaseProvider extends AbstractProvider {
  abstract readonly baseUrl: string;

  protected searchCache = new BoundedCache<string, ProviderSearchResult[]>({
    maxSize: 300,
    ttlMs: 15 * 60 * 1000,
  });

  protected episodeCache = new BoundedCache<string, ProviderEpisodeList>({
    maxSize: 200,
    ttlMs: 30 * 60 * 1000,
  });

  constructor(options?: ProviderOptions) {
    super(options);
  }

  protected extractSlugId(identifier: string): string {
    const clean = identifier
      .replace(/^https?:\/\/[^/]+\//, "")
      .replace(/^\//, "");
    const parts = clean.split("-");
    const lastPart = parts[parts.length - 1];
    return lastPart.includes("/")
      ? lastPart.split("/").pop() || lastPart
      : lastPart;
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

    const searchUrl = `${this.baseUrl}/search/${encodeURIComponent(cleanQuery.replace(/\s+/g, "-"))}`;
    const html = await this.fetchText(searchUrl, {
      headers: getDefaultHeaders({
        Referer: `${this.baseUrl}/`,
      }),
    });

    if (!html) return [];

    const $ = cheerio.load(html);
    const results: ProviderSearchResult[] = [];

    $(".flw-item").each((_, el) => {
      const item = $(el);
      const link = item.find("h3.film-name a");
      const href = link.attr("href") || "";
      const rawTitle = link.attr("title") || link.text();
      if (!href || !rawTitle) return;

      const slug = href.replace(/^https?:\/\/[^/]+/, "").replace(/^\//, "");
      const isTv =
        slug.startsWith("tv/") ||
        item.find(".fdi-type").text().trim().toLowerCase() === "tv";
      const itemMediaType: MediaType = isTv ? "tv" : "movie";

      if (mediaType && mediaType !== itemMediaType) {
        return;
      }

      const yearText = item.find(".fd-infor .fdi-item").first().text().trim();
      const year = parseInt(yearText, 10);
      const quality = item.find(".film-poster-quality").text().trim() || "HD";
      const poster =
        item.find(".film-poster-img").attr("data-src") ||
        item.find(".film-poster-img").attr("src");

      results.push({
        identifier: slug,
        name: decodeHtmlEntities(rawTitle),
        mediaType: itemMediaType,
        year: isNaN(year) ? undefined : year,
        quality,
        poster,
      });
    });

    this.searchCache.set(cacheKey, results);
    return results;
  }

  async getEpisodes(
    identifier: string,
    season: number = 1,
  ): Promise<ProviderEpisodeList> {
    const slugId = this.extractSlugId(identifier);
    const isTv = identifier.includes("tv/") || identifier.startsWith("tv-");
    const cacheKey = `${identifier}:${season}`;

    const cached = this.episodeCache.get(cacheKey);
    if (cached) return cached;

    if (isTv) {
      // 1. Fetch seasons
      const seasonsHtml = await this.fetchText(
        `${this.baseUrl}/ajax/season/list/${slugId}`,
        {
          headers: getDefaultHeaders({
            Referer: `${this.baseUrl}/${identifier}`,
            "X-Requested-With": "XMLHttpRequest",
          }),
        },
      );

      if (!seasonsHtml) {
        return { episodes: [1], seasons: [1], servers: [] };
      }

      const $ss = cheerio.load(seasonsHtml);
      const seasonsList: Array<{ id: string; num: number }> = [];

      $ss(".ss-item").each((idx, el) => {
        const id = $ss(el).attr("data-id") || "";
        const text = $ss(el).text().trim();
        const numMatch = text.match(/\d+/);
        const num = numMatch ? parseInt(numMatch[0], 10) : idx + 1;
        if (id) seasonsList.push({ id, num });
      });

      const matchedSeason =
        seasonsList.find((s) => s.num === season) || seasonsList[0];
      if (!matchedSeason) {
        return { episodes: [1], seasons: [1], servers: [] };
      }

      // 2. Fetch episodes for season
      const episodesHtml = await this.fetchText(
        `${this.baseUrl}/ajax/season/episodes/${matchedSeason.id}`,
        {
          headers: getDefaultHeaders({
            Referer: `${this.baseUrl}/${identifier}`,
            "X-Requested-With": "XMLHttpRequest",
          }),
        },
      );

      if (!episodesHtml) {
        return {
          episodes: [1],
          seasons: seasonsList.map((s) => s.num),
          servers: [],
        };
      }

      const $ep = cheerio.load(episodesHtml);
      const episodesList: Array<{ id: string; num: number }> = [];

      $ep(".eps-item").each((idx, el) => {
        const id = $ep(el).attr("data-id") || "";
        const text = $ep(el).text().trim();
        const numMatch = text.match(/(?:eps|episode)\s*(\d+)/i);
        const num = numMatch ? parseInt(numMatch[1], 10) : idx + 1;
        if (id) episodesList.push({ id, num });
      });

      // 3. Fetch servers for first episode
      const targetEpisode = episodesList[0];
      const servers: Array<{ id: string; name: string }> = [];

      if (targetEpisode) {
        const serversHtml = await this.fetchText(
          `${this.baseUrl}/ajax/episode/servers/${targetEpisode.id}`,
          {
            headers: getDefaultHeaders({
              Referer: `${this.baseUrl}/${identifier}`,
              "X-Requested-With": "XMLHttpRequest",
            }),
          },
        );

        if (serversHtml) {
          const $srv = cheerio.load(serversHtml);
          $srv(".link-item").each((_, el) => {
            const id = $srv(el).attr("data-id") || "";
            const name =
              $srv(el).text().trim() || $srv(el).attr("title") || "Server";
            if (id) servers.push({ id, name });
          });
        }
      }

      const result: ProviderEpisodeList = {
        episodes: episodesList.map((e) => e.num),
        seasons: seasonsList.map((s) => s.num),
        servers,
      };

      this.episodeCache.set(cacheKey, result);
      return result;
    } else {
      // Movie
      const serversHtml = await this.fetchText(
        `${this.baseUrl}/ajax/episode/list/${slugId}`,
        {
          headers: getDefaultHeaders({
            Referer: `${this.baseUrl}/${identifier}`,
            "X-Requested-With": "XMLHttpRequest",
          }),
        },
      );

      const servers: Array<{ id: string; name: string }> = [];
      if (serversHtml) {
        const $ = cheerio.load(serversHtml);
        $(".link-item").each((_, el) => {
          const id = $(el).attr("data-id") || "";
          const name = $(el).text().trim() || $(el).attr("title") || "Server";
          if (id) servers.push({ id, name });
        });
      }

      const result: ProviderEpisodeList = {
        episodes: [1],
        servers,
      };

      this.episodeCache.set(cacheKey, result);
      return result;
    }
  }

  async getStream(
    identifier: string,
    episode: number = 1,
    season: number = 1,
    server?: string,
  ): Promise<StreamSource | null> {
    const slugId = this.extractSlugId(identifier);
    const isTv = identifier.includes("tv/") || identifier.startsWith("tv-");

    let serverId: string | null = null;
    let resolvedServerName = server || "Default";

    if (isTv) {
      // Fetch season list
      const seasonsHtml = await this.fetchText(
        `${this.baseUrl}/ajax/season/list/${slugId}`,
        {
          headers: getDefaultHeaders({
            Referer: `${this.baseUrl}/${identifier}`,
            "X-Requested-With": "XMLHttpRequest",
          }),
        },
      );

      if (!seasonsHtml) return null;
      const $ss = cheerio.load(seasonsHtml);
      let targetSeasonId = "";

      $ss(".ss-item").each((idx, el) => {
        const id = $ss(el).attr("data-id") || "";
        const text = $ss(el).text().trim();
        const numMatch = text.match(/\d+/);
        const num = numMatch ? parseInt(numMatch[0], 10) : idx + 1;
        if (num === season) targetSeasonId = id;
      });

      if (!targetSeasonId) {
        targetSeasonId = $ss(".ss-item").first().attr("data-id") || "";
      }
      if (!targetSeasonId) return null;

      // Fetch episodes
      const episodesHtml = await this.fetchText(
        `${this.baseUrl}/ajax/season/episodes/${targetSeasonId}`,
        {
          headers: getDefaultHeaders({
            Referer: `${this.baseUrl}/${identifier}`,
            "X-Requested-With": "XMLHttpRequest",
          }),
        },
      );

      if (!episodesHtml) return null;
      const $ep = cheerio.load(episodesHtml);
      let targetEpisodeId = "";

      $ep(".eps-item").each((idx, el) => {
        const id = $ep(el).attr("data-id") || "";
        const text = $ep(el).text().trim();
        const numMatch = text.match(/(?:eps|episode)\s*(\d+)/i);
        const num = numMatch ? parseInt(numMatch[1], 10) : idx + 1;
        if (num === episode) targetEpisodeId = id;
      });

      if (!targetEpisodeId) {
        targetEpisodeId = $ep(".eps-item").first().attr("data-id") || "";
      }
      if (!targetEpisodeId) return null;

      // Fetch servers
      const serversHtml = await this.fetchText(
        `${this.baseUrl}/ajax/episode/servers/${targetEpisodeId}`,
        {
          headers: getDefaultHeaders({
            Referer: `${this.baseUrl}/${identifier}`,
            "X-Requested-With": "XMLHttpRequest",
          }),
        },
      );

      if (!serversHtml) return null;
      const $srv = cheerio.load(serversHtml);

      if (server) {
        $srv(".link-item").each((_, el) => {
          const id = $srv(el).attr("data-id") || "";
          const name = $srv(el).text().trim() || $srv(el).attr("title") || "";
          if (
            name.toLowerCase().includes(server.toLowerCase()) ||
            id === server
          ) {
            serverId = id;
            resolvedServerName = name;
          }
        });
      }

      if (!serverId) {
        const first = $srv(".link-item").first();
        serverId = first.attr("data-id") || null;
        resolvedServerName = first.text().trim() || "Server";
      }
    } else {
      // Movie
      const serversHtml = await this.fetchText(
        `${this.baseUrl}/ajax/episode/list/${slugId}`,
        {
          headers: getDefaultHeaders({
            Referer: `${this.baseUrl}/${identifier}`,
            "X-Requested-With": "XMLHttpRequest",
          }),
        },
      );

      if (!serversHtml) return null;
      const $ = cheerio.load(serversHtml);

      if (server) {
        $(".link-item").each((_, el) => {
          const id = $(el).attr("data-id") || "";
          const name = $(el).text().trim() || $(el).attr("title") || "";
          if (
            name.toLowerCase().includes(server.toLowerCase()) ||
            id === server
          ) {
            serverId = id;
            resolvedServerName = name;
          }
        });
      }

      if (!serverId) {
        const first = $(".link-item").first();
        serverId = first.attr("data-id") || null;
        resolvedServerName = first.text().trim() || "Server";
      }
    }

    if (!serverId) return null;

    const sourceData = await this.fetchJson<FlwSourceResponse>(
      `${this.baseUrl}/ajax/episode/sources/${serverId}`,
      {
        headers: getDefaultHeaders({
          Referer: `${this.baseUrl}/${identifier}`,
          "X-Requested-With": "XMLHttpRequest",
        }),
      },
    );

    const directSource = sourceData?.sources?.[0]?.file;
    if (directSource) {
      const isHls = directSource.includes(".m3u8");
      const subtitles = parseSubtitles(sourceData?.tracks);
      return {
        url: directSource,
        container: isHls ? "hls" : "mp4",
        quality: "1080p",
        resolution: 1080,
        serverName: resolvedServerName,
        headers: {
          ...getDefaultHeaders(),
          Referer: `${this.baseUrl}/`,
        },
        subtitles,
      };
    }

    const link = sourceData?.link;
    if (!link) return null;

    // If sourceData is an embed player / iframe (e.g. vidfast.vc, moviesapi.to, vixsrc),
    // it cannot be played in a native video element. Return null so failover occurs.
    if (
      sourceData?.type === "iframe" ||
      (!link.includes(".m3u8") && !link.includes(".mp4") && !link.includes(".mkv"))
    ) {
      return null;
    }

    const isHls = link.includes(".m3u8");
    const subtitles = parseSubtitles(sourceData?.tracks);

    return {
      url: link,
      container: isHls ? "hls" : "mp4",
      quality: "1080p",
      resolution: 1080,
      serverName: resolvedServerName,
      headers: {
        ...getDefaultHeaders(),
        Referer: `${this.baseUrl}/`,
      },
      subtitles,
    };
  }
}
