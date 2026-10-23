import { useState, type FormEvent } from 'react';
import { useConnection } from '../connection/context.tsx';
import { parseMegaFolderLink, type MegaLinkProblem } from '../storage/mega/link.ts';

const problemMessages: Record<MegaLinkProblem, string> = {
  'not-a-folder-link': 'That isn’t a MEGA folder link. It should look like https://mega.nz/folder/…#…',
  'missing-key': 'The link is missing its key, the part after “#”. Copy the whole link from MEGA.',
};

export function ConnectScreen() {
  const { connect } = useConnection();
  const [problem, setProblem] = useState<MegaLinkProblem | undefined>();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = parseMegaFolderLink(String(new FormData(event.currentTarget).get('link') ?? ''));
    if (parsed.ok) connect({ provider: 'mega', link: parsed.link });
    else setProblem(parsed.problem);
  };

  return (
    <section>
      <h1 className="text-3xl font-semibold">calibre-cloud</h1>
      <p className="mt-2 text-neutral-600">Browse your Calibre library straight from a MEGA shared folder.</p>
      <form className="mt-6 flex flex-col gap-2" onSubmit={submit} noValidate>
        <label htmlFor="link" className="font-medium">
          MEGA folder link
        </label>
        <input
          id="link"
          name="link"
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://mega.nz/folder/…#…"
          aria-invalid={problem !== undefined}
          aria-describedby={problem ? 'link-problem' : undefined}
          className="rounded border border-neutral-400 px-3 py-2"
        />
        {problem && (
          <p id="link-problem" role="alert" className="text-red-700">
            {problemMessages[problem]}
          </p>
        )}
        <button type="submit" className="self-start rounded bg-neutral-900 px-4 py-2 text-white">
          Connect
        </button>
      </form>
    </section>
  );
}
