import type { LoadProgress } from '../../../library/use-library.ts';
import { ProgressBar } from './progress-bar.tsx';

export function LoadingLibrary({ progress }: { progress: LoadProgress | undefined }) {
  return (
    <section>
      <h1 className="text-xl font-semibold">Loading your library…</h1>
      <ProgressBar
        label="Downloading library"
        loaded={progress?.loaded ?? 0}
        total={progress?.total ?? 0}
        className="mt-4 w-full"
      />
    </section>
  );
}
