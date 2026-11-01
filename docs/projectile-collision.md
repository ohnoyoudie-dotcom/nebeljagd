# Gerade Zauber treffen Gegner und Deckung

Die Kristallspitze lag beim Abschuss ungefähr 2,8 Meter über dem Spielerboden.
Ein gerader Schuss auf dieser Höhe konnte über normale Gegner, Zäune und
Mauern fliegen. Schon die vorherige abfallende Flugbahn hatte einen ähnlichen
Fehler bei nahen Zielen. Die Darstellung aus der schrägen Kamera ließ beides
wie einen Durchflug aussehen.

Der Stab richtet sich beim Zaubern nun in der bestehenden Hand auf 1,4 Meter
über dem Spielerboden aus. Das Projektil startet weiterhin an der wirklichen
Kristallspitze und fliegt von dort geradeaus. Die Gegenhaltung der freien Hand,
der Stand, die Reichweite, der Schaden und die Level-Rückmeldung bleiben erhalten.
Die Prüfung zwischen Körper und Mündung verhindert das Überspringen naher Deckung.

Zusätzlich prüft die Gegnerkollision die vollständige Überlappung von horizontalem
und vertikalem Flugabschnitt. Damit zählt auch ein Eintritt von oben, wenn der
Schuss anfangs noch über einem Gegner liegt. Trefferflächen werden nicht erhöht;
tatsächlich unterhalb des Schusses liegende kleine Hindernisse bleiben passierbar.

Die neuen Regressionen schlagen mit dem fehlerhaften Stand `d8e23ae` fehl.
Mit der Korrektur bestehen **379 Node-Tests**, Asset-/Kartenprüfung und Build.
Geprüft werden beide Tripo-Stäbe, mehrere Entfernungen und Bildschritte, Mauern
verschiedener Höhe, die erste Deckung vor einem Gegner, freie Durchgänge,
der genaue Kristallstart und unverändert gerader Flug.

Die Nutzerkarte, Originalmodelle und die neueren Inbox-Dateien bleiben erhalten.

Die erzeugte Browserdatei wurde mit sieben echten Schüssen auf der aktuellen
Karte geprüft: je Feuer/Eis gegen Gegner aus 4 m und 2,2 m sowie gegen einen
nahen Zaun. Ein weiterer Schuss überfliegt die 1,174 m hohe Tripo-Mauer und
stoppt an der höheren Mauer dahinter. Diese Höhenprüfung wurde nach dem
Abgleich mit den tatsächlichen Kollisionsmaßen korrigiert; es war keine
weitere Produktänderung nötig. Beide Einschlagbilder wurden visuell geprüft.
Es gab keine Browser-/Shaderfehler. Spiel und Vorschau sind bytegleich.

[Prüfbericht](projectile-collision-check.json) · [Feuertreffer](projectile-collision-fire.png) · [Eistreffer](projectile-collision-ice.png)
