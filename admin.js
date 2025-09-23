// Setzt das heutige Datum im Datumsfeld
function setToday() {
    const today = new Date();
    const iso = today.toISOString().split('T')[0];
    document.getElementById("dateInput").value = iso;
}

// Holt Mail aus localStorage oder lässt leer
function loadEmail() {
    document.getElementById("emailInput").value = localStorage.getItem("statsEmail") || "";
}

document.addEventListener("DOMContentLoaded", () => {
    setToday();
    loadEmail();

    document.getElementById("sendStatsMailBtn").addEventListener("click", async function(evt) {
        evt.preventDefault();
        const date = document.getElementById("dateInput").value;
        const email = document.getElementById("emailInput").value.trim();
        const msgDiv = document.getElementById("mailStatusMsg");
        msgDiv.style.color = "#222";
        msgDiv.textContent = "";

        if (!date || !email) {
            msgDiv.textContent = "Bitte Datum und E-Mail angeben!";
            msgDiv.style.color = "#c00";
            return;
        }

        // Merke E-Mail für später
        localStorage.setItem("statsEmail", email);

        msgDiv.textContent = "Versand läuft ...";
        msgDiv.style.color = "#007b00";

        try {
            const res = await fetch(`${window.API_URL}/send-statistics-email`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, date })
            });
            const data = await res.json();
            if (data.success) {
                msgDiv.textContent = "E-Mail erfolgreich gesendet!";
                msgDiv.style.color = "#007b00";
            } else {
                msgDiv.textContent = "Fehler beim Versand: " + (data.message || "Unbekannter Fehler");
                msgDiv.style.color = "#c00";
            }
        } catch (err) {
            msgDiv.textContent = "Fehler beim Versand: " + err.message;
            msgDiv.style.color = "#c00";
        }
    });
});