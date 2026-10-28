import type { Connection, LinkProvider } from '../provider.ts';
import { createMegaAdapter } from './adapter.ts';
import icon from './icon.svg';
import { parseMegaFolderLink, type MegaLinkProblem } from './link.ts';

type MegaConnection = { provider: 'mega'; link: string };

const problemMessages: Record<MegaLinkProblem, string> = {
  'not-a-folder-link': 'That isn’t a MEGA folder link. It should look like https://mega.nz/folder/…#…',
  'missing-key': 'The link is missing its key, the part after “#”. Copy the whole link from MEGA.',
};

function isMegaConnection(value: unknown): value is MegaConnection {
  if (typeof value !== 'object' || value === null) return false;
  const { provider, link } = value as Record<string, unknown>;
  return provider === 'mega' && typeof link === 'string';
}

export const megaProvider: LinkProvider = {
  kind: 'link',
  id: 'mega',
  name: 'MEGA',
  icon,
  connectForm: {
    hint: 'Paste the shared link to your Calibre library folder.',
    label: 'MEGA folder link',
    placeholder: 'https://mega.nz/folder/…#…',
  },
  parseConnectInput(input) {
    const parsed = parseMegaFolderLink(input);
    if (!parsed.ok) return { ok: false, problem: problemMessages[parsed.problem] };
    const connection: MegaConnection = { provider: 'mega', link: parsed.link };
    return { ok: true, connection };
  },
  connectInput(connection) {
    if (!isMegaConnection(connection)) throw new Error('Not a MEGA connection');
    return connection.link;
  },
  isConnection: (value): value is Connection => isMegaConnection(value),
  open(connection) {
    if (!isMegaConnection(connection)) throw new Error('Not a MEGA connection');
    return createMegaAdapter(connection.link);
  },
};
