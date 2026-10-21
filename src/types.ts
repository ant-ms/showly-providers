export type MediaType = "movie" | "tv";

export interface SubtitleTrack {
  id?: string;
  label: string;
  language: string;
  url: string;
  default?: boolean;
}

export interface StreamSource {
  url: string;
  container?: "hls" | "mp4";
  quality?: string;
  headers?: Record<string, string>;
  subtitles?: SubtitleTrack[];
  serverName?: string;
  resolution?: number;
}

export interface AvailableService {
  providerId: string;
  providerName: string;
  serverName: string;
  serverId: string;
  mediaType: MediaType;
  identifier: string;
  quality?: string;
  scoreBonus?: number;
}

export interface ProviderSearchResult {
  identifier: string;
  name: string;
  mediaType: MediaType;
  year?: number;
  quality?: string;
  poster?: string;
  seasonCount?: number;
  episodeCount?: number;
}

export interface ProviderEpisodeList {
  episodes: number[];
  seasons?: number[];
  servers: Array<{ id: string; name: string }>;
}

export interface BaseProvider {
  readonly id: string;
  readonly name: string;
  search(query: string, mediaType?: MediaType): Promise<ProviderSearchResult[]>;
  getStream(
    identifier: string,
    episode?: number,
    season?: number,
    server?: string,
  ): Promise<StreamSource | null>;
  getEpisodes?(
    identifier: string,
    season?: number,
  ): Promise<ProviderEpisodeList>;
}

export interface Logger {
  debug(data?: unknown, msg?: string): void;
  info(data?: unknown, msg?: string): void;
  warn(data?: unknown, msg?: string): void;
  error(data?: unknown, msg?: string): void;
}

export interface TitleMatcherOptions {
  year?: number;
  mediaType?: MediaType;
  yearTolerance?: number; // default ±1 year
}

export type TitleMatcherFn = (
  targetTitles: string | string[],
  searchResults: ProviderSearchResult[],
  options?: TitleMatcherOptions,
) => Promise<ProviderSearchResult | null> | ProviderSearchResult | null;
