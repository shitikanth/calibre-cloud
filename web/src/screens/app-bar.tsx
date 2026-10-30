import { Link } from '@tanstack/react-router';
import { useDisconnect } from '../library/use-disconnect.ts';
import { CopyConnectLinkOutcome, useCopyConnectLink } from './copy-connect-link.tsx';
import { DisconnectFailure } from './disconnect-button.tsx';
import { OverflowMenu } from './overflow-menu.tsx';
import { SearchBox } from './search-box.tsx';

export function AppBar() {
  const disconnect = useDisconnect();
  const copyLink = useCopyConnectLink();
  return (
    <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2 sm:px-6">
        <Link to="/" className="shrink-0 font-semibold">
          calibre-cloud
        </Link>
        <SearchBox />
        <OverflowMenu disconnect={disconnect} copyLink={copyLink} />
      </div>
      <CopyConnectLinkOutcome copyLink={copyLink} className="mx-auto max-w-6xl px-4 pb-2 sm:px-6" />
      <DisconnectFailure disconnect={disconnect} className="mx-auto max-w-6xl px-4 pb-2 sm:px-6" />
    </header>
  );
}
