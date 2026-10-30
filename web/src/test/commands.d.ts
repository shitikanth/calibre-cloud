import 'vitest/browser';

declare module 'vitest/browser' {
  export interface BrowserCommands {
    emulateReducedMotion: (reducedMotion: 'reduce' | null) => Promise<void>;
  }
}
