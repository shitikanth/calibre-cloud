import { useLocation, useRouter } from '@tanstack/react-router';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const prefix = 'signin-error=';

const SignInProblemContext = createContext<string | undefined>(undefined);

function readSignInError(hash: string): string | undefined {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
  return fragment.startsWith(prefix) ? fragment.slice(prefix.length) : undefined;
}

function problemFor(error: string | undefined): string | undefined {
  if (error === undefined) return undefined;
  return error === 'denied' ? 'Sign-in was cancelled.' : 'Couldn’t sign in. Try again.';
}

export function SignInOutcomeHandler({ children }: { children: ReactNode }) {
  const { hash, pathname, searchStr } = useLocation();
  const { history } = useRouter();
  const [problem] = useState(() => problemFor(readSignInError(hash)));

  useEffect(() => {
    if (readSignInError(hash) !== undefined) history.replace(`${pathname}${searchStr}`);
  }, [hash, pathname, searchStr, history]);

  return <SignInProblemContext value={problem}>{children}</SignInProblemContext>;
}

export function useSignInProblem(): string | undefined {
  return useContext(SignInProblemContext);
}

export function SignInProblem({ className = '' }: { className?: string }) {
  const problem = useSignInProblem();
  if (!problem) return null;
  return (
    <p role="alert" className={`${className} text-red-700`}>
      {problem}
    </p>
  );
}
