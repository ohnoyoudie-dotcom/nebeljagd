from pathlib import Path
from PIL import Image
import base64,re,io,json,urllib.request
ROOT=Path(__file__).resolve().parents[2]
SRC=Path(__file__).parent
OUT=ROOT/'grass-build';OUT.mkdir(exist_ok=True)
BASE='59e54781cafd95cd7dd31fb40c5b19dc7a10224d'
def source(name):
    p=ROOT/'welt'/name
    text=p.read_text()
    if 'REI_GRASS_MASK_DATA' in text:
        url=f'https://raw.githubusercontent.com/ohnoyoudie-dotcom/nebeljagd/{BASE}/welt/{name}'
        text=urllib.request.urlopen(url,timeout=30).read().decode()
    return text
image=Image.open(ROOT/'Blender/Gras/textures/grass4_mask_01.png').convert('L').resize((1024,1024),Image.Resampling.LANCZOS)
buf=io.BytesIO();image.save(buf,format='PNG',optimize=True)
texture="const REI_GRASS_MASK_DATA='data:image/png;base64,"+base64.b64encode(buf.getvalue()).decode()+"';\n"
common=(SRC/'common.js').read_text()
editor=source('map-editor.html');game=source('nebeljagd.html')
def once(s,old,new):
    count=s.count(old)
    if count!=1:raise ValueError(f'Expected exactly one integration anchor ({count}): {old[:120]}')
    return s.replace(old,new,1)
editor=once(editor,'<script type="module">','<script type="module">'+texture+common+'\n'+(SRC/'editor.js').read_text()+'\n')
editor=once(editor,'function Y(){X(),','function Y(){reiEditorSync();X(),')
editor=once(editor,'r.removeAttribute(`height`),r.querySelector','r.removeAttribute(`height`),reiPaintMap(r,M),r.querySelector')
pos=editor.index('</script>');editor=editor[:pos]+'\nreiEditorMount();\n'+editor[pos:]
editor=editor.replace('location.protocol===`file:`?`./nebeljagd.html?mapSource=editor`:`./index.html?mapSource=editor`','`./nebeljagd.html?mapSource=editor`')
editor=editor.replace('new URL(`./index.html?mapSource=editor`,location.href)','new URL(`./nebeljagd.html?mapSource=editor`,location.href)')
game=once(game,'<script type="module">','<script type="module">'+texture+common+'\n'+(SRC/'runtime.js').read_text()+'\n')
game=once(game,'let o=Up(t),s=new Map,c=[]','let o=Up(t),reiCfg=reiGroundSettings(t),reiBase=new J(reiCfg.color),s=new Map,c=[]')
game=once(game,'(o.colorAt(e,t,f),d.set(n,','(o.colorAt(e,t,f),reiRegionHasGrass(null,o.regionAt(e,t),reiCfg)&&f.lerp(reiBase,1-reiCfg.groundBlend),d.set(n,')
game=once(game,'let ne=await kp(a,{map:t,heightAt:k,groundHeightAt:k,quality:n,chunkSize:Wp}),re=new Set;','let ne=await kp(a,{map:t,heightAt:k,groundHeightAt:k,quality:n,chunkSize:Wp}),reiGround=await reiCreateGround({root:a,map:t,heightAt:k,colorAt:o.colorAt,isLand:o.isLand,isWater:o.isWater,regionAt:o.regionAt,quality:n}),re=new Set;')
game=once(game,'v.value=n,y.value=i,ne.update(e,n,r,i);','v.value=n,y.value=i,ne.update(e,n,r,i),reiGround.update(n,r);')
game=once(game,'ne.setQuality(p),m=-1/0','ne.setQuality(p),reiGround.setQuality(p),m=-1/0')
game=once(game,'mapId:t.id,terrainChunks:c.length','mapId:t.id,groundCover:reiGround.inspect(),terrainChunks:c.length')
game=once(game,'...ne.stats}},dispose(){let t=new Set,n=new Set;','...ne.stats}},dispose(){reiGround.dispose();let t=new Set,n=new Set;')
game=once(game,'for(let e of t.objects??[]){if([`heart`,`crystal`,`bow`,`sword`].includes(e.kind))continue;','for(let e of t.objects??[]){if(e.kind===`grass`&&e.variant===`short`&&reiRegionHasGrass(t,reiRegionAt(t,...e.position)))continue;if([`heart`,`crystal`,`bow`,`sword`].includes(e.kind))continue;')
for name,content in [('map-editor.html',editor),('nebeljagd.html',game)]:
    (OUT/name).write_text(content)
    script=re.search('<script type="module">([\\s\\S]*?)</script>',content).group(1)
    (OUT/(name+'.mjs')).write_text(script)
print(json.dumps({'editorBytes':len(editor.encode()),'gameBytes':len(game.encode()),'maskBytes':len(buf.getvalue()),'baseCommit':BASE}))
