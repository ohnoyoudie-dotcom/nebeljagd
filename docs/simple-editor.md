# Einfacher Karteneditor

Der Editor hat vier Hauptbereiche:

- **Malen:** Eine Landschaft wie Wiese oder Schnee antippen und auf der Insel
  ziehen. Die Pinselgröße bestimmt die Breite. Boden und Bewuchs werden zusammen
  verändert. „Hohes Gras malen“ erzeugt zusätzliche Versteckflächen.
- **Objekte:** Modell auswählen und auf die Karte setzen. „Mehrere Objekte
  verteilen“ ist eine zusätzliche, aufklappbare Funktion. Unter **Mauern & Zäune
  ziehen** lassen sich ganze Strecken zeichnen, mit Durchgängen versehen und
  später über ihre Formpunkte bearbeiten; eine 3D-Vorschau zeigt die Modelle.
- **Radieren:** „Gemalte Landschaft“, „Nur Grasflächen“ oder „Objekte“ wählen
  und über die Karte ziehen. Beim Bereichswechsel ist der Radierer sofort aktiv.
- **Mehr:** Wege, Flüsse, Karteninhalt, Wind, Ansicht und zusätzliche Dateiformate.

„Auswählen“, „Karte bewegen“, „Rückgängig“ und „Wiederholen“ bleiben über der
Karte erreichbar. Ein Wechsel des Hauptbereichs beendet den vorherigen Pinsel.
Eigenschaften erscheinen erst beim Auswählen eines Elements. Auf kleineren
Bildschirmen können sie mit dem Kreuz wieder geschlossen werden.

Die Anleitung zum neuen Ziehwerkzeug und seinem austauschbaren Modellaufbau
steht unter [Mauern und Zäune zeichnen](barrier-editor.md).

## Landschaft und Bodenfarbe

Eine Landschaft (bisher „Biom“) steuert die Bodenoberfläche und den passenden
Bewuchs gemeinsam. Das ist die normale Malfunktion. „Nur die Bodenfarbe ändern“
bleibt als aufklappbare Feineinstellung erhalten und beeinflusst den Bewuchs
nicht. Farbe, Dichte, Randweichheit und eigene Vorlagen sind weiterhin verfügbar,
aber nicht gleichzeitig in der Hauptansicht sichtbar.

## Was der Radierer entfernt

Der Landschaftsradierer entfernt **ganze berührte gemalte Flächen**. Die
betroffenen Kreisflächen werden vorab markiert. Bei einer gemalten Landschaft
werden sowohl der Bodenauftrag als auch die zugehörigen Biomdaten entfernt;
der ursprüngliche Inselboden kommt wieder zum Vorschein. Es entstehen keine
zusätzlichen, unsichtbaren Radiermasken. Die Grundregionen, Wege, Gewässer und
platzierten Gegenstände bleiben erhalten.

„Nur Grasflächen“ und „Objekte“ verwenden die bisherige Objektentfernung: Der
Radierkreis muss deren markierten Mittelpunkt berühren. Ein kompletter Strich
ist ein Rückgängig-Schritt. Ein abgebrochener Touch- oder Mausstrich wird
verworfen. Der Flächenradierer kann 0,5–80 m groß sein, der Objektradierer
0,5–24 m. Beim Wechsel wird die Größe auf den passenden Bereich begrenzt.

## Speichern und vorhandene Karten

**Speichern** sichert die weiterverwendbare `worldmap.json`, **Öffnen** lädt eine
vorhandene Karte und **Spielen** übergibt den aktuellen Entwurf an die 3D-Welt.
SVG und eine eigenständige HTML-Kopie befinden sich unter
**Mehr → Ansicht und Dateien**. Bestehende Karten bleiben kompatibel.

Während dieser Überarbeitung kamen auf `work` acht weitere Benutzerplatzierungen
an (Commit `697eee7`). Die vollständige Projektkarte mit 961 Objekten bleibt
unverändert erhalten, einschließlich dieser neuen Modelle und der zusätzlichen
Truhe. Alte Kategorien werden weiterhin nicht für neue Platzierungen angeboten;
ihre vorhandenen Instanzen lassen sich bewusst über die vorhandene Bereinigung
entfernen. Die Benutzerkarte wurde nicht automatisch bereinigt.

## Prüfung und Ausgabe

192 Node-Tests, elf Browserprüfungen und der Browser-Build sind bestanden.
Die Browserprüfungen in
`docs/simple-editor-check.json` decken Malen, Flächen-/Objektradieren,
Rückgängig/Wiederholen, geschützte Beute, Werkzeugwechsel, JSON- und HTML-Rundlauf,
3D-Übergabe sowie Touch-Abbruch ab. Layouts mit 1280, 1024, 768 und 390 Pixeln
Breite wurden geprüft und die Screenshots visuell gesichtet. Die Touch-Prüfung erfolgt in Chromium-Emulation und
ersetzt keine Leistungsprüfung auf einem physischen iPad.

Die geprüften Dateien stehen auf Branch `work` unter `welt/`. Nach dem
Aktualisieren `welt/map-editor.html` öffnen; `welt/nebeljagd.html` bleibt daneben.
Die öffentliche Pages-Veröffentlichung auf `main` wird dadurch nicht geändert.
