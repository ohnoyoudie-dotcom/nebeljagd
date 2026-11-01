# Überarbeitete Feuer- und Eiseffekte

Die zweite Fassung behält den stilisierten Fantasy-Stil bei und verfeinert
Form, Farbe und Bewegung der [ersten Zaubereffekte](spell-effects.md).

- Feuer hat einen kleinen heißen Kern und weich bewegte Flammenflächen mit
  Übergängen von Rot über Orange zu Gold. Die Farben bleiben auch vor dem
  grünen Gelände erkennbar.
- Durchgehende, schmal auslaufende Schweife folgen der tatsächlichen Flugbahn.
  Einzelne Funken und Frostsplitter ergänzen diese Spur. Nach dem Einschlag
  klingt der verbliebene Schweif kurz aus.
- Eis besitzt einen beleuchteten Kristall mit zwölf Flächen, einem Innenkern,
  kurzen Glanzpunkten und einem durchscheinenden Frostschleier.
- Einschläge verbinden eine auslaufende Front, Partikel und einen weichen
  Rauch- beziehungsweise Frostnebel. Eis erhält zusätzlich kurze Bruchstrahlen.

Die Änderungen betreffen die Darstellung. Schaden, Fluggeschwindigkeit,
Reichweite, Kollisionen und die im Editor gesetzten Gegenstände bleiben erhalten.
Im Editor **Spielen** öffnen, einen Stab aufnehmen und mit **F** zaubern.

`src/spell-effects.js` steuert Formen, Bewegung, Schweife und Lebenszeiten.
`src/spell-effect-materials.js` enthält die prozeduralen Farb- und
Transparenzverläufe. Die Effekte benötigen keine externen Texturen oder Downloads.

Die Schweife verwenden je Projektil einen festen Vorrat von 32 Wegpunkten und
bereits angelegte Grafikpuffer. Punkte werden nach zurückgelegter Strecke gesetzt.
Der Auslauf endet spätestens nach 0,22 Sekunden; ein Neustart entfernt ihn sofort.
Die Vorräte von 160 Partikeln und zwölf Impulsen bleiben bestehen.

Jeder Schweifabschnitt wird auf Sichtbarkeit geprüft, auch wenn das Projektil
selbst inzwischen im Nebel liegt. Die Effektzeit folgt ausschließlich der
laufenden Spielsimulation; während einer Pause bleiben auch die Shader und
Partikeltransformationen stehen.

Der Browsercheck in `tests/spell_effects_smoke.py` verwendet weiterhin den
tatsächlichen Editor und dessen **Spielen**-Übergang. Er erfasst beide Stäbe beim
Laden, Abschuss, Flug, frühen und späten Einschlag und prüft anschließend das
Zurücksetzen laufender Effekte. Der Testentwurf verändert die gespeicherte
Nutzerkarte nicht.
