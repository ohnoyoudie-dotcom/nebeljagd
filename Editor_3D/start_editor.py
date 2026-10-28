"""Serve the existing Nebeljagd project locally; never upload files or change maps."""
from __future__ import annotations

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, quote, urlsplit
import threading
import webbrowser

EDITOR = Path(__file__).resolve().parent
ROOT = EDITOR.parent


class LocalHandler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map,
                      ".glb": "model/gltf-binary", ".gltf": "model/gltf+json",
                      ".js": "text/javascript", ".mjs": "text/javascript"}

    def list_directory(self, path):
        self.send_error(403, "Directory listing is disabled")
        return None

    def send_head(self):
        path = unquote(urlsplit(self.path).path)
        if any(part.startswith(".") for part in path.split("/") if part):
            self.send_error(403, "Hidden paths are not served")
            return None
        resolved = Path(self.translate_path(self.path)).resolve()
        try:
            resolved.relative_to(ROOT)
        except ValueError:
            self.send_error(403, "Path outside project")
            return None
        return super().send_head()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()


def main():
    if not (ROOT / "Blender").is_dir():
        raise SystemExit(
            "Der Ordner Editor_3D muss direkt in deinem nebeljagd-Projekt liegen, "
            "neben dem vorhandenen Ordner Blender. ZIP zuerst entpacken.")
    for name in ("map-editor.html", "nebeljagd.html"):
        if not (EDITOR / name).is_file():
            raise SystemExit("Datei fehlt: " + str(EDITOR / name))
    missing = [name for name in ("Taverne.glb", "taverne_nebeljagd.glb")
               if not (ROOT / "Blender" / name).is_file()]
    if missing:
        print("Hinweis: Folgende Tavernen-Dateien fehlen im Blender-Ordner:", ", ".join(missing))
    handler = partial(LocalHandler, directory=str(ROOT))
    server = None
    for port in range(8765, 8775):
        try:
            server = ThreadingHTTPServer(("127.0.0.1", port), handler)
            break
        except OSError:
            continue
    if server is None:
        raise SystemExit("Kein freier lokaler Port zwischen 8765 und 8774 gefunden.")
    url = "http://127.0.0.1:%d/%s/map-editor.html" % (
        server.server_port, quote(EDITOR.name))
    print("Editor:", url, flush=True)
    print("Dieses Fenster waehrend des Tests offen lassen. Strg+C beendet den Server.")
    print("Nur auf diesem Computer erreichbar. Es wird nichts hochgeladen.")
    print("Vorhandene Karten bei Bedarf mit JSON oeffnen laden und regelmaessig als JSON sichern.")
    timer = threading.Timer(0.6, lambda: webbrowser.open(url))
    timer.daemon = True
    timer.start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
