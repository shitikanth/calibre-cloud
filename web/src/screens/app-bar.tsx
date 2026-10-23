import { Link } from '@tanstack/react-router';
import { useDisconnect } from '../library/use-disconnect.ts';
import { OverflowMenu } from './overflow-menu.tsx';
import { SearchBox } from './search-box.tsx';

export function AppBar() {
  const disconnect = useDisconnect();
  return (
    <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2 sm:px-6">
        <Link to="/" className="shrink-0 font-semibold">
          calibre-cloud
        </Link>
        <SearchBox />
        <OverflowMenu disconnect={disconnect} />
      </div>
      {disconnect.isError && (
        <p role="alert" className="mx-auto max-w-6xl px-4 pb-2 text-sm text-red-700 sm:px-6">
          Couldn’t disconnect: {disconnect.error.message}
        </p>
      )}
    </header>
  );
}
