import { fontSizeRange, readerThemes, stepFontSize, type ReaderSettings } from '../reader/reader-settings.ts';
import type { BookRenderer, ReaderTheme } from '../reader/renderer.ts';
import { panelClass, ReaderPopover } from './reader-popover.tsx';

const themeLabels: Record<ReaderTheme, string> = { light: 'Light', sepia: 'Sepia', dark: 'Dark' };
const zoomStep = 1.25;
const zoomRange = { min: 0.25, max: 4 };
const stepButtonClass =
  'min-h-11 min-w-11 rounded border border-(--reader-line) px-3 py-1 text-sm hover:bg-(--reader-hover) disabled:opacity-50 disabled:hover:bg-transparent';

export type SettingsToolProps = {
  renderer: BookRenderer;
  settings: ReaderSettings;
  onSettingsChange: (settings: ReaderSettings) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
};

export function SettingsTool({ renderer, settings, onSettingsChange, zoom, onZoomChange }: SettingsToolProps) {
  const icon = (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
    </>
  );
  return (
    <ReaderPopover label="Settings" icon={icon}>
      {() => (
        <section role="dialog" aria-label="Settings" className={`${panelClass} flex flex-col gap-4 p-4 text-sm`}>
          {renderer.setStyles && (
            <>
              <Stepper
                label="Text size"
                value={`${settings.fontSize}%`}
                decrease={{
                  label: 'Smaller text',
                  disabled: settings.fontSize <= fontSizeRange.min,
                  act: () => onSettingsChange(stepFontSize(settings, -1)),
                }}
                increase={{
                  label: 'Larger text',
                  disabled: settings.fontSize >= fontSizeRange.max,
                  act: () => onSettingsChange(stepFontSize(settings, 1)),
                }}
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
              decrease={{ label: 'Zoom out', disabled: zoom <= zoomRange.min, act: () => onZoomChange(zoom / zoomStep) }}
              increase={{ label: 'Zoom in', disabled: zoom >= zoomRange.max, act: () => onZoomChange(zoom * zoomStep) }}
            />
          )}
        </section>
      )}
    </ReaderPopover>
  );
}

type Step = { label: string; disabled: boolean; act: () => void };

function Stepper({ label, value, decrease, increase }: { label: string; value: string; decrease: Step; increase: Step }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <span className="flex items-center gap-2">
        <StepButton step={decrease} glyph="−" />
        <span className="w-12 text-center tabular-nums">{value}</span>
        <StepButton step={increase} glyph="+" />
      </span>
    </div>
  );
}

function StepButton({ step, glyph }: { step: Step; glyph: string }) {
  return (
    <button type="button" aria-label={step.label} className={stepButtonClass} disabled={step.disabled} onClick={step.act}>
      {glyph}
    </button>
  );
}
