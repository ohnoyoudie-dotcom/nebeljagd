# Ein fester Einstieg für Editor und Projektkarte

Der feste Einstieg lautet nach Veröffentlichung:

<https://ohnoyoudie-dotcom.github.io/nebeljagd/preview/editor.html>

Dieses Lesezeichen benötigt keinen wechselnden Versionsparameter und keinen
erneuten HTML-Download. Der Einstieg liest die aktuelle `release.json` ohne
Browsercache, zeigt den veröffentlichten Build und öffnet den zugehörigen
Editor mit seiner Datei-Prüfsumme im Link. Wenn die Versionsdatei nicht erreichbar
oder ungültig ist, erscheint eine Fehlermeldung mit erneutem Versuch. Es wird
nicht still eine möglicherweise ältere Editor-Datei geöffnet.

Beim Start lässt sich die **aktuelle Projektkarte** wählen oder ein **eigener
lokaler Entwurf fortsetzen**. Ein lokaler Entwurf gehört zum jeweiligen Browser
und zur Website-Adresse. Das Öffnen der Projektkarte verwirft oder überschreibt
einen vorhandenen Entwurf nicht stillschweigend. Die Versionsanzeige bezieht
sich auf den Editor-Build, nicht auf das Alter einer importierten eigenen Karte.

## Was veröffentlicht wird

Die zentrale Projektkarte bleibt `worldmap.json` im Projektstamm auf `work`.
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
Danach übernimmt er den Build nach `work/welt` und ausschließlich die geprüfte
Vorschau nach `main/preview`. Ein zwischenzeitlich geänderter `work`-Stand
blockiert eine veraltete Veröffentlichung. Konflikte auf `main` führen zum
Abbruch; der Workflow setzt oder überschreibt keine fremden Commits.
Jeder Push auf `work` startet einen Nachfolger, auch eine reine
Dokumentationsänderung. So lässt die Prüfung auf neuere Commits keinen
Editorstand ohne nachfolgenden Veröffentlichungslauf liegen. Die vom normalen
Workflow-Token erzeugten Build-Commits lösen selbst keinen neuen Lauf aus.

Ein Push mit dem Workflow-Token löst keinen normalen automatischen Pages-Build
aus. Deshalb fordert der Workflow anschließend den bestehenden Pages-Build
ausdrücklich über die GitHub-API an und wartet auf **genau den gerade
veröffentlichten Commit**. Ein älterer erfolgreicher Build gilt nicht als
Nachweis. Veröffentlichungen auf GitHub und deren tatsächliche Bereitstellung
bleiben unterscheidbare Schritte.
Vorübergehende Lesefehler werden begrenzt wiederholt. Ein ersetzter oder
abgebrochener Pages-Versuch beendet die Prüfung nicht vorzeitig, wenn noch
ein Nachfolger für denselben Commit erfolgreich werden kann. Ohne Bestätigung
innerhalb des festen Zeitfensters bleibt die Bereitstellung unbestätigt;
Zugriffs- und Konfigurationsfehler werden sofort gemeldet.

Voraussetzungen sind die bestehende GitHub-Pages-Konfiguration mit Quelle
**main / Repository-Stamm**, Schreibrechte des normalen Workflow-Tokens für
Repository-Inhalte und Pages sowie erlaubte Bot-Pushes auf beide Branches.
Es sind keine neuen Geheimnisse und kein zusätzlicher Hosting-Dienst nötig.
Bei einer anderen Pages-Quelle oder geschützten Branches meldet der Workflow
den konkreten Fehler; er ändert diese Einstellungen nicht selbstständig.
Ein bereits auf **GitHub Actions** umgestelltes Pages-Projekt muss stattdessen
seinen dafür eingerichteten Deployment-Workflow verwenden.

## Eigene Kartenänderungen

**Speichern** sichert weiterhin eine JSON-Datei auf dem Gerät. Es lädt weder
Karten auf GitHub hoch noch speichert es geräteübergreifend. Für eine neue
gemeinsame Projektkarte muss die gewünschte JSON-Datei als `worldmap.json` auf
`work` übernommen werden. Nach erfolgreichen Prüfungen veröffentlicht derselbe
Ablauf diese Karte zusammen mit dem passenden Editor und Spiel.

Lokale HTML-Kopien und ZIP-Pakete bleiben feste Offline-Stände. Ein geöffneter
Editor tauscht während der Bearbeitung keinen Code oder Kartenstand aus.
Vor einem Wechsel eigene Änderungen als JSON sichern und den festen Einstieg
erneut öffnen.
