# GLB-Texturcheck

`glb-texturcheck.html` ist eine eigenständige Browserseite ohne externe
Bibliotheken. Sie liest eine lokal ausgewählte GLB, verändert diese nicht und
überträgt weder Modell noch Texturen. Große Dateien müssen nicht vollständig
in den Arbeitsspeicher geladen werden: zuerst werden Kopf und JSON-Datenblock
gelesen, danach höchstens vier eingebettete Farbtexturen für die Vorschau.

## Verwendung

1. Die HTML-Datei herunterladen und im Browser öffnen.
2. Die betreffende GLB über die Dateiauswahl auswählen.
3. Ergebnis und eingebettete Farbtexturen ansehen.
4. „Prüfbericht herunterladen“ wählen und die kleine
   `nebeljagd-texturbericht.json` für die Diagnose weitergeben.

Falls ein verwalteter Browser lokale HTML-Seiten sperrt, kann dieselbe Datei
über einen lokalen Webserver geöffnet werden. Aus dem Projektverzeichnis:

```sh
python -m http.server 5198
```

Anschließend `http://localhost:5198/tools/glb-texturcheck.html` öffnen.

## Aussagegrenzen

Geprüft werden GLB-2-Kopf, Datenblockgrenzen, verwendete Mesh-/Materialverweise,
Farbtexturzuordnungen, deklarierte UV-Kanäle und Bilddatenbereiche. Material-
und Vertexfarben werden als Alternative zu Farbtexturen erkannt. Der Prüfer
unterscheidet externe Bilder, fehlende Bildverweise, unbenutzte Bilder und
Texturen ohne Farbzuordnung. Er lädt keine externen Bildverweise nach.

Eingebettete PNG-/JPEG-/WebP-/AVIF-Farbtexturen werden über die Browserdecoder
geöffnet. Ein Decoderfehler erzeugt eine Warnung; ein nicht unterstütztes
Vorschauformat wird separat vermerkt. KTX2 wird strukturell erkannt, aber nicht
dekodiert. Die 64×64-Farbstichprobe im Bericht ist nur eine Beobachtung und keine
Entscheidung, ob eine graue Textur richtig oder falsch ist.

Das Ergebnis ersetzt weder vollständige glTF-Validierung noch Renderer- oder
Kollisionsprüfung. Ein positiver Strukturcheck beweist nicht, dass ein Modell
in Tripo korrekt angezeigt wird. Der Metadaten-Hash im Bericht bezieht sich
nur auf den JSON-Datenblock, nicht auf die vollständige GLB.

## Prüfung

Getestet über lokales HTTP in Chromium mit synthetischen Fehlerfällen und den
beiden vorhandenen Tavernen-Dateien. Die ursprüngliche Taverne mit 65,44 MB
wurde einschließlich 4096×4096-Farbtextur gelesen; ihr Bericht war nur etwa
2,6 KB groß. Keine externen Netzwerkanfragen oder Browserfehler festgestellt.
Der verwaltete Cloud-Browser sperrt `file://`; dieser Startweg konnte dort
nicht geprüft werden. Die Richtlinie wurde nicht verändert.

Nachweis: `docs/glb-texturcheck-check.json`.
