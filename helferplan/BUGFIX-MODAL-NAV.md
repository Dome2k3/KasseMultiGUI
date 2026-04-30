# Bugfix: Helferplan Modal-Auswahl & Navigation

## Problem

### 1. Schicht-Auswahl über Modal funktionierte nicht

Wenn eine Schicht über das Auswahlformular (nicht per Drag & Drop) eingetragen wurde, erschien
sofort der Fehler:

> „Die Rolle des Helfers entspricht nicht den Anforderungen der Schicht (Erwachsener oder Orga)."

**Ursache:** Das Helfer-Dropdown im Modal zeigte alle Helfer eines Teams an, auch solche mit
inkompatibler Rolle (z. B. Minderjährige bei einer Schicht, die Erwachsene erfordert). Wählte man
einen unberechtigten Helfer, lehnte der Server die Anfrage mit HTTP 400 ab – und der Client zeigte
immer denselben, fest codierten Fehlertext, unabhängig vom tatsächlichen Servergrund.

### 2. „Turnier-Admin"-Reiter für alle sichtbar

Der Navigationsreiter „Turnier-Admin" erschien für alle Besucher, obwohl er nur Admins vorbehalten
sein soll.

### 3. „Helfer-Adden"-Link immer sichtbar

Der Link „Helfer-Adden" in der Navigation war auch für nicht angemeldete Benutzer sichtbar.

---

## Lösung

### Modal-Auswahl (`public/js/plan.js`, `public/plan.html`)

- `openShiftModal` speichert jetzt die zugehörige Aktivität als `currentActivity`.
- `updateHelperDropdown` filtert die Helfer nach der Rollenanforderung der Schicht:
  - `Alle` → alle Helfer des Teams werden angezeigt
  - `Erwachsen` → nur Helfer mit Rolle `Erwachsen` oder `Orga`
  - Sonstige Rolle → nur Helfer mit exakt dieser Rolle oder `Orga`
- Zusätzliche clientseitige Rollenvalidierung beim Absenden (analog zur bereits vorhandenen
  Drag-&-Drop-Validierung) verhindert unnötige Serveranfragen.
- Die tatsächliche Serverfehlermeldung wird nun aus der JSON-Antwort ausgelesen und angezeigt,
  statt einer hardcodierten Meldung.
- Das Modal zeigt einen Hinweis auf die Rollenanforderung der Schicht, damit Benutzer verstehen,
  warum die Auswahlliste möglicherweise kurz ist.

### Navigation: Turnier-Admin

Alle `<a href="plan-admin.html">Turnier-Admin</a>`-Links in den HTML-Dateien erhalten:
- `id="nav-turnier-admin"`
- `style="display:none"` (standardmäßig ausgeblendet)

Sie werden in den jeweiligen `updateAuthUI()`-Funktionen (bzw. `checkAuth()` in `helper-add.html`)
wieder eingeblendet, sobald `currentUser.is_admin === true`.

Betroffene Dateien: `plan.html`, `index.html`, `plan-admin.html`, `aufbau-abbau.html`,
`kuchen.html`, `statistik.html`, `changelog.html`, `helper-add.html`

### Navigation: Helfer-Adden

Der `<a href="helper-add.html">Helfer-Adden</a>`-Link in `index.html` erhält:
- `id="nav-helper-add"`
- `style="display:none"` (standardmäßig ausgeblendet)

Er wird in `main.js` → `updateAuthUI()` eingeblendet, sobald ein Benutzer angemeldet ist
(`currentUser !== null`).

### Neue Datei: `public/js/nav-auth.js`

Seiten ohne eigene Authentifizierungslogik (`aufbau-abbau.html`, `kuchen.html`, `statistik.html`,
`changelog.html`) binden dieses neue Script ein. Es ruft `/api/current-user` ab und blendet die
beiden betreffenden Navigationslinks entsprechend ein oder aus.

---

## Geänderte Dateien

| Datei | Art der Änderung |
|---|---|
| `public/js/plan.js` | Modal-Filterung, Validierung, Fehlermeldung, Nav-Sichtbarkeit |
| `public/js/main.js` | Nav-Sichtbarkeit (Turnier-Admin + Helfer-Adden) |
| `public/js/nav-auth.js` | **Neu** – gemeinsames Script für Nav-Sichtbarkeit |
| `public/plan.html` | Nav-Link-IDs, Rollen-Hinweis im Modal |
| `public/plan-admin.html` | Nav-Link-ID, `updateAuthUI` erweitert |
| `public/index.html` | Nav-Link-IDs |
| `public/helper-add.html` | Nav-Link-ID, `checkAuth` erweitert |
| `public/aufbau-abbau.html` | Nav-Link-ID, `nav-auth.js` eingebunden |
| `public/kuchen.html` | Nav-Link-ID, `nav-auth.js` eingebunden |
| `public/statistik.html` | Nav-Link-ID, `nav-auth.js` eingebunden |
| `public/changelog.html` | Nav-Link-ID, `nav-auth.js` eingebunden |
