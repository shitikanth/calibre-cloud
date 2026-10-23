import DOMPurify from 'dompurify';
import { useMemo } from 'react';

const purifyConfig = {
  FORBID_TAGS: ['style', 'img', 'form', 'input', 'button', 'textarea', 'select'],
  FORBID_ATTR: ['style', 'class', 'id'],
};

export function BookDescription({ html }: { html: string }) {
  const clean = useMemo(() => DOMPurify.sanitize(html, purifyConfig), [html]);
  return (
    <section aria-label="Description" className="description mt-6 max-w-prose break-words" dangerouslySetInnerHTML={{ __html: clean }} />
  );
}
