import type {
  MediaType,
  ProviderSearchResult,
  TitleMatcherOptions,
} from "./types.js";
import { getLogger } from "./utils/logger.js";

export type { TitleMatcherOptions };

/**
 * Normalizes title string by removing punctuation, converting accents/quotes,
 * collapsing whitespace, and lowercasing.
 */
export function normalizeTitle(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/–/g, "-")
    .replace(/\band\b/g, "&")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Tokenizes a string into a set of distinct words.
 */
export function tokenize(str: string): string[] {
  const norm = normalizeTitle(str);
  if (!norm) return [];
  return norm.split(" ").filter((w) => w.length > 0);
}

/**
 * Computes the standard Levenshtein edit distance between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  const s1 = a.toLowerCase();
  const s2 = b.toLowerCase();
  const m = s1.length;
  const n = s2.length;

  if (m === 0) return n;
  if (n === 0) return m;

  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    const c1 = s1.charAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const c2 = s2.charAt(j - 1);
      const cost = c1 === c2 ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1, // insertion
        prev[j] + 1, // deletion
        prev[j - 1] + cost, // substitution
      );
    }
    const temp = prev;
    prev = curr;
    curr = temp;
  }

  return prev[n];
}

/**
 * Returns Levenshtein similarity between 0 (completely different) and 1.0 (identical).
 */
export function levenshteinSimilarity(a: string, b: string): number {
  const s1 = normalizeTitle(a);
  const s2 = normalizeTitle(b);

  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;

  const dist = levenshteinDistance(s1, s2);
  const maxLen = Math.max(s1.length, s2.length);
  return Math.max(0, 1 - dist / maxLen);
}

/**
 * Computes token similarity (Sørensen–Dice coefficient) between two strings.
 */
export function tokenSimilarity(a: string, b: string): number {
  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));

  if (tokensA.size === 0 && tokensB.size === 0) return 1.0;
  if (tokensA.size === 0 || tokensB.size === 0) return 0.0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) {
      intersection++;
    }
  }

  return (2 * intersection) / (tokensA.size + tokensB.size);
}

/**
 * Calculates a year match score:
 * - Exact match: 40 points
 * - Within tolerance (default ±1): 25 points
 * - Outside tolerance: -30 points
 */
export function calculateYearScore(
  targetYear?: number,
  candidateYear?: number,
  tolerance: number = 1,
): number {
  if (!targetYear || !candidateYear) return 0;

  const diff = Math.abs(targetYear - candidateYear);
  if (diff === 0) return 40;
  if (diff <= tolerance) return 25;
  return -30;
}

/**
 * Calculates a media type match score:
 * - Exact match: 20 points
 * - Mismatch: -30 points
 */
export function calculateMediaTypeScore(
  targetType?: MediaType,
  candidateType?: MediaType,
): number {
  if (!targetType || !candidateType) return 0;
  return targetType === candidateType ? 20 : -30;
}

/**
 * Selects the best candidate from search results using Levenshtein distance,
 * token similarity, year tolerance matching (±1 year), and media type matching.
 */
export function matchBestSearchResult(
  targetTitles: string | string[],
  searchResults: ProviderSearchResult[],
  options?: TitleMatcherOptions,
): ProviderSearchResult | null {
  if (!searchResults || searchResults.length === 0) return null;
  if (searchResults.length === 1 && !options?.year && !options?.mediaType) {
    return searchResults[0];
  }

  const titles = Array.isArray(targetTitles) ? targetTitles : [targetTitles];
  const validTitles = titles
    .map((t) => (typeof t === "string" ? t.trim() : ""))
    .filter((t): t is string => t.length > 0);

  if (validTitles.length === 0) {
    return searchResults[0];
  }

  const log = getLogger();
  const yearTolerance = options?.yearTolerance ?? 1;

  let bestMatch: ProviderSearchResult | null = null;
  let bestScore = -Infinity;

  for (const candidate of searchResults) {
    let maxTitleScore = -Infinity;

    for (const target of validTitles) {
      const normTarget = normalizeTitle(target);
      const normCand = normalizeTitle(candidate.name);

      if (normTarget === normCand) {
        maxTitleScore = Math.max(maxTitleScore, 100);
        continue;
      }

      // Check Levenshtein similarity (0 to 1 -> 0 to 60 points)
      const levSim = levenshteinSimilarity(normTarget, normCand);
      // Check Token similarity (0 to 1 -> 0 to 40 points)
      const tokSim = tokenSimilarity(normTarget, normCand);

      let titleScore = levSim * 60 + tokSim * 40;

      // Substring bonus if one contains the other
      if (normTarget.includes(normCand) || normCand.includes(normTarget)) {
        titleScore += 15;
      }

      if (titleScore > maxTitleScore) {
        maxTitleScore = titleScore;
      }
    }

    let score = maxTitleScore;

    // Apply Year score
    if (options?.year) {
      score += calculateYearScore(options.year, candidate.year, yearTolerance);
    }

    // Apply Media Type score
    if (options?.mediaType) {
      score += calculateMediaTypeScore(options.mediaType, candidate.mediaType);
    }

    log.debug(
      {
        candidate: candidate.name,
        candidateYear: candidate.year,
        candidateType: candidate.mediaType,
        score,
      },
      "Candidate fuzzy match score",
    );

    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  return bestMatch;
}
