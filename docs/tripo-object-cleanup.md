# Tripo-Objektauswahl und Kartenbereinigung

Unter **Objekte** stehen zwölf Varianten in neun Kategorien bereit:
Wirtshaus und Wohnhaus 2, drei Tripo-Felsen, Holzwagen, Holzfass,
Steinbrunnen, Schatztruhe sowie die neuen Modelle für Schwert, Feuer- und
Eisstab. Die [Waffenmodelle](tripo-weapons.md) bleiben auch bei der Bereinigung
erhalten. Die Truhe startet direkt mit dem Tripo-Modell.
Das kleine Schloss, Herz, alte Holztruhe, Bogen und die bisherigen Waffenmodelle
und die übrigen alten Modelle werden nicht mehr als neue Einzelobjekte angeboten.
Auch „Natürlich verteilen“ nutzt ausschließlich die Tripo-Felsen.

**Mauern & Zäune ziehen** behält die vier aktuellen Stile samt Höhen und
Durchgängen. Ihre Modelle werden weiterhin benötigt und sind deshalb nicht
gelöscht; doppelte Einzelobjekt-Einträge sind entfernt. Der eigene Graspinsel,
Landschaftsmalen und Radiergummi bleiben verfügbar.

Die Projektkarte enthält bereits nur ein Tripo-Wirtshaus und vier aktive
Mauer-/Zaunstrecken. Deshalb verändert dieser Schritt keine ihrer Positionen,
Wege, Regionen, Bodenflächen oder Startbereiche.

Bei einem älteren lokalen Entwurf zunächst **Wiederherstellen**, dann
**Auf Tripo-Objekte bereinigen** wählen. Dieselbe Bereinigung steht nach
JSON-Import bereit. Sie entfernt alte Einzelobjekte einschließlich platzierter
alter Beute, Grasobjekte, einzelner Mauer-/Zaunobjekte und des kleinen Schlosses.
Die drei neuen Waffenvarianten werden ausdrücklich behalten.
Die vier aktuellen gezeichneten Mauer-/Zaunstile bleiben samt Verlauf,
Höhe und Durchgängen erhalten. Die Bereinigung lässt sich mit **Zurück**
rückgängig machen. Danach die Karte speichern.

Alte Daten bleiben bis zur ausdrücklichen Bereinigung lesbar. Im Objektfilter
sind ihre Kategorien deshalb weiterhin auffindbar; ein altes Modell erscheint
im Eigenschaftenfenster als „alte Platzierung“, lässt sich aber nicht neu
auswählen oder duplizieren. Laufzeit-Beute aus Truhen und die Waffensysteme
bleiben funktionstüchtig.

Technisch trennt `PLACEMENT_OBJECT_CATALOG` die Auswahl für neue Platzierungen
vom vollständigen Katalog für Spiel und Legacy-Import. Die unverändernde
Funktion `removeNonTripoObjects` bereinigt ausschließlich gespeicherte
Platzierungen. Die Quelldateien und vorhandenen Modellpakete bleiben erhalten.

Prüfungen: Alle 261 Node-Tests bestanden, einschließlich exakter Datenvergleiche
für Bereinigung und aktive Varianten. Sieben Browserprüfungen der ausgelieferten
HTML-Datei in `tests/tripo_palette_smoke.py` bestanden, mit
Auswahl, Platzierung, Import/Export, Bereinigung und Undo/Redo, Graspinsel
sowie Mauer-/Zaunzeichnung. Keine Browserfehler oder externen Ressourcenabrufe. Ergebnisse:
`docs/tripo-palette-check.json`.
Die erzeugten Dateien liegen weiterhin unter `welt/map-editor.html` und
`welt/nebeljagd.html` auf `work`; `main` wird dadurch nicht veröffentlicht.
