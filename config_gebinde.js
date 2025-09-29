document.addEventListener("DOMContentLoaded", function () {
    const tableBody = document.querySelector("#gebindeTable tbody");
    const form = document.getElementById("editForm");
    const resetBtn = document.getElementById("resetBtn");
    const message = document.getElementById("message");

    let gebindeData = [];
    let currentSort = { key: "produkt_name", asc: true };

    // Laden & Rendern
    function loadGebinde() {
        fetch(window.API_URL + '/config-gebinde')
            .then(res => res.json())
            .then(data => {
                gebindeData = data;
                renderTable();
            });
    }


    // Schönes Datumsformat
    function formatDateTime(ts) {
        if (!ts) return "";
        const d = new Date(ts);
        return d.getFullYear() + "-"
            + String(d.getMonth()+1).padStart(2,"0") + "-"
            + String(d.getDate()).padStart(2,"0") + " "
            + String(d.getHours()).padStart(2,"0") + ":"
            + String(d.getMinutes()).padStart(2,"0") + ":"
            + String(d.getSeconds()).padStart(2,"0");
    }

    function formatDateTime(ts) {
        if (!ts) return "";
        const d = new Date(ts);
        // YYYY-MM-DD HH:MM:SS
        return d.getFullYear() + "-"
            + String(d.getMonth()+1).padStart(2,"0") + "-"
            + String(d.getDate()).padStart(2,"0") + " "
            + String(d.getHours()).padStart(2,"0") + ":"
            + String(d.getMinutes()).padStart(2,"0") + ":"
            + String(d.getSeconds()).padStart(2,"0");
    }

    function renderTable() {
        // Sortieren
        const key = currentSort.key;
        const asc = currentSort.asc;
        const sorted = [...gebindeData].sort((a, b) => {
            if (a[key] === undefined || b[key] === undefined) return 0;
            if (typeof a[key] === "number") return asc ? a[key] - b[key] : b[key] - a[key];
            return asc ? String(a[key]).localeCompare(String(b[key])) : String(b[key]).localeCompare(String(a[key]));
        });

        tableBody.innerHTML = "";
        sorted.forEach(item => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
            <td>${item.produkt_name}</td>
            <td>${item.gebinde_groesse}</td>
            <td>${formatDateTime(item.created_at)}</td>
            <td>${formatDateTime(item.updated_at)}</td>
            <td><button data-id="${item.id}" class="pretty-btn editBtn">Bearbeiten</button></td>
            <td><button data-id="${item.id}" class="pretty-btn delBtn">Löschen</button></td>
        `;
            tableBody.appendChild(tr);
        });
    }

    // Initial laden
    loadGebinde();

    // Neu/Editieren
    form.onsubmit = function (e) {
        e.preventDefault();
        const id = form.gebinde_id.value;
        const body = {
            produkt_name: form.produkt_name.value,
            gebinde_groesse: parseInt(form.gebinde_groesse.value, 10)
        };
        let url = window.API_URL + "/config-gebinde";
        let method = "POST";
        if (id) {
            url += "/" + id;
            method = "PUT";
        }
        fetch(url, {
            method: method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        })
            .then(res => res.json())
            .then(res => {
                message.textContent = res.success ? "Gespeichert!" : res.error;
                form.reset();
                loadGebinde();
                setTimeout(() => { message.textContent = ""; }, 2500);
            });
    };

    // Reset
    resetBtn.onclick = function () {
        form.reset();
        message.textContent = "";
    };

    // Editieren/Löschen
    tableBody.onclick = function (e) {
        if (e.target.classList.contains("editBtn")) {
            const id = e.target.dataset.id;
            fetch(window.API_URL + "/config-gebinde/" + id)
                .then(res => res.json())
                .then(item => {
                    form.gebinde_id.value = item.id;
                    form.produkt_name.value = item.produkt_name;
                    form.gebinde_groesse.value = item.gebinde_groesse;
                    form.scrollIntoView({ behavior: "smooth" });
                });
        }
        if (e.target.classList.contains("delBtn")) {
            const id = e.target.dataset.id;
            if (confirm("Wirklich löschen?")) {
                fetch(window.API_URL + "/config-gebinde/" + id, { method: "DELETE" })
                    .then(res => res.json())
                    .then(res => {
                        message.textContent = res.success ? "Gelöscht!" : res.error;
                        loadGebinde();
                        setTimeout(() => { message.textContent = ""; }, 2500);
                    });
            }
        }
    };

    // Sortierfunktion für Tabellenüberschriften
    document.querySelectorAll(".sortable-header").forEach(th => {
        th.addEventListener("click", function () {
            const key = th.dataset.sort;
            if (currentSort.key === key) {
                currentSort.asc = !currentSort.asc;
            } else {
                currentSort.key = key;
                currentSort.asc = true;
            }
            renderTable();
        });
    });
});