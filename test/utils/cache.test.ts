import { describe, it, expect } from "vitest";
import { BoundedCache } from "../../src/utils/cache.js";

describe("BoundedCache", () => {
  it("stores and retrieves values correctly", () => {
    const cache = new BoundedCache<string, string>({ maxSize: 10 });
    cache.set("k1", "v1");
    expect(cache.get("k1")).toBe("v1");
    expect(cache.has("k1")).toBe(true);
    expect(cache.size).toBe(1);
  });

  it("handles deletion and clear", () => {
    const cache = new BoundedCache<string, number>();
    cache.set("a", 1).set("b", 2);
    expect(cache.size).toBe(2);

    expect(cache.delete("a")).toBe(true);
    expect(cache.has("a")).toBe(false);
    expect(cache.size).toBe(1);

    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get("b")).toBeUndefined();
  });

  it("evicts oldest items when maxSize is exceeded", () => {
    const cache = new BoundedCache<string, number>({ maxSize: 2 });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);

    expect(cache.has("a")).toBe(false);
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBe(3);
    expect(cache.size).toBe(2);
  });
});
