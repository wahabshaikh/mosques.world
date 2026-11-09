/** Lobby screen and the embeddable widget. No install prompt and no analytics consent bar. */
export function isKioskPath(pathname: string): boolean {
  return /^(?:\/[a-z]{2})?\/m\/[^/]+\/(?:display|widget)\/?$/.test(pathname);
}
