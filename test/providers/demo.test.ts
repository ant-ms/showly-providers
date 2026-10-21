import { describe, it, expect } from "vitest";
import { DemoProvider, DEMO_STREAMS } from "../../src/providers/demo.js";

describe("DemoProvider", () => {
  const provider = new DemoProvider();

  it("has correct id and name", () => {
    expect(provider.id).toBe("demo");
    expect(provider.name).toBe("DemoStream");
  });

  it("searches and returns standard test media items", async () => {
    const results = await provider.search("Big Buck Bunny", "movie");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.name.includes("Big Buck Bunny"))).toBe(true);
  });

  it("returns episodes and servers list", async () => {
    const eps = await provider.getEpisodes("demo:tv:demo-series", 1);
    expect(eps.episodes).toContain(1);
    expect(eps.servers.length).toBeGreaterThan(0);
    expect(eps.servers[0].id).toBe("demo-cdn");
  });

  it("returns 100% reliable 1080p HLS stream", async () => {
    const stream = await provider.getStream("demo:movie:test", 1, 1, "demo-cdn");
    expect(stream).toBeDefined();
    expect(stream?.url).toBe(DEMO_STREAMS.bigBuckBunny);
    expect(stream?.container).toBe("hls");
    expect(stream?.quality).toBe("1080p");
    expect(stream?.resolution).toBe(1080);
    expect(stream?.subtitles?.length).toBeGreaterThan(0);
  });

  it("supports backup demo HLS stream", async () => {
    const stream = await provider.getStream("demo:movie:test", 1, 1, "demo-backup");
    expect(stream).toBeDefined();
    expect(stream?.url).toBe(DEMO_STREAMS.sintel);
  });
});
