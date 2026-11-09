/**
 * Training and answer-engine crawlers. Search crawlers (Googlebot, Bingbot, Applebot) stay allowed.
 * robots.txt names them, and the proxy refuses them so a bot that ignores robots.txt still gets nothing.
 */
export const AI_CRAWLERS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "anthropic-ai",
  "Google-Extended",
  "CCBot",
  "Bytespider",
  "Amazonbot",
  "Applebot-Extended",
  "Meta-ExternalAgent",
  "FacebookBot",
  "PerplexityBot",
  "Perplexity-User",
  "YouBot",
  "Diffbot",
  "cohere-ai",
  "ImagesiftBot",
  "PetalBot",
  "Timpibot",
  "omgili",
] as const;

const NEEDLES = AI_CRAWLERS.map((agent) => agent.toLowerCase());

/** True when the User-Agent is one of the named AI crawlers. */
export function isAiCrawler(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return NEEDLES.some((needle) => ua.includes(needle));
}
