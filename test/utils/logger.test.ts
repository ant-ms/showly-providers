import { describe, it, expect } from "vitest";
import { getLogger, setLogger, nullLogger } from "../../src/utils/logger.js";
import type { Logger } from "../../src/types.js";

describe("logger utility", () => {
  it("defaults to nullLogger", () => {
    setLogger(null);
    const logger = getLogger();
    expect(logger).toBe(nullLogger);
    expect(() => logger.info("test")).not.toThrow();
  });

  it("sets and gets custom logger", () => {
    const logs: string[] = [];
    const customLogger: Logger = {
      debug: (d) => logs.push(`debug:${d}`),
      info: (d) => logs.push(`info:${d}`),
      warn: (d) => logs.push(`warn:${d}`),
      error: (d) => logs.push(`error:${d}`),
    };

    setLogger(customLogger);
    expect(getLogger()).toBe(customLogger);

    getLogger().info("hello");
    expect(logs).toContain("info:hello");

    setLogger(null);
  });
});
