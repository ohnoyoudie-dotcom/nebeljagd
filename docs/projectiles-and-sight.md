# Inbox-Projektile, Giftbogen und freie Sicht

Der Eisstab schießt `ice crystal 3d model.glb`, der Bogen verwendet
`feathered spear 3d model.glb` als aufgelegten und fliegenden Pfeil. Das bestehende
Feuerprojektil verwendet weiterhin `fiery flame 3d model.glb`.

Die beiden neuen Browserkopien liegen unter `assets/imported/tripo-projectiles`:
je 6.000 Dreiecke, drei eingebettete PBR-Texturen mit maximal 512 Pixeln und
zusammen 1.167.452 Bytes. Die Originale mit jeweils knapp zwei Millionen
Dreiecken bleiben bytegleich. `runtime-manifest.json` enthält Quellenprüfsummen
und das vollständige Dateiverzeichnis; Inspektionsberichte und Bilder zeigen
die vorbereiteten Kopien. Es wurden keine externen Anbieter aufgerufen.

`scripts/prepare-tripo-projectiles.py` zeigt standardmäßig nur seinen Plan.
Der dokumentierte Blender-Aufruf erzeugt eine neue Ausgabe und verweigert das
Überschreiben vorhandener Pakete. Das optionale `game-dev`-CLI war in dieser
Umgebung nicht verfügbar; die Vorbereitung verwendet den bereits etablierten
Blender-Weg des Projekts. Es handelt sich um lokale Projektderivate.

`src/projectile-models.js` richtet die diagonale Längsachse der Uploads auf die
Flugrichtung +Z aus. Die tatsächliche Modelllänge beträgt 0,95 m beim Eiskristall
und 1,05 m beim Federpfeil. Poolinstanzen teilen Geometrie und Texturen, besitzen
aber ihre veränderlichen Materialien selbst. Treffer, Eiseffekt, Schaden und
Pfeilgeschwindigkeit bleiben unverändert.

Der Giftwurf verwendet jetzt eine parabolische Zusatzhöhe von 4 m anstelle
des bisherigen 2-m-Sinusbogens. Die Geschwindigkeit zur Berechnung der Flugzeit
sinkt von 14 auf 8,5 m/s, mit mindestens 0,6 Sekunden Flugzeit. Ein 12-m-Wurf
dauert ungefähr 1,42 Sekunden. Kurze Kollisionssegmente verfolgen den Bogen auch
über einen langen Frame hinweg. Die Wolkenlaufzeit beginnt beim tatsächlichen
Einschlag; Dauer 3 Sekunden, Radius 2,4 m und Schaden bleiben erhalten.

Das bestätigte Giftmodell `green abstract 3d model.glb` lag bei dieser Änderung
weder in der Cloud-Inbox noch auf den aktuellen GitHub-Branches. Bis die Datei
bereitgestellt ist, bleibt das vorhandene Venomstachel-Modell aktiv. Es wird
keine erfolgte Einbindung dieser fehlenden Datei behauptet.

Brunnen (einschließlich Pfosten und Dach), Karren, Fässer, Holzkisten und Truhen
werden ausschließlich aus der taktischen Sichtberechnung herausgenommen.
Dadurch gelten freie Sicht auf Figuren/Beute und der sichtbare Geländebereich
einheitlich. Bewegung, Trefferkörper und Zerstörung bleiben getrennt davon.
Hohe Mauern, Häuser und Felsen behalten ihre Sichtverdeckung. Die Änderung
greift für bestehende Platzierungen und neue Editorobjekte ohne Kartenmigration.

Prüfung: `npm test`, `npm run verify:assets`, `npm run build`, anschließend
`tests/projectiles_sight_smoke.py` gegen die erzeugten Browserdateien. Der Test
verwendet nur eine temporäre Editor-Prüfkarte, echte Eingaben, die importierten
Modelle und Spielkollisionen. Er prüft Treffer, Pause, Giftbogen, Wolkenablauf,
Sicht, Bewegung, Neustart und die unveränderte Projektkarte. Bilder und Bericht
liegen unter `test-results/projectiles-sight`. Die vollständige manuelle
CI-Prüfung enthält denselben Test. Chromium/SwiftShader ist keine Messung auf
einem physischen Tablet.
