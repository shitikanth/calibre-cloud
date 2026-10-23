export type MegaLinkProblem = 'not-a-folder-link' | 'missing-key';

export type ParsedMegaLink = { ok: true; link: string } | { ok: false; problem: MegaLinkProblem };

const folderLink = /^https:\/\/mega\.nz\/folder\/([\w-]+)(?:#(.*))?$/;
const key = /^[\w-]+$/;

export function parseMegaFolderLink(input: string): ParsedMegaLink {
  const match = folderLink.exec(input.trim());
  if (!match) return { ok: false, problem: 'not-a-folder-link' };
  const [, handle, fragment] = match;
  if (!fragment) return { ok: false, problem: 'missing-key' };
  if (!key.test(fragment)) return { ok: false, problem: 'not-a-folder-link' };
  return { ok: true, link: `https://mega.nz/folder/${handle}#${fragment}` };
}
