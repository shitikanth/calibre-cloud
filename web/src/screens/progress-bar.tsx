type ProgressBarProps = { label: string; loaded: number; total: number; className: string };

export function ProgressBar({ label, loaded, total, className }: ProgressBarProps) {
  const percent = total > 0 ? Math.floor((loaded / total) * 100) : undefined;
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <progress aria-label={label} className="min-w-0 flex-1" max={100} {...(percent === undefined ? {} : { value: percent })} />
      {percent !== undefined && <span className="text-sm text-neutral-600">{percent}%</span>}
    </span>
  );
}
