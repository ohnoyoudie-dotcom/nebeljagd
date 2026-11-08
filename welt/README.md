# Nebeljagd · fertiges Browserpaket

[Aktuellen Online-Editor öffnen](https://ohnoyoudie-dotcom.github.io/nebeljagd/preview/editor.html)
· [Spiel öffnen](https://ohnoyoudie-dotcom.github.io/nebeljagd/preview/nebeljagd.html)
· [Offline-Paket herunterladen](https://ohnoyoudie-dotcom.github.io/nebeljagd/preview/nebeljagd-welt-und-editor.zip)

Dieser Ordner ist die automatisch erzeugte Ausgabe. `npm run build` baut Spiel,
Editor und Kartenkopien zusammen und aktualisiert ihre Prüfsummen in `release.json`.

## Wo Kartenänderungen hingehören

Die **maßgebliche Projektkarte ist `worldmap.json` im Hauptordner**, eine Ebene
über diesem Ordner. Im Online-Editor einmal **Mit GitHub verbinden** einrichten;
danach übernimmt **Speichern** die Karte direkt auf `work` und startet die
Veröffentlichung. Bei manuellen JSON-Exporten die gewünschte Datei im
Hauptordner übernehmen. Änderungen nur an `welt/worldmap.json` werden beim
nächsten Build wieder durch die Projektquelle ersetzt.

Ein automatisch gespeicherter Browserentwurf gehört zum jeweiligen Browser.
Er wird durch Bearbeiten allein noch nicht hochgeladen. **Speichern** nutzt im
Online-Editor die eingerichtete Verbindung. Der feste Link öffnet automatisch
den neuesten Editor mit deinem gespeicherten Entwurf. Ohne Entwurf öffnet er
die aktuelle Projektkarte. [Verbindung und Kartenschutz](../docs/online-editor.md).

## Inhalt

| Datei | Zweck |
| --- | --- |
| `editor.html` | Fester Online-Einstieg mit Versionsprüfung |
| `map-editor.html` | Vollständiger Karteneditor; auch im Offline-Paket |
| `nebeljagd.html` | Einzelspieler-Spiel |
| `index.html`, `teacher.html`, `lobby.html` | Klassenportal, Lehrkraft und Übungswiese; Anmeldung benötigt den Nebeljagd-Server |
| `avatar-preview.html` | Figuren- und Animationsvorschau |
| `worldmap.json` | Erzeugte Kopie der Projektkarte |
| `worldmap.svg` | Grafische Kartenansicht |
| `worldmap.schema.json` | Regeln für Kartendateien |
| `release.json` | Build-Version und Prüfsummen |
| `nebeljagd-welt-und-editor.zip` | Fertiges Offline-Paket |

Offline das ZIP vollständig entpacken und Editor und Spiel im selben Ordner
lassen. Ein heruntergeladenes Paket bleibt ein fester Stand. Für die aktuelle
Online-Version den Editor-Link oben verwenden; die ältere Webadresse unter
`/welt/` wird durch den aktuellen Veröffentlichungsablauf nicht aktualisiert.

Weitere Hinweise: [Editor und Veröffentlichung](../docs/online-editor.md),
[Klassenbetrieb](../docs/classroom.md), [wiederhergestellte Karte](../docs/map-recovery.md).
