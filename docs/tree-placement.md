# Bäume im Kartenatelier platzieren

In `welt/map-editor.html`: **Objekte → Einzeln → Objektart: Baum**. Als Modell stehen **Grüne Eiche · GLB**, **Herbsteiche · GLB**, **Große Kiefer · GLB** und **Junge Kiefer · GLB** zur Verfügung. „Auf Karte setzen“ aktivieren und auf Land klicken. Esc beendet das Setzen. Ein ausgewählter Baum bleibt verschiebbar; Drehung und Größe stehen rechts in den Eigenschaften.

„Zufällige Drehung (0–360°)“ ist bei Bäumen standardmäßig an. Die Hochachsen-Drehung wird genau einmal beim Setzen gewählt und als normaler Zahlenwert mit der Karte gespeichert. Ausschalten erzeugt neu gesetzte Bäume mit 0°. Bestehende Bäume ändern sich nicht. Duplizieren erhält die Ausrichtung der Vorlage. Rückgängig, Wiederholen, JSON und eigenständiger HTML-Export behalten die gespeicherten Werte.

Unter **Objekte → Verteilen** können dieselben GLB-Varianten mit Mindestabstand und zufälliger Drehung verteilt werden. Es wird nichts automatisch auf die Projektkarte gesetzt. Beide Bereinigungsfunktionen behalten diese freigeschalteten Baumvarianten bei.

## Verbindlicher Online-Editor und Veröffentlichung

Die verbindliche Arbeitsoberfläche ist **https://ohnoyoudie-dotcom.github.io/nebeljagd/preview/map-editor.html**. Für die Kartenbearbeitung muss keine lokale HTML-Datei geöffnet oder in den Editor importiert werden. „Öffnen“ im Editor lädt eine Weltkarte als JSON, **keine HTML-Datei**.

Änderungen am Editor werden auf Branch `work` entwickelt. Der vorhandene Workflow `.github/workflows/work-build-check.yml` baut nach jedem Push auf `work` den Editor und das Spiel, prüft beides und veröffentlicht bei erfolgreicher Prüfung **ausschließlich die zusammengehörenden Dateien im Verzeichnis `main/preview`**. Danach baut GitHub Pages die gewohnte Adresse neu. Nicht bestandene Prüfungen verhindern die Veröffentlichung; Aktualisierungen sind daher **nicht sekundengenau**, sondern erst nach erfolgreichem Build und Deployment online. Die Seite muss danach ggf. neu geladen werden, bei Browser-Caching mit `Strg+F5`.

Die bereits im Browser gespeicherten Kartenentwürfe werden durch ein Code-Deployment nicht auf die veröffentlichte `worldmap.json` geschrieben. Vor einem Wechsel oder Zurücksetzen des Browsers auf **„Entwurf sichern“** klicken bzw. eine JSON-Sicherung erstellen. Änderungen an der Online-Karte bleiben eigenständige Entwurfsdaten und werden nicht automatisch nach GitHub übertragen.

## Herkunft und Abgrenzung

Diese vier Modelle stammen aus dem bereits vorhandenen `Blender/nebeljagd_umwelt_kit_v1/assets/` und nutzen die vorhandenen echten Vorschauen, Normalisierung und Stamm-Kollisionen. Es sind **nicht** die fünf neu hochgeladenen „Tree Green“-Exporte. Diese enthalten aktuell eine Plane und einen leeren Baumgenerator, aber keine Stamm- oder Blattgeometrie. Die Originaldateien bleiben unverändert; sie werden weder als brauchbare Bäume angeboten noch heimlich durch andere Modelle unter ihren Namen ersetzt.

Die früheren prozeduralen und Rei-Baumvarianten bleiben für neue Platzierungen gesperrt, aber alte Karten bleiben lesbar. `worldmap.json` wird durch diese Freischaltung nicht verändert.

## Prüfung

`npm test`, `npm run verify:assets`, `npm run build`; danach `python tests/tree_placement_smoke.py` mit dem Repository über `http://127.0.0.1:4175` bereitgestellt. Der Browsertest prüft die tatsächlich gebaute `welt/map-editor.html`, echte UI-Platzierung, Vorschauen, Zufallsdrehung, manuelle Eigenschaften, Undo/Redo, Speichern/Import, 3D-Spieltest und die erneut geöffnete exportierte Editor-Datei. Er verändert nur seine Prüfszene, nicht die Projektkarte.
