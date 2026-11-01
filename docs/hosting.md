# Nebeljagd mit einer festen Internetadresse

Für den ersten gemeinsamen Schulserver ist **Render** vorbereitet. Der Dienst
startet Nebeljagd aus GitHub und stellt eine HTTPS-Adresse bereit. Schüler und
Lehrkräfte benutzen später dieselbe Adresse. Visual Studio, Node.js und
Terminalbefehle werden auf ihren Geräten dafür nicht benötigt.

## Was einmalig nötig ist

1. [Render öffnen](https://dashboard.render.com/) und ein Konto anlegen,
   beispielsweise mit deinem GitHub-Konto. Render Zugriff auf das Repository
   `ohnoyoudie-dotcom/nebeljagd` geben.
2. Sobald die vorbereiteten Dateien vollständig auf `work` übernommen sind,
   **New → Blueprint** wählen, dieses Repository und den Branch **work**
   auswählen. Render liest die Datei `render.yaml`.
3. Bei **NEBELJAGD_INITIAL_TEACHER_PASSWORD** dein gewünschtes Lehrkraft-Passwort
   mit mindestens 12 Zeichen eingeben. Dieses Passwort gehört ausschließlich
   in das geschützte Einstellungsfeld bei Render, nicht in GitHub oder den Chat.
4. Den von Render angezeigten Preis für Dienst und Speicher prüfen. Erst mit
   deiner Bestätigung bereitstellen. Der vorgeschlagene **Starter-Dienst mit
   1 GB dauerhaftem Speicher ist kostenpflichtig**. Es wurde hier weder ein
   Hosting-Konto angelegt noch ein Tarif gebucht.
5. Nach erfolgreichem Start den von Render angezeigten **onrender.com-Link**
   öffnen. Unter **Lehrkraft** anmelden, den aktuellen Editor öffnen und einen
   Code für die Klasse erstellen. Diese Adresse anschließend an die Schüler
   weitergeben. Eine eigene Domain ist für den Anfang nicht nötig.

Die tatsächliche Adresse entsteht erst beim Anlegen des Dienstes. Ein
ausgedachter Link wäre nicht benutzbar. Diese Vorbereitung ist noch keine
Veröffentlichung; die tatsächliche Render-Anmeldung muss danach geprüft werden.

## Was die Vorlage erledigt

- Eine einzelne Node-Instanz in Frankfurt startet den Anmeldeserver.
- Render baut Spiel, Startseite und Editor aus demselben Quellstand. Der
  Lehrerbereich führt immer zum Editor dieses bereitgestellten Stands.
- Passwort-Hash und Zugangscodes liegen unter `/var/data/nebeljagd` auf dem
  dauerhaften Speicher. Dieser Ordner wird nicht bei jedem Build ersetzt.
- Das Anfangspasswort wird nur beim ersten Start eingerichtet. Ein vorhandenes
  Passwort wird durch Updates oder ein geändertes Anfangspasswort nicht ersetzt.
- HTTPS-Anmelde-Cookies sind aktiviert. Ohne eingerichteten Lehrkraftzugang
  startet der Hosting-Dienst nicht erfolgreich.
- Änderungen an den Quellen auf `work` lösen einen neuen Build aus. Reine
  Änderungen an den erzeugten `welt/`-Dateien lösen keinen zweiten Build aus.

Nach einem Neustart bleiben die gespeicherten Codes gültig, solange sie nicht
geschlossen oder abgelaufen sind. Alle Browser müssen sich neu anmelden.
Schüler können ihren noch gültigen Code erneut eingeben. Die erste Lobby bleibt
eine individuelle Übungssitzung pro Schüler.

Ein kostenloser Dienst ohne dauerhaften Speicher würde die auf dem Server
gespeicherte Einrichtung und die Codes bei einem Neuaufsetzen verlieren. Deshalb
enthält diese Vorlage einen dauerhaften Datenträger. Die genauen aktuellen Preise
und Übertragungslimits zeigt Render vor der Buchung; sie wurden hier nicht live
verifiziert. Spiel und Editor enthalten große 3D-Dateien. Den ersten Start mit
mehreren Schulgeräten und der tatsächlichen Internetverbindung prüfen.

## Stand und Vorbereitung der Veröffentlichung

Diese Dateien liegen zunächst in der Cloud-Arbeitskopie. Der entfernte Branch
`work` enthält inzwischen zusätzliche Karten- und Waffenänderungen. Vor dem
Hosting müssen die neue Anmeldung, Lobby und Hosting-Dateien mit diesem Stand
zusammengeführt, geprüft und auf `work` veröffentlicht werden. Dabei die neueren
Kartenänderungen erhalten und `main` nicht ersetzen. Die bloße Auswahl des
derzeitigen entfernten `work`-Standes veröffentlicht noch nicht dieses Portal.

Für die technische Übergabe: Ein frischer Klon von `work` muss `npm ci`,
`npm test`, `npm run verify:assets` und `npm run build` erfolgreich ausführen.
Die erzeugten Dateien mit `python3 tests/classroom_smoke.py` prüfen. Danach auf
der echten HTTPS-Adresse Lehrer-Anmeldung, Code-Beitritt auf einem zweiten Gerät,
Editor und Code-Schließung prüfen. Der Provider muss den ursprünglichen
Hostnamen an den Node-Dienst weitergeben. Die Vorlage verwendet genau eine
Instanz, weil aktive Sitzungen im Arbeitsspeicher gehalten werden.

Bei Render lässt sich die automatische Bereitstellung zusätzlich an erfolgreiche
GitHub-Prüfungen binden, sofern diese Option im Konto verfügbar ist. Die Vorlage
aktiviert zunächst Bereitstellung nach Quelländerungen; sie verspricht keine
bereits eingerichtete Freigabe durch CI.

Die technischen Vorlagefelder wurden mit öffentlichen Render-Beispielen
abgeglichen: [Node-Dienst](https://github.com/render-examples/express-hello-world/blob/main/render.yaml)
und [dauerhafter Speicher](https://github.com/render-examples/strapi-sqlite/blob/main/render.yaml).
