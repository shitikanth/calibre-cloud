import { createContext, useContext, type ReactNode } from 'react';
import type { Renderers } from './renderer.ts';

const RendererContext = createContext<Renderers | undefined>(undefined);

export function RendererProvider({ renderers, children }: { renderers: Renderers; children: ReactNode }) {
  return <RendererContext value={renderers}>{children}</RendererContext>;
}

export function useRenderers(): Renderers {
  const renderers = useContext(RendererContext);
  if (!renderers) throw new Error('useRenderers must be used inside RendererProvider');
  return renderers;
}
