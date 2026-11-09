import { describe, expect, it } from "vitest";
import { AI_CRAWLERS, isAiCrawler } from "./crawlers";

describe("isAiCrawler", () => {
  it("names the crawlers the product has to keep out", () => {
    expect(AI_CRAWLERS).toContain("ClaudeBot");
    expect(AI_CRAWLERS).toContain("GPTBot");
    expect(AI_CRAWLERS).not.toContain("Googlebot");
  });

  it("matches those agents and leaves ordinary browsers and search crawlers alone", () => {
    expect(isAiCrawler("Mozilla/5.0 (compatible; ClaudeBot/1.0)")).toBe(true);
    expect(isAiCrawler("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 GPTBot/1.2")).toBe(true);
    expect(isAiCrawler("Mozilla/5.0 (compatible; Google-Extended)")).toBe(true);
    expect(isAiCrawler("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(false);
    expect(isAiCrawler("Mozilla/5.0 (Macintosh) Chrome/120.0.0.0 Safari/537.36")).toBe(false);
    expect(isAiCrawler(null)).toBe(false);
    expect(isAiCrawler("")).toBe(false);
  });
});
