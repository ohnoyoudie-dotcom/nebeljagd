# Magebrawl – GPU-Wind und sparsame Grafik auf iPads

Der eigene Baum `tree:kit-user-tree1` wird im bestehenden 3D-Weltobjekt-Renderer aus der unveränderten GLB-Geometrie und ihren erhaltenen Texturen, UVs und Alpha-Masken geladen.

Die Blätter nutzen das bereits vorhandene, weltweite `createVegetationWind`-Shaderfeld (Windrichtung, Böen, Windzonen, Aus-Schalter). Stamm und Äste bekommen keinen Windsway; Positionen, Kollision und Kartendateien bleiben unverändert. Mit `USER_TREE_WIND_RESPONSE = 1.35` ist die Bewegung dezent sichtbar. Die Animation wird vollständig auf der GPU pro Vertex berechnet; es sind keine neuen Animations- oder Draw-Calls pro Baum nötig.

Die Option **Darstellung → Leistung / iPad** in der Spielpause nutzt die bestehende Low-Quality-Landschafts-/Vegetationsstufe. Auf Geräten mit grobem Zeiger oder iPadOS startet die Ansicht automatisch auf `low`. iPadOS wird sowohl an einem regulären iPad-User-Agent als auch am MacIntel+TouchPoints-Modus erkannt. Das explizite `?quality=high` lässt die höhere Stufe zu, `?quality=low` oder `?quality=ipad` erzwingt die Sparstufe.

Render- und Schattengrenzen: Desktop hoch DPR maximal 1,75 und 4.096er Schattenkarte, Desktop niedrig DPR maximal 1,15 und 2.048er Schattenkarte; iPad/Touch niedrig DPR maximal 1,0 und 1.024er Schattenkarte (8 statt 24 Filter-Samples); iPad/Touch hoch DPR maximal 1,5 und 2.048er Schattenkarte.

Diese Grenzen reduzieren Füllrate und Schatten-Speicherbedarf. Das ist keine Garantie von 30 FPS – dafür ist ein Test auf echten Schul-iPads erforderlich. Ein Umstellen der Darstellungsstufe verändert weder JSON-Maps noch den Standard-Modellbestand und kann im Pausenmenü rückgängig gemacht werden.
