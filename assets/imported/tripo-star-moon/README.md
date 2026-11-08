# Sternstab und verzierte Mondsichel

Getrennte Browser-Ableitungen der vom Benutzer bereitgestellten Tripo-Modelle. Originale in assets/inbox bleiben bytegleich erhalten. Kein Anbieteraufruf.

Sternstab: physischer Griff bei (0,0,0), glTF +Y zur Spitze, Länge 1,70 m. Die genaue Spitze und Grenzen stehen in inspections/star-staff.json.

Mondsichel: Mittelpunkt bei (0,0,0), ursprüngliche glTF XY-Silhouette, Vorderseite +Z, Höhe 1,20 m. Für die horizontale Rückkehrflugbahn um -PI/2 auf X drehen und um die lokale Z-Achse rotieren.

Originale UVs und drei Texturkanäle bleiben erhalten. Sternstab maximal 12000 Dreiecke, 768 px Farbe/Material und 512 px Normal; Sichel maximal 6000 Dreiecke, 512 px Farbe/Material und Normal. Die Sichel-Normalmap wird vom unveränderten Originalskulpt auf die vereinfachte Geometrie gebacken, damit glattes Metall und Gravuren erhalten bleiben. previews/ zeigt Originalgeometrie und Ableitung mit identischer Kamera und Beleuchtung.

Reproduktion: siehe scripts/prepare-tripo-star-moon.py. Bestehende Modelloutputs werden abgelehnt. Kein kanonisches game-dev-Paket: die optionale CLI ist nicht installiert. Die Einbindung verwendet den bestehenden Projektworkflow.
