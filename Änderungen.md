# Änderungen

## 2026-05-14T09:17:35.115+00:00
- Helferplan: Schicht-Startlogik in `helferplan/public/js/plan.js` auf 2h-Blöcke mit 1h-Rest pro Abschnitt umgestellt; Abschnitte starten nach jedem `X` sowie bei Rollenwechseln (z. B. Jugend/Nachtgrenze) neu.
- Helferplan: 1h-Open-Slots im Layout der offenen Schichten ergänzt (ohne Pfeil), 2h-Slots behalten Pfeil-Darstellung.
- Helferplan: Block-Validierung in `helferplan/public/js/slot-rules.js` für flexible 1h/2h-Kombinationen geöffnet.
- Helferplan: Hinweise in `helferplan/public/plan-admin.html` auf die neue 1h/2h-Logik angepasst.
- Tests: `helferplan/test/slot-rules.test.js` für neue 1h-Regeln und Nachtgrenzen erweitert/aktualisiert.
