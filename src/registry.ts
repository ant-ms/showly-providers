import type {
  AvailableService,
  BaseProvider,
  MediaType,
  ProviderSearchResult,
  StreamSource,
  TitleMatcherFn,
  TitleMatcherOptions,
} from "./types.js";
import { getServiceScore, type QualityScoreOptions } from "./qualityScore.js";
import { DemoProvider } from "./providers/demo.js";
import { HiMoviesProvider } from "./providers/himovies.js";
import { MoviesJoyProvider } from "./providers/moviesjoy.js";
import { NovaProvider } from "./providers/nova.js";
import { ZoechipProvider } from "./providers/zoechip.js";
import { matchBestSearchResult } from "./titleMatcher.js";
import { getLogger } from "./utils/logger.js";

export interface RegistryOptions {
  providers?: BaseProvider[];
  titleMatcher?: TitleMatcherFn;
}

export interface CheckAvailabilityOptions {
  titleMatcherOptions?: TitleMatcherOptions;
  qualityScoreOptions?: QualityScoreOptions;
  mediaType?: MediaType;
  timeoutMs?: number;
}

export class ProviderRegistry {
  private providers = new Map<string, BaseProvider>();
  private titleMatcher: TitleMatcherFn;

  constructor(options?: RegistryOptions) {
    this.titleMatcher = options?.titleMatcher ?? matchBestSearchResult;

    if (options?.providers) {
      for (const p of options.providers) {
        this.register(p);
      }
    } else {
      // Default high-reliability western providers in benchmarked priority order
      this.register(new NovaProvider());
      this.register(new MoviesJoyProvider());
      this.register(new ZoechipProvider());
      this.register(new HiMoviesProvider());
      this.register(new DemoProvider());
    }
  }

  register(provider: BaseProvider): void {
    this.providers.set(provider.id, provider);
  }

  unregister(id: string): boolean {
    return this.providers.delete(id);
  }

  getProvider(id: string): BaseProvider | undefined {
    return this.providers.get(id);
  }

  getAllProviders(): BaseProvider[] {
    return Array.from(this.providers.values());
  }

  async checkAvailability(
    titleOrTitles: string | string[],
    year?: number,
    season?: number,
    episode?: number,
    options?: CheckAvailabilityOptions,
  ): Promise<AvailableService[]> {
    const log = getLogger();
    const titles = Array.isArray(titleOrTitles)
      ? titleOrTitles
      : [titleOrTitles];
    const validTitles = titles
      .map((t) => t?.trim())
      .filter((t): t is string => Boolean(t && t.length > 0));

    if (validTitles.length === 0) return [];

    const isTv =
      options?.mediaType === "tv" ||
      season !== undefined ||
      episode !== undefined;
    const mediaType: MediaType = options?.mediaType || (isTv ? "tv" : "movie");
    const targetSeason = season ?? (isTv ? 1 : undefined);
    const targetEpisode = episode ?? (isTv ? 1 : undefined);

    const matcherOptions: TitleMatcherOptions = {
      year,
      mediaType,
      ...(options?.titleMatcherOptions || {}),
    };

    const results: AvailableService[] = [];
    const providers = this.getAllProviders();

    await Promise.all(
      providers.map(async (provider) => {
        try {
          const providerCheck = async () => {
            const searches = await Promise.all(
              validTitles.map((title) =>
                provider
                  .search(title, mediaType)
                  .catch(() => [] as ProviderSearchResult[]),
              ),
            );

            // Deduplicate search results
            const candidateMap = new Map<string, ProviderSearchResult>();
            for (const searchResults of searches) {
              for (const r of searchResults) {
                if (!candidateMap.has(r.identifier)) {
                  candidateMap.set(r.identifier, r);
                }
              }
            }

            const allCandidates = Array.from(candidateMap.values());
            if (allCandidates.length === 0) return;

            const match = await this.titleMatcher(
              validTitles,
              allCandidates,
              matcherOptions,
            );
            if (!match) return;

            const matchedIdentifier = match.identifier;

            if (provider.getEpisodes) {
              const epData = await provider.getEpisodes(
                matchedIdentifier,
                targetSeason,
              );

              const hasTargetEpisode =
                !isTv ||
                !targetEpisode ||
                epData.episodes.includes(targetEpisode);

              if (hasTargetEpisode) {
                const servers =
                  epData.servers && epData.servers.length > 0
                    ? epData.servers
                    : [{ id: "default", name: "Default" }];

                for (const server of servers) {
                  results.push({
                    providerId: provider.id,
                    providerName: provider.name,
                    serverName: server.name,
                    serverId: server.id,
                    mediaType,
                    identifier: matchedIdentifier,
                    quality: match.quality || "1080p",
                  });
                }
              }
            } else {
              results.push({
                providerId: provider.id,
                providerName: provider.name,
                serverName: "Default",
                serverId: "default",
                mediaType,
                identifier: matchedIdentifier,
                quality: match.quality || "1080p",
              });
            }
          };

          if (options?.timeoutMs && options.timeoutMs > 0) {
            let timer: NodeJS.Timeout | undefined;
            const timeoutPromise = new Promise<void>((_, reject) => {
              timer = setTimeout(
                () =>
                  reject(
                    new Error(
                      `Provider check timed out after ${options.timeoutMs}ms`,
                    ),
                  ),
                options.timeoutMs,
              );
            });
            try {
              await Promise.race([providerCheck(), timeoutPromise]);
            } finally {
              if (timer) clearTimeout(timer);
            }
          } else {
            await providerCheck();
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          log.warn(
            { err: message, provider: provider.name },
            "Provider check failed",
          );
        }
      }),
    );

    // Score and rank all available services
    results.sort((a, b) => {
      const scoreB = getServiceScore(b, options?.qualityScoreOptions);
      const scoreA = getServiceScore(a, options?.qualityScoreOptions);
      return scoreB - scoreA;
    });

    return results;
  }

  async resolveStream(
    providerId: string,
    identifier: string,
    episode?: number,
    season?: number,
    server?: string,
  ): Promise<StreamSource | null> {
    const log = getLogger();
    const provider = this.getProvider(providerId);
    if (!provider) {
      log.warn({ providerId }, "Provider not found");
      return null;
    }

    return await provider.getStream(identifier, episode, season, server);
  }
}

export const registry = new ProviderRegistry();
