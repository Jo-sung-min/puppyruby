// Restore reviewed diagnostic metadata only after proving native placement and
// image bytes are unchanged. No original, PNG or Aseprite file is written.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'..');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
let restored=0,verified=0;
for(const style of ['sp08','sp15']) for(const breed of fs.readdirSync(path.join(root,'local-assets/work/sp-scenes-v1',style,'processed'))){
  const currentFile=path.join(root,'local-assets/work/sp-scenes-v1',style,'processed',breed,'conversion.json');
  const oldFile=path.join(root,'local-assets/work/sp-scenes-v1',style,'previous/before-exterior-key-cleanup',breed,'processed/conversion.json');
  const current=JSON.parse(fs.readFileSync(currentFile,'utf8')),old=JSON.parse(fs.readFileSync(oldFile,'utf8'));
  if(current.width!==old.width||current.height!==old.height||current.sourceSha256!==old.sourceSha256)throw Error(`Native canvas/source changed: ${style}/${breed}`);
  for(let i=0;i<16;i++){
    const a=current.cellRectangles[i],b=old.cellRectangles[i];
    for(const k of ['x','y','width','height','translation','sourceBounds'])if(!equal(a[k],b[k]))throw Error(`Native ${k} changed: ${style}/${breed}/${i}`);
    if(!old.eyeDetection[i]||!Array.isArray(old.eyeDetection[i].candidates))throw Error(`Missing prior diagnostics: ${style}/${breed}/${i}`);
  }
  for(const scene of Object.keys(current.scenes))if(sha(path.join(root,'local-assets/site',current.scenes[scene].png))!==current.pngSha256[scene])throw Error(`PNG changed: ${style}/${breed}/${scene}`);
  if(sha(path.join(root,'local-assets/site',current.aseprite))!==current.asepriteSha256)throw Error(`Editable master changed: ${style}/${breed}`);
  if(current.eyeDetection.some(value=>value===null)){
    current.eyeDetection=old.eyeDetection;
    current.reviewedRegistrationMetadataRestored=true;
    fs.writeFileSync(currentFile,JSON.stringify(current,null,2)+'\n');restored++;
  }
  verified++;
}
console.log(JSON.stringify({nativePlacementsVerified:verified,diagnosticSetsRestored:restored,imageFilesChanged:0}));
