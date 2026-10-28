import { useState, type FormEvent } from 'react';
import { useConnection, useProviders } from '../connection/context.tsx';
import type { LinkProvider } from '../storage/provider.ts';
import type { SignInProvider } from '../storage/sign-in.ts';
import { useConnectLinkInput } from './connect-link.tsx';
import { pickerPath } from './library-picker.tsx';
import { SignInProblem } from './sign-in-outcome.tsx';

export function ConnectScreen() {
  const { linkProviders, signInProviders } = useProviders();
  const linked = useLinkedInput();
  return (
    <div className="flex justify-center sm:py-12">
      <section
        aria-labelledby="connect-title"
        className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-6 shadow-sm sm:p-8"
      >
        <h1 id="connect-title" className="text-3xl font-semibold">
          calibre-cloud
        </h1>
        <p className="mt-2 text-neutral-600">Browse your Calibre library straight from the cloud storage it lives in.</p>
        {linkProviders.map((provider) => (
          <ConnectForm key={provider.id} provider={provider} initial={linked?.provider === provider ? linked : undefined} />
        ))}
        {signInProviders.length > 0 && (
          <div className="mt-6 flex flex-col gap-2">
            <SignInProblem />
            {signInProviders.map((provider) => (
              <SignInButton key={provider.id} provider={provider} />
            ))}
          </div>
        )}
      </section>
    </div>
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
  const { name, label, placeholder } = provider.connectForm;
  const inputId = `${provider.id}-connect`;
  const problemId = `${provider.id}-connect-problem`;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = provider.parseConnectInput(String(new FormData(event.currentTarget).get('input') ?? ''));
    if (parsed.ok) connect(parsed.connection);
    else setProblem(parsed.problem);
  };

  return (
    <form aria-label={`Connect ${name}`} className="mt-6 flex flex-col gap-2" onSubmit={submit} noValidate>
      <label htmlFor={inputId} className="font-medium">
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
        className="rounded border border-neutral-400 px-3 py-2"
      />
      {problem && (
        <p id={problemId} role="alert" className="text-red-700">
          {problem}
        </p>
      )}
      <button type="submit" className="self-start rounded bg-neutral-900 px-4 py-2 text-white">
        Connect
      </button>
    </form>
  );
}

function SignInButton({ provider }: { provider: SignInProvider }) {
  const { signInHref } = useProviders();
  return (
    <a
      href={signInHref(provider, pickerPath(provider.id))}
      className="inline-flex min-h-11 items-center justify-center rounded border border-neutral-400 px-4 py-2 hover:bg-neutral-100"
    >
      Sign in with {provider.name}
    </a>
  );
}
