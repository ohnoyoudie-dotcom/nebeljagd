"""Register the prepared gravity staff's actual Blender preview in the editor catalog.

Run after scripts/prepare-gravity-staff.py:
    python scripts/register-gravity-preview.py

Adds only the gravity asset entry and never changes existing thumbnails.
"""
from pathlib import Path
from PIL import Image
import base64
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / 'assets/catalog'
PREVIEW = ROOT / 'assets/imported/tripo-gravity-staff/previews/gravity-staff-runtime.png'
RUNTIME = ROOT / 'assets/imported/tripo-gravity-staff/runtime/gravity-staff.glb'
REPORT = ROOT / 'assets/imported/tripo-gravity-staff/inspections/gravity-staff.json'
THUMB = CATALOG / 'gravityStaff-kit-tripo-gravity-staff.webp'
PREVIEWS_JSON = CATALOG / 'previews.json'
MANIFEST = CATALOG / 'preview-manifest.json'
KEY = 'gravityStaff:kit-tripo-gravity-staff'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def run():
    report = json.loads(REPORT.read_text())
    model = RUNTIME.read_bytes()
    if sha(model) != report['runtime']['sha256']:
        raise ValueError('Prepared GLB changed before thumbnail registration')
    if THUMB.exists():
        raise FileExistsError('Refusing to overwrite an existing gravity thumbnail')
    with Image.open(PREVIEW) as image:
        asset = image.convert('RGBA').resize((192, 192), Image.Resampling.LANCZOS)
    thumb = Image.new('RGBA', (256, 192), (0, 0, 0, 0))
    thumb.paste(asset, (32, 0), asset)
    thumb.save(THUMB, format='WEBP', quality=92, method=6)
    raw = THUMB.read_bytes()
    thumbnails = json.loads(PREVIEWS_JSON.read_text())
    manifest = json.loads(MANIFEST.read_text())
    if KEY in thumbnails or any(x['kind'] == 'gravityStaff' for x in manifest['variants']):
        raise ValueError('Gravity preview already registered')
    thumbnails[KEY] = 'data:image/webp;base64,' + base64.b64encode(raw).decode('ascii')
    manifest['variants'].append({
        'kind': 'gravityStaff', 'variant': 'kit-tripo-gravity-staff',
        'label': 'Gravitationsstab · Tripo',
        'file': str(THUMB.relative_to(ROOT)),
        'bytes': len(raw), 'sha256': sha(raw),
        'method': 'Blender Cycles PBR of the actual prepared staff, transparent 640x640 -> 192x192 thumbnail',
        'source': str(PREVIEW.relative_to(ROOT)),
        'model': str(RUNTIME.relative_to(ROOT)),
        'modelSha256': report['runtime']['sha256'],
        'originalSourceSha256': report['source']['sha256'],
        'generator': 'scripts/prepare-gravity-staff.py; scripts/register-gravity-preview.py',
        'modelBounds': {'min': report['normalization']['gltfBounds'][0],
                        'max': report['normalization']['gltfBounds'][1]},
    })
    PREVIEWS_JSON.write_text(json.dumps(thumbnails, indent=2, ensure_ascii=False) + '\n')
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
    print('GRAVITY_THUMBNAIL_REGISTERED ' + json.dumps({'bytes': len(raw), 'sha256': sha(raw)}))


if __name__ == '__main__':
    run()
