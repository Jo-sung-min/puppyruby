#!/usr/bin/env node
'use strict';

// Deliberately changes only one unpublished commit. Never fetches, pushes,
// force-pushes, prunes objects, deletes working files, or resets the worktree.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const MEDIA = [
  ['frontend/public/images/', 'local-assets/site/images/'],
  ['frontend/public/downloads/', 'local-assets/site/downloads/'],
  ['frontend/public/favicon.svg', 'local-assets/site/favicon.svg'],
  ['docs/previews/', 'local-assets/site/images/docs-previews/'],
  ['.playwright-mcp/', 'local-assets/references/browser-captures/'],
];
const LIMIT = 100 * 1024 * 1024;
const PRESERVED_CORRECTIONS = new Map([
  ['frontend/public/downloads/PuppyRuby-server.sha256', 'local-assets/git-backup/media-originals/frontend/public/downloads/PuppyRuby-server.sha256'],
]);
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
const gitHash = (type, data) => crypto.createHash('sha1').update(`${type} ${data.length}\0`).update(data).digest('hex');
const invariant = (value, message) => { if (!value) throw new Error(message); };

function mediaDestination(name) {
  for (const [from, to] of MEDIA) {
    if (from.endsWith('/') ? name.startsWith(from) : name === from) return to + name.slice(from.length);
  }
  return null;
}

function normalizeInclude(name) {
  invariant(typeof name === 'string' && name.length > 0 && !/[\x00-\x1f*?\[\]]/.test(name), 'Each include must be a literal, nonempty relative file path without globs.');
  const normalized = name.replaceAll('\\', '/');
  invariant(!/^(?:\/|[A-Za-z]:)/.test(normalized) && !normalized.split('/').some(x => !x || x === '.' || x === '..'), 'Include paths must be literal project-relative paths.');
  invariant(!normalized.startsWith('.git/') && normalized !== '.git' && !normalized.startsWith('local-assets/'), 'Git internals and local-assets cannot be included.');
  invariant(!mediaDestination(normalized), 'A removed media path cannot also be included.');
  invariant(!normalized.split('/').some(x => /^\.env(?:\.|$)/i.test(x) && x !== '.env.example'), 'Private environment files cannot be included.');
  return normalized;
}

function treeHash(entries) {
  const root = new Map();
  for (const entry of entries) {
    const parts = entry.path.split('/');
    let directory = root;
    for (const part of parts.slice(0, -1)) {
      if (!directory.has(part)) directory.set(part, new Map());
      invariant(directory.get(part) instanceof Map, 'Proposed tree contains a file/directory collision.');
      directory = directory.get(part);
    }
    invariant(!directory.has(parts.at(-1)), 'Proposed tree contains a duplicate path.');
    directory.set(parts.at(-1), entry);
  }
  function encode(directory) {
    const children = [...directory].map(([name, value]) => value instanceof Map
      ? { name, mode: '40000', oid: encode(value), directory: true }
      : { name, mode: value.mode.replace(/^0+/, ''), oid: value.oid, directory: false });
    children.sort((a, b) => Buffer.compare(Buffer.from(a.name + (a.directory ? '/' : '')), Buffer.from(b.name + (b.directory ? '/' : ''))));
    return gitHash('tree', Buffer.concat(children.map(x => Buffer.concat([Buffer.from(`${x.mode} ${x.name}\0`), Buffer.from(x.oid, 'hex')]))));
  }
  return encode(root);
}

function replaceCommitTree(raw, nextTree) {
  invariant(raw.subarray(0, 46).toString('ascii').match(/^tree [a-f0-9]{40}\n$/), 'Unsupported original commit header.');
  const header = raw.subarray(0, raw.indexOf(Buffer.from('\n\n'))).toString('utf8');
  invariant(!/^gpgsig(?:-sha256)? /m.test(header), 'The unpublished commit is signed; this script will not invalidate its signature.');
  return Buffer.concat([Buffer.from(`tree ${nextTree}\n`), raw.subarray(46)]);
}

function matchingBlobBytes(bytes, expectedOid) {
  if (gitHash('blob', bytes) === expectedOid) return { bytes, conversion: 'none' };
  // Git's Windows checkout can add CRLF. Accept only an exact blob match after
  // removing those CR bytes; this does not permit any other content change.
  if (bytes.includes(Buffer.from('\r\n'))) {
    const normalized = Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n'));
    if (gitHash('blob', normalized) === expectedOid) return { bytes: normalized, conversion: 'worktree-crlf' };
  }
  return null;
}

function parseArgs(argv) {
  const options = { apply: false, includes: [], includeFiles: [], repo: path.resolve(__dirname, '..'), remote: 'origin', branch: 'main' };
  const values = new Map([
    ['--repo', 'repo'], ['--remote', 'remote'], ['--branch', 'branch'], ['--expected-head', 'expectedHead'],
    ['--expected-plan', 'expectedPlan'], ['--verified-remote-tip', 'verifiedRemoteTip'], ['--verified-at', 'verifiedAt'],
    ['--offline-remote-tip', 'offlineRemoteTip'],
  ]);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') options.apply = true;
    else if (arg === '--dry-run') options.apply = false;
    else if (arg === '--help') options.help = true;
    else if (arg === '--include' || arg === '--include-file' || values.has(arg)) {
      invariant(argv[i + 1] && !argv[i + 1].startsWith('--'), `Missing value for ${arg}.`);
      const value = argv[++i];
      if (arg === '--include') options.includes.push(value);
      else if (arg === '--include-file') options.includeFiles.push(value);
      else options[values.get(arg)] = value;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  options.repo = path.resolve(options.repo);
  invariant(/^[A-Za-z0-9._-]+$/.test(options.remote), 'Use a configured remote name, not a URL.');
  invariant(/^[A-Za-z0-9._/-]+$/.test(options.branch) && !options.branch.includes('..'), 'Invalid branch name.');
  invariant(!(options.verifiedRemoteTip && options.offlineRemoteTip), 'Use one remote verification method.');
  if (options.apply) {
    invariant(/^[a-f0-9]{40}$/.test(options.expectedHead || ''), '--apply requires --expected-head from the reviewed dry-run.');
    invariant(/^[a-f0-9]{64}$/.test(options.expectedPlan || ''), '--apply requires --expected-plan from the reviewed dry-run.');
    invariant(!options.offlineRemoteTip, 'An offline remote snapshot cannot authorize apply.');
  }
  return options;
}

function run(options) {
  const repository = options.repo;
  const gitPrefix = ['--no-optional-locks', '-c', `safe.directory=${repository.replaceAll('\\', '/')}`];
  const environment = { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' };
  function git(args, { input, env = {}, timeout = 60000, allowFailure = false } = {}) {
    const result = spawnSync('git', [...gitPrefix, ...args], { cwd: repository, env: { ...environment, ...env }, input, timeout, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
    if (allowFailure) return result;
    // Never forward Git stderr: authentication failures may contain remote URLs.
    invariant(!result.error && result.status === 0, `Git ${args[0]} failed (${result.error ? result.error.code : `exit ${result.status}`}); no raw remote or credential output was printed.`);
    return result.stdout;
  }
  const text = args => git(args).toString('utf8').trim();
  const resolveInside = relative => {
    const resolved = path.resolve(repository, relative);
    invariant(resolved.startsWith(repository + path.sep), 'Path escaped the project.');
    return resolved;
  };
  invariant(text(['rev-parse', '--show-toplevel']).replaceAll('\\', '/').toLowerCase() === repository.replaceAll('\\', '/').toLowerCase(), 'Run against the repository root.');
  invariant(text(['rev-parse', '--show-object-format']) === 'sha1', 'This repository must use SHA-1 Git objects.');
  const branchRef = `refs/heads/${options.branch}`;
  invariant(text(['symbolic-ref', 'HEAD']) === branchRef, `Check out ${options.branch} before running this script.`);
  const head = text(['rev-parse', 'HEAD']);
  if (options.expectedHead) invariant(head === options.expectedHead, 'HEAD changed since the reviewed audit.');
  const cached = git(['diff', '--cached', '--quiet', '--exit-code'], { allowFailure: true });
  invariant(cached.status === 0, 'The real index has staged changes. They were left untouched; this script requires an unstaged index.');
  const indexPath = path.resolve(repository, text(['rev-parse', '--git-path', 'index']));
  invariant(fs.existsSync(indexPath) && !fs.existsSync(indexPath + '.lock'), 'The Git index is missing or locked by another process.');
  const initialIndex = fs.readFileSync(indexPath);
  const initialIndexSha = sha256(initialIndex);
  const rawCommit = git(['cat-file', 'commit', head]);
  const originalHeader = rawCommit.subarray(0, rawCommit.indexOf(Buffer.from('\n\n'))).toString('utf8');
  const parents = [...originalHeader.matchAll(/^parent ([a-f0-9]{40})$/gm)].map(m => m[1]);
  invariant(parents.length === 1, 'Only one ordinary unpublished commit can be cleaned; merge commits are not rewritten.');

  let remoteTip;
  let remoteVerification;
  if (options.offlineRemoteTip) {
    invariant(/^[a-f0-9]{40}$/.test(options.offlineRemoteTip), 'Invalid offline remote tip.');
    remoteTip = options.offlineRemoteTip;
    remoteVerification = { method: 'offline-audit-only', fresh: false };
  } else if (options.verifiedRemoteTip) {
    const age = Date.now() - Date.parse(options.verifiedAt || '');
    invariant(/^[a-f0-9]{40}$/.test(options.verifiedRemoteTip) && Number.isFinite(age) && age >= -60000 && age <= 10 * 60 * 1000, 'Externally verified remote tip requires --verified-at within the last ten minutes.');
    remoteTip = options.verifiedRemoteTip;
    remoteVerification = { method: 'operator-provided-fresh-ls-remote', fresh: true, verifiedAt: options.verifiedAt };
  } else {
    const lines = git(['ls-remote', '--exit-code', options.remote, branchRef], { timeout: 45000 }).toString('utf8').trim().split('\n');
    invariant(lines.length === 1 && lines[0].split(/\s+/)[1] === branchRef && /^[a-f0-9]{40}\s/.test(lines[0]), 'The remote branch did not return one exact tip.');
    remoteTip = lines[0].split(/\s+/)[0];
    remoteVerification = { method: 'fresh-ls-remote', fresh: true, verifiedAt: new Date().toISOString() };
  }
  invariant(text(['rev-parse', `refs/remotes/${options.remote}/${options.branch}`]) === remoteTip, 'The remote tip differs from the local tracking ref; stop and review the remote changes first.');
  invariant(parents[0] === remoteTip, 'The current tip is not exactly one unpublished commit on top of the verified remote tip.');
  invariant(text(['rev-list', '--count', `${remoteTip}..${head}`]) === '1', 'More than one unpublished commit would require a different plan.');
  git(['merge-base', '--is-ancestor', remoteTip, head]);
  const reachableElsewhere = text(['for-each-ref', '--contains', head, '--format=%(refname)', 'refs/heads', 'refs/remotes', 'refs/tags']).split('\n').filter(Boolean).filter(ref => ref !== branchRef);
  invariant(reachableElsewhere.length === 0, 'Another branch, remote ref, or tag already references this tip; this script will not rewrite it.');

  const includes = [...options.includes];
  for (const name of options.includeFiles) {
    const list = JSON.parse(fs.readFileSync(resolveInside(name), 'utf8'));
    invariant(Array.isArray(list) && list.every(x => typeof x === 'string'), 'An include file must contain only a JSON array of relative file paths.');
    includes.push(...list);
  }
  const allowedPaths = [...new Set(includes.map(normalizeInclude))].sort();
  invariant(allowedPaths.includes('.gitignore'), 'Explicitly include the updated .gitignore in the plan.');

  function readTree(ref) {
    return git(['ls-tree', '-rlz', ref]).toString('utf8').split('\0').filter(Boolean).map(line => {
      const tab = line.indexOf('\t');
      const [mode, type, oid, size] = line.slice(0, tab).trim().split(/\s+/);
      return { path: line.slice(tab + 1), mode, type, oid, size: size === '-' ? 0 : Number(size) };
    });
  }
  const original = readTree(head);
  invariant(treeHash(original) === originalHeader.match(/^tree ([a-f0-9]{40})$/m)[1], 'Read-only tree hashing did not reproduce the original Git tree.');
  const indexEntries = git(['ls-files', '--stage', '-z']).toString('utf8').split('\0').filter(Boolean).map(line => {
    const tab = line.indexOf('\t');
    const [mode, oid, stage] = line.slice(0, tab).split(' ');
    invariant(stage === '0', 'The real index contains unresolved merge stages.');
    return { path: line.slice(tab + 1), mode, oid };
  });
  invariant(treeHash(indexEntries) === originalHeader.match(/^tree ([a-f0-9]{40})$/m)[1], 'The real index differs from HEAD, including intent-to-add entries. It was left untouched.');
  invariant(git(['ls-files', '-v', '-z']).toString('utf8').split('\0').filter(Boolean).every(line => line.startsWith('H ')), 'The real index contains special assume-unchanged/skip-worktree flags. They were left untouched; review them before cleanup.');
  const originalByPath = new Map(original.map(entry => [entry.path, entry]));
  const removed = original.filter(entry => mediaDestination(entry.path));
  const proposed = new Map(original.filter(entry => !mediaDestination(entry.path)).map(entry => [entry.path, entry]));
  const includedSnapshots = new Map();
  const changes = [];
  for (const name of allowedPaths) {
    const fullPath = resolveInside(name);
    const prior = originalByPath.get(name);
    if (!fs.existsSync(fullPath)) {
      invariant(prior, `Included path does not exist in HEAD or the worktree: ${name}`);
      proposed.delete(name);
      includedSnapshots.set(name, { missing: true });
      changes.push({ path: name, action: 'delete', previousOid: prior.oid });
      continue;
    }
    const stat = fs.lstatSync(fullPath);
    invariant(stat.isFile() && !stat.isSymbolicLink(), `Includes must name regular files, not directories or links: ${name}`);
    const realPath = fs.realpathSync(fullPath);
    invariant(realPath.toLowerCase().startsWith((repository + path.sep).toLowerCase()), `Included file resolves outside the project: ${name}`);
    invariant(stat.size <= LIMIT, `Included file exceeds 100 MiB: ${name}`);
    const bytes = fs.readFileSync(fullPath);
    const cleanOid = git(['hash-object', `--path=${name}`, '--stdin'], { input: bytes }).toString('utf8').trim();
    const clean = matchingBlobBytes(bytes, cleanOid);
    invariant(clean, `Included file uses an unsupported custom Git clean filter: ${name}`);
    const entry = { path: name, mode: prior?.mode || '100644', type: 'blob', oid: cleanOid, size: clean.bytes.length };
    invariant(entry.mode === '100644' || entry.mode === '100755', `Unsupported included file mode: ${name}`);
    proposed.set(name, entry);
    includedSnapshots.set(name, { bytes, cleanBytes: clean.bytes, sha: sha256(bytes), entry });
    if (!prior || entry.oid !== prior.oid || entry.mode !== prior.mode) changes.push({ path: name, action: prior ? 'update' : 'add', size: entry.size, oid: entry.oid });
  }
  for (const entry of original) {
    if (!mediaDestination(entry.path) && !allowedPaths.includes(entry.path)) {
      const kept = proposed.get(entry.path);
      invariant(kept?.oid === entry.oid && kept.mode === entry.mode, `An unrelated original entry changed: ${entry.path}`);
    }
  }
  const copyAudit = { verified: 0, bytesVerified: 0, lineEndingConversions: [], preservedCorrections: [], missing: [], mismatched: [] };
  function verifiedCopy(relative, expectedOid) {
    const fullPath = resolveInside(relative);
    if (!fs.existsSync(fullPath)) return null;
    const stat = fs.lstatSync(fullPath);
    if (!stat.isFile() || stat.isSymbolicLink() || !fs.realpathSync(fullPath).toLowerCase().startsWith((repository + path.sep).toLowerCase())) return null;
    const bytes = fs.readFileSync(fullPath);
    const match = matchingBlobBytes(bytes, expectedOid);
    return match ? { conversion: match.conversion, gitBlobOid: expectedOid, workingFileSha256: sha256(bytes) } : null;
  }
  for (const entry of removed) {
    const destination = mediaDestination(entry.path);
    const canonical = resolveInside(destination);
    if (!fs.existsSync(canonical)) { copyAudit.missing.push(entry.path); continue; }
    const match = verifiedCopy(destination, entry.oid);
    if (match) {
      if (match.conversion !== 'none') copyAudit.lineEndingConversions.push(entry.path);
      copyAudit.verified++; copyAudit.bytesVerified += entry.size;
      continue;
    }
    const preserved = PRESERVED_CORRECTIONS.get(entry.path);
    const original = preserved && verifiedCopy(preserved, entry.oid);
    if (original) {
      copyAudit.preservedCorrections.push({ path: entry.path, originalPreservedAt: preserved, originalGitBlobOid: entry.oid, originalConversion: original.conversion, correctedCanonicalSha256: sha256(fs.readFileSync(canonical)) });
      copyAudit.verified++; copyAudit.bytesVerified += entry.size;
    } else copyAudit.mismatched.push(entry.path);
  }
  const ignoreProbe = git(['check-ignore', '--no-index', '--verbose', 'local-assets/site/images/git-cleanup-probe.png'], { allowFailure: true });
  invariant(ignoreProbe.status === 0 && ignoreProbe.stdout.toString('utf8').startsWith('.gitignore:'), 'The project .gitignore must ignore the canonical local-assets folder; a global/local-only exclude is insufficient.');
  const nextEntries = [...proposed.values()];
  const nextTree = treeHash(nextEntries);
  const nextRawCommit = replaceCommitTree(rawCommit, nextTree);
  const nextCommit = gitHash('commit', nextRawCommit);
  const remoteObjects = new Set(text(['rev-list', '--objects', remoteTip]).split('\n').map(line => line.split(' ')[0]));
  const newBlobs = [...new Map(nextEntries.filter(entry => entry.type === 'blob' && !remoteObjects.has(entry.oid)).map(entry => [entry.oid, entry])).values()];
  const largeNewBlobs = newBlobs.filter(entry => entry.size >= LIMIT).map(entry => ({ path: entry.path, bytes: entry.size }));
  invariant(largeNewBlobs.length === 0, 'The proposed unpublished commit still contains a new blob at or above 100 MiB.');
  const planId = sha256(Buffer.from(JSON.stringify({ head, remoteTip, initialIndexSha, nextTree, nextCommit, allowedPaths, removed: removed.map(entry => [entry.path, entry.oid]) })));
  const ready = remoteVerification.fresh && copyAudit.missing.length === 0 && copyAudit.mismatched.length === 0;
  const report = {
    mode: options.apply ? 'apply' : 'dry-run', ready, planId, head, remoteTip, nextTree, nextCommit, remoteVerification,
    branch: options.branch, unpublishedCommits: 1, indexSha256: initialIndexSha,
    original: { files: original.length, bytes: original.reduce((sum, entry) => sum + entry.size, 0) },
    proposed: { files: nextEntries.length, bytes: nextEntries.reduce((sum, entry) => sum + entry.size, 0), newBlobCount: newBlobs.length, newBlobBytes: newBlobs.reduce((sum, entry) => sum + entry.size, 0), newBlobsAtOrAbove100MiB: largeNewBlobs },
    removal: { files: removed.length, bytes: removed.reduce((sum, entry) => sum + entry.size, 0), mappings: MEDIA },
    canonicalCopies: copyAudit, includedPaths: allowedPaths, changes,
    unrelatedOriginalEntriesPreserved: original.length - removed.length - allowedPaths.filter(name => originalByPath.has(name)).length,
    commitMetadataPreserved: true, sharedHistoryRewritten: false, pushPerformed: false,
  };
  if (!options.apply) return report;
  invariant(ready, 'Canonical copies are incomplete or remote verification is stale; no Git changes were made.');
  invariant(planId === options.expectedPlan, 'The plan changed since the reviewed dry-run; no Git changes were made.');

  function assertSnapshot() {
    invariant(text(['symbolic-ref', 'HEAD']) === branchRef && text(['rev-parse', 'HEAD']) === head, 'HEAD changed during cleanup; refusing to update it.');
    invariant(sha256(fs.readFileSync(indexPath)) === initialIndexSha, 'The real Git index changed during cleanup; refusing to update it.');
    for (const [name, snapshot] of includedSnapshots) {
      const fullPath = resolveInside(name);
      invariant(snapshot.missing ? !fs.existsSync(fullPath) : fs.existsSync(fullPath) && sha256(fs.readFileSync(fullPath)) === snapshot.sha, `An included worktree file changed during cleanup: ${name}`);
    }
  }
  assertSnapshot();
  const backup = resolveInside(`local-assets/git-backup/${new Date().toISOString().replaceAll(/[-:.]/g, '')}-${head.slice(0, 12)}`);
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  invariant(fs.realpathSync(path.dirname(backup)).toLowerCase().startsWith((repository + path.sep).toLowerCase()), 'Recovery directory resolves outside the project.');
  fs.mkdirSync(backup, { recursive: false });
  fs.writeFileSync(path.join(backup, 'original-commit.bin'), rawCommit, { flag: 'wx' });
  fs.writeFileSync(path.join(backup, 'original-index'), initialIndex, { flag: 'wx' });
  fs.writeFileSync(path.join(backup, 'plan.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  const bundle = path.join(backup, 'original-main.bundle');
  process.stderr.write('Creating a local recovery bundle; no remote write is performed.\n');
  git(['bundle', 'create', bundle, branchRef], { timeout: 30 * 60 * 1000 });
  git(['bundle', 'verify', bundle], { timeout: 120000 });
  invariant(git(['bundle', 'list-heads', bundle]).toString('utf8').split('\n').some(line => line === `${head} ${branchRef}`), 'Recovery bundle does not contain the original branch tip.');
  assertSnapshot();
  const temporaryIndex = path.join(backup, 'proposed-index');
  const tempEnv = { GIT_INDEX_FILE: temporaryIndex };
  git(['read-tree', head], { env: tempEnv });
  if (removed.length) git(['update-index', '--force-remove', '-z', '--stdin'], { input: Buffer.from(removed.map(entry => entry.path).join('\0') + '\0'), env: tempEnv });
  for (const [name, snapshot] of includedSnapshots) {
    if (snapshot.missing) git(['update-index', '--force-remove', '--', name], { env: tempEnv });
    else {
      invariant(git(['hash-object', '-w', '--stdin'], { input: snapshot.cleanBytes }).toString('utf8').trim() === snapshot.entry.oid, 'Written blob differs from the reviewed plan.');
      git(['update-index', '--add', '--cacheinfo', snapshot.entry.mode, snapshot.entry.oid, name], { env: tempEnv });
    }
  }
  invariant(git(['write-tree'], { env: tempEnv }).toString('utf8').trim() === nextTree, 'Temporary Git index differs from the reviewed proposed tree.');
  invariant(git(['hash-object', '-t', 'commit', '-w', '--stdin'], { input: nextRawCommit }).toString('utf8').trim() === nextCommit, 'Written commit differs from the reviewed plan.');
  assertSnapshot();
  // Refresh the remote immediately before updating the local branch. No fetch.
  if (!options.verifiedRemoteTip) {
    const fresh = git(['ls-remote', '--exit-code', options.remote, branchRef], { timeout: 45000 }).toString('utf8').trim().split(/\s+/)[0];
    invariant(fresh === remoteTip, 'The remote changed while the backup was created; the branch was not rewritten.');
  } else {
    invariant(Date.now() - Date.parse(options.verifiedAt) <= 10 * 60 * 1000, 'External remote verification expired during backup; the branch was not rewritten.');
  }

  const lockPath = indexPath + '.lock';
  let ownLock = false;
  let branchUpdated = false;
  try {
    const lock = fs.openSync(lockPath, 'wx');
    ownLock = true;
    try { fs.writeFileSync(lock, fs.readFileSync(temporaryIndex)); fs.fsyncSync(lock); } finally { fs.closeSync(lock); }
    assertSnapshot();
    git(['update-ref', '-m', 'Remove unpublished media after verified CDN migration', branchRef, nextCommit, head]);
    branchUpdated = true;
    fs.renameSync(lockPath, indexPath);
    ownLock = false;
  } catch (error) {
    if (branchUpdated) {
      const rollback = git(['update-ref', '-m', 'Restore original tip after index synchronization failure', branchRef, head, nextCommit], { allowFailure: true });
      invariant(rollback.status === 0, `Index synchronization failed and the branch could not be restored. Recovery data is in ${backup}; do not reset or delete working files.`);
    }
    throw error;
  } finally {
    if (ownLock && fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
  }
  invariant(text(['rev-parse', 'HEAD']) === nextCommit, 'Unexpected HEAD after cleanup. Recovery bundle is available.');
  git(['diff', '--cached', '--quiet', '--exit-code']);
  git(['merge-base', '--is-ancestor', remoteTip, nextCommit]);
  const final = { ...report, completed: true, backup: path.relative(repository, backup).replaceAll('\\', '/'), bundleVerified: true, realIndexSynchronized: true, workingFilesDeleted: 0, ordinaryFastForwardPossibleAtVerification: true };
  fs.writeFileSync(path.join(backup, 'completed.json'), JSON.stringify(final, null, 2) + '\n', { flag: 'wx' });
  return final;
}

module.exports = { MEDIA, gitHash, treeHash, replaceCommitTree, matchingBlobBytes, normalizeInclude, mediaDestination, parseArgs, run };
if (require.main === module) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      process.stdout.write('Dry-run: node scripts/clean-unpublished-media.cjs --include-file local-assets/work/git-cleanup/include.json\nApply: add --apply --expected-head <reviewed HEAD> --expected-plan <reviewed planId>\nOffline audit only: --offline-remote-tip <known SHA> (cannot apply)\nExternally verified remote: --verified-remote-tip <fresh ls-remote SHA> --verified-at <ISO timestamp>\nInclude files contain an explicit JSON array; directory globs are never accepted.\n');
    } else process.stdout.write(JSON.stringify(run(options), null, 2) + '\n');
  } catch (error) {
    process.stderr.write(`Media cleanup stopped: ${error.message}\n`);
    process.exitCode = 1;
  }
}
