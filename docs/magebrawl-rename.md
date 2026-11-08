# Magebrawl

Der aktuelle Spielname ist **Magebrawl**. Titel, Menüs, Portal, Kartenatelier,
Charakterstudio, Kartenexporte, Downloadnamen und aktuelle Dokumentation
verwenden diesen Namen.

- Spiel: `welt/magebrawl.html`.
- Paket: `welt/magebrawl-welt-und-editor.zip`.
- Windows-Start: `Magebrawl-starten.cmd`.
- Fester Online-Editor: https://ohnoyoudie-dotcom.github.io/nebeljagd/preview/editor.html.

Die Repository-Adresse bleibt bestehen, damit derselbe Editor-Link und die
GitHub-Kartensynchronisation funktionieren. Die bisherige `nebeljagd.html`
leitet auf das Spiel weiter und übernimmt Query-Parameter und URL-Anker auch
bei lokalen Dateien. Das alte generierte ZIP wird bei der Veröffentlichung
durch das Paket mit dem neuen Namen ersetzt.

Bestehende Browser-Speicherschlüssel, IndexedDB-Dateiverbindungen,
Kartenschema-IDs, Sitzungs-Cookies und das private Verzeichnis `.nebeljagd/`
bleiben kompatibel: Die Umbenennung soll keine Karten, Passwörter oder
Anmeldungen verlieren. Servereinstellungen verwenden jetzt `MAGEBRAWL_*`;
vorhandene `NEBELJAGD_*`-Einstellungen werden weiterhin akzeptiert. Wenn beide
gesetzt sind, hat der neue Name Vorrang.

Unverändert bleiben die vom Nutzer bearbeiteten Kartendaten, originale
Assetdateien und deren Herkunftsbelege, Animationsnamen im GLB sowie historische
Build-Archive und Prüfberichte. Deren technische Namen sind keine aktuellen
Produkttitel.

Validierung: 519 Tests (`npm test`), vollständiger Build und Browserprüfungen der erzeugten
Dateien. `tests/magebrawl_brand_smoke.py` kontrolliert außerdem den alten Spieleinstieg,
Editor-Entwürfe, den Spielen-Link und den Inhalt des neuen Downloadpakets.
Der verwaltete Cloud-Browser sperrt `file://`; das extrahierte Paket wird deshalb
über einen isolierten lokalen HTTP-Server ohne externe Ressourcen geprüft.
Die URL-Auflösung für lokale Dateien ist zusätzlich im Kompatibilitätstest abgedeckt.
