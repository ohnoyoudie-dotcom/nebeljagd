"""Prepare the uploaded soul projectile with the established local Blender path."""
from pathlib import Path
import importlib.util
import json
import sys

spec = importlib.util.spec_from_file_location('projectiles', Path(__file__).with_name('prepare-tripo-projectiles.py'))
pipeline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pipeline)
pipeline.OUTPUT = pipeline.ROOT / 'assets/imported/tripo-soul-projectile'
pipeline.COMMAND = 'blender -b -t 3 --python scripts/prepare-soul-projectile.py -- --execute'
pipeline.TRIANGLE_BUDGET = 4000
pipeline.TEXTURE_BUDGET = 256
pipeline.ASSETS = [('soul-projectile', 'Seelenrichterstab Projektil.glb',
    'b34ecf234e3d67d2b9108933e14c224168697ae09c3e811c38bcc8f781df158c')]
ARCHIVE = 'assets/inbox/Seelenrichterstab Projektil.rar'
ARCHIVE_SHA = 'c90b3f56274e4fa9345e20f833e16d05e99226f985f33c3a30672e1c30b1cd6d'

if __name__ == '__main__':
    assert pipeline.digest(pipeline.ROOT / ARCHIVE) == ARCHIVE_SHA
    if '--execute' in sys.argv:
        pipeline.execute()
        manifest = pipeline.OUTPUT / 'runtime-manifest.json'
        data = json.loads(manifest.read_text())
        data['sources'].append({'path': ARCHIVE, 'sha256': ARCHIVE_SHA})
        manifest.write_text(json.dumps(data, indent=2) + '\n')
    else:
        print(json.dumps({'command': pipeline.COMMAND, 'output': str(pipeline.OUTPUT), 'overwrite': False,
            'source': pipeline.inspect(pipeline.ROOT / 'assets/inbox' / pipeline.ASSETS[0][1])}, indent=2))
