# Sicht, Beute und Kampf

Die bestehende große Insel wurde erweitert. Spiel und Objekteditor verwenden
weiter dieselbe `worldmap.json`; die 17 Kristallpositionen wurden zu Truhen.
Zusammen mit Haus- und Starttruhen liegen 48 Truhen und insgesamt 4.016 Objekte
in der Karte. Der vorherige Browserstand ist unter
`public/versions/nebeljagd-grosse-insel-v013.html` unverändert archiviert.

## Sicht und Gebäude

Alle 31 Gebäude bleiben ohne Dach; ihre Innenräume sind dauerhaft aktiviert.
Eine taktische Rundumsicht von 18 Metern, inspiriert von Battlerite, begrenzt
die lokale Sicht. Ein 3,5 Meter breiter weicher Rand mischt hellen graublauen Nebel ein.
Landschaft und Gegenstände bleiben als gedämpfte Formen sichtbar.
Baumstämme, Felsen und Wände werfen Sichtschatten; gedrehte Gebäude verwenden
ihre tatsächlichen Wandkonturen. Türen erlauben den Blick in den sichtbaren Raum.

`visibility-model.js` berechnet lokale Hindernisse über einen räumlichen Index.
`vision.js` überträgt 512 Strahlen auf eine kleine GPU-Textur und mischt den Nebel an der
Weltposition von Gelände, Wasser und Objektmaterialien ein. Figuren außerhalb
der Sicht werden ganz ausgeblendet; Bodenbeute bleibt durch den Nebel sichtbar,
lässt sich aber nur in Reichweite mit Sichtkontakt aufnehmen. Verdeckte Übungsgegner zeigen weder Namen
noch Lebensbalken. Hoher Bewuchs verbirgt fremde Figuren ebenfalls. Die lokale
Figur und ihr Balken bleiben zur Orientierung lesbar. Dies ist lokale Sichtlogik;
später muss ein Multiplayer-Server auch die übertragenen Gegnerdaten begrenzen.
Die schematische Minikarte zeigt weiterhin die bekannte Inselgeografie.

Wolkenschatten werden als bewegtes Muster auf die tatsächlichen Oberflächen
projiziert und verdunkeln sie um höchstens 27 Prozent. Der giftige schrumpfende
Nebel bleibt ein separates System mit den gespeicherten Kartenphasen.

## Truhen, Gold und Waffen

Ohne ausgerüstete Waffe wird ein erreichbarer Fund in 1,1 Metern Abstand
automatisch aufgenommen. **E** beziehungsweise die Aktionstaste wechselt bewusst
zur nächsten erreichbaren Waffe
oder öffnet die nächste Truhe. Wände und Sichtweite verhindern Ferninteraktion.
Der Deckel klappt auf; zwei Münzportionen und eine Waffe springen heraus. Beute
landet möglichst auf erreichbarem Boden zur Seite des Spielers. Die Goldmenge
wird erst nach der Fluganimation beim Darüberlaufen eingesammelt. Jede Truhe
liefert pro Runde nur einmal Beute; ein Neustart räumt dynamische Beute auf.

| Stufe | Farbe | Faktor | Bogen | Schwert | Feuerstab | Eisstab |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Normal | Grau | 0,8 | 18 | 22 | 13 | 15 |
| Gewöhnlich / Common | Weiß | 1 | 22 | 27 | 16 | 19 |
| Ungewöhnlich / Uncommon | Grün | 1,25 | 28 | 34 | 20 | 24 |
| Selten | Blau | 1,6 | 35 | 43 | 26 | 30 |
| Legendär | Orange | 2,15 | 47 | 58 | 34 | 41 |

Schaden ist gerundet. Feuer verursacht zusätzlich drei Sekunden lang
`4 × Faktor` Brandschaden pro Sekunde. Eis halbiert die Bewegung für 2,5 Sekunden.
Wiederholte Treffer verlängern/erneuern den Effekt, vervielfachen ihn aber nicht.
`loot-tiers.js` ist die gemeinsame Quelle für Spiel, Editor und Anzeige.
`combat.js` hält Gesundheit, Verbrennung und Verlangsamung getrennt vom Modell.
Pfeile und Zauber prüfen ihre Flugstrecke gegen Ziele und Terrain; das zuerst
getroffene Hindernis entscheidet. Schwertschläge treffen nicht durch Wände.

Nahe dem Start stehen drei beschriftete, nicht angreifende **Übungsgegner** mit
140 Lebenspunkten. Sie patrouillieren langsam, verbrennen sichtbar und laufen
unter Eis tatsächlich langsamer. Besiegte Figuren bleiben bis zum Neustart
liegen. Sie sind lokale Testfiguren, keine anderen Spieler. Auf ungeeigneten
importierten Karten werden sie ausgelassen, wenn kein sicherer Platz frei ist.

`health-bars.js` zeichnet die Balken aller registrierten Figuren gemeinsam in
einem InstancedMesh. Das System kann später weitere Spieler aufnehmen; aktuell
sind nur die lokale Spielfigur und die Übungsgegner registriert.

## Editor und neue Assets

Im Editor sind Truhen und beide Zauberstäbe platzierbar. Jede Waffe besitzt ein
Seltenheitsfeld; JSON, Schema und SVG erhalten diese Eigenschaft. Alte JSON-Karten
werden beim Import kompatibel normalisiert: Kristalle werden Truhen, Waffen ohne
Stufe werden gewöhnlich. Eine Dateiablage importiert keine beliebigen Modelle.
Neue Dateien gehören nach `assets/inbox/` oder können im Chat hochgeladen werden;
`assets/inbox/README.md` erklärt Formate und den anschließenden Einbau.

## Prüfung

`npm test`, `npm run verify:assets`, `npm run map:check`, `npm run build`.
Browserprüfungen gegen den fertigen Build:

```sh
NEBELJAGD_URL=http://127.0.0.1:4173 python3 tests/tactical_loot_smoke.py
NEBELJAGD_URL=http://127.0.0.1:4173 python3 tests/loot_editor_smoke.py
```

Berichte: `docs/tactical-loot-smoke.json`, `docs/tactical-vision-check.json`,
`docs/loot-editor-check.json`. Die tatsächliche Veröffentlichung wird getrennt
unter `docs/public-delivery-check.json` geprüft. Browserprüfungen verwenden
Chromium mit Software-WebGL; sie belegen keine Bildrate auf physischen iPads.

Die abschließende lokale Prüfung bestand 60 Node-Tests, zehn Spielabläufe im
Browser und sechs Editorabläufe. Der exakte Einzeldatei-Build startete mit
gesperrten HTTP/S-Anfragen ohne Netzwerkbedarf. Die geprüften Dateien wurden
mit Commit `63d2a73` unter den bestehenden Pages-Adressen veröffentlicht.
