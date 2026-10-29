// PROTOTYPE for #156. Throwaway: lives on prototype/drive-file-picker, never merged to main.
const scope = 'https://www.googleapis.com/auth/drive.file';
const api = 'https://www.googleapis.com/drive/v3';
const folderType = 'application/vnd.google-apps.folder';
const stateKey = 'PROTOTYPE-156-wipe-me';
const cases = ['my-drive', 'shared-with-me', 'shared-drive'];

const $ = (id) => document.getElementById(id);
const config = await (await fetch('/config.json')).json();
const violations = [];
const results = [];

function load() {
  try {
    return JSON.parse(localStorage.getItem(stateKey)) ?? { picks: {}, walks: {} };
  } catch {
    return { picks: {}, walks: {} };
  }
}
function save(state) {
  localStorage.setItem(stateKey, JSON.stringify(state));
}
function log(...parts) {
  $('log').textContent += `${new Date().toISOString()} ${parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ')}\n`;
}

document.addEventListener('securitypolicyviolation', (e) => {
  violations.push(`${e.effectiveDirective} blocked ${e.blockedURI} (from ${e.sourceFile || 'page'}:${e.lineNumber})`);
  $('violations').textContent = violations.join('\n');
  render();
});

// --- session: OAuth implicit flow by redirect, so the Picker is the only thing needing CSP additions ---

function readRedirect() {
  if (!location.hash.includes('access_token')) return;
  const params = new URLSearchParams(location.hash.slice(1));
  const session = {
    accessToken: params.get('access_token'),
    scope: params.get('scope'),
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + Number(params.get('expires_in')) * 1000).toISOString(),
    pickedThisSession: [],
  };
  sessionStorage.setItem(stateKey, JSON.stringify(session));
  location.replace(`/${params.get('state') ?? ''}`);
}
if (location.hash.includes('error=')) log('sign-in error', location.hash);
readRedirect();

function session() {
  return JSON.parse(sessionStorage.getItem(stateKey) ?? 'null');
}
function updateSession(change) {
  sessionStorage.setItem(stateKey, JSON.stringify({ ...session(), ...change }));
}

$('sign-in').addEventListener('click', () => {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: `${location.origin}/`,
    response_type: 'token',
    scope,
    include_granted_scopes: 'false',
    prompt: 'select_account',
    state: location.search,
  }).toString();
  location.assign(url);
});
$('sign-out').addEventListener('click', () => {
  sessionStorage.removeItem(stateKey);
  render();
});

// --- Drive REST ---

async function drive(path, params = {}, headers = {}) {
  const url = new URL(`${api}/${path}`);
  url.search = new URLSearchParams({ supportsAllDrives: 'true', ...params }).toString();
  const response = await fetch(url, { headers: { authorization: `Bearer ${session().accessToken}`, ...headers } });
  return response;
}

async function listChildren(folder, driveId) {
  const children = [];
  let pageToken;
  let status;
  do {
    const response = await drive('files', {
      q: `'${folder}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime)',
      pageSize: '1000',
      includeItemsFromAllDrives: 'true',
      ...(driveId ? { corpora: 'drive', driveId } : {}),
      ...(pageToken ? { pageToken } : {}),
    });
    status = response.status;
    if (!response.ok) return { status, error: await response.text(), children };
    const body = await response.json();
    children.push(...body.files);
    pageToken = body.nextPageToken;
  } while (pageToken);
  return { status, children };
}

async function rangeRead(file) {
  if (!file) return { found: false };
  const response = await drive(`files/${file.id}`, { alt: 'media' }, { range: 'bytes=0-15' });
  const bytes = response.ok ? new Uint8Array(await response.arrayBuffer()) : new Uint8Array();
  return {
    found: true,
    path: file.path,
    id: file.id,
    status: response.status,
    contentRangeExposed: response.headers.get('content-range'),
    bytes: bytes.length,
    sqliteHeader: new TextDecoder().decode(bytes) === 'SQLite format 3\0',
    error: response.ok ? undefined : (await response.text()).slice(0, 300),
  };
}

// --- step 1: Picker ---

let pickerReady;
function loadPicker() {
  pickerReady ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => window.gapi.load('picker', { callback: resolve, onerror: reject });
    script.onerror = () => reject(new Error('api.js blocked or failed'));
    document.head.append(script);
  });
  return pickerReady;
}

async function pick(kind) {
  if (!session()) return log('sign in first');
  try {
    await loadPicker();
  } catch (error) {
    pickerReady = undefined;
    return log('picker load failed', String(error));
  }
  const { picker } = window.google;
  const view = new picker.DocsView().setIncludeFolders(true).setSelectFolderEnabled(true);
  if (kind === 'shared-with-me') view.setOwnedByMe(false);
  if (kind === 'shared-drive') view.setEnableDrives(true);
  new picker.PickerBuilder()
    .addView(view)
    .setOAuthToken(session().accessToken)
    .setDeveloperKey(config.apiKey)
    .setAppId(config.appId)
    .setCallback((data) => {
      log('picker callback', data[picker.Response.ACTION]);
      if (data[picker.Response.ACTION] !== picker.Action.PICKED) return;
      const doc = data[picker.Response.DOCUMENTS][0];
      const state = load();
      state.picks[kind] = { id: doc.id, mimeType: doc.mimeType, driveId: doc.driveId, pickedAt: new Date().toISOString() };
      save(state);
      updateSession({ pickedThisSession: [...session().pickedThisSession, kind] });
      log('picked', kind, state.picks[kind]);
      render();
    })
    .build()
    .setVisible(true);
}
document.querySelectorAll('[data-pick]').forEach((button) => button.addEventListener('click', () => pick(button.dataset.pick)));

// --- steps 2-4, 6, 7: walk ---

async function walk(kind) {
  const state = load();
  const root = state.picks[kind];
  const progress = (text) => ($('progress').textContent = text);
  const startedAt = new Date().toISOString();

  const rootMeta = await drive(`files/${root.id}`, { fields: 'id, mimeType, driveId, ownedByMe, shared, capabilities(canListChildren, canDownload)' });
  const rootBody = await rootMeta.json();
  const driveId = rootBody.driveId;

  const files = {};
  const listings = [];
  const queue = [{ id: root.id, path: '' }];
  while (queue.length > 0) {
    const batch = queue.splice(0, 8);
    await Promise.all(batch.map(async (folder) => {
      const listing = await listChildren(folder.id, driveId);
      listings.push({ path: folder.path || '/', depth: folder.path.split('/').filter(Boolean).length, status: listing.status, count: listing.children.length, error: listing.error?.slice(0, 300) });
      for (const child of listing.children) {
        const path = `${folder.path}/${child.name}`;
        files[path] = { id: child.id, mimeType: child.mimeType, modifiedTime: child.modifiedTime, path };
        if (child.mimeType === folderType) queue.push({ id: child.id, path });
      }
    }));
    progress(`listed ${listings.length} folders, ${Object.keys(files).length} items so far, ${queue.length} folders queued`);
  }

  const all = Object.values(files);
  const nonFolders = all.filter((f) => f.mimeType !== folderType);
  const nested = (f) => f.path.split('/').length >= 4;
  const previous = state.walks[kind]?.at(-1);
  const added = previous ? nonFolders.filter((f) => !(f.path in previous.files)) : [];
  const metadataPath = '/metadata.db';
  const reads = {
    metadataDb: await rangeRead(files[metadataPath]),
    cover: await rangeRead(nonFolders.find((f) => nested(f) && f.path.endsWith('/cover.jpg'))),
    epub: await rangeRead(nonFolders.find((f) => nested(f) && f.path.endsWith('.epub'))),
    newCover: previous ? await rangeRead(added.find((f) => f.path.endsWith('/cover.jpg'))) : undefined,
    newEpub: previous ? await rangeRead(added.find((f) => f.path.endsWith('.epub'))) : undefined,
  };

  const record = {
    startedAt,
    session: { issuedAt: session().issuedAt, scope: session().scope, pickedThisSession: session().pickedThisSession },
    page: { cspMode: config.cspMode, referrerPolicy: config.referrerPolicy },
    root: { status: rootMeta.status, body: rootMeta.ok ? rootBody : undefined, error: rootMeta.ok ? undefined : rootBody },
    listings: {
      folders: listings.length,
      ok: listings.filter((l) => l.status === 200).length,
      failed: listings.filter((l) => l.status !== 200),
      emptyByDepth: Object.entries(Object.groupBy(listings.filter((l) => l.count === 0), (l) => l.depth)).map(([d, ls]) => `depth ${d}: ${ls.length}`),
      rootCount: listings.find((l) => l.path === '/')?.count,
    },
    totals: { folders: all.length - nonFolders.length, files: nonFolders.length, epubs: nonFolders.filter((f) => f.path.endsWith('.epub')).length },
    reads,
    diff: previous
      ? {
          previousWalk: previous.startedAt,
          added: added.length,
          removed: Object.keys(previous.files).filter((p) => !(p in files) && previous.files[p].mimeType !== folderType).length,
          metadataDbIdBefore: previous.files[metadataPath]?.id,
          metadataDbIdNow: files[metadataPath]?.id,
          metadataDbModifiedBefore: previous.files[metadataPath]?.modifiedTime,
          metadataDbModifiedNow: files[metadataPath]?.modifiedTime,
        }
      : undefined,
  };
  log('walk', kind, { ...record, reads: undefined });
  state.walks[kind] = [...(state.walks[kind] ?? []).map((w) => ({ ...w, files: undefined })), { ...record, files }];
  save(state);
  results.push(markdown(kind, record));
  progress(`done: ${kind}`);
  render();
}

function verdictOf(read) {
  if (!read) return 'n/a';
  if (!read.found) return 'no such file found in the listing';
  return `HTTP ${read.status}, ${read.bytes} bytes, Content-Range readable: ${read.contentRangeExposed ? `yes (\`${read.contentRangeExposed}\`)` : 'no'}${read.error ? `, error: \`${read.error.replaceAll('\n', ' ')}\`` : ''}`;
}

function markdown(kind, r) {
  const lines = [
    `### ${kind}, walk at ${r.startedAt}`,
    `- Token: issued ${r.session.issuedAt}, scope \`${r.session.scope}\`, picks made in this session: ${r.session.pickedThisSession.length ? r.session.pickedThisSession.join(', ') : 'none (step 5)'}`,
    `- Page: CSP ${r.page.cspMode}, Referrer-Policy \`${r.page.referrerPolicy}\``,
    `- Step 7, root \`files.get\`: HTTP ${r.root.status}${r.root.body ? `, canListChildren: ${r.root.body.capabilities?.canListChildren}, canDownload: ${r.root.body.capabilities?.canDownload}, ownedByMe: ${r.root.body.ownedByMe}, driveId: ${r.root.body.driveId ? 'yes' : 'no'}` : `, error: \`${JSON.stringify(r.root.error)}\``}`,
    `- Step 2, root listing: ${r.listings.rootCount ?? 0} children`,
    `- Step 3, tree: ${r.listings.ok}/${r.listings.folders} folder listings returned 200; found ${r.totals.folders} folders, ${r.totals.files} files (${r.totals.epubs} EPUBs). Empty listings: ${r.listings.emptyByDepth.join(', ') || 'none'}`,
    ...r.listings.failed.slice(0, 5).map((l) => `  - listing at depth ${l.depth}: HTTP ${l.status}, \`${(l.error ?? '').replaceAll('\n', ' ')}\``),
    `- Step 4, \`metadata.db\` (Range bytes=0-15): ${verdictOf(r.reads.metadataDb)}, SQLite header: ${r.reads.metadataDb.sqliteHeader ?? 'n/a'}`,
    `- Step 4, nested \`cover.jpg\`: ${verdictOf(r.reads.cover)}`,
    `- Step 4, nested EPUB: ${verdictOf(r.reads.epub)}`,
  ];
  if (r.diff) {
    lines.push(
      `- Step 6, vs walk at ${r.diff.previousWalk}: ${r.diff.added} files added, ${r.diff.removed} removed`,
      `- Step 6, \`metadata.db\` file ID ${r.diff.metadataDbIdBefore === r.diff.metadataDbIdNow ? 'unchanged' : 'CHANGED'}; modifiedTime ${r.diff.metadataDbModifiedBefore} → ${r.diff.metadataDbModifiedNow}`,
      `- Step 6, new \`cover.jpg\`: ${verdictOf(r.reads.newCover)}`,
      `- Step 6, new EPUB: ${verdictOf(r.reads.newEpub)}`,
    );
  }
  return lines.join('\n');
}

// --- render ---

function render() {
  const s = session();
  $('page').textContent = [
    `CSP mode: ${config.cspMode}`,
    `Content-Security-Policy: ${config.csp}`,
    `Picker additions: ${config.cspMode === 'prod' ? '(none, prod only)' : JSON.stringify(config.additions)}`,
    `Referrer-Policy: ${config.referrerPolicy}`,
    `Client ID set: ${Boolean(config.clientId)}, API key set: ${Boolean(config.apiKey)}, App ID: ${config.appId || '(missing)'}`,
  ].join('\n');
  $('session').textContent = s
    ? `token issued ${s.issuedAt}, expires ${s.expiresAt}\ngranted scope: ${s.scope}${s.scope === scope ? '' : '   <-- NOT drive.file only, results invalid'}\npicks this session: ${s.pickedThisSession.join(', ') || 'none'}`
    : 'no token in this tab';
  const state = load();
  $('picks').textContent = cases.map((c) => `${c}: ${state.picks[c] ? `${state.picks[c].id} (picked ${state.picks[c].pickedAt}), ${state.walks[c]?.length ?? 0} walks` : '-'}`).join('\n');
  const buttons = $('walk-buttons');
  buttons.replaceChildren(...cases.filter((c) => state.picks[c]).map((c) => {
    const button = document.createElement('button');
    button.textContent = `Walk ${c}`;
    button.disabled = !s;
    button.addEventListener('click', () => walk(c).catch((error) => log('walk failed', String(error))));
    return button;
  }));
  const csp = violations.length ? `### CSP violations (${config.cspMode})\n${violations.map((v) => `- ${v}`).join('\n')}` : `### CSP violations (${config.cspMode})\nnone`;
  $('results').value = [csp, ...results].join('\n\n');
}

$('copy').addEventListener('click', () => navigator.clipboard.writeText($('results').value));
$('reset').addEventListener('click', () => {
  localStorage.removeItem(stateKey);
  sessionStorage.removeItem(stateKey);
  results.length = 0;
  render();
});
render();
