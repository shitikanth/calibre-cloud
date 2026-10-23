declare global {
  var sqlite3ApiConfig: { disable?: { vfs?: Record<string, boolean> } } | undefined;
}

globalThis.sqlite3ApiConfig = {
  disable: { vfs: { opfs: true, 'opfs-wl': true, kvvfs: true } },
};
