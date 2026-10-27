# Walddorf: Umsetzung und Abnahme

Der vorhandene Einstieg ist bereits Three.js/WebGL2. Er wird weiterentwickelt;
die 2D-Versionen bleiben unverändert. Die bisherige 3D-Version liegt zusätzlich
unter `public/versions/nebeljagd-3d-v011.html`, ihre Quellen unter `archive/`.

## Technischer Plan

1. Vorhandene Regeln, HUD, Eingabe, Waffen und Sammelgegenstände erhalten.
2. Drei bestehende begehbare Gebäude zu individuellen Fachwerk-, Holz- und
   Steinbauten ausarbeiten. Geometrie nach Material und Dach-/Raumgruppe bündeln.
3. Eigenständige Bodenmaterialien mit Erdpfaden, Laub, feuchten Bachufern,
   Pflasterstellen und feinem Relief erzeugen. Waldvegetation und Dorfdetails
   instanzieren; Hindernisse erhalten passende Kollisionskörper.
4. In Blender einen neutralen Waldläufer mit Armature, Skinning und benannten
   Idle-/Walk-Clips erstellen und als GLB laden. Bewegung, Rolle und Waffen erhalten.
5. Tarnstatus von Sichtbarkeit trennen. Lokale Silhouette weich auf 45 % Deckkraft
   überblenden; Grashalme behalten ihre Tiefe und verdecken Teile der Figur.
6. Gefahrennebel über Shader darstellen: dunkler Außenbereich, mehrere Dichtestufen,
   sichtbare Grenze und zusätzliche Sichtabschwächung mit Entfernung.
7. Bildschirmauflösung/Schatten budgetieren, Materialien wiederverwenden, große
   Mengen ähnlicher Geometrie bündeln und Vegetations-LOD verwenden.
8. Produktionsbuild, Regeltests, gezielte Browserprüfungen und Aufnahmen derselben
   Spielkamera erstellen. Draw Calls/Geometrie dokumentieren; Software-FPS sind
   keine Aussage über Safari oder iPad-Hardware.

## Prüfpunkte

- WASD, Joystick, Rollen, E/F, Herzen, Kristalle, Pause und Neustart funktionieren.
- Beide Schlafräume, Hauseingänge und Brücke bleiben erreichbar.
- Zäune/Mauern und große Objekte blockieren; Bewegung gleitet entlang ihrer Kanten.
- Grasstatus funktioniert unabhängig von Opacity und wird beim Verlassen gelöscht.
- Nebel verursacht weiterhin die vorhandenen zeitabhängigen Schäden.
- Neue Assets laden auch in der eigenständigen HTML-Version ohne externe Dienste.
- Geprüfte alte Versionen behalten ihre SHA-256-Werte.

## Grenzen des Auftrags

Die im Text erwähnten Referenzbilder wurden nicht mitgeliefert. Eine direkte
Bildangleichung an diese Aufnahmen kann daher nicht belegt werden. Ziel ist ein
eigenständiger erster Art-Pass; das Qualitätsniveau eines kommerziellen Spiels
wird nur behauptet, wenn die tatsächlichen Ansichten das belegen.

Blender ist lokal vorhanden. Die optionale `game-dev`-CLI fehlt; es gibt deshalb
keine kanonischen CLI-Paket-/GPU-Belege. Eigene Blender-Quellen, GLB-Strukturprüfungen
und Browseraufnahmen dienen als direkte Nachweise. Keine fremden Spielassets,
bezahlten Provider oder externen Grafikdienste werden benötigt.

30 FPS auf Schul-iPads bleiben ein zu messendes Ziel, bis Safari auf den tatsächlich
eingesetzten Geräten geprüft wurde. Gegner, Online-Multiplayer und Lernaufgaben
werden in diesem Grafikdurchgang nicht ergänzt.
