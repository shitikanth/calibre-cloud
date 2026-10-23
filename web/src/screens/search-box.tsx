import { useLocation, useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

export function SearchBox() {
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  const { q } = useSearch({ strict: false });
  const term = typeof q === 'string' ? q : '';
  const input = useRef<HTMLInputElement>(null);
  const onLibrary = pathname === '/';
  const leftForLibrary = useRef(false);

  useEffect(() => {
    if (!onLibrary) leftForLibrary.current = false;
    if (input.current && (!onLibrary || document.activeElement !== input.current)) input.current.value = term;
  }, [term, onLibrary]);

  const change = (value: string) => {
    const replace = onLibrary || leftForLibrary.current;
    leftForLibrary.current = true;
    void navigate({ to: '/', search: value.trim() ? { q: value } : {}, replace });
  };

  return (
    <form role="search" className="min-w-0 flex-1" onSubmit={(event) => event.preventDefault()}>
      <input
        ref={input}
        type="search"
        aria-label="Search books"
        placeholder="Search title, author, series, or tag"
        defaultValue={term}
        onChange={(event) => change(event.target.value)}
        className="w-full rounded border border-neutral-400 px-3 py-1.5"
      />
    </form>
  );
}
