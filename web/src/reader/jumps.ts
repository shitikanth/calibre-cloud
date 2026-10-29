import type { Relocation } from './renderer.ts';

const turnsBeforeForgetting = 3;

export type JumpTarget = { location: string } | { fraction: number };

export type Jump = (target: JumpTarget) => Promise<void>;

export type Jumps = {
  readonly origin: Relocation | undefined;
  relocate(relocation: Relocation): void;
  jump(go: () => Promise<void>): Promise<void>;
  turn(): void;
  back(goTo: (location: string) => Promise<void>): Promise<void>;
  subscribe(listener: () => void): () => void;
};

export function trackJumps(): Jumps {
  const listeners = new Set<() => void>();
  let current: Relocation | undefined;
  let from: Relocation | undefined;
  let origin: Relocation | undefined;
  let turns = 0;
  let latestJump = 0;

  const showOrigin = (next: Relocation | undefined) => {
    if (next === origin) return;
    origin = next;
    for (const listener of listeners) listener();
  };
  const forget = () => {
    from = undefined;
    showOrigin(undefined);
  };

  return {
    get origin() {
      return origin;
    },
    relocate(relocation) {
      current = relocation;
    },
    async jump(go) {
      const id = ++latestJump;
      from ??= current;
      try {
        await go();
      } finally {
        if (id === latestJump) {
          turns = 0;
          if (from && current && current.location !== from.location) showOrigin(from);
          else forget();
        }
      }
    },
    turn() {
      if (!origin) return;
      turns += 1;
      if (turns >= turnsBeforeForgetting) forget();
    },
    async back(goTo) {
      const target = origin;
      latestJump += 1;
      forget();
      if (target) await goTo(target.location);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
