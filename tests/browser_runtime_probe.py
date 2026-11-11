"""Verify the actual browser runtime before the generated-game checks."""
import os
from playwright.sync_api import sync_playwright

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        executable_path=os.environ.get('CHROMIUM_EXECUTABLE'), headless=True,
        args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    try:
        page = browser.new_page()
        page.set_content('<canvas id="gpu"></canvas>')
        assert page.evaluate("!!document.querySelector('#gpu').getContext('webgl2')"), 'WebGL 2 is unavailable'
        print('PASS Chromium', browser.version, 'starts with WebGL 2 and the runner system libraries')
    finally:
        browser.close()
