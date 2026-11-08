# Gemeinsamer Einstieg für Magebrawl

Die Startseite trennt zwei Wege: Schüler geben den Zugangscode der Lehrkraft
ein; Lehrkräfte melden sich mit ihrem Passwort an. Im Lehrerbereich sind der
aktuelle Editor und die Verwaltung der Übungsrunden direkt erreichbar.

Für eine feste Internetadresse ohne lokale Installation ist der
[Hosting-Weg über Render](hosting.md) vorbereitet. Er erfordert einmalig ein
Hosting-Konto und die ausdrückliche Tarifauswahl beim Anbieter.

## Unter Windows per Doppelklick öffnen

Im aktuellen Projektordner **`Magebrawl-starten.cmd`** doppelt anklicken.
Visual Studio und eingegebene `npm`-Befehle sind dafür nicht nötig. Einmalig
muss [Node.js ab 22.12](https://nodejs.org/en/download) installiert sein; der
Starter erklärt dies, falls Node.js noch fehlt.

Beim ersten Start legst du im geöffneten Fenster dein Lehrkraft-Passwort fest.
Danach startet der Server und öffnet die Startseite automatisch im Browser.
Vorhandene Passwörter bleiben erhalten. Das Fenster während der Nutzung offen
lassen; mit **Strg+C** oder dem Schließen des Fensters endet der Server.

Der Starter verwendet die bereits erzeugten Dateien im Ordner `welt/` und
braucht keine Installation der Entwicklungswerkzeuge. Die Adresse öffnet die
Seite auf deinem Rechner; einen öffentlichen Internet-Link erzeugt dieser
lokale Start nicht. Bei einem belegten Port öffnet der Starter keine fremde
Website, sondern meldet den Konflikt.

## Auf einem gemeinsamen Server starten

Voraussetzung: Node.js ab 22.12. Im Projektordner:

```sh
npm ci
npm run school:setup
npm run build
npm run school
```

Die Einrichtung fragt das Lehrerpasswort im Terminal ab und speichert nur einen
Passworthash im ignorierten Ordner `.nebeljagd/`. Das Passwort gehört weder in
den Chat noch in das Repository. Der Server startet standardmäßig auf Port 5200
und ist zunächst nur auf seinem Rechner erreichbar. Im Lehrerbereich kann eine
Übungsrunde erstellt werden; ihr Code wird automatisch erzeugt und angezeigt.

Damit Schüler auf anderen Geräten beitreten können, müssen alle dieselbe
Serveradresse verwenden. Für das eigene Schulnetz kann der Server ausdrücklich
auf der Netzwerkschnittstelle gestartet werden, beispielsweise in PowerShell:

```powershell
$env:HOST = '0.0.0.0'
npm run school
```

Die Geräte verwenden dann die Adresse dieses Rechners mit Port 5200. Für eine
öffentliche Internetadresse wird der Dienst hinter HTTPS betrieben. GitHub Pages
oder das Doppelklicken einer HTML-Datei führen diesen Server nicht aus.
Ein öffentlicher Schulserver und dessen Domain wurden mit dieser Änderung noch
nicht bereitgestellt.

Hinter einem HTTPS-Reverse-Proxy `MAGEBRAWL_SECURE_COOKIES=1` setzen und den
ursprünglichen Hostnamen weiterreichen. Dann gelten die Anmelde-Cookies nur
über HTTPS. `MAGEBRAWL_DATA_DIR` kann einen eigenen Speicherort für die
Serverdaten festlegen. Ein bestehendes Passwort lässt sich lokal mit
`npm run school:setup -- --replace` wechseln; danach den Server neu starten,
um vorhandene Anmeldungen zu beenden.

## Übungswiese

Der Code öffnet eine große grüne Übungsfläche mit den neuen Waffen, weiteren
Gegenständen, Truhen und Übungsgegnern. Es gibt keinen schrumpfenden Nebel und
keinen Zeitdruck. Schülerinnen und Schüler probieren Bewegung, Aufheben und
Angriffe aus. Diese erste Lobby ist ein gemeinsamer Zugang zu individuellen
Übungssitzungen; andere Schülerfiguren werden noch nicht live synchronisiert.

Die Lehrkraft kann einen Code schließen. Geschlossene oder abgelaufene Codes
lassen keine neuen Teilnehmer zu; laufende Sitzungen prüfen regelmäßig ihren
Zugang und verlassen die Übungswiese, sobald er beendet wurde. Es werden keine
Schülernamen benötigt. Codes sind acht Stunden gültig; laufende Übungssitzungen
prüfen den Zugang in einem 15-Sekunden-Intervall und beim Zurückkehren in den Tab.

## Immer denselben aktuellen Editor öffnen

Im Lehrerbereich führt **Aktuellen Editor öffnen** stets auf
`map-editor.html` desselben Serverstands. HTML und Zugangsdatenantworten werden
vom Server ohne Browsercache ausgeliefert. Die Build-Kennung zeigt, welcher
Stand auf diesem Server liegt.

Jedes `npm run build` erzeugt jetzt die Browserdateien und aktualisiert
**automatisch `welt/`**, einschließlich `welt/map-editor.html`, Startseite und
Spiel. `welt/release.json` enthält Build-Kennung und Dateiprüfsummen. Der
GitHub-Workflow übernimmt denselben Kopierschritt. Die Regel ist auch in
`AGENTS.md` für künftige Arbeiten festgehalten.

Ein erfolgreicher lokaler Build aktualisiert die Dateien auf diesem Rechner.
Ein bereits laufender Server auf einem anderen Rechner erhält sie erst durch
Übertragen beziehungsweise Aktualisieren des Repository-Stands. Das wurde
nicht als automatische Internetveröffentlichung eingerichtet.

Der eigenständige Editor und `magebrawl.html` bleiben direkt nutzbar. Wenn die
Startseite ohne Server geöffnet wird, erklärt sie den fehlenden Klassenbetrieb
und bietet den Offline-Editor an. Sie simuliert keine Anmeldung.
Auf dem Schulserver erfordert auch der direkte Aufruf der Spiel-Datei eine
gültige Anmeldung; der Editor ist dort ausschließlich für Lehrkräfte zugänglich.

## Entwicklung

`npm run dev` startet Vite. Seine `/api`-Anfragen gehen an den parallel gestarteten
Klassenserver auf Port 5200. Der Vite-Server ist eine Entwicklungsumgebung;
für die Zugangskontrolle der ausgelieferten Seiten `npm run school` verwenden.

## Prüfen

`npm test` enthält echte HTTP-Prüfungen für Anmeldung, Rollen, Zugangscodes und
deren Ablauf sowie Tests für die Übungskarte und ihre Sitzungsprüfung.
Nach `npm run build` prüft `python3 tests/classroom_smoke.py` die erzeugten
`welt/`-Dateien mit getrennten Browserzugängen für Lehrkraft und Schüler,
einschließlich aktueller Waffen im Editor, Bewegung und Waffenwechsel auf der
Wiese, Abmelden und Schließen eines Codes. Dafür sind Python Playwright und
Chromium nötig. Der Test startet einen eigenen temporären Server, hinterlegt
keine echten Zugangsdaten und schreibt den Prüfbericht und Bildschirmbilder
nach `test-results/classroom/`. Der `work`-Workflow führt ihn vor Veröffentlichung
des erzeugten Browserstands aus.

Prüfstand dieser Umsetzung: [classroom-check.json](classroom-check.json).
