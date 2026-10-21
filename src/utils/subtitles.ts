import type { SubtitleTrack } from "../types.js";

const LANGUAGE_CODE_MAP: Record<string, string> = {
  spanish: "es",
  french: "fr",
  german: "de",
  italian: "it",
  portuguese: "pt",
  russian: "ru",
  arabic: "ar",
  japanese: "ja",
  chinese: "zh",
  korean: "ko",
  dutch: "nl",
  polish: "pl",
  swedish: "sv",
  turkish: "tr",
  hindi: "hi",
  greek: "el",
  hebrew: "he",
  thai: "th",
  vietnamese: "vi",
  indonesian: "id",
};

export function normalizeLanguageCode(labelOrLang: string): string {
  const lower = (labelOrLang || "").toLowerCase().trim();
  if (
    lower.startsWith("eng") ||
    lower.startsWith("en-") ||
    lower.startsWith("en_") ||
    lower === "en" ||
    lower.includes("english")
  ) {
    return "en";
  }

  for (const [name, code] of Object.entries(LANGUAGE_CODE_MAP)) {
    if (lower.includes(name) || lower === code) return code;
  }

  // Handle common 2 or 3 letter ISO codes (e.g. "spa" -> "es", "fre" / "fra" -> "fr", "ger" / "deu" -> "de")
  if (lower.startsWith("es-") || lower === "spa") return "es";
  if (lower.startsWith("fr-") || lower === "fra" || lower === "fre")
    return "fr";
  if (lower.startsWith("de-") || lower === "deu" || lower === "ger")
    return "de";
  if (lower.startsWith("it-") || lower === "ita") return "it";
  if (lower.startsWith("pt-") || lower === "por") return "pt";
  if (lower.startsWith("ru-") || lower === "rus") return "ru";
  if (lower.startsWith("ar-") || lower === "ara") return "ar";
  if (lower.startsWith("zh-") || lower === "zho" || lower === "chi")
    return "zh";
  if (lower.startsWith("ja-") || lower === "jpn") return "ja";

  return lower || "en";
}

export interface RawSubtitle {
  file?: string;
  src?: string;
  url?: string;
  label?: string;
  lang?: string;
  language?: string;
  kind?: string;
  default?: boolean;
}

export function parseSubtitles(rawSubs?: RawSubtitle[]): SubtitleTrack[] {
  if (!rawSubs || !Array.isArray(rawSubs)) return [];

  const filtered = rawSubs.filter((sub) => {
    const url = sub.file || sub.src || sub.url;
    const kind = (sub.kind || "").toLowerCase();
    const lang = (sub.lang || sub.language || "").toLowerCase();
    const isThumbnail = kind === "thumbnails" || lang === "thumbnails";
    return Boolean(url && !isThumbnail);
  });

  const hasExplicitDefault = filtered.some((s) => s.default === true);

  return filtered.map((sub, idx) => {
    const url = (sub.file || sub.src || sub.url)!;
    const rawLabel = sub.label || sub.lang || sub.language || "English";

    // If label specifies a known non-English language, prioritize the label
    const labelLang = sub.label ? normalizeLanguageCode(sub.label) : null;
    const isLabelNonEnglish = Boolean(labelLang && labelLang !== "en");

    const language = isLabelNonEnglish
      ? labelLang!
      : normalizeLanguageCode(sub.lang || sub.language || sub.label || "en");

    let isDefault = false;
    if (hasExplicitDefault) {
      isDefault = sub.default === true;
    } else {
      // Default to the first English track if no subtitle is explicitly marked default
      const isEnglish =
        language === "en" || rawLabel.toLowerCase().includes("english");
      const firstEnIndex = filtered.findIndex((s) => {
        const sLabelLang = s.label ? normalizeLanguageCode(s.label) : null;
        const sIsNonEn = Boolean(sLabelLang && sLabelLang !== "en");
        const sLang = sIsNonEn
          ? sLabelLang!
          : normalizeLanguageCode(s.lang || s.language || s.label || "en");
        return (
          sLang === "en" || (s.label || "").toLowerCase().includes("english")
        );
      });
      isDefault = isEnglish && idx === (firstEnIndex >= 0 ? firstEnIndex : 0);
    }

    return {
      label: rawLabel,
      language,
      url,
      default: isDefault,
    };
  });
}
