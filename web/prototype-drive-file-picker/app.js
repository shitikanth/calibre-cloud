const scope = 'https://www.googleapis.com/auth/drive.file';
const api = 'https://www.googleapis.com/drive/v3';
const folderType = 'application/vnd.google-apps.folder';
const libraryKey = 'PROTOTYPE-156-library-wipe-me';
const sessionKey = 'PROTOTYPE-156-session-wipe-me';
const pickKinds = ['my-drive', 'shared-with-me', 'shared-drive'];

const $ = (id) => document.getElementById(id);
const config = await (await fetch(`/config.json${location.search}`)).json();
const violations = [];

function load() {
  try {
    return JSON.parse(localStorage.getItem(libraryKey)) ?? { picks: {}, walks: {} };
  } catch {
    return { picks: {}, walks: {} };
  }
}
function save(state) {
  localStorage.setItem(libraryKey, JSON.stringify(state));
}
function log(...parts) {
  $('log').textContent += `${new Date().toISOString()} ${parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ')}\n`;
}

document.addEventListener('securitypolicyviolation', (e) => {
  violations.push(`${e.effectiveDirective} blocked ${e.blockedURI} (from ${e.sourceFile || 'page'}:${e.lineNumber})`);
  $('violations').textContent = violations.join('\n');
  render();
});

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
  sessionStorage.setItem(sessionKey, JSON.stringify(session));
  location.replace(`/${params.get('state') ?? ''}`);
}
if (location.hash.includes('error=')) log('sign-in error', location.hash);
readRedirect();

function session() {
  return JSON.parse(sessionStorage.getItem(sessionKey) ?? 'null');
}
function updateSession(change) {
  sessionStorage.setItem(sessionKey, JSON.stringify({ ...session(), ...change }));
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
  sessionStorage.removeItem(sessionKey);
  render();
});

function drive(path, params = {}, headers = {}) {
  const url = new URL(`${api}/${path}`);
  url.search = new URLSearchParams({ supportsAllDrives: 'true', ...params }).toString();
  return fetch(url, { headers: { authorization: `Bearer ${session().accessToken}`, ...headers } });
}

async function listChildren(folder, driveId) {
  const children = [];
  let pageToken;
  let status;
  do {
    const response = await drive('files', {
      q: `'${folder}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, modifiedTime)',
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
    status: response.status,
    contentRangeExposed: response.headers.get('content-range'),
    bytes: bytes.length,
    sqliteHeader: new TextDecoder().decode(bytes.slice(0, 16)) === 'SQLite format 3\0',
    error: response.ok ? undefined : (await response.text()).slice(0, 300),
  };
}

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

const firstEndingWith = (files, suffix) => files.find((f) => f.path.endsWith(suffix));

async function walk(kind) {
  const state = load();
  const root = state.picks[kind];
  const s = session();
  const progress = (text) => ($('progress').textContent = text);
  const startedAt = new Date().toISOString();

  const rootMeta = await drive(`files/${root.id}`, { fields: 'id, mimeType, driveId, ownedByMe, shared, capabilities(canListChildren, canDownload)' });
  const rootBody = await rootMeta.json();
  const driveId = rootBody.driveId;

  const items = [];
  const listings = [];
  const queue = [{ id: root.id, path: '' }];
  while (queue.length > 0) {
    const batch = queue.splice(0, 8);
    await Promise.all(batch.map(async (folder) => {
      const listing = await listChildren(folder.id, driveId);
      listings.push({ path: folder.path || '/', depth: folder.path.split('/').filter(Boolean).length, status: listing.status, count: listing.children.length, error: listing.error?.slice(0, 300) });
      for (const child of listing.children) {
        const path = `${folder.path}/${child.name}`;
        items.push({ id: child.id, folder: child.mimeType === folderType, modifiedTime: child.modifiedTime, path });
        if (child.mimeType === folderType) queue.push({ id: child.id, path });
      }
    }));
    progress(`listed ${listings.length} folders, ${items.length} items so far, ${queue.length} folders queued`);
  }

  const files = items.filter((f) => !f.folder);
  const nestedFiles = files.filter((f) => f.path.split('/').length >= 4);
  const byPath = Object.fromEntries(items.map((f) => [f.path, [f.id, f.folder ? 1 : 0, f.modifiedTime]]));
  const previous = state.walks[kind]?.findLast((w) => w.byPath);
  const added = previous ? files.filter((f) => !(f.path in previous.byPath)) : [];
  const metadataPath = '/metadata.db';
  const metadataDb = items.find((f) => f.path === metadataPath);
  const reads = {
    metadataDb: await rangeRead(metadataDb),
    cover: await rangeRead(firstEndingWith(nestedFiles, '/cover.jpg')),
    epub: await rangeRead(firstEndingWith(nestedFiles, '.epub')),
    newCover: previous ? await rangeRead(firstEndingWith(added, '/cover.jpg')) : undefined,
    newEpub: previous ? await rangeRead(firstEndingWith(added, '.epub')) : undefined,
  };

  const walkRecord = {
    kind,
    startedAt,
    session: { issuedAt: s.issuedAt, scope: s.scope, pickedThisSession: s.pickedThisSession },
    page: { cspMode: config.cspMode, referrerPolicy: config.referrerPolicy },
    root: { status: rootMeta.status, body: rootMeta.ok ? rootBody : undefined, error: rootMeta.ok ? undefined : rootBody },
    listings: {
      folders: listings.length,
      ok: listings.filter((l) => l.status === 200).length,
      failed: listings.filter((l) => l.status !== 200),
      emptyByDepth: Object.entries(Object.groupBy(listings.filter((l) => l.count === 0), (l) => l.depth)).map(([d, ls]) => `depth ${d}: ${ls.length}`),
      rootCount: listings.find((l) => l.path === '/')?.count,
    },
    totals: {
      folders: items.length - files.length,
      files: files.length,
      epubs: files.filter((f) => f.path.endsWith('.epub')).length,
      duplicatePaths: items.length - Object.keys(byPath).length,
    },
    reads,
    diff: previous
      ? {
          previousWalk: previous.startedAt,
          added: added.length,
          removed: Object.entries(previous.byPath).filter(([p, [, folder]]) => !folder && !(p in byPath)).length,
          metadataDbIdBefore: previous.byPath[metadataPath]?.[0],
          metadataDbIdNow: metadataDb?.id,
          metadataDbModifiedBefore: previous.byPath[metadataPath]?.[2],
          metadataDbModifiedNow: metadataDb?.modifiedTime,
        }
      : undefined,
  };
  log('walk', kind, { ...walkRecord, reads: undefined });
  const walks = (state.walks[kind] ?? []).map(({ byPath: _, ...w }) => w);
  state.walks[kind] = [...walks, { ...walkRecord, byPath }];
  try {
    save(state);
  } catch (error) {
    log('path map too large for localStorage; saving without it, so the next walk has no diff', String(error));
    state.walks[kind] = [...walks, walkRecord];
    save(state);
  }
  progress(`done: ${kind}`);
  render();
}

function readSummary(read) {
  if (!read) return 'n/a';
  if (!read.found) return 'no such file found in the listing';
  return `HTTP ${read.status}, ${read.bytes} bytes, Content-Range readable: ${read.contentRangeExposed ? `yes (\`${read.contentRangeExposed}\`)` : 'no'}${read.error ? `, error: \`${read.error.replaceAll('\n', ' ')}\`` : ''}`;
}

function resultMarkdown(walkRecord) {
  const { root, listings, totals, reads, diff } = walkRecord;
  const lines = [
    `### ${walkRecord.kind}, walk at ${walkRecord.startedAt}`,
    `- Token: issued ${walkRecord.session.issuedAt}, scope \`${walkRecord.session.scope}\`, picks made in this session: ${walkRecord.session.pickedThisSession.length ? walkRecord.session.pickedThisSession.join(', ') : 'none (step 5)'}`,
    `- Page: CSP ${walkRecord.page.cspMode}, Referrer-Policy \`${walkRecord.page.referrerPolicy}\``,
    `- Step 7, root \`files.get\`: HTTP ${root.status}${root.body ? `, canListChildren: ${root.body.capabilities?.canListChildren}, canDownload: ${root.body.capabilities?.canDownload}, ownedByMe: ${root.body.ownedByMe}, driveId: ${root.body.driveId ? 'yes' : 'no'}` : `, error: \`${JSON.stringify(root.error)}\``}`,
    `- Step 2, root listing: ${listings.rootCount ?? 0} children`,
    `- Step 3, tree: ${listings.ok}/${listings.folders} folder listings returned 200; found ${totals.folders} folders, ${totals.files} files (${totals.epubs} EPUBs), ${totals.duplicatePaths} duplicate paths. Empty listings: ${listings.emptyByDepth.join(', ') || 'none'}`,
    ...listings.failed.slice(0, 5).map((l) => `  - listing at depth ${l.depth}: HTTP ${l.status}, \`${(l.error ?? '').replaceAll('\n', ' ')}\``),
    `- Step 4, \`metadata.db\` (Range bytes=0-15): ${readSummary(reads.metadataDb)}, SQLite header: ${reads.metadataDb.sqliteHeader ?? 'n/a'}`,
    `- Step 4, nested \`cover.jpg\`: ${readSummary(reads.cover)}`,
    `- Step 4, nested EPUB: ${readSummary(reads.epub)}`,
  ];
  if (diff) {
    lines.push(
      `- Step 6, vs walk at ${diff.previousWalk}: ${diff.added} files added, ${diff.removed} removed`,
      `- Step 6, \`metadata.db\` file ID ${diff.metadataDbIdBefore === diff.metadataDbIdNow ? 'unchanged' : 'CHANGED'}; modifiedTime ${diff.metadataDbModifiedBefore} → ${diff.metadataDbModifiedNow}`,
      `- Step 6, new \`cover.jpg\`: ${readSummary(reads.newCover)}`,
      `- Step 6, new EPUB: ${readSummary(reads.newEpub)}`,
    );
  }
  return lines.join('\n');
}

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
  $('picks').textContent = pickKinds.map((k) => `${k}: ${state.picks[k] ? `${state.picks[k].id} (picked ${state.picks[k].pickedAt}), ${state.walks[k]?.length ?? 0} walks` : '-'}`).join('\n');
  $('walk-buttons').replaceChildren(...pickKinds.filter((k) => state.picks[k]).map((k) => {
    const button = document.createElement('button');
    button.textContent = `Walk ${k}`;
    button.disabled = !s;
    button.addEventListener('click', () => walk(k).catch((error) => log('walk failed', String(error))));
    return button;
  }));
  const csp = `### CSP violations (${config.cspMode}, Referrer-Policy \`${config.referrerPolicy}\`)\n${violations.map((v) => `- ${v}`).join('\n') || 'none'}`;
  const walks = Object.values(state.walks).flat().sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  $('results').value = [csp, ...walks.map(resultMarkdown)].join('\n\n');
}

$('copy').addEventListener('click', () => navigator.clipboard.writeText($('results').value));
$('reset').addEventListener('click', () => {
  localStorage.removeItem(libraryKey);
  sessionStorage.removeItem(sessionKey);
  render();
});
render();
