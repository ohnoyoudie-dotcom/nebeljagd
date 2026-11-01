# Waffen beim Wechsel wieder ablegen

Beim bisherigen Wechsel blieb die alte Waffe als aufgesammelt markiert. Ihr
Bodenmodell blieb unsichtbar, während der Charakter bereits die neue Waffe hielt.

Der Wechsel mit **E** tauscht jetzt die beiden vorhandenen Gegenstände:
Die bisherige Waffe liegt an der Fundstelle der neuen. Sie behält ID, Modell,
Seltenheit, Größe und Drehung und lässt sich sofort wieder aufnehmen. Mehrfaches
Wechseln erzeugt keine Kopien. Die automatische erste Aufnahme ersetzt weiterhin
keine bereits ausgerüstete Waffe.

Ein Rundenneustart stellt die im Editor gesetzten Waffen an ihre ursprünglichen
Positionen zurück und entfernt zusätzlich erzeugte Truhenbeute. Der Editorentwurf
selbst wird durch das Spielen nicht verändert.

Ein Versionsparameter im Editorlink wird beim Öffnen des Spieltests übernommen,
damit ein aktualisierter Editor auch die zugehörige Spielversion lädt. Bereits
geöffnete Spiel-Tabs müssen geschlossen und über **Spielen** neu geöffnet werden.

Geprüft mit 337 Node-Tests und sieben Browserprüfungen der gebauten Dateien unter
dem tatsächlichen `/preview/`-Pfad. Der Browser setzt drei echte Tripo-Waffen im
Editor, öffnet den Spieltest und tauscht sie über Tastatureingaben mehrfach.
Keine Browserfehler; abgelegte Waffen in den Screenshots sichtbar.
Build: `03d805c5e9d5`. Die drei vom Nutzer auf `work` (`040d2f7`)
gespeicherten Waffenplatzierungen sind unverändert in der Ausgangskarte enthalten.
Der Neustart prüft auch deren ursprüngliche Positionen.
Prüfbericht: [weapon-swap-check.json](weapon-swap-check.json).

Veröffentlicht unter [Editor öffnen](https://ohnoyoudie-dotcom.github.io/nebeljagd/preview/map-editor.html?v=a786ff0), ausschließlich `preview/` auf `main`.
Commit: `a786ff0cdb5ae8df8b1014d1b788e585df669740`; [GitHub-Pages-Bereitstellung](https://github.com/ohnoyoudie-dotcom/nebeljagd/actions/runs/41311535345) erfolgreich.
Die veröffentlichten Dateien entsprechen dem geprüften Build; der direkte
Pages-HTTP-Aufruf ist in dieser Umgebung durch die Netzwerkpolicy gesperrt.
