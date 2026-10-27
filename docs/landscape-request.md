# Nebeljagd – Map-Editor erweitern: Vegetation, Gelände, Wind und natürliche Spielwelt

Erweitere den bestehenden Map-Editor von Nebeljagd um professionelle Landschafts- und Vegetationswerkzeuge.

**Wichtig:** Bestehende Editorfunktionen, Karten, Objektplatzierungen, Kollisionen und Spielmechaniken müssen erhalten bleiben. Analysiere zunächst die vorhandene Architektur und erweitere die bestehenden Systeme, statt einen zweiten Editor aufzubauen.

Das Spiel läuft im Browser auf PCs und iPads. Achte deshalb besonders auf Performance, einfache Bedienung und eine möglichst natürliche Fantasy-Spielwelt.

## 1. Gras- und Vegetationseditor

Implementiere ein Pinselwerkzeug, mit dem Gras und andere Vegetation direkt auf die Karte gemalt werden können.

### Grashöhe
- Schieberegler für Grashöhe von 25 % bis 300 %.
- Standardhöhe 100 %.
- Zufällige Größenunterschiede innerhalb eines einstellbaren Bereichs.
- Unterschiedliche Höhen innerhalb derselben Grasfläche ermöglichen.
- Höhe nachträglich für bereits platzierte Grasflächen bearbeiten.
- Wurzelpunkte bleiben am Boden verankert.
- Optionale Höhenvariation von 0–50 %.
- Eigenständige Presets für kurzes Gras, Wiese und hohes Versteckgras.

### Grasdichte
- Dichte mit Schieberegler von 0–100 % einstellen.
- Einzelne Grasbüschel oder zusammenhängende Flächen malen.
- Pinselgröße und Pinselstärke einstellen.
- Weiche, unregelmäßige Ränder erzeugen.
- Dichte nachträglich verändern.
- Radierer zum Entfernen von Vegetation.

### Bodenfarbe übernehmen
- Schalter „Bodenfarbe übernehmen“.
- Grasfarbe dynamisch an die darunterliegende Bodenfarbe anpassen.
- Einstellbare Farbübergangsstärke von 0–100 %.
- Natürliche Grünfärbung darf nicht vollständig verloren gehen.
- Zusätzlich manuelle Grasfarbe über Farbauswahl einstellen.
- Einstellbare Helligkeit, Sättigung und Farbvariation.
- Unterschiedliche Farbvariationen pro Grasbüschel.
- Bei Änderungen der Bodenfarbe soll sich die Vegetation automatisch aktualisieren.
- Die Farbanpassung darf die Texturtransparenz nicht verändern.

### Grastypen
- Kurzes Wiesengras
- Mittelhohes Gras
- Hohes Versteckgras
- Trockenes Gras
- Dunkles Waldgras
- Sumpfgras
- Blumenwiese

Bestehende GLB-Grasmodelle nach Möglichkeit verwenden. Fehlende Varianten über Skalierung, Farben und zufällige Rotation erzeugen, ohne unnötig viele neue Modelle zu laden.

## 2. Dynamisches Windsystem

Implementiere ein gemeinsames Windsystem, das Gras und später weitere geeignete Vegetation animieren kann.

### Windsteuerung
- Wind aktivieren/deaktivieren.
- Windstärke 0–100 %.
- Windgeschwindigkeit einstellen.
- Windrichtung über einen drehbaren Richtungspfeil bestimmen.
- Windböen aktivieren/deaktivieren.
- Böenstärke und Böenhäufigkeit einstellen.
- Turbulenz einstellen.
- Vorschau der Animation direkt im Editor.

### Natürliches Verhalten
- Gras bewegt sich sanft und unregelmäßig.
- Benachbarte Grasbüschel reagieren ähnlich, aber nicht identisch.
- Die Bewegung soll wellenartig über Wiesen laufen.
- Graswurzeln bleiben fest am Boden.
- Die Spitzen bewegen sich stärker als die unteren Bereiche.
- Gelegentliche Windböen erzeugen sichtbare Wellen.
- Bäume, Sträucher und hohes Gras können unterschiedlich stark reagieren.

### Lokale Windzonen
- Windstärke in einzelnen Kartenbereichen verändern.
- Windgeschützte Bereiche ermöglichen.
- Unterschiedliche Windrichtungen regional zulassen.
- Übergänge zwischen Windzonen weich gestalten.

Die Windanimation soll direkt im Browser berechnet werden. Blender-spezifische Shaderknoten dürfen keine Voraussetzung sein.

Prüfe die vorhandene Rendering-Technik und implementiere eine kompatible, möglichst GPU-basierte Lösung. Falls das nicht möglich ist, eine performante Alternative verwenden.

## 3. Geländebearbeitung

Erweitere den Editor um ein Bodenmalwerkzeug.

### Bodenarten
- Grüne Wiese
- Dunkler Waldboden
- Erde
- Sand
- Schlamm
- Stein
- Fels
- Schnee
- Gepflasterter Weg

### Bodenwerkzeuge
- Bodenarten auf die Karte malen.
- Verschiedene Pinselgrößen.
- Weiche und harte Pinselränder.
- Natürliche Übergänge zwischen Bodenarten.
- Farbvariation innerhalb einer Bodenfläche.
- Bodenfarben nachträglich verändern.
- Keine sichtbaren quadratischen Übergänge oder abrupten Texturkanten.

## 4. Natürliche Objektverteilung

Implementiere ein Werkzeug zur automatischen Platzierung von Vegetation und Landschaftsobjekten.

- Bäume, Büsche, Gras, Steine und Blumen verteilen.
- Einstellbare Objektdichte.
- Zufällige Rotation.
- Zufällige Skalierung.
- Mindestabstände zwischen größeren Objekten.
- Natürliche Gruppenbildung statt gleichmäßiger Raster.
- Kollisionen und nicht platzierbare Bereiche berücksichtigen.
- Platzierungen bleiben nachträglich bearbeitbar.
- Vorhandene GLB-Assets aus dem Projekt verwenden.

## 5. Biome und Umgebung

Implementiere speicherbare Landschafts-Presets für:

- Wiese
- Wald
- Herbstwald
- Sumpf
- Wüste
- Schneegebiet
- Felslandschaft
- Dorf und Bauernhof

Jedes Biom definiert passende Bodenfarben, Vegetationsarten, Objektdichten und Farbvariationen.

Biome müssen sich manuell aufmalen lassen. Übergänge zwischen Biomen sollen möglichst natürlich aussehen.

## 6. Benutzeroberfläche

Ordne alle Funktionen übersichtlich in folgende Editorbereiche:

1. Gelände
2. Vegetation
3. Objekte
4. Wind und Umgebung
5. Biome
6. Karte und Vorschau

Ergänze eine Rückgängig-/Wiederholen-Funktion, einstellbare Pinselgrößen, einen Radierer, eine Vorschau und eine einfache Verwaltung gespeicherter Einstellungen.

Die Bedienung muss mit Maus und iPad-Touch funktionieren.

## 7. Performance

Die Karte soll auch auf Schul-iPads flüssig laufen.

- Instancing für wiederholte 3D-Objekte prüfen.
- Möglichst wenige Draw Calls.
- Level of Detail für entfernte Vegetation.
- Nicht sichtbare Objekte effizient ausblenden.
- Keine unnötigen Animationen außerhalb der Kamera.
- Vegetation bei Bedarf in Kartenabschnitte aufteilen.
- Qualitätsstufen für unterschiedliche Geräte.
- Editor und Spielmodus müssen dieselben gespeicherten Kartendaten verwenden.

## 8. Speicherung und Integration

Alle Einstellungen müssen dauerhaft mit der Karte gespeichert werden.

Dazu gehören:
- Grasart, Position, Skalierung und Dichte
- Farbwerte und Bodenfarbanpassung
- Windparameter und Windzonen
- Bodenarten
- Biome
- platzierte Objekte und ihre Eigenschaften

Speichere Versionen so, dass bestehende Karten weiterhin geladen werden können.

Verändere keine bestehenden Spielmechaniken ohne Notwendigkeit.

**GitHub:** Arbeite ausschließlich auf dem vorhandenen Entwicklungsbranch von Nebeljagd. Keine Änderungen an `main`.

## 9. Umsetzung und Prüfung

Analysiere zunächst den bestehenden Map-Editor, seine Assetstruktur und die Rendertechnik.

Implementiere die Funktionen in sinnvoller Reihenfolge, integriere sie in die vorhandene Oberfläche und überprüfe anschließend:

- Gras lässt sich malen und löschen.
- Grashöhe und Dichte lassen sich verändern.
- Gras übernimmt die Bodenfarbe.
- Wind bewegt Gras natürlich.
- Verschiedene Biome lassen sich gestalten.
- Änderungen bleiben nach dem Neuladen erhalten.
- Karten funktionieren weiterhin im Spielmodus.
- Die Performance auf iPads bleibt möglichst stabil.

Berichte abschließend, welche Funktionen umgesetzt wurden, welche getestet wurden und wo noch Einschränkungen bestehen.