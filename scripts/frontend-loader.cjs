'use strict';
// Compile the real local renderers and their TypeScript dependencies for native exports and checks.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const frontend = path.resolve(__dirname, '../frontend');
const frontendRequire = Module.createRequire(path.join(frontend, 'package.json'));
const swc = frontendRequire('next/dist/build/swc');
const cache = new Map();
function resolveFrontendDependency(filename, name, fallback) {
  if (name.endsWith('.module.css')) return new Proxy({}, { get: (_, key) => key === '__esModule' ? false : String(key) });
  const base = name.startsWith('@/') ? path.join(frontend, 'src', name.slice(2)) : name.startsWith('.') ? path.resolve(path.dirname(filename), name) : null;
  if (base && (base.startsWith(frontend + path.sep))) {
    const target = [base, base + '.ts', base + '.tsx', path.join(base, 'index.ts'), path.join(base, 'index.tsx')].find(candidate => /\.tsx?$/.test(candidate) && fs.existsSync(candidate));
    if (target) return loadFrontend(path.relative(frontend, target));
  }
  return fallback(name);
}
function loadFrontend(relativePath, overrides = {}) {
  const filename = path.resolve(frontend, relativePath);
  if (!filename.startsWith(frontend + path.sep)) throw new Error('Only frontend sources can be loaded.');
  const reusable = Object.keys(overrides).length === 0;
  if (reusable && cache.has(filename)) return cache.get(filename).exports;
  const compiled = swc.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, jsc: { parser: { syntax: 'typescript', tsx: filename.endsWith('.tsx') }, transform: { react: { runtime: 'automatic' } }, target: 'es2020' }, module: { type: 'commonjs' },
  }).code;
  const loaded = new Module(filename, module);
  loaded.filename = filename; loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const fallback = loaded.require.bind(loaded);
  loaded.require = name => Object.hasOwn(overrides, name) ? overrides[name] : resolveFrontendDependency(filename, name, fallback);
  if (reusable) cache.set(filename, loaded);
  try { loaded._compile(compiled, filename); } catch (error) { if (reusable) cache.delete(filename); throw error; }
  return loaded.exports;
}
module.exports = { loadFrontend, resolveFrontendDependency };
