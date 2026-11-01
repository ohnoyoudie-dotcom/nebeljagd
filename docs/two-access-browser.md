# Historische Browserprüfung der zwei Landzugänge

Dieser Bericht dokumentiert den vorherigen Kartenstand mit zwei natürlichen Landhälsen. Die aktuelle Referenzkarte mit zwei Brücken wird im Bericht `reference-layout-check.json` und den Bildern `reference-layout-*.png` geprüft. Der folgende Nachweis und seine Prüfsummen bleiben als historischer Stand erhalten.

Die endgültigen Standalone-Dateien aus `welt` bestehen alle neun Browserprüfungen. Der Bericht `two-access-check.json` enthält ihre SHA-256-Prüfsummen, die gemessenen Spielerpositionen und die verwendete Testadresse. Es gab keine JavaScript-Fehler und keine zusätzlichen externen Ressourcenanfragen.

Im Editor sind die beiden Landhälse und die ausgeschnittene Lagune sichtbar; Wege und Flüsse sind leer. Wasserpolygone lassen sich auswählen und über Eckpunkte ändern, einschließlich Rückgängig/Wiederholen. Beim Ziehen eines Inselpunkts folgt die sichtbare Küste bereits während der Mausbewegung. Objektplatzierung und Graspinsel bleiben im Wasser wirkungslos. JSON und exportiertes Editor-HTML bewahren die Karte exakt; Karten ohne Wasserpolygone lassen sich weiter öffnen.

Die beiden Zugänge wurden im echten Spiel mit normalen WASD-Eingaben überschritten. Der Nordlauf führte von `[180, -305]` bis ungefähr `[192.87, -292.13]`, der Südlauf von `[239, 296]` bis `[252.07, 282.93]`. Für diese Wiederholbarkeit wurde lediglich der Spielstart in Kopien der Karte geändert und über den normalen JSON-Import geladen.

Am Westufer stoppt fortgesetztes Laufen bei ungefähr `x=154.50`; die Wasserfläche beginnt bei `x=155`. Nach einem normalen Rückschritt und erneuter Ausrichtung nach Osten wurde auch eine Vorwärtsrolle abgefangen. Die Figur blieb in allen Prüfungen auf trockenem Boden. `two-access-runtime.png` zeigt die tatsächliche Wasserfläche und die Insel-Minimap; `two-access-editor.png` zeigt die vollständige Kartenbasis.

Der Test verwendet Chromium mit Software-WebGL. Er prüft Bedienung, Darstellung und Kollision, nicht die Leistung auf einem Endgerät. Die vollständige Zwei-Zugänge-Topologie wird unabhängig durch `tests/two_access_island.test.js` bewiesen; `tests/island_runtime.test.js` gleicht die Bodentriangulation mit den Wasserlöchern ab.

Der damalige Prüflauf verwendete folgenden Aufruf; das Skript prüft inzwischen die aktuelle Brückenkarte:

```sh
python -m http.server 5208 --bind 127.0.0.1 --directory welt
NEBELJAGD_URL=http://127.0.0.1:5208 NEBELJAGD_STANDALONE=1 python tests/two_access_smoke.py
```
