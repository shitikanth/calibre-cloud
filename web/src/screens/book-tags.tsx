export function BookTags({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <ul aria-label="Tags" className="flex flex-wrap gap-2 text-sm">
      {tags.map((tag) => (
        <li key={tag} className="rounded-full bg-neutral-100 px-3 py-1 break-words">
          {tag}
        </li>
      ))}
    </ul>
  );
}
