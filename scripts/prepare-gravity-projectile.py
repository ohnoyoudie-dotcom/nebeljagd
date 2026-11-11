"""Prepare the user's Void projectile without changing its original GLB.

Uses the established local Blender pipeline, with no provider requests.
Read-only unless --execute is supplied; refuses to replace an existing package.
"""
from pathlib import Path
import importlib.util
import json
import sys

spec = importlib.util.spec_from_file_location('projectiles', Path(__file__).with_name('prepare-tripo-projectiles.py'))
pipeline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pipeline)
pipeline.OUTPUT = pipeline.ROOT / 'assets/imported/tripo-gravity-projectile'
pipeline.COMMAND = 'blender -b -t 3 --python scripts/prepare-gravity-projectile.py -- --execute'
pipeline.TRIANGLE_BUDGET = 4000
pipeline.TEXTURE_BUDGET = 256
pipeline.ASSETS = [('void-projectile', 'Void Projektil.glb',
                    '419684146dcf1378d9efde812508008dee949899ef35df547f3e5d4197deede5')]

if __name__ == '__main__':
    if '--execute' in sys.argv:
        pipeline.execute()
    else:
        print(json.dumps({'command': pipeline.COMMAND, 'output': str(pipeline.OUTPUT), 'overwrite': False,
                          'source': pipeline.inspect(pipeline.ROOT / 'assets/inbox' / pipeline.ASSETS[0][1])}, indent=2))
