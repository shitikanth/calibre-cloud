import { useEffect, useRef } from 'react';
import { useInView } from './use-in-view.ts';

type LoadMoreProps = { loaded: number; loading: boolean; loadMore: () => Promise<unknown> };

export function LoadMore({ loaded, loading, loadMore }: LoadMoreProps) {
  const sentinel = useRef<HTMLDivElement>(null);
  const nearEnd = useInView(sentinel, { rootMargin: '800px' });

  useEffect(() => {
    if (nearEnd && !loading) void loadMore();
  }, [nearEnd, loading, loadMore, loaded]);

  return (
    <div ref={sentinel} className="py-6 text-center text-sm text-neutral-600">
      {loading && 'Loading more books…'}
    </div>
  );
}
