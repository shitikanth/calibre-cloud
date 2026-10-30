import 'vitest/browser';

declare module 'vitest/browser' {
  interface BrowserCommands {
    emulateReducedMotion: (reducedMotion: 'reduce' | null) => Promise<void>;
  }
}
