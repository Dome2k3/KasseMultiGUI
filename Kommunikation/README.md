# BVT Kommunikation

Dieser Ordner enthaelt den ersten Entwurf fuer eine Kommunikationszentrale zur jaehrlichen Planung des BVT.

## Dateien

- `index.html`: Dashboard mit KPIs, Gantt-Chart, Mail-/Meilensteinliste und QS-Vorschau.
- `kommunikation.css`: Gestaltung des Dashboards.
- `kommunikation.js`: Frontend-Logik mit API-Anbindung, Statusfluss und Mailto-QS-Vorbereitung.
- `SQL-Kommunikation.sql`: Tabellen fuer Eintraege, Versandlog und Vorlagen.
- `server-routes.example.js`: Beispiel fuer spaetere Express-API-Routen mit Nodemailer.

## Gedachte Arbeitsweise

1. Pro Mail oder Meilenstein wird ein Eintrag angelegt.
2. Mail-Eintraege erhalten Eventdaten, Meta-Mail, Empfaenger, Versanddatum, Text und Status.
3. Fuer die QS wird die Mail zuerst an die Meta-Mail geschickt.
4. In dieser QS-Mail stehen die echten Empfaenger bereits sauber vorbereitet, damit nach der Freigabe nur noch weitergeleitet werden muss.
5. Meilensteine ohne Empfaenger erscheinen trotzdem im Gantt-Chart, damit keine organisatorischen Punkte vergessen werden.
6. Bestehende Eintraege koennen ueber `Edit` bearbeitet werden.
7. Ein komplettes Jahr kann aus einem bestehenden Event kopiert werden; Termine werden relativ zum neuen Event-Freitag verschoben.
8. Faellige Eintraege erscheinen automatisch im Erinnerungsblock. Der Server kann zusaetzlich taegliche Erinnerungsmails versenden.

## Verbesserungsideen fuer die naechste Ausbaustufe

- Kontakte/Behoerden als eigene Tabelle pflegen statt Empfaenger nur als JSON zu speichern.
- Vier-Augen-Freigabe mit `reviewed_by` und `reviewed_at`.
- Anhaenge fuer Plaene, Lageplaene, Genehmigungen und Sicherheitskonzepte.
- Finaler Direktversand an echte Empfaenger erst nach Freigabe.
