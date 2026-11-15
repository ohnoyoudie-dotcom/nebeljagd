"""Register only the two real, locally rendered control-staff previews."""
from pathlib import Path
import base64,hashlib,json
from PIL import Image
root=Path(__file__).resolve().parents[1]
def digest(b):return hashlib.sha256(b).hexdigest()
p=root/'assets/catalog/previews.json';previews=json.loads(p.read_text())
m=root/'assets/catalog/preview-manifest.json';manifest=json.loads(m.read_text())
for kind,slug in [('shadowStaff','shadow-staff'),('clockworkStaff','clockwork-staff')]:
 package=root/f'assets/imported/tripo-{slug}'
 report=json.loads((package/f'inspections/{slug}.json').read_text())
 source=f'assets/imported/tripo-{slug}/previews/{slug}-runtime.png'
 image=Image.open(root/source);image.thumbnail((256,256))
 file=f'assets/catalog/{kind}-kit-tripo-{slug}.webp';image.save(root/file,format='WEBP',quality=85)
 data=(root/file).read_bytes();variant=f'kit-tripo-{slug}'
 previews[f'{kind}:{variant}']='data:image/webp;base64,'+base64.b64encode(data).decode()
 manifest['variants']=[v for v in manifest['variants'] if not (v['kind']==kind and v['variant']==variant)]
 manifest['variants'].append(dict(kind=kind,variant=variant,file=file,bytes=len(data),sha256=digest(data),method='Blender Cycles PBR of actual normalized runtime GLB, 640px render to 256px WebP',source=source,model=report['runtime']['path'],modelSha256=report['runtime']['sha256'],originalSourceSha256=report['source']['sha256'],generator=f'scripts/prepare-{slug}.py; scripts/register-control-staff-previews.py',modelBounds=dict(min=report['normalization']['gltfBounds'][0],max=report['normalization']['gltfBounds'][1])))
p.write_text(json.dumps(previews,ensure_ascii=False,indent=2)+'\n');m.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
