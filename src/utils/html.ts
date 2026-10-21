import { decode } from "html-entities";

/**
 * Decodes all HTML5 named, decimal, and hexadecimal entities,
 * normalizing curly quotes and en-dashes to standard ASCII.
 */
export function decodeHtmlEntities(str: string): string {
  if (!str) return "";
  return decode(str)
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/–/g, "-")
    .trim();
}

/**
 * Extracts attribute value from an HTML tag string using regex.
 */
export function extractAttribute(html: string, attr: string): string | null {
  const match = new RegExp(`${attr}=["']([^"']+)["']`, "i").exec(html);
  return match ? decodeHtmlEntities(match[1]) : null;
}

/**
 * Strips HTML tags from a string.
 */
export function stripHtml(html: string): string {
  if (!html) return "";
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}
