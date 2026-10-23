import { useEffect, useRef } from 'react';
import type { BookSummary } from '../library/protocol.ts';
import { useCover } from '../library/use-cover.ts';
import { useInView } from './use-in-view.ts';

export type CoverSize = 'thumbnail' | 'full';

export function BookCover({ book, size }: { book: BookSummary; size: CoverSize }) {
  const frame = useRef<HTMLDivElement>(null);
  const inView = useInView(frame, { rootMargin: '200px', once: true });
  const cover = useCover(book, size === 'full' || inView);

  if (!book.cover || cover.isError) return <CoverPlaceholder title={book.title} />;
  return (
    <div ref={frame} className="aspect-2/3 overflow-hidden rounded bg-neutral-200">
      {cover.data && <BlobImage blob={cover.data} alt={`Cover of ${book.title}`} />}
    </div>
  );
}

function BlobImage({ blob, alt }: { blob: Blob; alt: string }) {
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(blob);
    if (image.current) image.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  return <img ref={image} alt={alt} decoding="async" className="h-full w-full object-cover" />;
}

function CoverPlaceholder({ title }: { title: string }) {
  return (
    <div
      role="img"
      aria-label={`No cover for ${title}`}
      className="flex aspect-2/3 items-center justify-center overflow-hidden rounded bg-neutral-300 p-3 text-center font-serif text-neutral-700"
    >
      <span className="line-clamp-6 break-words">{title}</span>
    </div>
  );
}
