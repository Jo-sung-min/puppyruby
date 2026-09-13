"""Create a labeled QA contact sheet from untouched native idle images."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parent.parent
assets = json.loads((root / 'frontend/src/lib/generated/art16-scene-assets.json').read_text('utf-8-sig'))
out = root / 'local-assets/work/desktop-reactions'
out.mkdir(parents=True, exist_ok=True)
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 15)
canvas = Image.new('RGB', (1500, 1920), '#202229')
d = ImageDraw.Draw(canvas)
for i, asset in enumerate(assets):
    src = Image.open(root / ('local-assets/site' + asset['scenes']['idle']['png'])).convert('RGBA')
    src.thumbnail((288, 288), Image.Resampling.NEAREST)
    x,y = (i%5)*300, (i//5)*320
    canvas.paste(src, (x+(300-src.width)//2,y+20), src)
    d.text((x+6,y+4), f"{i+1}. {asset['breed']} ({asset['width']}x{asset['height']})", font=font, fill='white')
canvas.save(out/'idle-contact.png')

# Independently placed native-image guides, reviewed on the contact sheet.
# Coordinates below refer to the 1399px QA preview; output uses native source pixels.
guides = [
 (100,149,149,149,107,267,143,267),
 (115,138,157,138,120,268,151,268),
 (111,147,155,147,117,268,152,268),
 (100,143,149,143,107,268,144,268),
 (112,155,161,155,115,268,158,268),
 (107,138,159,138,113,267,151,267),
 (105,139,152,139,106,268,145,268),
 (115,149,164,149,123,268,158,268),
 (104,120,145,120,103,252,143,252),
 (109,133,153,133,112,252,149,252),
 (94,143,144,143,101,269,138,269),
 (113,147,164,147,121,269,157,269),
 (110,147,168,147,116,253,156,253),
 (116,141,165,141,120,257,157,257),
 (116,125,162,125,117,257,157,257),
 (111,155,167,155,121,263,155,263),
 (115,146,164,146,122,263,155,263),
 (100,147,148,147,106,264,144,264),
 (97,145,146,145,104,264,143,264),
 (116,133,163,133,122,258,155,258),
 (111,136,169,136,115,265,159,265),
 (109,102,146,102,111,247,145,247),
 (107,137,155,137,107,266,151,266),
 (119,145,162,145,116,267,163,267),
 (107,133,172,133,108,260,169,260),
 (111,145,154,145,113,261,149,261),
 (108,141,172,141,113,261,158,261),
 (116,145,164,145,119,261,157,261),
 (109,155,162,155,113,263,160,263),
 (95,144,145,144,104,262,147,262),
]
scale_preview=1399/1500
metadata = {}
for asset, coords in zip(assets,guides):
    w,h=asset['width'],asset['height']
    scale=min(288/w,288/h)
    rendered_w=round(w*scale)
    # PIL thumbnail uses integer dimensions, so use the actual size.
    native=Image.open(root/('local-assets/site'+asset['scenes']['idle']['png'])).convert('RGBA')
    thumb=native.copy(); thumb.thumbnail((288,288),Image.Resampling.NEAREST)
    sx,sy=thumb.width/w,thumb.height/h
    def point(x,y):
        return round((x/scale_preview-(300-thumb.width)//2)/sx),round((y/scale_preview-20)/sy)
    points=[point(*coords[j:j+2]) for j in range(0,8,2)]
    # Tight inner-eye apertures leave eyelids/eyelashes untouched.
    eyes=[dict(x=x,y=y,rx=9,ry=10) for x,y in points[:2]]
    if asset['breed'] in ('chihuahua','bostonterrier','rottweiler','frenchbulldog'):
        eyes=[dict(x=e['x'],y=e['y'],rx=11,ry=12) for e in eyes]
    paws=[dict(x=x,y=y,rx=15,ry=12) for x,y in points[2:]]
    metadata[asset['breed']]=dict(width=w,height=h,eyes=eyes,paws=paws,footY=max(p['y'] for p in paws)+10)
path=root/'shared/art16-reaction-anchors.json'
path.write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(root/'frontend/src/lib/generated/art16-reaction-anchors.json').write_bytes(path.read_bytes())
for i,asset in enumerate(assets):
    src=Image.open(root/('local-assets/site'+asset['scenes']['idle']['png'])).convert('RGBA')
    draw=ImageDraw.Draw(src)
    for j,p in enumerate(metadata[asset['breed']]['eyes']+metadata[asset['breed']]['paws']):
        color='#00ff98' if j<2 else '#1bb9ff'
        x,y,rx,ry=(p[k] for k in ('x','y','rx','ry'))
        draw.ellipse((x-rx,y-ry,x+rx,y+ry),outline=color,width=1)
        draw.line((x-2,y,x+2,y),fill=color)
    src.thumbnail((288,288),Image.Resampling.NEAREST)
    x,y=(i%5)*300,(i//5)*320
    canvas.paste(src,(x+(300-src.width)//2,y+20),src)
canvas.save(out/'anchor-guides.png')
