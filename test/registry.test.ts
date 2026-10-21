import { describe, it, expect } from "vitest";
import { ProviderRegistry } from "../src/registry.js";
import type {
  BaseProvider,
  MediaType,
  ProviderEpisodeList,
  ProviderSearchResult,
  StreamSource,
} from "../src/types.js";

describe("ProviderRegistry", () => {
  const createMockProvider = (
    id: string,
    name: string,
    servers: Array<{ id: string; name: string }>,
  ): BaseProvider => ({
    id,
    name,
    search: async (query: string, mediaType?: MediaType): Promise<ProviderSearchResult[]> => [
      {
        identifier: `${id}:${query}`,
        name: query,
        mediaType: mediaType || "movie",
        year: 2023,
        quality: "1080p",
      },
    ],
    getEpisodes: async (
      _identifier: string,
      _season?: number,
    ): Promise<ProviderEpisodeList> => ({
      episodes: [1, 2, 3],
      seasons: [1, 2],
      servers,
    }),
    getStream: async (
      identifier: string,
      episode?: number,
      season?: number,
      server?: string,
    ): Promise<StreamSource | null> => ({
      url: `https://${id}.cdn.com/${identifier}/s${season || 1}e${episode || 1}.m3u8`,
      container: "hls",
      quality: "1080p",
      resolution: 1080,
      serverName: server || servers[0]?.name || "Default",
    }),
  });

  it("registers and unregisters providers correctly", () => {
    const registry = new ProviderRegistry({ providers: [] });
    expect(registry.getAllProviders()).toHaveLength(0);

    const p1 = createMockProvider("p1", "P1", [{ id: "s1", name: "S1" }]);
    registry.register(p1);
    expect(registry.getAllProviders()).toHaveLength(1);
    expect(registry.getProvider("p1")).toBe(p1);

    expect(registry.unregister("p1")).toBe(true);
    expect(registry.getAllProviders()).toHaveLength(0);
  });

  it("checks availability and scores services", async () => {
    const novaMock = createMockProvider("nova", "NovaHD", [
      { id: "falcon", name: "Falcon · 1080p" },
    ]);
    const himoviesMock = createMockProvider("himovies", "HiMovies", [
      { id: "upcloud", name: "UpCloud" },
    ]);

    const registry = new ProviderRegistry({
      providers: [himoviesMock, novaMock],
    });

    const services = await registry.checkAvailability("Oppenheimer", 2023);
    expect(services.length).toBeGreaterThanOrEqual(2);

    // NovaHD should rank higher due to provider weight & Falcon server bonus
    expect(services[0].providerId).toBe("nova");
    expect(services[0].serverName).toBe("Falcon · 1080p");
  });

  it("resolves stream from chosen provider", async () => {
    const demo = createMockProvider("demo", "DemoStream", [
      { id: "demo-cdn", name: "Demo CDN" },
    ]);
    const registry = new ProviderRegistry({ providers: [demo] });

    const stream = await registry.resolveStream(
      "demo",
      "demo:movie:oppenheimer",
      1,
      1,
      "Demo CDN",
    );
    expect(stream).toBeDefined();
    expect(stream?.url).toContain("demo.cdn.com");
    expect(stream?.container).toBe("hls");
  });

  it("returns null when resolving from non-existent provider", async () => {
    const registry = new ProviderRegistry({ providers: [] });
    const stream = await registry.resolveStream("non-existent", "id");
    expect(stream).toBeNull();
  });
});
