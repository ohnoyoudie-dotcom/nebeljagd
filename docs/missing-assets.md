# Gezielt benötigte Grafikpakete

Alle aktuellen Objektarten besitzen eine zugeordnete Darstellung. Diese Liste
sammelt gezielte **Verbesserungen und spätere Pakete**, statt vorhandene Modelle
als fehlend auszugeben. Bis zur jeweiligen Umsetzung bleibt der aktuelle
Spielstand benutzbar.

| Priorität / Paket | Bereits vorhanden | Gezielt benötigt | Abnahme |
| --- | --- | --- | --- |
| Aktuelle Grafikarbeit: Truhe, Fass und Kiste | Funktionale Spieltruhe und einfache zerstörbare Einrichtung; überarbeitete Truhen-Bildvorlage | Hochwertige Tripo-Modelle im gemeinsamen Avatar-Stil. Zuerst Truhe prüfen und vorbereiten, danach intaktes Fass und passende Kiste; beschädigte Varianten anschließend | GLB mit Texturen, passende Größe und Materialdarstellung, beweglicher Truhendeckel/Innenraum, geprüfte Kollisionen und Eintrag im Editor |
| Spieleravatar: Basis bereits eingebaut | Hochgeladene Tripo-GLB mit Texturen, Stand-, Lauf- und Vorwärtsrollanimation; angepasste Hände und Bodenkontakte | Weitere Animationen und Ausrüstung bei Bedarf gezielt verfeinern | Gleiche Spielfigur in Spiel und Vorschau; aktueller Stand siehe `docs/tripo-avatar-update.md` |
| Vegetation verfeinern | Drei eigene Baumformen, zwei Rei-Bäume, Rei-Strauch, Blumen, Spielgras | Nur falls der bestehende Look ersetzt werden soll: browsergeeignete Blatttexturen/-materialien und ein vollständiges exportiertes Grashalm-Modell | Keine verlorenen Geometry-Nodes-Instanzen; passende Transparenz; niedrige Draw-Call- und Dreieckszahl |
| Shops nach Festlegung des Systems | Gold, Waffen, Seltenheiten, Häuser | Händlerfigur oder klar lesbarer Marktstand, Verkaufssymbol und gegebenenfalls Interaktionsanimation | Erst Sortiment, Währung und Kaufbedienung festlegen; anschließend Modelle und Oberflächen passend entwickeln |
| Lernstationen nach Inhaltsklärung | Magischer Schrein ohne Fragen | Erkennbare Stationsvarianten, passende Symbole für Aufgaben/Status und gegebenenfalls Animationen | Aufgabenablauf und Zustände zunächst festlegen; der letzte Nutzerpunkt „Lernstationen und Wiede…“ ist noch unvollständig |

## Technischer nächster Schritt: Mehrspieler

Dies ist kein fehlendes Grafikpaket. Vor weiteren großen Spielsystemen soll die
Lehrkraft vor der Runde **Teams** oder **Alle gegen alle** wählen können.
Bewegung, Treffer/Gesundheit, Gegenstände und Sicht/Nebel müssen über einen
autoritativen Spielserver konsistent zwischen den Geräten synchronisiert
werden. Aktuell sind nur die lokale Figur und gekennzeichnete Übungsgegner
aktiv; dieser Katalog führt keine Netzwerkfunktion ein.

Für jedes neue Grafikpaket Herkunft und Nutzungshinweise zusammen mit den
Dateien ablegen. Zielformat ist eine eigenständige `.glb`; `.blend` bleibt die
bearbeitbare Quelle. Das reine Kopieren einer Datei nach `assets/inbox/`
ersetzt noch keine Zuordnung im Editor oder Laufzeitcode.
