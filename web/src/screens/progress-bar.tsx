import { formatSize } from './format.ts';

type Progress = { loaded: number; total: number };
type ProgressBarProps = Progress & { label: string; className: string };

function percentOf({ loaded, total }: Progress): number | undefined {
  return total > 0 ? Math.min(100, Math.floor((loaded / total) * 100)) : undefined;
}

export function describeProgress(progress: Progress): string {
  const percent = percentOf(progress);
  if (percent !== undefined) return `${formatSize(progress.loaded)} of ${formatSize(progress.total)} · ${percent}%`;
  return progress.loaded > 0 ? `${formatSize(progress.loaded)} downloaded` : '';
}

function Fill({ percent }: { percent: number | undefined }) {
  if (percent === undefined) {
    return <span className="absolute inset-y-0 left-[35%] w-[30%] rounded-full bg-current animate-progress-slide motion-reduce:animate-none" />;
  }
  return (
    <span
      className="absolute inset-y-0 left-0 rounded-full bg-current transition-[width] duration-200 ease-out"
      style={{ width: `${percent}%` }}
    />
  );
}

function progressAria(label: string, percent: number | undefined) {
  return {
    role: 'progressbar',
    'aria-label': label,
    'aria-valuemin': 0,
    'aria-valuemax': 100,
    ...(percent === undefined ? {} : { 'aria-valuenow': percent }),
  } as const;
}

export function ProgressBar({ label, loaded, total, className }: ProgressBarProps) {
  const percent = percentOf({ loaded, total });
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <span {...progressAria(label, percent)} className="relative h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-neutral-200 text-neutral-900">
        <Fill percent={percent} />
      </span>
      {percent !== undefined && <span className="text-xs text-neutral-600 tabular-nums">{percent}%</span>}
    </span>
  );
}

export function TopProgressBar({ label, loaded, total, className }: ProgressBarProps) {
  const percent = percentOf({ loaded, total });
  return (
    <span {...progressAria(label, percent)} className={`fixed inset-x-0 top-0 z-30 h-[3px] overflow-hidden ${className}`}>
      <Fill percent={percent} />
    </span>
  );
}
