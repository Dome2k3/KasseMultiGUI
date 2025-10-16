document.addEventListener("DOMContentLoaded", () => {
    // Setze das Datum auf heute beim Laden der Seite (ISO Format für Input-Feld)
    const today = new Date();
    const formattedDate = today.toISOString().split('T')[0]; // YYYY-MM-DD
    const dateInput = document.getElementById("date");
    if (dateInput) dateInput.value = formattedDate;

    // Daten beim Laden der Seite abrufen (inkl. evtl. gewählter Kategorie)
    const initialCategory = document.getElementById("category")?.value || "";
    fetchStatistics("", "", "", initialCategory);

    // Event-Listener für den Filter-Button: Event-Delegation am Container (robuster)
    const filterContainer = document.querySelector(".filter-container");
    if (filterContainer) {
        filterContainer.addEventListener("click", (e) => {
            const target = e.target;
            if (target && target.tagName === "BUTTON") {
                // explizit den richtigen Button erwischen: falls weitere Buttons im Container sind, man kann hier ggf. eine ID oder class prüfen
                // z.B. if (target.id === 'applyFilterBtn') ...
                filterStatistics();
            }
        });
    } else {
        // Fallback: Versuch, direkt den Button zu binden
        const btn = document.querySelector(".filter-container button");
        if (btn) btn.addEventListener("click", filterStatistics);
    }

    // E-Mail Button initialisieren
    const sendStatsMailBtn = document.getElementById("sendStatsMailBtn");
    if (sendStatsMailBtn) {
        sendStatsMailBtn.addEventListener("click", openMailModal);
    }
    setupMailModal();
});

function formatDate(date) {
    // Erwartet ein Date-Objekt!
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
}

function formatDateForMySQL(date) {
    // Das Feld liefert nun immer YYYY-MM-DD
    return date;
}

function fetchStatistics(date = "", startTime = "", endTime = "", category = "") {
    // Verwende URL & URLSearchParams für korrekten Query-Build
    const base = `${window.API_URL}/statistics`;
    const url = new URL(base, window.location.origin);

    if (date) {
        const mysqlDate = formatDateForMySQL(date);
        url.searchParams.set("date", mysqlDate);
    }
    if (startTime) url.searchParams.set("startTime", startTime);
    if (endTime) url.searchParams.set("endTime", endTime);
    if (category) url.searchParams.set("category", category);

    fetch(url.toString())
        .then(response => response.json())
        .then(data => {
            console.log("Response data:", data); // Debug!
            if (data.error) {
                console.error("API-Fehler:", data.error);
                return;
            }
            if (!data.bonStats || !Array.isArray(data.bonStats)) {
                console.error("Keine gültigen bonStats erhalten:", data);
                return;
            }
            updateBonStatsTable(data.bonStats);
            updateProductStatsTable(data.productStats || []);
            updateIntervalStatsTable(data.intervalStats || []);
            updateCategoryStatsTable(data.categoryStats || []);
            renderChart(data.bonStats);
        })
        .catch(error => console.error("Fehler beim Abrufen der Statistik:", error));
}

function updateCategoryStatsTable(categoryStats) {
    const categoryStatsTable = document.getElementById("categoryStatsTable");
    if (!categoryStatsTable) {
        console.error("Element with id 'categoryStatsTable' not found");
        return;
    }
    categoryStatsTable.innerHTML = ""; // Tabelle leeren

    categoryStats.forEach(stat => {
        const totalRevenue = parseFloat(stat.total_revenue) || 0;
        const avgBonValue = parseFloat(stat.avg_bon_value) || 0;

        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${stat.category}</td>
            <td>${stat.total_bons}</td>
            <td>${totalRevenue.toFixed(2)}</td>
            <td>${avgBonValue.toFixed(2)}</td>
        `;
        categoryStatsTable.appendChild(row);
    });
}

function updateBonStatsTable(bonStats) {
    const bonStatsTable = document.getElementById("bonStatsTable");
    if (!bonStatsTable) {
        console.error("Element with id 'bonStatsTable' not found");
        return;
    }
    bonStatsTable.innerHTML = ""; // Tabelle leeren

    bonStats.forEach(stat => {
        const totalRevenue = parseFloat(stat.total_revenue) || 0;
        const avgBonValue = parseFloat(stat.avg_bon_value) || 0;

        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${formatDate(new Date(stat.date))}</td>
            <td>${stat.total_bons}</td>
            <td>${totalRevenue.toFixed(2)}</td>
            <td>${avgBonValue.toFixed(2)}</td>
        `;
        bonStatsTable.appendChild(row);
    });
}

function updateProductStatsTable(productStats) {
    const productStatsTable = document.getElementById("productStatsTable");
    if (!productStatsTable) {
        console.error("Element with id 'productStatsTable' not found");
        return;
    }
    productStatsTable.innerHTML = ""; // Tabelle leeren

    for (let i = 0; i < productStats.length; i += 2) {
        const stat1 = productStats[i];
        const stat2 = productStats[i + 1];

        const totalRevenue1 = parseFloat(stat1?.total_revenue) || 0;
        const totalRevenue2 = parseFloat(stat2?.total_revenue) || 0;

        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${stat1?.product_name || ""}</td>
            <td>${stat1?.total_sold || ""}</td>
            <td>${stat1 ? totalRevenue1.toFixed(2) : ""}</td>
            <td>${stat2?.product_name || ""}</td>
            <td>${stat2?.total_sold || ""}</td>
            <td>${stat2 ? totalRevenue2.toFixed(2) : ""}</td>
        `;
        productStatsTable.appendChild(row);
    }
}

function updateIntervalStatsTable(intervalStats) {
    const intervalStatsTable = document.getElementById("intervalStatsTable");
    if (!intervalStatsTable) {
        console.error("Element with id 'intervalStatsTable' not found");
        return;
    }
    intervalStatsTable.innerHTML = ""; // Tabelle leeren

    intervalStats.forEach(stat => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${stat.interval}</td>
            <td>${stat.product_name}</td>
            <td>${stat.total_sold}</td>
        `;
        intervalStatsTable.appendChild(row);
    });
}

function filterStatistics() {
    const date = document.getElementById("date")?.value || "";
    const startTime = document.getElementById("startTime")?.value || "";
    const endTime = document.getElementById("endTime")?.value || "";
    const category = document.getElementById("category")?.value || "";

    fetchStatistics(date, startTime, endTime, category);
}

let salesChartInstance = null; // Globale Variable für Chart-Instanz

function renderChart(bonStats) {
    const canvas = document.getElementById('salesChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Vorherigen Chart zerstören, falls vorhanden
    if (salesChartInstance) {
        salesChartInstance.destroy();
    }

    const labels = bonStats.map(stat => formatDate(new Date(stat.date)));
    const data = bonStats.map(stat => parseFloat(stat.total_revenue) || 0);

    salesChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Gesamtumsatz (€)',
                data: data,
                borderColor: 'rgba(75, 192, 192, 1)',
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                fill: true,
                tension: 0.1
            }]
        },
        options: {
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Datum'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Gesamtumsatz (€)'
                    },
                    beginAtZero: true
                }
            }
        }
    });
}

// --- E-Mail-Dialog, Speicherung, Versand ---
function openMailModal() {
    const modal = document.getElementById("mailModal");
    const emailInput = document.getElementById("emailInput");
    const mailStatusMsg = document.getElementById("mailStatusMsg");
    if (mailStatusMsg) mailStatusMsg.textContent = "";
    // Lade Standard-Mailadresse
    if (emailInput) emailInput.value = localStorage.getItem("statsEmail") || "";
    if (modal) {
        modal.style.display = "flex";
        emailInput?.focus();
    }
}

function setupMailModal() {
    // Schließen mit X oder außen klicken
    const closeBtn = document.getElementById("closeMailModal");
    if (closeBtn) closeBtn.onclick = () => {
        const modal = document.getElementById("mailModal");
        if (modal) modal.style.display = "none";
    };
    // ESC schließt auch
    document.addEventListener("keydown", function(evt) {
        if (evt.key === "Escape") {
            const modal = document.getElementById("mailModal");
            if (modal) modal.style.display = "none";
        }
    });
    // Modal-Formular-Submit
    const mailForm = document.getElementById("mailForm");
    if (mailForm) {
        mailForm.onsubmit = async function(evt) {
            evt.preventDefault();
            const email = document.getElementById("emailInput")?.value.trim();
            if (!email) return;
            localStorage.setItem("statsEmail", email); // als Standard speichern

            // Hole aktuelle Filter
            const date = document.getElementById("date")?.value;
            const startTime = document.getElementById("startTime")?.value;
            const endTime = document.getElementById("endTime")?.value;
            const category = document.getElementById("category")?.value || "";

            // UI Feedback
            const msgDiv = document.getElementById("mailStatusMsg");
            if (msgDiv) {
                msgDiv.style.color = "#007b00";
                msgDiv.textContent = "Versand läuft ...";
            }

            try {
                const res = await fetch(`${window.API_URL}/send-statistics-email`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, date, startTime, endTime, category })
                });
                const data = await res.json();
                if (msgDiv) {
                    if (data.success) {
                        msgDiv.textContent = "E-Mail erfolgreich versendet!";
                        msgDiv.style.color = "#007b00";
                    } else {
                        msgDiv.textContent = "Fehler beim Versand: " + (data.message || "Unbekannter Fehler");
                        msgDiv.style.color = "#c00";
                    }
                }
            } catch (err) {
                if (msgDiv) {
                    msgDiv.textContent = "Fehler beim Versand: " + err.message;
                    msgDiv.style.color = "#c00";
                }
            }
        };
    }
    // Modal bei Klick außerhalb schließen
    const mailModal = document.getElementById("mailModal");
    if (mailModal) {
        mailModal.onclick = function(e) {
            if (e.target === this) this.style.display = "none";
        };
    }
}