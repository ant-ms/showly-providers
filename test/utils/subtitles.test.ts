import { describe, it, expect } from "vitest";
import {
  normalizeLanguageCode,
  parseSubtitles,
  type RawSubtitle,
} from "../../src/utils/subtitles.js";

describe("subtitles utility", () => {
  describe("normalizeLanguageCode", () => {
    it("normalizes English variations to en", () => {
      expect(normalizeLanguageCode("English")).toBe("en");
      expect(normalizeLanguageCode("eng")).toBe("en");
      expect(normalizeLanguageCode("en-US")).toBe("en");
      expect(normalizeLanguageCode("en_GB")).toBe("en");
    });

    it("normalizes common world languages to ISO codes", () => {
      expect(normalizeLanguageCode("Spanish")).toBe("es");
      expect(normalizeLanguageCode("French")).toBe("fr");
      expect(normalizeLanguageCode("German")).toBe("de");
      expect(normalizeLanguageCode("Japanese")).toBe("ja");
      expect(normalizeLanguageCode("Arabic")).toBe("ar");
    });
  });

  describe("parseSubtitles", () => {
    it("handles empty or invalid inputs", () => {
      expect(parseSubtitles(undefined)).toEqual([]);
      expect(parseSubtitles([])).toEqual([]);
    });

    it("filters out thumbnail tracks", () => {
      const raw: RawSubtitle[] = [
        { url: "https://subs.org/thumbs.vtt", kind: "thumbnails" },
        { url: "https://subs.org/en.vtt", label: "English", lang: "en" },
      ];
      const parsed = parseSubtitles(raw);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].label).toBe("English");
    });

    it("defaults to first English track when no default is explicit", () => {
      const raw: RawSubtitle[] = [
        { url: "https://subs.org/fr.vtt", label: "French", lang: "fr" },
        { url: "https://subs.org/en.vtt", label: "English", lang: "en" },
        { url: "https://subs.org/es.vtt", label: "Spanish", lang: "es" },
      ];
      const parsed = parseSubtitles(raw);
      expect(parsed[0].default).toBe(false);
      expect(parsed[1].default).toBe(true);
      expect(parsed[2].default).toBe(false);
    });

    it("preserves explicit default track", () => {
      const raw: RawSubtitle[] = [
        { url: "https://subs.org/fr.vtt", label: "French", default: true },
        { url: "https://subs.org/en.vtt", label: "English", default: false },
      ];
      const parsed = parseSubtitles(raw);
      expect(parsed[0].default).toBe(true);
      expect(parsed[1].default).toBe(false);
    });
  });
});
