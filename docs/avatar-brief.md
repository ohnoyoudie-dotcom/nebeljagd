Du arbeitest an meinem Browser-Spiel **Nebeljagd**, einem Top-down-Fantasy-Battle-Royale / Action-RPG, optisch grob in Richtung Battlerite / Battlerite Royale, aber mit eigener Designsprache.

## Projekt

Repository:
`ohnoyoudie-dotcom/nebeljagd`

Arbeite ausschließlich auf dem Branch:
`work`

**Niemals `main` verändern.**

Das Spiel soll auf PC und iPad im Browser laufen. Performance ist wichtig, aber der lokale Spielercharakter darf deutlich hochwertiger sein als gewöhnliche Umgebungsassets.

Im Projekt existiert bereits ein bisheriger Charakter und vermutlich unter anderem:

- `src/character.js`
- `scripts/build-character.py`
- `assets/characters/ranger.glb`

Prüfe die tatsächliche Repository-Struktur selbst und verwende die real vorhandenen Pfade. Verlasse dich nicht blind auf diese Liste.

---

# Ziel

Erstelle einen **neuen hochwertigen neutralen menschlichen Basisavatar** für Nebeljagd, den wir tatsächlich direkt im Spiel verwenden können.

Die Figur soll qualitativ deutlich über dem bisherigen Avatar liegen.

Der bisherige Avatar wirkt:
- zu blockig
- zu simpel
- zu stark aus Grundkörpern zusammengesetzt
- zu wenig wie ein hochwertiger Hero-Character

Genau das soll die neue Figur beheben.

---

# Visuelle Zielrichtung

Orientiere dich grundsätzlich an hochwertigen Top-down-Actionspielen wie Battlerite / Battlerite Royale:

- stilisierter 3D-Charakter
- hochwertige, klare Silhouette
- hand-painted / stylized PBR look
- aus der Top-down-Kamera sofort lesbar
- deutlich detaillierter als Low-Poly-KayKit-Stil
- nicht fotorealistisch
- nicht kindlich
- nicht Chibi
- nicht Anime-Illustration
- nicht wie Roblox / Minecraft / einfacher Mobile-Placeholder
- keine sichtbare Konstruktion aus primitiven Kugeln, Zylindern und Kästen

Es soll ein **echtes Game-Character-Modell** entstehen.

---

# Wichtig: keine Klasse

Der Charakter soll zunächst **keiner Klasse zugeordnet** sein.

Er soll wie ein normaler Mensch / Fantasy-Abenteurer aussehen.

Keine eindeutige Klassenidentität:

- kein Magierstab
- kein riesiger Ritterpanzer
- kein Bogen als permanentes Merkmal
- kein Zauberhut
- keine schwere Tankrüstung
- keine eindeutige Assassin-/Rogue-Silhouette
- keine übertriebene Spezialwaffe

Später sollen auf dieser Basis unterschiedliche Ausrüstung, Waffen und eventuell Klassen aufgebaut werden können.

Der Basisavatar muss deshalb möglichst neutral und modular sein.

---

# Körper und Proportionen

Erstelle eine stilisierte menschliche Figur mit ungefähr:

- Körperhöhe etwa 1,80–1,90 m im Modell
- leicht vergrößerter Kopf für Top-down-Lesbarkeit
- anatomisch glaubwürdiger Brustkorb
- erkennbare Taille und Hüfte
- natürliche Schulterform
- modellierte Ober-/Unterarme
- erkennbare Ellenbogen
- vernünftige Hände
- natürliche Oberschenkel
- modellierte Knie
- Waden
- anatomisch glaubwürdige Füße/Stiefel

Die Proportionen dürfen für die Spielkamera leicht überzeichnet sein:

- Kopf ca. +5–10 %
- Hände ca. +10 %
- Stiefel ca. +10–15 %
- Schulterbreite leicht betont

Nicht muskelbepackt, sondern sportlich / durchschnittlich athletisch.

---

# Gesicht

Das Gesicht muss wirklich modelliert sein und darf nicht nur aus Kugel + Block bestehen.

Mindestens:

- erkennbare Stirn
- Augenhöhlen
- Augen
- Augenbrauen
- Nase mit Nasenrücken
- Wangen
- Kiefer
- Mundbereich
- Ohren
- Halsübergang

Das Gesicht muss aus der Nahansicht ordentlich aussehen, aber darf für die Spielkamera stilisiert vereinfacht werden.

Keine Porträt-AAA-Komplexität erforderlich.

---

# Haare

Erstelle eine normale menschliche Frisur, die aus der Top-down-Perspektive gut lesbar ist.

Beispielsweise:

- mittellanges/dunkelbraunes Haar
- mehrere größere modellierte Haarsträhnen / Hair Clumps
- klare Form von oben
- kein kugelförmiger Haarhelm
- keine vielen winzigen Einzelhaare

Optional leichter Bart, aber ebenfalls aus stilisierten größeren Formen.

---

# Kleidung

Der Charakter soll einfache hochwertige Fantasy-/mittelalterlich inspirierte Alltagskleidung tragen.

Beispielsweise:

- dunkle Tunika / Jacke
- Unterhemd
- Hose
- Gürtel
- Lederstiefel
- eventuell kurze Schulter-/Kragenstofflage
- wenige Riemen
- 1–2 kleine Taschen

Keine schwere Rüstung.

Farbwelt ungefähr:

- dunkles gedämpftes Blau
- Anthrazit
- Braun / Leder
- kleine rostrote oder beige Akzente
- einzelne dezente Metallteile

Die Kleidung soll aus mehreren großen, klar lesbaren Formen bestehen und nicht aus dutzenden beliebigen kleinen Teilen.

---

# Stoff

Stoff muss tatsächliche Form besitzen:

- Falten an Schulter / Brust
- Falten an Hüfte
- Falten an Knien
- klare Stoffdicke
- glaubwürdige Überlappungen

Falls ein kurzer Mantel / Schulterstoff verwendet wird:

- nicht zu lang
- darf Figur von oben nicht verdecken
- schöne große Falten
- leichte asymmetrische Form möglich
- beim Laufen klar beweglich

---

# Materialien

Die Figur benötigt hochwertige, glTF-kompatible Materialien.

Mindestens Materialtrennung zwischen:

- Haut
- Haar
- Stoff
- Leder
- Metall

Look:

## Haut
- warme Hautfarbe
- leicht unterschiedliche Werte im Gesicht und an den Händen
- nicht plastisch

## Stoff
- sehr hohe Roughness
- leichte Farbvariation
- Falten über Geometrie und/oder Normal/Bump

## Leder
- mittel-hohe Roughness
- leicht unregelmäßige Farbgebung
- dunklere Nähte / Vertiefungen
- leicht hellere abgenutzte Kanten

## Metall
- deutlich als Metall erkennbar
- begrenzte Metallic-Flächen
- dunklere Vertiefungen
- hellere Kanten
- nicht spiegelnd wie Chrom

Wenn Texturen verwendet werden, möglichst ein effizienter Atlas:

- 2048×2048 für die Hauptfigur bevorzugt
- Base Color
- Roughness
- Metallic
- Normal, falls sinnvoll

Wenn das reine Blender-Python-Verfahren keine hochwertige Textur sinnvoll erzeugen kann, priorisiere gute Geometrie und saubere PBR-Materialien statt künstlich schlechte Texturen zu erzeugen.

---

# Geometriequalität

Zielbereich für die eigentliche Spielfigur:

**ca. 12.000–25.000 Dreiecke**

20.000 Dreiecke sind für den lokalen Hauptcharakter akzeptabel.

Polygonbudget soll dort eingesetzt werden, wo es sichtbar hilft:

1. Kopf / Gesicht
2. Haare
3. Silhouette
4. Hände
5. Stiefel
6. Stofffalten
7. Kleidung/Rüstungskanten

Keine unnötigen Polygone in unsichtbaren Flächen.

---

# WICHTIG – nicht wieder Primitive-Look

Du darfst Primitive für einen Blockout benutzen.

Der **finale sichtbare Avatar darf aber nicht wie eine Sammlung aus**:

- Kugeln
- Kegeln
- Würfeln
- einfachen Zylindern

aussehen.

Wenn du mit solchen Grundkörpern beginnst, musst du sie:

- verbinden
- remeshen
- sculpten / proportional bearbeiten
- Übergänge modellieren
- Silhouette überarbeiten
- Oberflächen formen

bis ein zusammenhängender hochwertiger Charakter entsteht.

Wenn die Figur am Ende noch wie ein Blender-Prototyp aussieht, ist das Ziel NICHT erreicht.

---

# Modellierungsstrategie

Bevorzuge folgenden Aufbau:

## Körper
zusammenhängendes menschliches Basemesh

## Kleidung
separate Meshes:
- Oberteil
- Hose
- Gürtel
- Stiefel
- optional Schulterstoff

## Haare
separates Mesh

## optionale Gegenstände
separate Meshes

So können später verschiedene Outfits und Waffen eingebaut werden.

---

# Rig

Erstelle ein sauberes humanoides Skelett.

Mindestens:

- root
- pelvis / hips
- spine
- chest
- neck
- head
- clavicles
- upper arms
- forearms
- hands
- thighs
- shins
- feet

Wenn sinnvoll zusätzlich:
- toe bones
- cape / cloth bones

Das Mesh muss vernünftig gewichtet werden.

Prüfe besonders:

- Schultern
- Ellenbogen
- Hüften
- Knie

auf hässliche Deformationen.

---

# Animationen

Die GLB soll mindestens enthalten:

### Idle
- leichte Atmung
- kleine Gewichtsverlagerung
- kein übertriebenes Wippen
- nahtlose Schleife

Name:
`Idle_Nebeljagd`

### Run
- energischer Top-down-Lauf
- etwas schneller / knackiger als realistisches Joggen
- klare Arm-/Beinbewegung
- wenig unnötige Animation
- nahtlose Schleife

Name:
`Run_Nebeljagd`

### Roll

Sehr wichtig:

Die aktuelle Rolle im Spiel gefällt mir nicht.

Es muss ein **echter Vorwärtspurzelbaum / Forward Combat Roll** sein.

Ablauf:

1. Figur geht leicht herunter.
2. Oberkörper kippt nach vorne.
3. Kopf wird eingezogen.
4. Knie werden herangezogen.
5. Figur rollt vollständig über Rücken/Schultern.
6. vollständige Vorwärtsrotation.
7. Füße kommen wieder auf den Boden.
8. Figur steht direkt wieder laufbereit.

Kein:
- Gleiten
- Dash
- Superman-Sprung
- seitliches Fallen
- bloßes Drehen um die Mittelachse

Name:
`Roll_Nebeljagd`

---

# Top-down-Test

Das Modell muss nicht nur im Blender-Viewport gut aussehen.

Erstelle eine Testkamera ungefähr entsprechend unserer tatsächlichen Spielkamera.

Prüfe aus Top-down-/isometrischer Perspektive:

- Kopf eindeutig sichtbar
- Richtung der Figur erkennbar
- Arme und Beine unterscheidbar
- Hände nicht völlig verschwunden
- Stiefel erkennbar
- Kleidung klar lesbar
-