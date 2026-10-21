import { describe, it, expect } from "vitest";
import {
  calculateMediaTypeScore,
  calculateYearScore,
  levenshteinDistance,
  levenshteinSimilarity,
  matchBestSearchResult,
  normalizeTitle,
  tokenSimilarity,
} from "../src/titleMatcher.js";
import type { ProviderSearchResult } from "../src/types.js";

describe("titleMatcher", () => {
  describe("normalizeTitle", () => {
    it("lowercases, normalizes apostrophes, dashes, and removes non-alphanumeric chars", () => {
      expect(normalizeTitle("Spider-Man: Across the Spider-Verse")).toBe(
        "spider man across the spider verse",
      );
      expect(normalizeTitle("Grey's Anatomy – Season 1")).toBe(
        "grey s anatomy season 1",
      );
    });
  });

  describe("similarity metrics", () => {
    it("computes accurate Levenshtein distance and similarity", () => {
      expect(levenshteinDistance("oppenheimer", "oppenheimer")).toBe(0);
      expect(levenshteinSimilarity("oppenheimer", "oppenheimer")).toBe(1.0);
      expect(levenshteinDistance("breaking", "braking")).toBe(1);
      expect(
        levenshteinSimilarity("interstellar", "interstelar"),
      ).toBeGreaterThan(0.9);
    });

    it("computes token similarity", () => {
      expect(
        tokenSimilarity(
          "Lord of the Rings: The Fellowship of the Ring",
          "The Lord of the Rings Fellowship of the Ring",
        ),
      ).toBe(1.0);
    });
  });

  describe("year scoring with tolerance", () => {
    it("gives highest points for exact year match", () => {
      expect(calculateYearScore(2023, 2023)).toBe(40);
    });

    it("gives points for ±1 year tolerance match", () => {
      expect(calculateYearScore(2023, 2024)).toBe(25);
      expect(calculateYearScore(2023, 2022)).toBe(25);
    });

    it("penalizes matches outside tolerance", () => {
      expect(calculateYearScore(2023, 2015)).toBe(-30);
    });
  });

  describe("media type scoring", () => {
    it("rewards matching media type and penalizes mismatch", () => {
      expect(calculateMediaTypeScore("movie", "movie")).toBe(20);
      expect(calculateMediaTypeScore("tv", "tv")).toBe(20);
      expect(calculateMediaTypeScore("movie", "tv")).toBe(-30);
    });
  });

  describe("matchBestSearchResult", () => {
    const candidates: ProviderSearchResult[] = [
      {
        identifier: "oppenheimer-movie-2023",
        name: "Oppenheimer",
        mediaType: "movie",
        year: 2023,
      },
      {
        identifier: "oppenheimer-tv-1980",
        name: "Oppenheimer",
        mediaType: "tv",
        year: 1980,
      },
      {
        identifier: "oppenheimer-real-story-2023",
        name: "Oppenheimer: The Real Story",
        mediaType: "movie",
        year: 2023,
      },
      {
        identifier: "after-trinity-2023",
        name: "Oppenheimer After Trinity",
        mediaType: "movie",
        year: 2023,
      },
    ];

    it("matches exact title and year correctly for movie", () => {
      const match = matchBestSearchResult("Oppenheimer", candidates, {
        year: 2023,
        mediaType: "movie",
      });
      expect(match?.identifier).toBe("oppenheimer-movie-2023");
    });

    it("differentiates TV miniseries vs Movie based on mediaType and year", () => {
      const match = matchBestSearchResult("Oppenheimer", candidates, {
        year: 1980,
        mediaType: "tv",
      });
      expect(match?.identifier).toBe("oppenheimer-tv-1980");
    });

    it("fuzzy matches titles with punctuation differences", () => {
      const spidermanCandidates: ProviderSearchResult[] = [
        {
          identifier: "spiderman-far-from-home",
          name: "Spider-Man: Far From Home",
          mediaType: "movie",
          year: 2019,
        },
        {
          identifier: "spiderman-homecoming",
          name: "Spider-Man: Homecoming",
          mediaType: "movie",
          year: 2017,
        },
      ];

      const match = matchBestSearchResult(
        "Spiderman Far from Home",
        spidermanCandidates,
        { year: 2019, mediaType: "movie" },
      );
      expect(match?.identifier).toBe("spiderman-far-from-home");
    });
  });
});
