import { useState, type FormEvent } from 'react';
import { useConnection } from '../connection/context.tsx';
import type { StorageProvider } from '../storage/provider.ts';
import { providers } from '../storage/providers.ts';

export function ConnectScreen() {
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
        {providers.map((provider) => (
          <ConnectForm key={provider.id} provider={provider} />
        ))}
      </section>
    </div>
  );
}

function ConnectForm({ provider }: { provider: StorageProvider }) {
  const { connect } = useConnection();
  const [problem, setProblem] = useState<string | undefined>();
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
