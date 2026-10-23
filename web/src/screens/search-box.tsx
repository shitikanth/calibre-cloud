import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

export function SearchBox({ term }: { term: string }) {
  const navigate = useNavigate({ from: '/' });
  const [draft, setDraft] = useState(term);

  const change = (value: string) => {
    setDraft(value);
    void navigate({ search: value.trim() ? { q: value } : {}, replace: true });
  };

  return (
    <form role="search" className="mt-4" onSubmit={(event) => event.preventDefault()}>
      <input
        type="search"
        aria-label="Search books"
        placeholder="Search title, author, series, or tag"
        value={draft}
        onChange={(event) => change(event.target.value)}
        className="w-full rounded border border-neutral-400 px-3 py-2"
      />
    </form>
  );
}
