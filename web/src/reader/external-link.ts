const openableProtocols = new Set(['http:', 'https:', 'mailto:']);

export function canOpenExternally(url: string): boolean {
  return URL.canParse(url) && openableProtocols.has(new URL(url).protocol);
}
