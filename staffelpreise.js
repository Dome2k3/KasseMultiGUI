// staffelpreise.js
// Verwaltet die Staffeltabelle lokal (localStorage) ohne DB-Anbindung
// Enthält Debounce für Eingaben, horizontales Scroll-Wrapper + Slider,
// Icon-Buttons per createElementNS (CSP-freundlich) und einen Multiplier-Slider.
(function () {
    const STORAGE_KEY = 'kasse_staffelpreise_v1';
    const STORAGE_MAX_MULT = 'kasse_staffel_max_multiplier_v1';
    const table = document.getElementById('staffelTable');
    const addItemBtn = document.getElementById('addItemBtn');
    const resetBtn = document.getElementById('resetBtn');
    const messageDiv = document.getElementById('message');

    // Default
    const DEFAULT_MAX_MULTIPLIER = 7;

    // ----------------- Helpers -----------------
    // Debounce helper
    function debounce(fn, wait) {
        let t;
        return function (...args) {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), wait);
        };
    }

    // CSP-safe SVG creator (no innerHTML)
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

    // format Euro
    function formatEuro(n) {
        return n.toFixed(2).replace('.', ',') + ' €';
    }

    function showMessage(text) {
        if (!messageDiv) return;
        messageDiv.textContent = text || '';
    }

    // Truncate name for display (max 9 characters)
    function truncateName(name) {
        if (!name) return '';
        return name.length > 9 ? name.slice(0, 9) + '…' : name;
    }

    function genId() {
        return 'id_' + Math.random().toString(36).slice(2, 10);
    }

    // ----------------- Data load/save -----------------
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

    // Debounced save to avoid frequent localStorage writes while typing
    const debouncedSave = debounce(() => {
        saveData(state.items);
    }, 500);

    // ----------------- Defaults -----------------
    const STAFFEL_DEFAULT_DATA = [
        { id: genId(), name: 'Bier', price: 3.50, editing: false },
        { id: genId(), name: 'Radler', price: 3.80, editing: false },
        { id: genId(), name: 'Cola', price: 2.50, editing: false },
        { id: genId(), name: 'Wasser', price: 2.50, editing: false },
        { id: genId(), name: 'Pfand', price: 2.50, editing: false }
    ];

    // ----------------- Responsive + Controls (injected CSS) -----------------
    function addResponsiveStyles() {
        if (document.getElementById('staffel-responsive-styles')) return;
        const css = `
/* Wrapper für horizontales Scrollen */
#staffel-table-wrapper {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  box-sizing: border-box;
  position: relative;
}

/* Tabelle als inline-width (natürliche Breite) */
#staffelTable {
  width: max-content;
  border-collapse: collapse;
  table-layout: auto;
  box-sizing: border-box;
}

/* Schriftgröße skaliert */
#staffelTable, #staffelTable th, #staffelTable td {
  font-size: clamp(11px, 2.6vw, 14px);
  padding: 6px 8px;
  vertical-align: middle;
}

/* Name-Spalte: nicht zu breit, Ellipsen */
#staffelTable th.name-col, #staffelTable td.name-col {
  max-width: 9ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  box-sizing: border-box;
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

/* Abstände zwischen icon buttons */
#staffelTable .btn-delete {
  margin-left: 6px;
}

/* Multiplier control */
#staffel-multiplier-control {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  margin: 6px 0;
  box-sizing: border-box;
}
#staffel-multiplier-control label {
  font-size: 12px;
  color: inherit;
  user-select: none;
}
#staffel-multiplier-control input[type="range"] {
  width: 160px;
  height: 28px;
}

/* Scroll slider */
#staffel-scroll-container {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  box-sizing: border-box;
}
#staffel-scroll-container input[type="range"] {
  width: 100%;
  max-width: 600px;
  -webkit-appearance: none;
  height: 6px;
  background: #e6e6e6;
  border-radius: 6px;
  outline: none;
}
#staffel-scroll-container input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  background: #333;
  border-radius: 50%;
  box-shadow: 0 0 0 3px rgba(0,0,0,0.06);
  cursor: pointer;
}

/* Kleine Displays */
@media (max-width: 420px) {
  #staffelTable, #staffelTable th, #staffelTable td { font-size: 11px; padding: 4px 6px; }
  #staffelTable .icon-btn { width: 24px; height: 24px; }
  #staffelTable .icon-btn svg { width: 16px; height: 16px; }
  #staffel-multiplier-control input[type="range"] { width: 120px; }
  #staffel-scroll-container input[type="range"] { max-width: 380px; }
}
`;
        const st = document.createElement('style');
        st.id = 'staffel-responsive-styles';
        st.textContent = css;
        document.head.appendChild(st);
    }

    // ----------------- Multiplier control (slider) -----------------
    function getSavedMaxMultiplier() {
        const raw = localStorage.getItem(STORAGE_MAX_MULT);
        const n = raw ? Number(raw) : DEFAULT_MAX_MULTIPLIER;
        if (!isFinite(n) || n < 2 || n > 7) return DEFAULT_MAX_MULTIPLIER;
        return n;
    }

    function ensureMultiplierControl() {
        let control = document.getElementById('staffel-multiplier-control');
        if (control) return control;

        control = document.createElement('div');
        control.id = 'staffel-multiplier-control';

        const label = document.createElement('label');
        label.htmlFor = 'staffel-multiplier-range';
        label.textContent = 'Anzeigen bis ×';

        const valueSpan = document.createElement('span');
        valueSpan.id = 'staffel-multiplier-value';
        valueSpan.textContent = getSavedMaxMultiplier();

        const range = document.createElement('input');
        range.type = 'range';
        range.id = 'staffel-multiplier-range';
        range.min = '2';
        range.max = '7';
        range.step = '1';
        range.value = getSavedMaxMultiplier();

        range.addEventListener('input', (e) => {
            const v = Number(e.target.value);
            state.maxMultiplierVisible = v;
            localStorage.setItem(STORAGE_MAX_MULT, String(v));
            const vs = document.getElementById('staffel-multiplier-value');
            if (vs) vs.textContent = v;
            renderTable(); // render when user explicitly changes multiplier count
            // update scroll slider after re-render
            setTimeout(updateHorizontalScrollSlider, 40);
        });

        control.appendChild(label);
        control.appendChild(valueSpan);
        control.appendChild(range);

        if (table && table.parentNode) {
            table.parentNode.insertBefore(control, table);
        } else {
            document.body.insertBefore(control, document.body.firstChild);
        }

        return control;
    }

    // Enforce at least 3 multipliers in landscape on small devices (so total visible columns >=5)
    function getEffectiveMaxMultiplier() {
        const saved = state.maxMultiplierVisible || getSavedMaxMultiplier() || DEFAULT_MAX_MULTIPLIER;
        if (window.matchMedia && window.matchMedia('(orientation: landscape) and (max-width: 812px)').matches) {
            return Math.max(saved, 3);
        }
        return saved;
    }

    // ----------------- Horizontal scroll wrapper + slider -----------------
    function ensureTableWrapperAndSlider() {
        if (!table) return;
        let wrapper = document.getElementById('staffel-table-wrapper');
        if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.id = 'staffel-table-wrapper';
            table.parentNode.insertBefore(wrapper, table);
            wrapper.appendChild(table);
        }

        let sc = document.getElementById('staffel-scroll-container');
        if (!sc) {
            sc = document.createElement('div');
            sc.id = 'staffel-scroll-container';

            const leftLabel = document.createElement('span');
            leftLabel.textContent = '◀';
            leftLabel.setAttribute('aria-hidden', 'true');
            leftLabel.style.opacity = '0.6';
            leftLabel.style.fontSize = '12px';

            const slider = document.createElement('input');
            slider.type = 'range';
            slider.id = 'staffel-scroll-slider';
            slider.min = '0';
            slider.max = '0';
            slider.step = '1';
            slider.value = '0';
            slider.setAttribute('aria-label', 'Tabelle horizontal scrollen');

            const rightLabel = document.createElement('span');
            rightLabel.textContent = '▶';
            rightLabel.setAttribute('aria-hidden', 'true');
            rightLabel.style.opacity = '0.6';
            rightLabel.style.fontSize = '12px';

            sc.appendChild(leftLabel);
            sc.appendChild(slider);
            sc.appendChild(rightLabel);

            wrapper.parentNode.insertBefore(sc, wrapper.nextSibling);

            slider.addEventListener('input', (e) => {
                const s = document.getElementById('staffel-table-wrapper');
                if (!s) return;
                s.scrollLeft = Number(e.target.value);
            });

            wrapper.addEventListener('scroll', () => {
                syncSliderWithScroll();
            });

            wrapper.addEventListener('touchend', () => setTimeout(syncSliderWithScroll, 10));
            wrapper.addEventListener('mouseup', () => setTimeout(syncSliderWithScroll, 10));
            window.addEventListener('resize', () => {
                setTimeout(updateHorizontalScrollSlider, 80);
            });

            setTimeout(updateHorizontalScrollSlider, 40);
        }
    }

    function updateHorizontalScrollSlider() {
        const wrapper = document.getElementById('staffel-table-wrapper');
        const slider = document.getElementById('staffel-scroll-slider');
        if (!wrapper || !slider) return;
        const max = Math.max(0, wrapper.scrollWidth - wrapper.clientWidth);
        slider.max = String(Math.round(max));
        if (Number(slider.value) > max) {
            slider.value = String(Math.round(max));
            wrapper.scrollLeft = max;
        } else {
            wrapper.scrollLeft = Number(slider.value);
        }
        const scContainer = document.getElementById('staffel-scroll-container');
        if (scContainer) {
            scContainer.style.display = (max > 0 ? 'flex' : 'none');
        }
    }

    function syncSliderWithScroll() {
        const wrapper = document.getElementById('staffel-table-wrapper');
        const slider = document.getElementById('staffel-scroll-slider');
        if (!wrapper || !slider) return;
        slider.value = String(Math.round(wrapper.scrollLeft));
    }

    // ----------------- Partial DOM updates to avoid focus loss -----------------
    // Update total cells for a given rendered row element (tr)
    function updateTotalsForRow(tr, price, maxMult) {
        // td indices: 0=buttons,1=name,2=price, 3.. => multipliers 2..
        const tds = tr.querySelectorAll('td');
        for (let i = 2; i < tds.length; i++) {
            const multIndex = i - 1; // when i=3 -> mult 2
            const mult = multIndex;
            if (mult >= 2 && mult <= maxMult) {
                const total = Number(price) * mult;
                tds[i].textContent = formatEuro(total);
            }
        }
    }

    // ----------------- Rendering -----------------
    function renderTable() {
        ensureMultiplierControl();
        ensureTableWrapperAndSlider();

        const items = state.items;
        const maxMult = getEffectiveMaxMultiplier();

        const head = document.createElement('thead');
        const headRow = document.createElement('tr');

        // Head: Buttons | Name | Preis | multipliers 2..maxMult
        ['', 'Name', 'Preis'].forEach((h, idx) => {
            const th = document.createElement('th');
            if (idx === 0) th.className = 'left-col';
            if (idx === 1) th.className = 'name-col';
            th.textContent = h;
            headRow.appendChild(th);
        });
        for (let i = 2; i <= maxMult; i++) {
            const th = document.createElement('th');
            th.textContent = String(i);
            headRow.appendChild(th);
        }
        head.appendChild(headRow);

        const body = document.createElement('tbody');
        items.forEach((item) => {
            const tr = document.createElement('tr');

            // Buttons cell
            const tdBtn = document.createElement('td');
            tdBtn.style.textAlign = 'left';

            const btn = document.createElement('button');
            btn.className = 'icon-btn btn-edit';
            btn.title = item.editing ? 'Speichern' : 'Editieren';
            btn.setAttribute('aria-label', item.editing ? 'Speichern' : 'Editieren');
            btn.addEventListener('click', () => {
                // Toggle: if saving, flip editing->false and re-render to show view mode
                if (item.editing) {
                    item.editing = false;
                    saveData(state.items);
                    renderTable();
                } else {
                    state.items.forEach(i => i.editing = false);
                    item.editing = true;
                    renderTable();
                    // focus on newly created input (handled after render)
                }
            });
            btn.appendChild(createSvgIcon(item.editing ? 'check' : 'pencil'));
            tdBtn.appendChild(btn);

            const del = document.createElement('button');
            del.className = 'icon-btn btn-delete';
            del.title = 'Löschen';
            del.setAttribute('aria-label', 'Löschen');
            del.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm('Artikel wirklich löschen?')) {
                    deleteItem(item.id);
                }
            });
            del.appendChild(createSvgIcon('x'));
            tdBtn.appendChild(del);

            tr.appendChild(tdBtn);

            // Name
            const tdName = document.createElement('td');
            tdName.className = 'name-col';
            if (item.editing) {
                const inp = document.createElement('input');
                inp.type = 'text';
                inp.value = item.name;
                inp.className = 'name-input';
                inp.maxLength = 64; // allow editing longer name if desired
                // IMPORTANT: do NOT re-render while typing; update model and debounced-save
                inp.addEventListener('input', (e) => {
                    item.name = e.target.value;
                    debouncedSave();
                    // update title for ease (not re-render)
                    tdName.title = item.name || '';
                });
                tdName.appendChild(inp);
            } else {
                tdName.textContent = truncateName(item.name);
                tdName.style.textAlign = 'left';
                tdName.title = item.name || '';
            }
            tr.appendChild(tdName);

            // Price cell
            const tdPrice = document.createElement('td');
            if (item.editing) {
                const inp = document.createElement('input');
                inp.type = 'number';
                inp.step = '0.01';
                inp.min = '0';
                inp.value = Number(item.price).toFixed(2);
                inp.className = 'price-input';
                // Update model and totals on input, but do NOT re-render => avoids focus loss
                inp.addEventListener('input', (e) => {
                    // allow comma as decimal separator
                    const raw = e.target.value;
                    const val = parseFloat(String(raw).replace(',', '.'));
                    item.price = isFinite(val) ? val : 0;
                    debouncedSave(); // save after typing stops
                    // update totals in this row directly
                    updateTotalsForRow(tr, item.price, maxMult);
                });
                tdPrice.appendChild(inp);
            } else {
                tdPrice.textContent = formatEuro(Number(item.price));
            }
            tr.appendChild(tdPrice);

            // Multiplier columns (render based on active maxMult)
            for (let i = 2; i <= maxMult; i++) {
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

        // After render, focus newly created input if any
        const lastEditingInput = table.querySelector('input.name-input, input.price-input');
        if (lastEditingInput) {
            lastEditingInput.focus();
            // move cursor to end
            const val = lastEditingInput.value;
            lastEditingInput.setSelectionRange && lastEditingInput.setSelectionRange(val.length, val.length);
        }

        // after render update scroll slider
        setTimeout(updateHorizontalScrollSlider, 40);
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

    // ----------------- State -----------------
    const state = {
        items: loadData(),
        maxMultiplierVisible: getSavedMaxMultiplier()
    };

    // ----------------- Init -----------------
    addResponsiveStyles();
    ensureMultiplierControl();
    ensureTableWrapperAndSlider();

    if (addItemBtn) addItemBtn.addEventListener('click', addItem);
    if (resetBtn) resetBtn.addEventListener('click', resetToDefault);

    // re-render on resize/orientation, with minor debounce
    window.addEventListener('resize', () => {
        clearTimeout(window.__staffel_resize_timeout);
        window.__staffel_resize_timeout = setTimeout(() => {
            renderTable();
            updateHorizontalScrollSlider();
        }, 120);
    });
    window.addEventListener('orientationchange', () => {
        setTimeout(() => {
            renderTable();
            updateHorizontalScrollSlider();
        }, 160);
    });

    renderTable();

    window.staffelpreise = {
        getAll: () => state.items,
        save: () => saveData(state.items)
    };
})();