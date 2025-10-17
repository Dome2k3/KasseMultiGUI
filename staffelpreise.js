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
/* Responsive tweaks für die Staffeltabelle */
#staffelTable {
  display: block;
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  white-space: nowrap;
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
#staffelTable .price-input,
#staffelTable .pretty-btn {
  font-size: inherit;
  box-sizing: border-box;
}
/* Noch kompakter auf sehr kleinen Bildschirmen */
@media (max-width: 420px) {
  #staffelTable, #staffelTable th, #staffelTable td {
    font-size: 11px;
    padding: 4px 6px;
  }
  #staffelTable .pretty-btn {
    padding: 3px 5px;
  }
}
`;
            const st = document.createElement('style');
            st.id = 'staffel-responsive-styles';
            st.textContent = css;
            document.head.appendChild(st);
        }

        // Beispielstandards (kann angepasst werden)
        const DEFAULT_DATA = [
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
                if (!raw) return DEFAULT_DATA.slice();
                const parsed = JSON.parse(raw);
                if (!Array.isArray(parsed)) return DEFAULT_DATA.slice();
                return parsed.map(item => ({ id: item.id || genId(), name: item.name || '', price: Number(item.price) || 0, editing: false }));
            } catch (e) {
                console.error('Fehler beim Laden der Staffelpreise:', e);
                return DEFAULT_DATA.slice();
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
            ['','Name','Preis','2','3','4','5','6'].forEach((h, idx) => {
                const th = document.createElement('th');
                if (idx === 0) th.className = 'left-col';
                if (idx === 1) th.className = 'name-col';
                th.textContent = h;
                headRow.appendChild(th);
            });
            head.appendChild(headRow);

            const body = document.createElement('tbody');
            items.forEach((item, rowIndex) => {
                const tr = document.createElement('tr');

                // Editieren Button (ganz links)
                const tdBtn = document.createElement('td');
                tdBtn.style.textAlign = 'left';
                const btn = document.createElement('button');
                btn.className = 'pretty-btn btn-edit';
                btn.textContent = item.editing ? 'Speichern' : 'Editieren';
                btn.addEventListener('click', () => toggleEdit(item.id));
                tdBtn.appendChild(btn);

                // Delete optional
                const del = document.createElement('button');
                del.className = 'pretty-btn btn-delete';
                del.style.marginLeft = '8px';
                del.textContent = 'Löschen';
                del.title = 'Zeile löschen';
                del.addEventListener('click', () => { if (confirm('Artikel wirklich löschen?')) { deleteItem(item.id); }});
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

                // Preis (Einzelpreis - Spalte 1, die bereits sichtbar ist)
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
            state.items = DEFAULT_DATA.map(i => ({ ...i, id: genId(), editing: false }));
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

        addItemBtn.addEventListener('click', addItem);
        resetBtn.addEventListener('click', resetToDefault);

        renderTable();

        window.staffelpreise = {
            getAll: () => state.items,
            save: () => saveData(state.items)
        };
    })();
