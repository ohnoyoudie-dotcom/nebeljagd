# Ein fester Einstieg für Editor und Projektkarte

Der feste Einstieg lautet nach Veröffentlichung:

<https://ohnoyoudie-dotcom.github.io/nebeljagd/preview/editor.html>

Dieses Lesezeichen benötigt keinen wechselnden Versionsparameter und keinen
erneuten HTML-Download. Der Einstieg liest die aktuelle `release.json` ohne
Browsercache, zeigt den veröffentlichten Build und öffnet den zugehörigen
Editor mit seiner Datei-Prüfsumme im Link. Wenn die Versionsdatei nicht erreichbar
oder ungültig ist, erscheint eine Fehlermeldung mit erneutem Versuch. Es wird
nicht still eine möglicherweise ältere Editor-Datei geöffnet.

Beim Start lässt sich die **aktuelle Projektkarte** wählen oder ein **eigener
lokaler Entwurf fortsetzen**. Ein lokaler Entwurf gehört zum jeweiligen Browser
und zur Website-Adresse. Das Öffnen der Projektkarte verwirft oder überschreibt
einen vorhandenen Entwurf nicht stillschweigend. Die Versionsanzeige bezieht
sich auf den Editor-Build, nicht auf das Alter einer importierten eigenen Karte.

## Was veröffentlicht wird

Die zentrale Projektkarte bleibt `worldmap.json` im Projektstamm auf `work`.
`npm run build` erzeugt Editor, Spiel, Kartendateien und Offline-Paket gemeinsam
und synchronisiert sie nach `welt/`. Editor und Spiel enthalten dieselbe
Build-Kennung und dieselbe Karten-Prüfsumme. `welt/release.json` enthält die
Größen und SHA-256-Prüfsummen der endgültigen Dateien.

`node scripts/prepare-preview.js welt <Verzeichnis>/preview` prüft alle
benötigten Dateien gegen diese Metadaten, bevor es die Veröffentlichung
vorbereitet. Ein Editor aus einem anderen Build oder eine abweichende Karte
bricht den Schritt ab. In der öffentlichen Einzelspieler-Vorschau verweist
`preview/index.html` weiterhin auf das Spiel. Der Klassenportal-Einstieg und
alle Dateien außerhalb von `preview/` auf `main` bleiben erhalten.

Der Workflow **Work build and visual checks** testet den auslösenden
Quellcommit auf `work`, baut das Paket und prüft die erzeugten Browserdateien.
Danach übernimmt er den Build ausschließlich nach `work/welt`. Ein
zwischenzeitlich geänderter `work`-Stand blockiert eine veraltete Veröffentlichung.
Der Workflow schreibt nicht nach `main` und fordert keinen Pages-Build an.
Das geprüfte ZIP und die Versionsdatei stehen außerdem sieben Tage als
Actions-Artefakt **nebeljagd-work-browser** bereit.

Der bisherige öffentliche Pages-Einstieg oben bleibt damit auf seinem bereits
veröffentlichten Stand. Er ist kein Testzugang für neue `work`-Änderungen.
Zum Testen des aktuellen Branch-Builds das
[Browserpaket aus work](https://github.com/ohnoyoudie-dotcom/nebeljagd/raw/refs/heads/work/welt/nebeljagd-welt-und-editor.zip)
herunterladen, entpacken und `map-editor.html` öffnen. **Spielen** öffnet das
passende `nebeljagd.html` mit dem Editorentwurf. Für einen neuen öffentlichen
Web-Testzugang ist eine separate Hosting-Einrichtung nötig.

## Eigene Kartenänderungen

**Speichern** sichert weiterhin eine JSON-Datei auf dem Gerät. Es lädt weder
Karten auf GitHub hoch noch speichert es geräteübergreifend. Für eine neue
gemeinsame Projektkarte muss die gewünschte JSON-Datei als `worldmap.json` auf
`work` übernommen werden. Nach erfolgreichen Prüfungen speichert derselbe
Ablauf diese Karte zusammen mit dem passenden Editor und Spiel auf `work`.

Lokale HTML-Kopien und ZIP-Pakete bleiben feste Offline-Stände. Ein geöffneter
Editor tauscht während der Bearbeitung keinen Code oder Kartenstand aus.
Vor einem Wechsel eigene Änderungen als JSON sichern und den festen Einstieg
erneut öffnen.
