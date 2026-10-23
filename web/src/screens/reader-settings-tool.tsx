import { useRef, useState } from 'react';
import { readerThemes, stepFontSize, fontSize, type ReaderSettings } from '../reader/reader-settings.ts';
import type { BookRenderer, ReaderTheme } from '../reader/renderer.ts';
import { panelClass, toolButtonClass } from './reader-toc.tsx';
import { useDismiss } from './use-dismiss.ts';

const themeLabels: Record<ReaderTheme, string> = { light: 'Light', sepia: 'Sepia', dark: 'Dark' };
const stepButtonClass = 'rounded border border-(--reader-line) px-3 py-1 text-sm hover:bg-(--reader-hover) disabled:opacity-50 disabled:hover:bg-transparent';

export type SettingsToolProps = {
  renderer: BookRenderer;
  settings: ReaderSettings;
  onSettingsChange: (settings: ReaderSettings) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
};

export function SettingsTool({ renderer, settings, onSettingsChange, zoom, onZoomChange }: SettingsToolProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), root);

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        aria-label="Settings"
        aria-expanded={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className={toolButtonClass}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 fill-none stroke-current stroke-2">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
        </svg>
      </button>
      {open && (
        <section role="dialog" aria-label="Settings" className={`${panelClass} flex flex-col gap-4 p-4 text-sm`}>
          {renderer.setStyles && (
            <>
              <Stepper
                label="Text size"
                value={`${settings.fontSize}%`}
                decrease={{ label: 'Smaller text', disabled: settings.fontSize <= fontSize.min, act: () => onSettingsChange(stepFontSize(settings, -1)) }}
                increase={{ label: 'Larger text', disabled: settings.fontSize >= fontSize.max, act: () => onSettingsChange(stepFontSize(settings, 1)) }}
              />
              <div role="radiogroup" aria-label="Theme" className="flex gap-4">
                {readerThemes.map((theme) => (
                  <label key={theme} className="flex items-center gap-1">
                    <input
                      type="radio"
                      name="reader-theme"
                      value={theme}
                      checked={settings.theme === theme}
                      onChange={() => onSettingsChange({ ...settings, theme })}
                    />
                    {themeLabels[theme]}
                  </label>
                ))}
              </div>
            </>
          )}
          {renderer.setZoom && (
            <Stepper
              label="Zoom"
              value={`${Math.round(zoom * 100)}%`}
              decrease={{ label: 'Zoom out', act: () => onZoomChange(zoom / 1.25) }}
              increase={{ label: 'Zoom in', act: () => onZoomChange(zoom * 1.25) }}
            />
          )}
        </section>
      )}
    </div>
  );
}

type Step = { label: string; disabled?: boolean; act: () => void };

function Stepper({ label, value, decrease, increase }: { label: string; value: string; decrease: Step; increase: Step }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <span className="flex items-center gap-2">
        <button type="button" className={stepButtonClass} disabled={decrease.disabled} onClick={decrease.act}>
          {decrease.label}
        </button>
        <span className="w-12 text-center tabular-nums">{value}</span>
        <button type="button" className={stepButtonClass} disabled={increase.disabled} onClick={increase.act}>
          {increase.label}
        </button>
      </span>
    </div>
  );
}
