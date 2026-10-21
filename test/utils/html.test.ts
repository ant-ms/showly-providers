import { describe, it, expect } from "vitest";
import {
  decodeHtmlEntities,
  extractAttribute,
  stripHtml,
} from "../../src/utils/html.js";

describe("html utility", () => {
  it("decodes HTML entities and normalizes quotes", () => {
    expect(decodeHtmlEntities("&amp; &lt; &gt; &quot;")).toBe('& < > "');
    expect(
      decodeHtmlEntities("It&#39;s &ldquo;Showly&rdquo; &ndash; Providers"),
    ).toBe('It\'s "Showly" - Providers');
  });

  it("extracts attribute from html snippet", () => {
    const snippet =
      '<a href="/movie/123" data-id="xyz_789" title="Test Title">';
    expect(extractAttribute(snippet, "data-id")).toBe("xyz_789");
    expect(extractAttribute(snippet, "href")).toBe("/movie/123");
    expect(extractAttribute(snippet, "title")).toBe("Test Title");
    expect(extractAttribute(snippet, "nonexistent")).toBeNull();
  });

  it("strips HTML tags and collapses spaces", () => {
    const raw = "<div><h1>Title</h1> <p>Some <b>bold</b> text.</p></div>";
    expect(stripHtml(raw)).toBe("Title Some bold text.");
  });
});
