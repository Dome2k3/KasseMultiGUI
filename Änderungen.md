# Änderungen

## 2026-05-26T09:47:32.313+00:00
- Helferplan: `helper-add.html` — Live-Suchfilter für die Helferliste hinzugefügt: Textfeld (enthält-Suche), Team-Dropdown und Rollen-Dropdown über der Tabelle; zeigt Trefferanzahl in Echtzeit an.
- Helferplan: `changelog.html` — Jeder Changelog-Eintrag zeigt jetzt ein Badge mit dem betroffenen Datensatz-Namen und ID (z. B. `Max Müller (ID: 42)`); Schicht-Einträge lösen den Helfernamen auf; `escapeHtml` für sichere Ausgabe hinzugefügt.
- Helferplan: `index.html` + `main.js` — Zwei neue PDF-Export-Typen ergänzt: „Alle Helfer" (tabellarische Liste nach Team filterbar) und „Statistik: Admins / Editoren" (Tabelle mit Name, E-Mail, Editor/Admin-Status, letzter Aktivität).
- Helferplan: `plan.html` + `plan.js` — Team-Farbbadges in der Teams-Legende sind jetzt anklickbar und filtern den Helfer-Pool direkt; aktives Team erhält einen Highlight-Ring; Hover-Animation und Hinweis „(anklicken zum Filtern)" ergänzt.

## 2026-05-14T09:17:35.115+00:00
- Helferplan: Schicht-Startlogik in `helferplan/public/js/plan.js` auf 2h-Blöcke mit 1h-Rest pro Abschnitt umgestellt; Abschnitte starten nach jedem `X` sowie bei Rollenwechseln (z. B. Jugend/Nachtgrenze) neu.
- Helferplan: 1h-Open-Slots im Layout der offenen Schichten ergänzt (ohne Pfeil), 2h-Slots behalten Pfeil-Darstellung.
- Helferplan: Block-Validierung in `helferplan/public/js/slot-rules.js` für flexible 1h/2h-Kombinationen geöffnet.
- Helferplan: Hinweise in `helferplan/public/plan-admin.html` auf die neue 1h/2h-Logik angepasst.
- Tests: `helferplan/test/slot-rules.test.js` für neue 1h-Regeln und Nachtgrenzen erweitert/aktualisiert.
