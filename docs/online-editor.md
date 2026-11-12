# Ein fester Einstieg für Editor und Projektkarte

Der feste Einstieg lautet nach Veröffentlichung:

<https://ohnoyoudie-dotcom.github.io/nebeljagd/preview/editor.html>

Dieses Lesezeichen benötigt keinen wechselnden Versionsparameter und keinen
erneuten HTML-Download. Der Einstieg liest die aktuelle `release.json` ohne
Browsercache, zeigt den veröffentlichten Build und öffnet den zugehörigen
Editor mit seiner Datei-Prüfsumme im Link. Wenn die Versionsdatei nicht erreichbar
oder ungültig ist, erscheint eine Fehlermeldung mit erneutem Versuch. Es wird
nicht still eine möglicherweise ältere Editor-Datei geöffnet.

Der feste Link öffnet nach der Versionsprüfung automatisch den aktuellen Editor
mit dem zuletzt gespeicherten Browserentwurf, ansonsten mit der aktuellen
Projektkarte. Bei eingerichteter GitHub-Verbindung lädt er anschließend automatisch
die zuletzt online gespeicherte Karte; einen anderen Browserentwurf sichert er
vorher separat. Auch nach einem Editor-Update bleibt der vollständige Entwurf
einschließlich Objekten, Bodenfarben und Biomflächen erhalten. Mit
`editor.html?choose=1` ist die ausdrückliche Auswahl der Projektkarte weiterhin
möglich; ein anderer Entwurf wird dabei geschützt. Die Versionsanzeige nennt
den Editor-Build und kennzeichnet die geöffnete Kartenquelle separat.

Die Auswahl „Projektkarte“ gilt nur für das einmalige Öffnen. Der Editor entfernt
danach den Startparameter aus seiner Adresse. Neuladen und erneutes Öffnen dieser
Adresse setzen ohne GitHub-Verbindung den automatisch gespeicherten Browserentwurf
fort; mit Verbindung wird die Onlinekarte wie unten beschrieben geladen. „Spielen“
überträgt genau diesen Kartenstand ins Testfenster und ändert den Entwurf nicht.
Auch ältere Lesezeichen mit `start=project` setzen einen vorhandenen Entwurf
fort; ohne Entwurf öffnen sie die Projektkarte. Die ausdrückliche Auswahl über
„Aktuelle Projektkarte öffnen“ bleibt erhalten und schützt andere Entwürfe.
Die Filter unter „Karteninhalt“ begrenzen nur die Liste; auf der Karte bleiben
andere Objektarten beim Platzieren und Verschieben als Orientierung sichtbar.

## Was veröffentlicht wird

Die zentrale Projektkarte bleibt `worldmap.json` im Projektstamm auf `work`.
Wird nur `welt/worldmap.json` von Hand geändert, stoppt der Build zum Schutz
dieser Bearbeitung. Der gewünschte Stand muss zuerst vollständig in die
Quelldatei im Projektstamm übernommen werden; der Build darf ihn nicht still
durch die ältere Projektkarte ersetzen.
`npm run build` erzeugt Editor, Spiel, Kartendateien und Offline-Paket gemeinsam
und synchronisiert sie nach `welt/`. Editor und Spiel enthalten dieselbe
Build-Kennung und dieselbe Karten-Prüfsumme. `welt/release.json` enthält die
Größen und SHA-256-Prüfsummen der endgültigen Dateien.

`node scripts/prepare-preview.js welt <Verzeichnis>/preview` prüft alle
benötigten Dateien gegen diese Metadaten, bevor es die Veröffentlichung
vorbereitet. Ein Editor aus einem anderen Build oder eine abweichende Karte
bricht den Schritt ab. In der öffentlichen Einzelspieler-Vorschau verweist
`preview/index.html` weiterhin auf das Spiel. Der Klassenportal-Einstieg und
alle Dateien außerhalb von `preview/` auf `main` bleiben erhalten.

Der Workflow **Work build and visual checks** testet den auslösenden
Quellcommit auf `work`, baut das Paket und prüft die erzeugten Browserdateien.
Danach übernimmt er den Build nach `work/welt` und die dazu passende Vorschau
nach `main/preview`. Diese Aktualisierung der Webvorschau wurde ausdrücklich
freigegeben. Andere Dateien auf `main` bleiben erhalten. Vor jedem Push wird
geprüft, dass kein neuerer Entwicklungsstand vorliegt; es gibt keinen Force-Push.
Anschließend fordert der Workflow den bestehenden Pages-Build für genau den
veröffentlichten Commit an und prüft dessen Ergebnis. Ein erfolgreicher Push
allein bestätigt noch keine erfolgreiche Bereitstellung.

Das geprüfte ZIP und die Versionsdatei stehen außerdem sieben Tage als
Actions-Artefakt **magebrawl-work-browser** bereit. Die
[Offline-Kopie aus work](https://github.com/ohnoyoudie-dotcom/nebeljagd/raw/refs/heads/work/welt/magebrawl-welt-und-editor.zip)
bleibt zum Herunterladen verfügbar.

## Eigene Kartenänderungen

Im veröffentlichten Online-Editor sichert **Speichern** (auch Strg+S) die Karte
direkt als `worldmap.json` auf `work`. Der bestehende Workflow prüft sie und
veröffentlicht danach das zusammengehörige Paket. Der Editor unterscheidet
„auf GitHub gesichert“ von „online veröffentlicht“ und bestätigt die
Veröffentlichung erst, wenn die öffentliche Versionsdatei genau die
Karten-Prüfsumme enthält. Ein unveränderter Stand erzeugt keinen weiteren Commit.

### Einmalige Verbindung im Browser

GitHub Pages selbst hat keinen beschreibbaren Kartenspeicher. Die Verbindung
nutzt deshalb die GitHub-API mit einer vom Eigentümer eingerichteten Berechtigung:

1. Im Editor **Mit GitHub verbinden** öffnen.
2. Dem Link zu einem neuen **Fine-grained personal access token** folgen.
   Resource owner **ohnoyoudie-dotcom**, nur Repository **nebeljagd** und
   Repository permission **Contents: Read and write** wählen.
3. Den Token ausschließlich im Editor einsetzen. Mit **Verbindung auf diesem
   Gerät merken** bleibt er in diesem Browser gespeichert; sonst gilt er für
   den aktuellen Tab. Danach **Verbinden** wählen.

Die Verbindung ist auf die Karte dieses Repositories und den Branch `work`
festgelegt. Zugangsdaten gehören niemals in Chat, Git, Kartenexporte oder die
HTML-Datei. Der eingegebene Token wird nur im Authorization-Header an
`https://api.github.com` gesendet. Die Verbindungsverwaltung kann ihn wieder
aus dem Browser entfernen. Abgelaufene oder widerrufene Tokens müssen ersetzt
werden; dabei bleibt die Karte erhalten. Ohne eingerichtete Verbindung kann
die Seite nichts auf GitHub schreiben.

Bei bestehender Verbindung wird beim Öffnen auch der aktuelle gespeicherte
Stand auf `work` geladen, auch beim Aktualisieren oder erneuten Öffnen des Tabs.
Ein abweichender Browserentwurf wird vorher vollständig separat gesichert und
bleibt unter **Vorherige Karte sichern** herunterladbar. Direkt nach der Übernahme
ist er außerdem über **Rückgängig** erreichbar. Scheitert die Sicherung, bleibt
die bisherige Karte geöffnet. Ohne Verbindung oder bei einem Netzwerkfehler
bleibt ebenfalls der Browserentwurf erhalten.

Bereits während der Online-Abfrage begonnene Änderungen werden nicht ersetzt;
dann bietet der Editor den manuellen Abgleich an. Jede Speicherung verwendet die zuvor
gelesene GitHub-Dateiversion als Schreibbedingung. Bei einem Konflikt bietet
**Onlinekarte übernehmen** einen sicheren Abgleich: Der eigene Stand bleibt
separat im Browser und unter **Vorherige Karte sichern** als JSON abrufbar.

**Karte als JSON sichern** bleibt als zusätzliche lokale Sicherung verfügbar.
In Offline-Kopien bleibt **Speichern** die bisherige Dateispeicherung. Eine
manuell übernommene JSON-Datei gehört weiterhin in den Projektstamm; Änderungen
nur an `welt/worldmap.json` sind keine dauerhafte Projektquelle.

Lokale HTML-Kopien und ZIP-Pakete bleiben feste Offline-Stände. Ein geöffneter
Editor tauscht während der Bearbeitung keinen Code oder Kartenstand aus.
Der feste Einstieg lädt beim nächsten Öffnen den aktuellen Editor. Noch nicht
online gesicherte Änderungen bleiben bei automatischer Übernahme einer Onlinekarte
als separate Sicherung erhalten; ohne GitHub-Verbindung wird der Browserentwurf
fortgesetzt. Für ein anderes Gerät zuvor **Speichern** verwenden und die
erfolgreiche Meldung abwarten.

## Verbindlicher Entwicklungsablauf

Der Benutzer hat die selbstständige Veröffentlichung ausdrücklich beauftragt.
Entwicklung bleibt auf `work`. Vor Editoränderungen den aktuellen Remote-Stand
mit seiner neuesten Karte übernehmen; nach Tests und Build selbst pushen und
die erfolgreiche Pages-Bereitstellung kontrollieren. Der Benutzer muss weder
einen neuen Editor herunterladen noch für unsere Änderungen selbst pushen.
Diese Vorgabe ist auch in `AGENTS.md` festgehalten.

Die automatischen Tests der GitHub-Speicherung benutzen eine simulierte API
mit unechten Zugangsdaten. Ein realer Schreibzugriff aus dem Browser setzt die
einmalige Einrichtung durch den Repository-Eigentümer voraus.
Tests für feste Inselgeometrien und Platzierungen benutzen eigene Referenzkarten;
sie schreiben der bearbeitbaren Projektkarte keine bestimmte Objektzahl oder
Regionsaufteilung vor. Die tatsächliche Karte wird beim Build validiert und
in den Browserprüfungen vollständig geöffnet.
