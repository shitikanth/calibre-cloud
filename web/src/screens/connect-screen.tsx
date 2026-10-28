import { Link } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { useConnection, useProviders } from '../connection/context.tsx';
import type { LinkProvider, StorageProvider } from '../storage/provider.ts';
import { useConnectLinkInput } from './connect-link.tsx';
import { connectPath } from './connect-path.ts';
import { SignInProblem } from './sign-in-outcome.tsx';

const headingClass = 'font-serif text-[34px] leading-[1.12] font-medium tracking-[-0.01em]';

export function ConnectScreen({ provider }: { provider?: LinkProvider | undefined }) {
  return (
    <div className="flex justify-center sm:py-12">
      <div aria-hidden="true" className="fixed inset-0 -z-10 hidden bg-neutral-50 sm:block" />
      <section
        aria-labelledby="connect-title"
        className="w-full max-w-md bg-white px-2 pt-4 pb-7 text-neutral-900 sm:rounded-xl sm:border sm:border-neutral-200 sm:px-10 sm:pt-11 sm:pb-8"
      >
        {provider ? <LinkStep provider={provider} /> : <ChooseProvider />}
      </section>
    </div>
  );
}

function ChooseProvider() {
  const { allProviders } = useProviders();
  return (
    <>
      <p className="text-sm/[1.5] font-semibold text-neutral-600">calibre-cloud</p>
      <h1 id="connect-title" className={`mt-7 ${headingClass}`}>
        Connect your Calibre library
      </h1>
      <SignInProblem className="mt-4" />
      <ul className="mt-7 grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-3">
        {allProviders.map((provider) => (
          <li key={provider.id}>
            <ProviderTile provider={provider} />
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm/[1.5] text-neutral-600">
        Read-only. calibre-cloud never changes your library, and your books go straight from your storage to this
        browser.
      </p>
    </>
  );
}

const tileClass =
  'flex min-h-30 flex-col items-center justify-center gap-2.5 rounded-xl border border-neutral-200 px-2 py-4 hover:border-neutral-300 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900';

function ProviderTile({ provider }: { provider: StorageProvider }) {
  const { signInHref } = useProviders();
  const content = (
    <>
      <img src={provider.icon} alt="" className="size-12" />
      <span className="text-[15px] font-semibold">{provider.name}</span>
    </>
  );
  if (provider.kind === 'sign-in') {
    return (
      <a href={signInHref(provider, connectPath(provider.id))} className={tileClass}>
        {content}
      </a>
    );
  }
  return (
    <Link to="/connect/$provider" params={{ provider: provider.id }} className={tileClass}>
      {content}
    </Link>
  );
}

function LinkStep({ provider }: { provider: LinkProvider }) {
  const linked = useLinkedInput();
  return (
    <>
      <Link
        to="/"
        className="-mt-2.5 -ml-1 inline-flex min-h-11 items-center gap-1.5 px-1 text-[15px] text-neutral-600 hover:text-neutral-900"
      >
        <span aria-hidden="true">‹</span> All storage
      </Link>
      <h1 id="connect-title" className={`mt-7 ${headingClass}`}>
        {provider.name}
      </h1>
      <p className="mt-2.5 text-neutral-600">{provider.connectForm.hint}</p>
      <ConnectForm provider={provider} initial={linked?.provider === provider ? linked : undefined} />
    </>
  );
}

type InitialInput = { input: string; problem: string | undefined };

function useLinkedInput(): (InitialInput & { provider: LinkProvider }) | undefined {
  const { resolveConnectInput } = useProviders();
  const input = useConnectLinkInput();
  if (input === undefined) return undefined;
  const { provider, parsed } = resolveConnectInput(input);
  return { provider, input, problem: parsed.ok ? undefined : parsed.problem };
}

function ConnectForm({ provider, initial }: { provider: LinkProvider; initial: InitialInput | undefined }) {
  const { connect } = useConnection();
  const [problem, setProblem] = useState(initial?.problem);
  const { label, placeholder } = provider.connectForm;
  const inputId = `${provider.id}-connect`;
  const problemId = `${provider.id}-connect-problem`;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = provider.parseConnectInput(String(new FormData(event.currentTarget).get('input') ?? ''));
    if (parsed.ok) connect(parsed.connection);
    else setProblem(parsed.problem);
  };

  return (
    <form aria-label={`Connect ${provider.name}`} className="mt-7 flex flex-col gap-2" onSubmit={submit} noValidate>
      <label htmlFor={inputId} className="font-semibold">
        {label}
      </label>
      <input
        id={inputId}
        name="input"
        type="text"
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        defaultValue={initial?.input}
        aria-invalid={problem !== undefined}
        aria-describedby={problem ? problemId : undefined}
        className="min-h-12 rounded-lg border border-neutral-400 bg-white px-3 placeholder:text-neutral-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neutral-900"
      />
      {problem && (
        <p id={problemId} role="alert" className="text-red-700">
          {problem}
        </p>
      )}
      <button
        type="submit"
        className="mt-2 min-h-12 rounded-lg bg-neutral-900 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
      >
        Connect
      </button>
    </form>
  );
}
