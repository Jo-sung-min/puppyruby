// Render the real pure dog component. No server access or production asset export.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const root = path.resolve(__dirname, '..');
const frontend = Module.createRequire(path.join(root, 'frontend/package.json'));
const swc = frontend('next/dist/build/swc');
const React = frontend('react');
const { renderToStaticMarkup } = frontend('react-dom/server');
const sharp = frontend('sharp');
function load(relative, overrides = {}) {
  const filename = path.join(root, 'frontend', relative);
  const code = swc.transformSync(fs.readFileSync(filename, 'utf8'), { filename, jsc: { parser: { syntax: 'typescript', tsx: filename.endsWith('.tsx') }, transform: { react: { runtime: 'automatic' } }, target: 'es2020' }, module: { type: 'commonjs' } }).code;
  const loaded = new Module(filename, module); loaded.filename = filename; loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const fallback = loaded.require.bind(loaded); loaded.require = name => Object.hasOwn(overrides, name) ? overrides[name] : fallback(name);
  loaded._compile(code, filename); return loaded.exports;
}
const { PixelDog } = load('src/components/pixel-dog.tsx');
const { dogStyles, styleBreedIds } = load('src/lib/dog-styles.ts');
const cosmetics = load('src/lib/cosmetics.ts');
const game = load('src/lib/game.ts');
const { PuppySprite } = load('src/components/puppy-sprite.tsx', { '../lib/cosmetics': cosmetics, '@/lib/game': game, './styled-pixel-dog': { PixelDog } });
const svg = props => renderToStaticMarkup(React.createElement(PixelDog, { decorative: true, groundShadow: false, ...props })).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" ');
async function pixels(props) { return sharp(Buffer.from(svg(props))).ensureAlpha().raw().toBuffer(); }
(async () => {
  let checks = 0;
  for (const style of dogStyles) for (const breed of styleBreedIds) {
    const plain = await pixels({ breed, styleId: style.id });
    const variants = new Set();
    for (const item of cosmetics.paidAccessories) {
      const art = await pixels({ breed, styleId: style.id, accessory: item.id });
      assert.notDeepEqual(art, plain, `${style.id}/${breed}/${item.id} must be visible`);
      const digest = require('node:crypto').createHash('sha256').update(art).digest('hex');
      assert(!variants.has(digest), `${style.id}/${breed} paid accessories must differ`); variants.add(digest); checks += 2;
    }
  }
  for (const [aura, style] of Object.entries(cosmetics.auraStyles)) {
    const element = PuppySprite({ puppy: { breed: 0, aura } });
    assert.equal(element.props['data-aura'], aura); assert.equal(element.props.style['--puppy-aura-color'], style.color);
    assert.equal(element.props.children.props.groundShadow, false); checks += 3;
  }
  for (const aura of [null, 'none', 'bad', '__proto__']) {
    const element = PuppySprite({ puppy: { breed: 0, aura } });
    assert.equal(element.props['data-aura'], undefined); checks++;
  }
  let gallery = '<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="430"><rect width="1120" height="430" fill="#fafafa"/><text x="24" y="35" font-family="Arial" font-size="20" fill="#222">PuppyRuby · accessory previews</text>';
  for (let i = 0; i < cosmetics.paidAccessories.length; i++) {
    const item = cosmetics.paidAccessories[i];
    for (let row = 0; row < 2; row++) {
      const image = await sharp(Buffer.from(svg({ breed: row ? 'beagle' : 'pomeranian', styleId: row ? 'mochi' : 'classic', accessory: item.id }))).png().toBuffer();
      gallery += `<image x="${16 + i*156}" y="${56+row*180}" width="128" height="128" href="data:image/png;base64,${image.toString('base64')}"/><text x="${80+i*156}" y="${207+row*180}" text-anchor="middle" font-family="Arial" font-size="13" fill="#333">${item.id}</text>`;
    }
  }
  gallery += '</svg>';
  const out = path.join(root, 'desktop/build/cosmetic-preview.png'); fs.mkdirSync(path.dirname(out), { recursive: true });
  await sharp(Buffer.from(gallery)).png().toFile(out);
  console.log(`PASS ${checks} cosmetics checks: 16 styles × 7 breeds × 7 accessories, aura mapping. Preview: ${out}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
