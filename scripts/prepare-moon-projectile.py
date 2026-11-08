"""Prepare the newly synchronized moon upload using the established asset pipeline.

Read-only by default; --execute writes a separate package and preserves sources.
"""
from pathlib import Path
import importlib.util
import json
import sys

spec = importlib.util.spec_from_file_location('projectiles', Path(__file__).with_name('prepare-tripo-projectiles.py'))
pipeline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pipeline)
pipeline.OUTPUT = pipeline.ROOT / 'assets/imported/tripo-moon-projectile'
pipeline.COMMAND = 'blender -b -t 3 --python scripts/prepare-moon-projectile.py -- --execute'
pipeline.ASSETS = [('crescent-moon', 'crescent moon prop 3d model.glb',
                    '45d3e2ddcb987144a1faa1cf7aeea24c9f9eb94c708576feb7d9e0ddfaa79551')]

if __name__ == '__main__':
    if '--execute' in sys.argv:
        pipeline.execute()
    else:
        print(json.dumps({'command': pipeline.COMMAND, 'output': str(pipeline.OUTPUT), 'overwrite': False,
                          'source': pipeline.inspect(pipeline.ROOT / 'assets/inbox' / pipeline.ASSETS[0][1])}, indent=2))
