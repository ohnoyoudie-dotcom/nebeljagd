# Übersicht, Waffen und Wasser nach den Gameplay-Referenzen

Die zwei vom Nutzer bereitgestellten Gameplay-Aufnahmen zeigen eine gut lesbare
schräge Top-Down-Perspektive: offene Aktionsflächen, Deckung und Requisiten an den
Rändern, klare Wege sowie grüne Außenflächen und dunklere Innenräume. Diese
Gestaltungsprinzipien werden auf die eigene Nebeljagd-Welt übertragen. Es werden
keine Originalmodelle, Bildtexturen oder UI-Bestandteile aus dem Referenzspiel benutzt.

## Umsetzung

- 34 statt zuvor bis zu 68 Bäume. Vier freigehaltene Kampfbereiche, größere
  Baumabstände und zurückhaltendere Größenschwankungen halten Sichtlinien offen.
  Beide Grafikstufen verwenden dieselben festen Hindernisse; nur deren Darstellung
  ändert sich mit der Qualität.
- Zwölf statt sechs Grasflächen mit unterschiedlichen Radien, elliptischen
  Ausdehnungen, Drehungen und organischen Rändern. Die Halme werden nach Fläche
  gewichtet verteilt, damit kleine Flecken nicht übermäßig dicht werden.
- Kühleres Grün, weniger gleichmäßige Erdpfade und weichere Wegschultern
  unterscheiden Boden, Laufwege und Verstecke klarer.
- Echte Flugstreckenprüfung gegen den räumlichen Hindernisindex. Der erste Kontakt
  liefert Position und Oberflächennormale; ein Pfeil reflektiert gedämpft, verliert
  Höhe und verschwindet nach dem kurzen Abprall. Das verhindert auch Durchschüsse
  durch dünne Wände bei niedrigen Bildraten. Ein Test vom Körper zur Pfeilspitze
  verhindert, dass der Startpunkt hinter einer direkt davorstehenden Wand liegt.
- Kollisionshöhen unterscheiden hohe Baumstämme/Wände von niedrigem Geröll.
  Kleine Steine unterhalb der Pfeilbahn blockieren einen höheren Schuss nicht.
- Ein Bogen wird vor dem Körper gegriffen; Sehne und eingelegter Pfeil bewegen
  sich beim Spannen und Lösen. Arm-/Brustposen werden auf das vorhandene Skelett
  angewendet. Das Schwert selbst folgt einem Bogen vor dem Körper mit Ausholen,
  Schlag und Nachführen; der helle Schwung ergänzt die sichtbare Klinge.
- Der Bach nutzt einen GPU-Shader für Strömung, Rippel, Wirbel, wechselnden
  Uferschaum und Reflexe. Kleine Geometriewellen laufen ohne CPU-Meshupdates.
  Außerhalb der sicheren Zone wird auch das Wasser dunkler.

## Prüfung und Grenzen

Node-Prüfungen decken schnelle Segmente durch dünne Wände, Baumzylinder,
abgerundete Ecken, den frühesten Kontakt, Türöffnungen, niedrige Hindernisse,
Überlappung beim Start sowie Bogenfreigabe, Abprall und Schwertklingenbewegung ab.
Die Browserprüfung verwendet tatsächliche E-/F-Eingaben und die realen
Hindernisse der Karte; Kameraaufnahmen werden aus dem Spiel erzeugt.

Alle **17 Node-Tests**, der Produktionsbuild und die Asset-/Versionsprüfung sind
erfolgreich. Beide Produktions-Browserprüfungen bestehen ohne JavaScript- oder
Shaderfehler. Tatsächlich geprüft wurden Pfeilabprall an Hauswand, Baum und hohem
Fels, Bogenspannen vor Freigabe genau eines Pfeils, Abbruch durch Rollen und die
sichtbare Schwertklinge vor dem Körper. Der gemessene Schwertwinkel reicht von
−0,904 bis +1,156 Radiant, die Spitze bleibt währenddessen vor der Figur.

Zusätzlich bestehen Bewegung, Sammeln, Grasüberblendung, alle Häuser und beide
Schlafzimmer, Brücken-/Torpassage, geschlossener Zaun, Nebelschaden, Touch-Aktionen
und der Einzel-HTML-Build mit nur einer HTTP-Anfrage. Die Szene enthält tatsächlich
34 Bäume und 12 unterschiedlich große Grasflächen.

Maschinenlesbare Berichte: [combat-smoke.json](combat-smoke.json) und
[village-smoke-current.json](village-smoke-current.json). Aktuelle Ansichten:
[Walddorf](screenshots/forest-village.png), [Bogen](screenshots/bow-draw.png),
[Schwert](screenshots/sword-strike.png), [Kampffläche](screenshots/fighting-clearing.png),
[Wasser](screenshots/river-current.png).

Pfeile treffen derzeit die Umgebung. Gegner, Spielerschaden durch Waffen und
Online-Multiplayer sind weiterhin spätere Entwicklungsschritte. Ein physischer
Safari-/iPad-Leistungsnachweis bleibt offen. Die bisherigen Spielversionen und
deren Prüfsummen bleiben erhalten.
