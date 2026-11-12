"""Prepare the uploaded meteor body, retaining both the RAR and original GLB.

Uses the established local Blender pipeline; --execute writes a new package.
"""
from pathlib import Path
import importlib.util
import json
import sys

spec = importlib.util.spec_from_file_location('projectiles', Path(__file__).with_name('prepare-tripo-projectiles.py'))
pipeline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pipeline)
pipeline.OUTPUT = pipeline.ROOT / 'assets/imported/tripo-meteor-projectile'
pipeline.COMMAND = 'blender -b -t 3 --python scripts/prepare-meteor-projectile.py -- --execute'
pipeline.TRIANGLE_BUDGET = 6000
pipeline.TEXTURE_BUDGET = 256
pipeline.ASSETS = [('meteor-projectile', 'Meteor Projektil.glb',
    '4f9a1a68931503dac7a122da40a93079a979d809e49e73958346de43e677b67f')]
ARCHIVE = 'assets/inbox/Meteor Projektil.rar'
ARCHIVE_SHA = '3a1d00a446b1979cec83d4c92fad9289d427c54908e9868be3e18a0a939e4d98'

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
