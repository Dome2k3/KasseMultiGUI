document.addEventListener("DOMContentLoaded", () => {
    // Setze das Datum auf heute beim Laden der Seite
    const today = new Date();
    const formattedDate = formatDate(today);
    document.getElementById("date").value = formattedDate;

    // Daten beim Laden der Seite abrufen
    fetchStatistics();

    // Event-Listener für den Filter-Button
    document.querySelector("button").addEventListener("click", filterStatistics);
});

function formatDate(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Monate sind 0-basiert
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
}

function formatDateForMySQL(date) {
    if (!date) return "";
    const [day, month, year] = date.split('.');
    return `${year}-${month}-${day}`;
}

function fetchStatistics(date = "", startTime = "", endTime = "") {
    let url = "http://192.168.0.187:3000/statistics";

    if (date) {
        const mysqlDate = formatDateForMySQL(date);
        url += `?date=${encodeURIComponent(mysqlDate)}`;
    }
    if (startTime && endTime) {
        if (!url.includes('?')) {
            url += '?';
        } else {
            url += '&';
        }
        url += `startTime=${encodeURIComponent(startTime)}&endTime=${encodeURIComponent(endTime)}`;
    }

    fetch(url)
        .then(response => response.json())
        .then(data => {
            updateBonStatsTable(data.bonStats);
            updateProductStatsTable(data.productStats);
            updateIntervalStatsTable(data.intervalStats);
            renderChart(data.bonStats);
        })
        .catch(error => console.error("Fehler beim Abrufen der Statistik:", error));
}

function updateBonStatsTable(bonStats) {
    const bonStatsTable = document.getElementById("bonStatsTable");
    if (!bonStatsTable) {
        console.error("Element with id 'bonStatsTable' not found");
        return;
    }
    bonStatsTable.innerHTML = ""; // Tabelle leeren

    bonStats.forEach(stat => {
        const totalRevenue = parseFloat(stat.total_revenue) || 0; // Falls total_revenue null oder undefined ist, setze es auf 0
        const avgBonValue = parseFloat(stat.avg_bon_value) || 0; // Falls avg_bon_value null oder undefined ist, setze es auf 0

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

    productStats.forEach(stat => {
        const totalRevenue = parseFloat(stat.total_revenue) || 0; // Falls total_revenue null oder undefined ist, setze es auf 0

        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${stat.product_name}</td>
            <td>${stat.total_sold}</td>
            <td>${totalRevenue.toFixed(2)}</td>
        `;
        productStatsTable.appendChild(row);
    });
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
    const date = document.getElementById("date").value;
    const startTime = document.getElementById("startTime").value;
    const endTime = document.getElementById("endTime").value;

    fetchStatistics(date, startTime, endTime);
}

function renderChart(bonStats) {
    const ctx = document.getElementById('salesChart').getContext('2d');

    const labels = bonStats.map(stat => formatDate(new Date(stat.date)));
    const data = bonStats.map(stat => parseFloat(stat.total_revenue) || 0);

    new Chart(ctx, {
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