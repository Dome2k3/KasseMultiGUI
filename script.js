let total = 0;
let itemCount = 1;
let receiptCount = 1; // Eindeutige Bon-Nummer
let history = []; // Speichert alle Bons
let receipts = {}; // Startet leer, wird mit jedem Artikel befüllt
let bonDetails = { items: [] }; // Standardwert als leeres Array

// Artikel laden und Preis loggen
fetch(`${window.API_URL}/items`)
    .then(response => response.json())
    .then(data => {
        items = data;
        console.log('Artikel geladen:', items);
        displayItems();  // Artikel als Buttons darstellen
    })
    .catch(error => {
        console.error('Fehler beim Abrufen der Artikel:', error);
    });

// fügt den gleichen Artikel mehrfach hinzu
function addMultipleItems(itemName, itemPrice, qty) {
    for (let i = 0; i < qty; i++) {
        addItem(itemName, itemPrice);
    }
}

// Kategorie-Farben und Icons Mapping
const categoryStyles = {
    'Essen': { color: '#e67e22', icon: '🍽️' },
    'Getränke': { color: '#3498db', icon: '🥤' },
    'Snacks': { color: '#9b59b6', icon: '🍿' },
    'Süßes': { color: '#e91e63', icon: '🍬' },
    'Kaffee': { color: '#795548', icon: '☕' },
    'Bier': { color: '#f39c12', icon: '🍺' },
    'Weizen': { color: '#f39c12', icon: '🍺' },
    'Wein': { color: '#8e44ad', icon: '🍷' },
    'Alkohol': { color: '#c0392b', icon: '🍹' },
    'Frühstück': { color: '#27ae60', icon: '🥐' },
    'Wurst': { color: '#d35400', icon: '🌭' },
    'Pommes': { color: '#f1c40f', icon: '🍟' },
    'Pfand': { color: '#1abc9c', icon: '♻️' },
    'Flammkuchen': { color: '#ff6b35', icon: '🍕' },
    'Vegetarisch': { color: '#4caf50', icon: '🥗' },
    'Fast Food': { color: '#ff5722', icon: '🍔' },
    'Fleisch': { color: '#b71c1c', icon: '🥩' },
    'zHelfer': { color: '#607d8b', icon: '👤' },
    'Softdrinks': { color: '#ff6b6b', icon: '🥤' },
    'Apfelschorle': { color: '#7cb342', icon: '🍾' },
    'Sonstiges': { color: '#7f8c8d', icon: '📦' }
};

// Funktion um Kategorie-Style zu bekommen (mit Fallback)
function getCategoryStyle(category) {
    const lowerCat = category.toLowerCase();
    for (const [key, style] of Object.entries(categoryStyles)) {
        if (lowerCat.includes(key.toLowerCase())) {
            return style;
        }
    }
    return categoryStyles['Sonstiges'];
}

// Funktion zum Anzeigen der Artikel als Buttons (GUI-aware)
function displayItems() {
    const artikelButtonsDiv = document.getElementById('artikel-buttons');
    artikelButtonsDiv.innerHTML = ''; // Leeren des Bereichs

    if (!Array.isArray(items) || items.length === 0) {
        console.warn("Keine Artikel vorhanden oder 'items' ist nicht definiert.");
        return;
    }

    const gui = window.currentGUI || null;

    // Spezialfall Pfand: feste Schnellbuttons (1x, 2x, 5x)
    if (gui === 'pfand') {
        const pfandProduct = items.find(it =>
            (it.kategorie && it.kategorie.toLowerCase().includes('pfand')) ||
            (it.name && it.name.toLowerCase().includes('pfand'))
        );
        const pfandPrice = pfandProduct ? parseFloat(pfandProduct.preis) : 1;

        const quantities = [1, 2, 5];
        const gruppeDiv = document.createElement("div");
        gruppeDiv.className = "warengruppe";
        
        const style = getCategoryStyle('Pfand');
        gruppeDiv.style.borderLeft = `4px solid ${style.color}`;
        gruppeDiv.style.backgroundColor = `${style.color}10`;

        const title = document.createElement("h3");
        title.innerHTML = `${style.icon} Pfand`;
        gruppeDiv.appendChild(title);

        const grid = document.createElement("div");
        grid.className = "button-grid";

        quantities.forEach(q => {
            const btn = document.createElement('button');
            btn.innerHTML = `${q}x Pfand`;
            btn.style.backgroundColor = style.color;
            btn.onclick = () => addMultipleItems('Pfandrück', pfandPrice * -1, q);
            grid.appendChild(btn);
        });

        gruppeDiv.appendChild(grid);
        artikelButtonsDiv.appendChild(gruppeDiv);
        return; // fertig
    }

    // Normalfall: Produkte nach GUI filtern (oder alle anzeigen)
    const filtered = gui
        ? items.filter(i =>
            (i.gui && (i.gui === gui || i.gui === 'all')) ||
            (!i.gui && (i.kategorie && i.kategorie.toLowerCase() === gui))
        )
        : items;

    const categories = [...new Set(filtered.map(item => item.kategorie || 'Sonstiges'))];

    categories.forEach((category, index) => {
        const gruppeDiv = document.createElement("div");
        gruppeDiv.className = "warengruppe";
        
        const style = getCategoryStyle(category);
        gruppeDiv.style.borderLeft = `4px solid ${style.color}`;
        gruppeDiv.style.backgroundColor = `${style.color}10`;

        const title = document.createElement("h3");
        title.innerHTML = `${style.icon} ${category}`;
        gruppeDiv.appendChild(title);

        const grid = document.createElement("div");
        grid.className = "button-grid";

        filtered
            .filter(item => (item.kategorie || 'Sonstiges') === category)
            .forEach(item => {
                const price = parseFloat(item.preis);
                if (!item.name || isNaN(price)) {
                    console.warn("Fehlendes oder ungültiges Artikelobjekt:", item);
                    return;
                }

                const btn = document.createElement('button');
                btn.innerHTML = item.name;
                btn.style.backgroundColor = style.color;
                btn.onclick = () => addItem(item.name, price);
                grid.appendChild(btn);
            });

        gruppeDiv.appendChild(grid);
        artikelButtonsDiv.appendChild(gruppeDiv);
    });
}


// Funktion für das Hinzufügen eines Artikels
function addItem(itemName, itemPrice) {
    const receiptId = Date.now(); // Verwende die aktuelle Zeit als eindeutige ID
    const receipt = receipts[receiptId] || { items: [], total: 0 };  // Hole den aktuellen Bon oder erstelle einen neuen

    // Artikel zum Bon hinzufügen
    receipt.items.push({
        name: itemName,
        quantity: 1, // Annahme: immer 1, kannst das nach Bedarf ändern
        price: itemPrice
    });

    // Gesamtpreis des Bons aktualisieren
    receipt.total += itemPrice;

    // Speichere den aktualisierten Bon in `receipts`
    receipts[receiptId] = receipt;

    // Anzeige des hinzugefügten Artikels und des Gesamtbetrags aktualisieren
    const receiptList = document.getElementById('receipt-list');
    const newItem = document.createElement('li');
    
    // Item text content
    const itemText = document.createElement('span');
    itemText.textContent = `${itemName} - €${itemPrice.toFixed(2)}`;
    newItem.appendChild(itemText);
    
    // Delete button (x)
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '×';
    deleteBtn.className = 'delete-item-btn';
    deleteBtn.onclick = function() {
        removeReceiptItem(newItem, itemPrice);
    };
    newItem.appendChild(deleteBtn);
    
    receiptList.appendChild(newItem);

    total += itemPrice;
    document.getElementById('total').textContent = `Summe: ${total.toFixed(2)} €`;

    itemCount; // Artikelzähler erhöhen
}

// Funktion zum Entfernen eines einzelnen Artikels vom Bon
function removeReceiptItem(listItem, itemPrice) {
    listItem.remove();
    total -= itemPrice;
    document.getElementById('total').textContent = `Summe: ${total.toFixed(2)} €`;
}

function removePfandItems() {
    const receiptList = document.getElementById('receipt-list');
    const totalElement = document.getElementById('total');

    let newTotal = 0;

    // Alle Listenelemente abrufen
    const items = Array.from(receiptList.children);

    // Liste filtern, ohne "Pfand"
    receiptList.innerHTML = ''; // Liste leeren

    items.forEach(item => {
        if (!item.textContent.includes('Pfand')) {
            const parts = item.textContent.split('. '); // Trenne alte Nummerierung
            if (parts.length > 1) {
                item.textContent = `1. ${parts[1]}`; // Immer mit "1." beginnen
            }
            receiptList.appendChild(item);

            // Preis extrahieren und aufsummieren
            const priceMatch = item.textContent.match(/€(\d+\.\d+)/);
            if (priceMatch) {
                newTotal += parseFloat(priceMatch[1]);
            }
        }
    });

    // Gesamtbetrag aktualisieren
    total = newTotal;
    if (totalElement) {
        totalElement.textContent = `Summe: ${total.toFixed(2)} €`;
    }
}

function resetReceipt() {
    const receiptList = document.getElementById('receipt-list');
    const totalElement = document.getElementById('total'); // Überprüfen, ob das Element existiert

    // Inhalt des aktuellen Bons löschen
    receiptList.innerHTML = '';

    // Setze den Gesamtbetrag zurück
    total = 0;
    if (totalElement) {
        totalElement.textContent = `Summe: ${total.toFixed(2)} €`; // Aktualisiert die Anzeige, wenn das Element existiert
    }

    // Artikelnummer zurücksetzen
    itemCount = 1; // Stellt sicher, dass der Zähler korrekt zurückgesetzt wird
}

function finalizeBon() {
    const receiptList = document.querySelector('#receipt-list');
    const receiptItems = Array.from(receiptList.children).map(item => item.textContent);
    const timestamp = new Date().toLocaleString();

    if (receiptItems.length > 0) {
        const bonDetails = {
            id: receiptCount,
            timestamp: timestamp,
            items: receiptItems,
            total: parseFloat(total).toFixed(2) // Gesamtbetrag als Zahl mit 2 Dezimalstellen
        };

        // Formatierte Items erstellen
        const formattedItems = formatItems(bonDetails.items);

        // Berechne totalAmount und prüfe auf NaN
        let totalAmount = formattedItems.reduce((sum, item) => sum + item.total, 0);
        totalAmount = parseFloat(totalAmount).toFixed(2); // Sicherstellen, dass es eine Zahl ist
        console.log("Berechneter totalAmount in finalizeBon:", totalAmount); // Zeigt den berechneten Gesamtbetrag

        // Überprüfen, ob totalAmount eine gültige Zahl ist
        if (isNaN(totalAmount) || totalAmount === 'NaN') {
            console.error("Ungültiger Gesamtbetrag:", totalAmount);
            return;
        }

        // Erst in DB speichern, dann mit DB-ID drucken
        sendReceiptsToServer({ totalAmount: totalAmount, items: formattedItems }, function(dbId) {
            // Bon-ID aus der Datenbank verwenden
            if (dbId) {
                bonDetails.id = dbId;
            }

            // In History aufnehmen
            history.push(bonDetails);
            updateHistory();

            // Optionaler PDF-Download (nur wenn Checkbox aktiv)
            sendPrintRequest(bonDetails);
        });

        // Nächste Bon-ID (Fallback-Zähler)
        receiptCount++;

        // Bon zurücksetzen
        resetReceipt();
    }
}

function updateHistory() {
    const historyList = document.getElementById('history-list');
    historyList.innerHTML = ''; // Liste zurücksetzen

    if (history.length === 0) {
        historyList.innerHTML = '<p>Keine Bons vorhanden.</p>';
        return;
    }

    // History nach Bon-Nummer (id) absteigend sortieren
    const sortedHistory = history.slice().sort((a, b) => b.id - a.id);

    // Neueste Bestellung holen (erste nach Sortierung)
    const latestReceipt = sortedHistory[0];

    const latestOrderDiv = document.createElement('div');
    latestOrderDiv.classList.add('history-item', 'latest-order');

    latestOrderDiv.innerHTML = `
        <h3>Letzte Bestellung (Bon Nr. ${latestReceipt.id})</h3>
        <table>
            <thead>
                <tr>
                    <th>Datum</th>
                    <th>Artikel</th>
                    <th>Summe</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>${latestReceipt.timestamp}</td>
                    <td>
                        <ul>
                            ${latestReceipt.items.map(item => `<li>${item}</li>`).join('')}
                        </ul>
                    </td>
                    <td>€${latestReceipt.total}</td>
                </tr>
            </tbody>
        </table>
    `;

    historyList.appendChild(latestOrderDiv);

    // Prüfen, ob es ältere Bestellungen gibt
    if (sortedHistory.length > 1) {
        const toggleButton = document.createElement('button');
        toggleButton.textContent = 'Ältere Bons anzeigen';
        toggleButton.classList.add('toggle-history');

        const collapsedOrdersDiv = document.createElement('div');
        collapsedOrdersDiv.id = 'collapsed-orders';
        collapsedOrdersDiv.style.display = 'none';

        // Ältere Bestellungen (alle außer die neueste)
        for (let i = 1; i < sortedHistory.length; i++) {
            const receipt = sortedHistory[i];

            const historyItem = document.createElement('div');
            historyItem.classList.add('history-item');

            historyItem.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h4>Bon Nr. ${receipt.id}</h4>
                    <button class="toggle-details">Details anzeigen</button>
                </div>
            `;

            // Details-Container
            const details = document.createElement('div');
            details.classList.add('details');
            details.style.display = 'none';

            const table = document.createElement('table');
            table.innerHTML = `
                <thead>
                    <tr>
                        <th>Datum</th>
                        <th>Artikel</th>
                        <th>Summe</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>${receipt.timestamp}</td>
                        <td>
                            <ul>
                                ${receipt.items.map(item => `<li>${item}</li>`).join('')}
                            </ul>
                        </td>
                        <td>€${receipt.total}</td>
                    </tr>
                </tbody>
            `;
            details.appendChild(table);

            // Event-Listener für den Button
            const toggleDetailsButton = historyItem.querySelector('.toggle-details');
            toggleDetailsButton.onclick = () => {
                const isHidden = details.style.display === 'none';
                details.style.display = isHidden ? 'block' : 'none';
                toggleDetailsButton.textContent = isHidden ? 'Details verbergen' : 'Details anzeigen';
            };

            historyItem.appendChild(details);
            collapsedOrdersDiv.appendChild(historyItem);
        }

        // Button zum Ein-/Ausklappen der alten Bons
        toggleButton.onclick = () => {
            const isHidden = collapsedOrdersDiv.style.display === 'none';
            collapsedOrdersDiv.style.display = isHidden ? 'block' : 'none';
            toggleButton.textContent = isHidden ? 'Ältere Bons ausblenden' : 'Ältere Bons anzeigen';
        };

        historyList.appendChild(toggleButton);
        historyList.appendChild(collapsedOrdersDiv);
    }
}

function sendPrintRequest(bonDetails) {
    // Prüfen, ob der Benutzer die PDF-Erstellung aktiviert hat
    const isPdfEnabled = document.getElementById('generate-pdf').checked;
    console.log("Bon Details zum Drucken:", bonDetails);

    // Artikel aufteilen: Flammkuchen vs. Küche (wie in server.js)
    const allItems = bonDetails.items.map(item => {
        const cleanItem = item.replace(/×$/, '').trim();
        return cleanItem;
    });
    const flammkuchenItems = allItems.filter(item => item.includes('Flammkuchen'));
    const kitchenItems = allItems.filter(item => !item.includes('Flammkuchen'));

    if (isPdfEnabled) {
        // 1. Kassenbon-PDF (Kundenbon) – immer
        try {            const { jsPDF } = window.jspdf;
            const pageHeight = Math.max(100, 40 + allItems.length * 5 + 40);
            const doc = new jsPDF({ unit: 'mm', format: [80, pageHeight] });
            const left = 5;
            const right = 75;
            const center = 40;
            let y = 10;

            doc.setFontSize(14);
            doc.text('*** Kassenbon ***', center, y, { align: 'center' });
            y += 8;

            doc.setFontSize(9);
            doc.text(`Bon Nr. ${bonDetails.id}`, left, y);
            y += 5;
            doc.text(bonDetails.timestamp, left, y);
            y += 5;
            doc.line(left, y, right, y);
            y += 5;

            doc.text('Artikel', left, y);
            doc.text('Preis', right, y, { align: 'right' });
            y += 2;
            doc.line(left, y, right, y);
            y += 5;

            allItems.forEach((cleanItem, i) => {
                const lastDash = cleanItem.lastIndexOf(' - ');
                if (lastDash !== -1) {
                    const name = `${i + 1}. ${cleanItem.slice(0, lastDash).trim()}`;
                    const price = cleanItem.slice(lastDash + 3).trim();
                    doc.text(name, left, y);
                    doc.text(price, right, y, { align: 'right' });
                } else {
                    doc.text(`${i + 1}. ${cleanItem}`, left, y);
                }
                y += 5;
            });

            doc.line(left, y, right, y);
            y += 6;
            doc.setFontSize(11);
            doc.text(`Gesamt: \u20AC${bonDetails.total}`, left, y);
            y += 8;

            doc.setFontSize(9);
            doc.text('Der F\u00F6rderverein dankt dir f\u00FCr', center, y, { align: 'center' });
            y += 5;
            doc.text('deinen Einkauf! Save the Date:', center, y, { align: 'center' });
            y += 5;
            doc.text('BVT 39 - 2.-4. Juli 2027!', center, y, { align: 'center' });

            doc.save(`Bon-${bonDetails.id}.pdf`);
            console.log("Kassenbon-PDF erfolgreich erstellt");
        } catch (e) {
            console.error("Fehler bei der Kassenbon-PDF-Erstellung:", e);
        }

        // 2. Küchenbon-PDF – wenn Nicht-Flammkuchen-Artikel vorhanden
        if (kitchenItems.length > 0) {
            try {
                const { jsPDF } = window.jspdf;
                const pageHeight = Math.max(80, 40 + kitchenItems.length * 5 + 15);
                const doc = new jsPDF({ unit: 'mm', format: [80, pageHeight] });
                const left = 5;
                const right = 75;
                const center = 40;
                let y = 10;

                doc.setFontSize(14);
                doc.text('*** K\u00DCCHE ***', center, y, { align: 'center' });
                y += 8;

                doc.setFontSize(9);
                doc.text(`Bon Nr. ${bonDetails.id}`, left, y);
                y += 5;
                doc.text(bonDetails.timestamp, left, y);
                y += 5;
                doc.line(left, y, right, y);
                y += 5;

                doc.text('Artikel', left, y);
                y += 2;
                doc.line(left, y, right, y);
                y += 5;

                kitchenItems.forEach((item, i) => {
                    const lastDash = item.lastIndexOf(' - ');
                    const name = lastDash !== -1 ? item.slice(0, lastDash).trim() : item;
                    doc.text(`${i + 1}. ${name}`, left, y);
                    y += 5;
                });

                doc.line(left, y, right, y);

                doc.save(`Kueche-${bonDetails.id}.pdf`);
                console.log("K\u00FCchenbon-PDF erfolgreich erstellt");
            } catch (e) {
                console.error("Fehler bei der K\u00FCchenbon-PDF-Erstellung:", e);
            }
        }

        // 3. Flammkuchenbon-PDF – nur wenn Flammkuchen bestellt
        if (flammkuchenItems.length > 0) {
            try {
                const { jsPDF } = window.jspdf;
                const pageHeight = Math.max(80, 40 + flammkuchenItems.length * 5 + 15);
                const doc = new jsPDF({ unit: 'mm', format: [80, pageHeight] });
                const left = 5;
                const right = 75;
                const center = 40;
                let y = 10;

                doc.setFontSize(14);
                doc.text('*** FLAMMKUCHEN ***', center, y, { align: 'center' });
                y += 8;

                doc.setFontSize(9);
                doc.text(`Bon Nr. ${bonDetails.id}`, left, y);
                y += 5;
                doc.text(bonDetails.timestamp, left, y);
                y += 5;
                doc.line(left, y, right, y);
                y += 5;

                doc.text('Flammkuchen', left, y);
                y += 2;
                doc.line(left, y, right, y);
                y += 5;

                flammkuchenItems.forEach((item, i) => {
                    const lastDash = item.lastIndexOf(' - ');
                    const name = lastDash !== -1 ? item.slice(0, lastDash).trim() : item;
                    doc.text(`${i + 1}. ${name}`, left, y);
                    y += 5;
                });

                doc.line(left, y, right, y);

                doc.save(`Flammkuchen-${bonDetails.id}.pdf`);
                console.log("Flammkuchenbon-PDF erfolgreich erstellt");
            } catch (e) {
                console.error("Fehler bei der Flammkuchenbon-PDF-Erstellung:", e);
            }
        }
    }
}

function formatItems(receiptItems) {
    console.log("Formatiere Artikel:", receiptItems); // Logge die Eingabedaten
    return receiptItems.map(item => {
        // Finde das letzte Vorkommen des Trennzeichens '-'
        const lastIndex = item.lastIndexOf(' - ');
        if (lastIndex === -1) {
            console.error("Ungültiges Format für Artikel:", item);
            return null; // Falls kein '-' gefunden wird, überspringen
        }

        // Teile Name und Preis basierend auf dem letzten Vorkommen von '-'
        const productName = item.slice(0, lastIndex).trim();
        const price = item.slice(lastIndex + 3).trim(); // 3 für die Länge von ' - '

        // Konvertiere den Preis in eine Zahl und prüfe, ob es gültig ist
        const total = parseFloat(price.replace('€', '').trim());
        if (isNaN(total)) {
            console.error("Ungültiger Preis für Artikel:", item);
            return null; // Falls der Preis ungültig ist, überspringe diesen Artikel
        }

        // Da der Artikelname möglicherweise mehr als ein Wort enthält, verwenden wir nur den letzten Teil
        return {
            name: productName,
            quantity: 1,  // Bei Bedarf anpassen, falls Quantität auch immer in den Daten vorhanden ist
            price: total,
            total: total
        };
    }).filter(item => item !== null); // Filtert ungültige Artikel heraus
}

// --- Funktion zum Senden des Bons an den Server ---
function sendReceiptsToServer(bonDetails, callback) {
    console.log("Bon Details zum Speichern:", bonDetails);

    // GUI mitschicken (wird in z.B. essen.html gesetzt)
    bonDetails.gui = window.currentGUI || bonDetails.gui || 'essen';

    if (bonDetails && Array.isArray(bonDetails.items) && bonDetails.items.length > 0) {
        fetch(`${window.API_URL}/finalize-bon`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bonDetails }),
        })
            .then(response => response.json())
            .then(data => {
                console.log("Daten erfolgreich gespeichert:", data);

                if (data.success) {
                    // Callback mit DB-ID aufrufen
                    if (callback) callback(data.id);
                    // Nach dem Speichern: Historie aus der DB neu laden für diese GUI
                    loadRecentBons();
                } else {
                    if (callback) callback(null);
                }
            })
            .catch(error => {
                console.error("Fehler beim Speichern des Bons:", error);
                if (callback) callback(null);
            });
    } else {
        console.error("Bon-Daten sind leer oder ungültig.");
    }
}



function resetStatistics() {
    console.log('Reset wurde aufgerufen');
    const salesData = localStorage.getItem('salesData');
    console.log('Aktuelle salesData:', salesData);

    if (salesData) {
        if (confirm('Möchten Sie die Statistik wirklich zurücksetzen? Diese Aktion kann nicht rückgängig gemacht werden.')) {
            localStorage.removeItem('salesData');
            localStorage.setItem('receiptCount', '1'); // Setzt den Bon-Zähler zurück
            alert('Statistik wurde erfolgreich zurückgesetzt.');

            // Anzeige zurücksetzen
            const statsOutput = document.getElementById('statistic-output');
            if (statsOutput) {
                statsOutput.innerHTML = '<p>Keine Verkaufsdaten vorhanden.</p>';
            }
        }
    } else {
        alert('Es gibt keine Statistikdaten, die zurückgesetzt werden können.');
    }
}

// --- Funktion zum Rendern eines Bons ---
function renderBon(bon, prepend = false) {
    const historyList = document.getElementById("history-list");

    const bonDiv = document.createElement("div");
    bonDiv.classList.add("bon-entry");

    const dateStr = bon.created_at ? new Date(bon.created_at).toLocaleString() : new Date().toLocaleString();

    bonDiv.innerHTML = `
        <strong>Bon #${bon.id}</strong> (${dateStr})<br>
        Summe: ${parseFloat(bon.totalAmount).toFixed(2)} €<br>
        <ul>
            ${bon.items.map(i => `<li>${i.quantity} × ${i.name} (${parseFloat(i.total).toFixed(2)} €)</li>`).join("")}
        </ul>
    `;

    if (prepend && historyList.firstChild) {
        historyList.insertBefore(bonDiv, historyList.firstChild);
    } else {
        historyList.appendChild(bonDiv);
    }
}

// --- Funktion zum Laden der letzten Bons aus der DB ---
async function loadRecentBons() {
    try {
        const guiParam = encodeURIComponent(window.currentGUI || '');
        const url = guiParam ? `${window.API_URL}/recent-bons?gui=${guiParam}` : `${window.API_URL}/recent-bons`;
        const response = await fetch(url);
        const bons = await response.json();

        const historyList = document.getElementById("history-list");
        historyList.innerHTML = "";

        if (!bons || bons.length === 0) {
            historyList.innerHTML = "<p>Keine Bons vorhanden.</p>";
            return;
        }

        // Sortiere absteigend nach ID und hole die 10 höchsten IDs (= neuesten Bons)
        const sortedBons = bons.sort((a, b) => b.id - a.id);
        const latestBons = sortedBons.slice(0, 10);

        // Render von neu (höchste ID) nach alt (niedrigste ID)
        latestBons.forEach(bon => renderBon(bon, false)); // prepend = false!
    } catch (err) {
        console.error("Fehler beim Laden der letzten Bons:", err);
    }
}


// --- Direkt beim Laden der Seite Historie aus DB holen ---
window.addEventListener("DOMContentLoaded", loadRecentBons);
