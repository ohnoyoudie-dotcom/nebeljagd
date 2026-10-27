# Gezielt benötigte Grafikpakete

Alle aktuellen Objektarten besitzen eine zugeordnete Darstellung. Diese Liste
sammelt gezielte **Verbesserungen und spätere Pakete**, statt vorhandene Modelle
als fehlend auszugeben. Bis zur jeweiligen Umsetzung bleibt der aktuelle
Spielstand benutzbar.

| Priorität / Paket | Bereits vorhanden | Gezielt benötigt | Abnahme |
| --- | --- | --- | --- |
| Nächstes Grafikpaket: Spielfigur und echte Vorwärtsrolle | Animierter Waldläufer mit Idle/Walk und bisheriger prozeduraler Drehbewegung | Zusammen passendes Modell, Skelett und Animationsclips für Stehen, Laufen, Richtungswechsel, Abtauchen, Einrollen, Überschlagen und Aufstehen; Waffenhaltepositionen | Gut lesbare Silhouette von oben, passende Fußkontakte, sauberer Übergang aus und zurück zur Fortbewegung, alle Waffen in der Hand, Blender-Quelle und eigenständige GLB |
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
