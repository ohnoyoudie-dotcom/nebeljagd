"""Compatibility entry point for editor/chest loot verification.
NEBELJAGD_URL points to the generated preview (default: port 4174).
"""
import runpy
from pathlib import Path
runpy.run_path(str(Path(__file__).with_name('chest_loot_browser_smoke.py')), run_name='__main__')
