import { useLocation, useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

export function SearchBox() {
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  const { q } = useSearch({ strict: false });
  const term = typeof q === 'string' ? q : '';
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (input.current && document.activeElement !== input.current) input.current.value = term;
  }, [term, pathname]);

  const change = (value: string) => {
    void navigate({ to: '/', search: value.trim() ? { q: value } : {}, replace: pathname === '/' });
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
