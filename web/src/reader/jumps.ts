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
  let landed = false;
  let turns = 0;
  let latestJump = 0;

  const set = (next: Relocation | undefined, nextLanded: boolean) => {
    const before = landed ? from : undefined;
    from = next;
    landed = nextLanded;
    if ((landed ? from : undefined) !== before) for (const listener of listeners) listener();
  };

  return {
    get origin() {
      return landed ? from : undefined;
    },
    relocate(relocation) {
      current = relocation;
    },
    async jump(go) {
      const id = ++latestJump;
      set(from ?? current, landed);
      turns = 0;
      try {
        await go();
      } finally {
        if (id === latestJump) {
          if (from && current && current.location !== from.location) set(from, true);
          else set(undefined, false);
        }
      }
    },
    turn() {
      if (!from) return;
      turns += 1;
      if (turns >= turnsBeforeForgetting) set(undefined, false);
    },
    async back(goTo) {
      const target = landed ? from : undefined;
      latestJump += 1;
      set(undefined, false);
      if (target) await goTo(target.location);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
