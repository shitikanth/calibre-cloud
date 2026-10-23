import type { ReaderStyles, ReaderTheme } from './renderer.ts';

export type ReaderSettings = ReaderStyles;

export const readerThemes: ReaderTheme[] = ['light', 'sepia', 'dark'];

export const defaultReaderSettings: ReaderSettings = { fontSize: 100, theme: 'light' };

export const fontSizeRange = { min: 50, max: 300, step: 10 };

const storageKey = 'calibre-cloud:reader-settings';

export function loadReaderSettings(): ReaderSettings {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (isReaderSettings(stored)) return stored;
  } catch {
    return defaultReaderSettings;
  }
  return defaultReaderSettings;
}

export function saveReaderSettings(settings: ReaderSettings): void {
  localStorage.setItem(storageKey, JSON.stringify(settings));
}

export function stepFontSize(settings: ReaderSettings, direction: 1 | -1): ReaderSettings {
  const next = Math.min(fontSizeRange.max, Math.max(fontSizeRange.min, settings.fontSize + direction * fontSizeRange.step));
  return { ...settings, fontSize: next };
}

function isReaderSettings(value: unknown): value is ReaderSettings {
  if (typeof value !== 'object' || value === null) return false;
  const { fontSize, theme } = value as Record<string, unknown>;
  return (
    typeof fontSize === 'number' &&
    Number.isFinite(fontSize) &&
    fontSize >= fontSizeRange.min &&
    fontSize <= fontSizeRange.max &&
    readerThemes.includes(theme as ReaderTheme)
  );
}
