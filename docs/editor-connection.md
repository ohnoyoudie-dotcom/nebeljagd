# GitHub-Verbindung des Karteneditors

Die Verbindung gilt standardmäßig für den aktuellen Tab. Dauerhafte Speicherung
bleibt eine ausdrückliche Wahl: „Verbindung auf diesem Gerät merken“ im Dialog
oder „Auf diesem Gerät merken“ an einer vorhandenen Verbindung. Dafür muss der
Token nicht erneut eingegeben werden. Die Anzeige unterscheidet „nur dieser Tab“
und „Gerät gemerkt“. Ohne Einwilligung wird kein Token dauerhaft gespeichert.

Ein fehlgeschlagener Verbindungsversuch entfernt keine vorhandene Anmeldung.
Netzwerkfehler lassen die Karte und die Zugangsdaten erhalten. Leseanfragen werden
höchstens einmal nach 350 ms wiederholt. Eine GitHub-Anfragesperre (429 oder 403
mit Rate-Limit-/Retry-After-Header) wird separat gemeldet und nicht sofort erneut
angefragt. „Verbindung erneut prüfen“ verwendet die vorhandene Anmeldung.
Nach einer Netzwerkunterbrechung versuchen das Online-Ereignis und die Rückkehr
zum Tab einen Abgleich; eigene Änderungen behalten den bisherigen Konfliktschutz.
Es gibt dabei keinen automatischen Schreibzugriff. Nicht bestätigte Schreibzugriffe
werden weiterhin durch Lesen geprüft, niemals blind wiederholt.

Abgelaufene oder widerrufene GitHub-Tokens können nicht automatisch verlängert
werden. Bei einem echten Zugriffsfehler muss der Eigentümer den Token im Editor
ersetzen. Token bleiben aus Karten, Exporten, Berichten und ausgeliefertem Code
heraus. Browserprüfungen verwenden ausschließlich eine simulierte GitHub-API.

Die Fehlermeldung nennt HTTP-Status und Vorgang (Lesen/Speichern). HTTP 401
bedeutet eine nicht akzeptierte Anmeldung, HTTP 403 beim Speichern einen
abgelehnten Schreibzugriff und HTTP 404 einen für diesen Token nicht erreichbaren
Kartenpfad. Bekannte Repository-Regeln und sekundäre Rate-Limits werden getrennt
erkannt. Rohantworten und Token werden nicht angezeigt. Ein erfolgreicher
Lesezugriff beim Verbinden bestätigt keine Schreibberechtigung. Bestehende
Fine-grained Tokens lassen sich auf GitHub bearbeiten; Berechtigungsänderungen
müssen dort gespeichert werden.
