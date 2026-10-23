export type FolderTreeNode<N> = {
  name: string | null;
  directory: boolean;
  timestamp: number;
  children?: N[];
};

export function resolveLibraryPath<N extends FolderTreeNode<N>>(root: N, path: string): N | undefined {
  const segments = path.split('/');
  let node: N | undefined = root;
  for (const [i, segment] of segments.entries()) {
    const candidates = (node.children ?? []).filter((child) => child.directory !== (i === segments.length - 1));
    node = newest(candidates.filter((child) => child.name === segment));
    node ??= newest(candidates.filter((child) => child.name?.toLowerCase() === segment.toLowerCase()));
    if (!node) return undefined;
  }
  return node;
}

function newest<N extends FolderTreeNode<N>>(nodes: N[]): N | undefined {
  return nodes.reduce<N | undefined>((best, node) => (!best || node.timestamp > best.timestamp ? node : best), undefined);
}
