# Aenderungen HelferessenBestellung

## 2026-06-18

- Neue Unterseite fuer die Essensplanung an Aufbau- und Abbautagen angelegt.
- Neue API in `helferessen.js` im Unterordner erstellt.
- Die API legt automatisch zwei MySQL-Tabellen in der bestehenden Datenbank an:
  - `helferessen_events`
  - `helferessen_orders`
- Admin-Seite `index.html`:
  - Tag/Datum anlegen.
  - Optionen Partypizza/Doener und Eis festlegen.
  - QR-Code und oeffentlichen Link erzeugen.
  - Bestehende Planungen anzeigen.
  - Zusammenfassung fuer Bestellung und WhatsApp erzeugen.
- Oeffentliche Seite `bestellung.html`:
  - Ohne Passwort erreichbar.
  - Name eintragen.
  - Auswahl Salami, Schinken, Vegetarisch, Pizzadoener, Doener oder Pommes.
  - Bei Doener zusaetzlich Ohne Zwiebeln und Falafel.
  - Optional Eis, wenn fuer den Tag aktiviert.
  - Eintraege koennen per X mit Bestaetigung geloescht werden.
- Admin-Seite und Burger-Menues um Helferessen ergaenzt.
