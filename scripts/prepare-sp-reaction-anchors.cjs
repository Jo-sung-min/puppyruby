'use strict';
// Paw guide coordinates are reviewed on inspect-sp-scene-anchors' 300px cells.
// Eye centers come from isolated native black-bean components, then are checked on the same sheet.
const fs = require('node:fs'), path = require('node:path'), { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..'), sharp = createRequire(path.join(root, 'frontend/package.json'))('sharp');
const target = path.join(root, 'local-assets/work/sp-scenes-v1/reaction-anchors.json');
const result = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : {};
const guides = {
  'sp08/poodle': [130, 295, 169, 295], 'sp08/maltese': [128, 295, 168, 295], 'sp08/shiba': [125, 295, 164, 295],
  'sp08/corgi': [131, 283, 169, 283], 'sp08/beagle': [129, 293, 170, 293],
  'sp08/samoyed': [118, 295, 164, 295], 'sp08/bichon': [128, 295, 166, 295], 'sp08/golden': [123, 291, 164, 291],
  'sp08/labrador': [126, 296, 162, 296], 'sp08/husky': [120, 294, 165, 294], 'sp08/shihtzu': [131, 293, 169, 293],
  'sp08/frenchbulldog': [130, 291, 171, 291], 'sp08/dachshund': [129, 293, 169, 293], 'sp08/schnauzer': [126, 288, 165, 288],
  'sp08/chihuahua': [133, 290, 172, 290], 'sp08/dalmatian': [132, 296, 170, 296], 'sp08/akita': [123, 295, 162, 295],
  'sp08/bordercollie': [119, 291, 159, 291], 'sp08/doberman': [132, 296, 171, 296], 'sp08/rottweiler': [125, 290, 167, 290],
  'sp08/greatdane': [129, 290, 168, 290], 'sp08/saintbernard': [125, 297, 165, 297], 'sp08/bassethound': [126, 295, 169, 295],
  'sp08/englishbulldog': [129, 285, 174, 285], 'sp08/westie': [121, 297, 162, 297], 'sp08/bostonterrier': [126, 297, 169, 297],
  'sp08/yorkshireterrier': [129, 298, 171, 298], 'sp08/pekingese': [122, 297, 164, 298], 'sp08/chowchow': [120, 298, 160, 298],
  'sp15/poodle': [132, 295, 173, 295], 'sp15/maltese': [126, 295, 165, 295], 'sp15/shiba': [115, 295, 154, 295],
  'sp15/corgi': [125, 282, 171, 282], 'sp15/beagle': [130, 290, 170, 290], 'sp15/samoyed': [128, 291, 167, 291],
  'sp15/bichon': [130, 294, 168, 294], 'sp15/golden': [126, 295, 161, 295], 'sp15/labrador': [132, 295, 172, 295],
  'sp15/husky': [122, 295, 163, 295], 'sp15/shihtzu': [126, 295, 165, 295], 'sp15/frenchbulldog': [126, 286, 172, 286],
  'sp15/dachshund': [128, 296, 168, 296], 'sp15/schnauzer': [124, 291, 165, 291], 'sp15/chihuahua': [121, 294, 166, 294],
  'sp15/dalmatian': [128, 297, 170, 297], 'sp15/akita': [126, 296, 164, 296], 'sp15/bordercollie': [119, 295, 160, 295],
  'sp15/doberman': [132, 295, 171, 295], 'sp15/rottweiler': [126, 297, 171, 297], 'sp15/greatdane': [132, 297, 172, 297],
  'sp15/saintbernard': [124, 296, 168, 296], 'sp15/bassethound': [130, 289, 166, 289], 'sp15/englishbulldog': [118, 297, 170, 297],
  'sp15/westie': [125, 297, 166, 297],
  'sp15/bostonterrier': [127, 295, 169, 295], 'sp15/yorkshireterrier': [126, 298, 168, 298],
  'sp15/pekingese': [115, 298, 157, 298], 'sp15/chowchow': [124, 297, 165, 297],
};
(async () => {
  const pending = [];
  for (const [key, guide] of Object.entries(guides)) {
    const proofPath = path.join(root, 'local-assets/work/sp-scenes-v1', key.split('/')[0], 'processed', key.split('/')[1], 'conversion.json');
    if (!fs.existsSync(proofPath)) { pending.push(key); continue; }
    const proof = JSON.parse(fs.readFileSync(proofPath, 'utf8'));
    const eyes = proof.eyeDetection?.[0]?.eyes;
    if (eyes?.length !== 2) { pending.push(`${key}: eye review needed`); continue; }
    const image = await sharp(path.join(root, 'local-assets/site', proof.scenes.idle.png)).resize({ width: 280, height: 290, fit: 'inside', kernel: 'nearest' }).png().toBuffer({ resolveWithObject: true });
    const sx = image.info.width / proof.width, sy = image.info.height / proof.height, ox = Math.floor((300 - image.info.width) / 2);
    const paws = [0, 2].map(index => ({ x: Math.round((guide[index] - ox) / sx), y: Math.round((guide[index + 1] - 30) / sy), rx: 15, ry: 11 }));
    result[key] = { width: proof.width, height: proof.height, eyes, paws };
  }
  fs.writeFileSync(target + '.tmp', JSON.stringify(result, null, 2) + '\n'); fs.renameSync(target + '.tmp', target);
  console.log(JSON.stringify({ anchors: Object.keys(result).length, pending }));
})().catch(error => { console.error(error); process.exitCode = 1; });
