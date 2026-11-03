import { createFileRoute } from '@tanstack/react-router';
import { LibraryScreen } from '../../../screens/library-screen.tsx';

export const Route = createFileRoute('/_connected/_shell/')({
  validateSearch: (search: Record<string, unknown>): { q?: string } => {
    const q = search['q'];
    return typeof q === 'string' || typeof q === 'number' ? { q: String(q) } : {};
  },
  component: LibraryScreen,
});
