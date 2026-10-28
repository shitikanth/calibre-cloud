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
  const router = useRouter();
  const [problem, setProblem] = useState(() => problemFor(readSignInError(hash)));

  useEffect(() => {
    if (readSignInError(hash) !== undefined) router.history.replace(`${pathname}${searchStr}`);
  }, [hash, pathname, searchStr, router]);

  useEffect(() => {
    if (!problem) return;
    return router.subscribe('onBeforeNavigate', ({ pathChanged }) => {
      if (pathChanged) setProblem(undefined);
    });
  }, [problem, router]);

  return <SignInProblemContext value={problem}>{children}</SignInProblemContext>;
}

export function useSignInProblem(): string | undefined {
  return useContext(SignInProblemContext);
}

export function SignInProblem({ className = '', announce = true }: { className?: string; announce?: boolean }) {
  const problem = useSignInProblem();
  if (!problem) return null;
  return (
    <p role={announce ? 'alert' : undefined} className={`${className} text-red-700`}>
      {problem}
    </p>
  );
}
