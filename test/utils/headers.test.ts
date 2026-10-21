import { describe, it, expect } from "vitest";
import {
  DEFAULT_USER_AGENT,
  getDefaultHeaders,
  getRefererHeaders,
} from "../../src/utils/headers.js";

describe("headers utility", () => {
  it("returns default headers with standard Chrome User-Agent", () => {
    const headers = getDefaultHeaders();
    expect(headers["User-Agent"]).toBe(DEFAULT_USER_AGENT);
    expect(headers["Accept"]).toBeDefined();
  });

  it("merges custom extra headers", () => {
    const headers = getDefaultHeaders({
      Authorization: "Bearer xyz",
      "X-Custom": "val",
    });
    expect(headers["User-Agent"]).toBe(DEFAULT_USER_AGENT);
    expect(headers["Authorization"]).toBe("Bearer xyz");
    expect(headers["X-Custom"]).toBe("val");
  });

  it("creates referer and origin headers", () => {
    const headers = getRefererHeaders("https://novahd.cc/watch/123");
    expect(headers.Referer).toBe("https://novahd.cc/watch/123");
    expect(headers.Origin).toBe("https://novahd.cc");
  });
});
