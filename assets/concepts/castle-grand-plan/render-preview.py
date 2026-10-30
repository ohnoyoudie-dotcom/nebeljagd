"""Render the measured SVG as a PNG using the environment's Chromium."""
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parent
with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path='/usr/bin/chromium', headless=True)
    page = browser.new_page(viewport={'width': 2200, 'height': 1710}, device_scale_factor=1)
    page.set_content('<style>body{margin:0}</style>'+root.joinpath('floorplan.svg').read_text())
    page.locator('svg').screenshot(path=str(root/'floorplan.png'))
    overflow = page.locator('svg text').evaluate_all(
        '(els)=>els.filter(e=>{let b=e.getBBox();return b.x<0||b.x+b.width>2200||'
        'b.y<0||b.y+b.height>1710}).map(e=>e.textContent)')
    assert not overflow, overflow
    browser.close()
print('PNG rendered; all labels are inside the drawing.')
