import { useLocation, useRouter } from '@tanstack/react-router';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { readConnectLink } from '../connection/connect-link.ts';

const ConnectLinkInput = createContext<string | undefined>(undefined);

export function ConnectLink({ children }: { children: ReactNode }) {
  const { hash, pathname, searchStr } = useLocation();
  const { history } = useRouter();
  const [input] = useState(() => readConnectLink(hash));

  useEffect(() => {
    if (readConnectLink(hash) !== undefined) history.replace(`${pathname}${searchStr}`);
  }, [hash, pathname, searchStr, history]);

  return <ConnectLinkInput value={input}>{children}</ConnectLinkInput>;
}

export function useConnectLinkInput(): string | undefined {
  return useContext(ConnectLinkInput);
}
