// staffelpreise.js
// Verwaltet die Staffeltabelle lokal (localStorage) ohne DB-Anbindung
(function () {
    const STORAGE_KEY = 'kasse_staffelpreise_v1';
    const table = document.getElementById('staffelTable');
    const addItemBtn = document.getElementById('addItemBtn');
    const resetBtn = document.getElementById('resetBtn');
    const messageDiv = document.getElementById('message');

    // responsive styles (wird per JS injiziert, damit Datei standalone verbessert)
    function addResponsiveStyles() {
        if (document.getElementById('staffel-responsive-styles')) return;
        const css = `
/* Basis-Layout für die Tabelle - normale Tabellenanzeige */
#staffelTable {
  width: 100%;
  border-collapse: collapse;
  table-layout: auto;
  box-sizing: border-box;
}

/* Schriftgröße skaliert, damit auf kleinen Bildschirmen mehr Spalten sichtbar sind */
#staffelTable, #staffelTable th, #staffelTable td {
  font-size: clamp(11px, 2.6vw, 14px);
  padding: 6px 8px;
  vertical-align: middle;
}

/* Eingaben und Buttons anpassen */
#staffelTable .name-input,
#staffelTable .price-input {
  font-size: inherit;
  box-sizing: border-box;
  width: 100%;
}

/* Icon-Buttons links: kompakt, ohne Text */
#staffelTable .icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  margin: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  color: inherit;
}
#staffelTable .icon-btn:focus {
  outline: 2px solid rgba(0,0,0,0.12);
  outline-offset: 2px;
  border-radius: 3px;
}
#staffelTable .icon-btn svg {
  width: 18px;
  height: 18px;
  display: block;
  fill: currentColor;
}

/* Abstände zwischen den beiden Icon-Buttons */
#staffelTable .btn-delete {
  margin-left: 6px;
}

/* --- Progressive column hiding ---
   Kolonnenaufbau:
   1: Buttons (Edit/Delete)
   2: Name
   3: Preis
   4: 2
   5: 3
   6: 4
   7: 5
   8: 6

   Mit Media-Queries blendet die Tabelle bei immer schmaleren Viewports
   nacheinander die rechten Staffelspalten aus (8 -> 7 -> 6 -> ... -> 4),
   Preis (Spalte 3) bleibt immer sichtbar.
*/

/* Bis 720px: letzte Spalte (Multiplikator 6) verbergen */
@media (max-width: 720px) {
  #staffelTable th:nth-child(8),
  #staffelTable td:nth-child(8) { display: none; }
}

/* Bis 640px: Multiplikator 5 verbergen (die vorherige bleibt auch verborgen) */
@media (max-width: 640px) {
  #staffelTable th:nth-child(7),
  #staffelTable td:nth-child(7) { display: none; }
}

/* Bis 560px: Multiplikator 4 verbergen */
@media (max-width: 560px) {
  #staffelTable th:nth-child(6),
  #staffelTable td:nth-child(6) { display: none; }
}

/* Bis 480px: Multiplikator 3 verbergen */
@media (max-width: 480px) {
  #staffelTable th:nth-child(5),
  #staffelTable td:nth-child(5) { display: none; }
}

/* Bis 420px: Multiplikator 2 verbergen (es bleiben Buttons, Name, Preis) */
@media (max-width: 420px) {
  #staffelTable th:nth-child(4),
  #staffelTable td:nth-child(4) { display: none; }
}

/* Sehr kleine Displays: kleinere Padding/Svg-Größen */
@media (max-width: 360px) {
  #staffelTable, #staffelTable th, #staffelTable td {
    font-size: 11px;
    padding: 3px 5px;
  }
  #staffelTable .icon-btn {
    width: 22px;
    height: 22px;
  }
  #staffelTable .icon-btn svg {
    width: 14px;
    height: 14px;
  }
}
`;
        const st = document.createElement('style');
        st.id = 'staffel-responsive-styles';
        st.textContent = css;
        document.head.appendChild(st);
    }

    // helper: create an SVG element for the requested icon (no innerHTML, no eval)
    function createSvgIcon(name) {
        const svgns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgns, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        svg.style.width = '18px';
        svg.style.height = '18px';
        svg.style.display = 'block';
        svg.style.fill = 'currentColor';

        const path = document.createElementNS(svgns, 'path');

        switch (name) {
            case 'pencil':
                path.setAttribute('d', 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 000-1.42l-2.34-2.34a1.003 1.003 0 00-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z');
                break;
            case 'check':
                path.setAttribute('d', 'M9 16.2l-3.5-3.5L4 14.2 9 19.25 20 8.25 17.5 5.75z');
                break;
            case 'x':
                path.setAttribute('d', 'M18.3 5.71L12 12.01 5.71 5.71 4.29 7.12 10.59 13.41 4.29 19.71 5.71 21.12 12 14.83 18.29 21.12 19.71 19.71 13.41 13.41 19.71 7.12z');
                break;
            default:
                path.setAttribute('d', '');
        }

        svg.appendChild(path);
        return svg;
    }

    // Beispielstandards (eindeutiger Name, um Konflikte zu vermeiden)
    const STAFFEL_DEFAULT_DATA = [
        { id: genId(), name: 'Bier', price: 3.50, editing: false },
        { id: genId(), name: 'Radler', price: 3.80, editing: false },
        { id: genId(), name: 'Cola', price: 2.50, editing: false },
        { id: genId(), name: 'Wasser', price: 2.50, editing: false },
        { id: genId(), name: 'Pfand', price: 2.50, editing: false }
    ];

    function genId() {
        return 'id_' + Math.random().toString(36).slice(2, 10);
    }

    function loadData() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return STAFFEL_DEFAULT_DATA.slice();
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return STAFFEL_DEFAULT_DATA.slice();
            return parsed.map(item => ({ id: item.id || genId(), name: item.name || '', price: Number(item.price) || 0, editing: false }));
        } catch (e) {
            console.error('Fehler beim Laden der Staffelpreise:', e);
            return STAFFEL_DEFAULT_DATA.slice();
        }
    }

    function saveData(items) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items.map(i => ({ id: i.id, name: i.name, price: i.price }))));
        showMessage('Gespeichert');
        setTimeout(() => showMessage(''), 1200);
    }

    function formatEuro(n) {
        return n.toFixed(2).replace('.', ',') + ' €';
    }

    function showMessage(text) {
        if (!messageDiv) return;
        messageDiv.textContent = text || '';
    }

    function renderTable() {
        const items = state.items;
        const head = document.createElement('thead');
        const headRow = document.createElement('tr');
        // Startet bei 2 (Spalte 1 ist der Einzelpreis, den man bereits eingibt)
        ['', 'Name', 'Preis', '2', '3', '4', '5', '6'].forEach((h, idx) => {
            const th = document.createElement('th');
            if (idx === 0) th.className = 'left-col';
            if (idx === 1) th.className = 'name-col';
            th.textContent = h;
            headRow.appendChild(th);
        });
        head.appendChild(headRow);

        const body = document.createElement('tbody');
        items.forEach((item) => {
            const tr = document.createElement('tr');

            // Links: ein Icon-Button (Stift / Häkchen) und ein Icon-Button (X) dicht nebeneinander
            const tdBtn = document.createElement('td');
            tdBtn.style.textAlign = 'left';

            const btn = document.createElement('button');
            btn.className = 'icon-btn btn-edit';
            btn.title = item.editing ? 'Speichern' : 'Editieren';
            btn.setAttribute('aria-label', item.editing ? 'Speichern' : 'Editieren');
            btn.addEventListener('click', () => toggleEdit(item.id));
            // append the correct SVG node (no innerHTML)
            btn.appendChild(createSvgIcon(item.editing ? 'check' : 'pencil'));
            tdBtn.appendChild(btn);

            const del = document.createElement('button');
            del.className = 'icon-btn btn-delete';
            del.title = 'Löschen';
            del.setAttribute('aria-label', 'Löschen');
            del.addEventListener('click', (e) => { e.stopPropagation(); if (confirm('Artikel wirklich löschen?')) { deleteItem(item.id); }});
            del.appendChild(createSvgIcon('x'));
            tdBtn.appendChild(del);

            tr.appendChild(tdBtn);

            // Name
            const tdName = document.createElement('td');
            if (item.editing) {
                const inp = document.createElement('input');
                inp.type = 'text';
                inp.value = item.name;
                inp.className = 'name-input';
                inp.addEventListener('input', (e) => {
                    item.name = e.target.value;
                    saveData(state.items);
                    renderTable();
                });
                tdName.appendChild(inp);
            } else {
                tdName.textContent = item.name;
                tdName.style.textAlign = 'left';
            }
            tr.appendChild(tdName);

            // Preis (Einzelpreis - Spalte 3)
            const tdPrice = document.createElement('td');
            if (item.editing) {
                const inp = document.createElement('input');
                inp.type = 'number';
                inp.step = '0.01';
                inp.min = '0';
                inp.value = Number(item.price).toFixed(2);
                inp.className = 'price-input';
                inp.addEventListener('input', (e) => {
                    const val = parseFloat(e.target.value.replace(',', '.'));
                    item.price = isFinite(val) ? val : 0;
                    saveData(state.items);
                    renderTable();
                });
                tdPrice.appendChild(inp);
            } else {
                tdPrice.textContent = formatEuro(Number(item.price));
            }
            tr.appendChild(tdPrice);

            // Staffelspalten 2..6 (startet bei 2, nicht bei 1)
            for (let i = 2; i <= 6; i++) {
                const td = document.createElement('td');
                const total = Number(item.price) * i;
                td.textContent = formatEuro(total);
                tr.appendChild(td);
            }

            body.appendChild(tr);
        });

        table.innerHTML = '';
        table.appendChild(head);
        table.appendChild(body);
    }

    function toggleEdit(id) {
        const item = state.items.find(i => i.id === id);
        if (!item) return;
        if (item.editing) {
            item.editing = false;
            saveData(state.items);
        } else {
            state.items.forEach(i => i.editing = false);
            item.editing = true;
        }
        renderTable();
    }

    function addItem() {
        const newItem = { id: genId(), name: 'Neuer Artikel', price: 0.00, editing: true };
        state.items.push(newItem);
        saveData(state.items);
        renderTable();
        setTimeout(() => {
            const inputs = table.querySelectorAll('input.name-input');
            if (inputs.length) inputs[inputs.length - 1].focus();
        }, 50);
    }

    function deleteItem(id) {
        state.items = state.items.filter(i => i.id !== id);
        saveData(state.items);
        renderTable();
    }

    function resetToDefault() {
        if (!confirm('Wirklich auf Standard zurücksetzen? Alle lokalen Änderungen gehen verloren.')) return;
        state.items = STAFFEL_DEFAULT_DATA.map(i => ({ ...i, id: genId(), editing: false }));
        saveData(state.items);
        renderTable();
        showMessage('Auf Standard zurückgesetzt');
        setTimeout(() => showMessage(''), 1500);
    }

    const state = {
        items: loadData()
    };

    // responsive Styles hinzufügen, bevor die Tabelle gerendert wird
    addResponsiveStyles();

    if (addItemBtn) addItemBtn.addEventListener('click', addItem);
    if (resetBtn) resetBtn.addEventListener('click', resetToDefault);

    renderTable();

    window.staffelpreise = {
        getAll: () => state.items,
        save: () => saveData(state.items)
    };
})();