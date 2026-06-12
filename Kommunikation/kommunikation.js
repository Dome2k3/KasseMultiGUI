const API_BASE = (window.API_URL || "").replace(/\/$/, "");
const ENDPOINT = `${API_BASE}/kommunikation/api/eintraege`;
const COPY_ENDPOINT = `${API_BASE}/kommunikation/api/jahr-kopieren`;
const REMINDER_DAYS = 14;
const DEFAULT_BODY = [
    "Hallo zusammen,",
    "",
    "bitte vormerken: Das BVT findet von Freitag bis Sonntag statt.",
    "",
    "Viele Gruesse",
    "Orga-Team"
].join("<br>");

let selectedId = null;
let editingId = null;
let items = [];

function formatDate(value) {
    if (!value) return "-";
    return new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    }).format(new Date(`${String(value).slice(0, 10)}T12:00:00`));
}

function dateOnly(value) {
    return value ? String(value).slice(0, 10) : "";
}

function statusLabel(status) {
    const labels = {
        draft: "Entwurf",
        review: "QS offen",
        ready: "Freigegeben",
        sent: "Gesendet",
        done: "Erledigt",
        cancelled: "Abgebrochen"
    };
    return labels[status] || status;
}

function sortedItems() {
    return [...items].sort((a, b) => String(a.sendDate || "").localeCompare(String(b.sendDate || "")));
}

function openItems() {
    return sortedItems().filter((item) => !["sent", "done", "cancelled"].includes(item.status));
}

function daysUntil(value) {
    const target = new Date(`${dateOnly(value)}T12:00:00`);
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function reminderItems() {
    return openItems().filter((item) => {
        const remaining = daysUntil(item.sendDate);
        return Number.isFinite(remaining) && remaining <= REMINDER_DAYS;
    });
}

async function loadItems() {
    setLoadingState("Lade Kommunikation aus der Datenbank ...");
    try {
        const response = await fetch(ENDPOINT);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        items = await response.json();
        if (selectedId && !items.some((item) => String(item.id) === String(selectedId))) {
            selectedId = null;
        }
        if (editingId && !items.some((item) => String(item.id) === String(editingId))) {
            resetFormMode();
        }
        render();
    } catch (error) {
        renderError(`Kommunikation konnte nicht geladen werden: ${error.message}`);
    }
}

function setLoadingState(message) {
    document.getElementById("mailList").innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
    document.getElementById("timeline").innerHTML = `<p>${escapeHtml(message)}</p>`;
    document.getElementById("nextSteps").innerHTML = "";
    document.getElementById("reminderList").innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function renderError(message) {
    document.getElementById("mailList").innerHTML = `<div class="empty-state error-state">${escapeHtml(message)}</div>`;
    document.getElementById("timeline").innerHTML = `<p>${escapeHtml(message)}</p>`;
    document.getElementById("previewBox").textContent = message;
}

function render() {
    renderEventHeader();
    renderKpis();
    renderNextSteps();
    renderReminders();
    renderTimeline();
    renderItems();
    renderPreview();
    renderEventOptions();
}

function renderEventHeader() {
    const first = sortedItems()[0];
    document.getElementById("eventNameTop").textContent = first?.eventName || "BVT Kommunikation";
    document.getElementById("eventDatesTop").textContent = first
        ? `${formatDate(first.eventStart)} - ${formatDate(first.eventEnd)}`
        : "-";
}

function renderKpis() {
    const mailItems = items.filter((item) => item.type === "mail");
    const openReview = mailItems.filter((item) => item.status === "review").length;
    const sent = mailItems.filter((item) => item.status === "sent").length;
    const next = openItems()[0];
    const reminders = reminderItems();

    document.getElementById("kpiTotal").textContent = items.length;
    document.getElementById("kpiReview").textContent = openReview;
    document.getElementById("kpiSent").textContent = sent;
    document.getElementById("kpiReminders").textContent = reminders.length;
    document.getElementById("kpiNextDate").textContent = next ? formatDate(next.sendDate) : "-";
    document.getElementById("kpiNextTitle").textContent = next ? next.title : "alles erledigt";
    document.getElementById("currentPhase").textContent = next ? next.title : "Turnierkommunikation abgeschlossen";
    document.getElementById("currentFocus").textContent = next
        ? `${next.type === "mail" ? "naechste Mail" : "naechster Meilenstein"} am ${formatDate(next.sendDate)}`
        : "keine offenen Punkte";
}

function renderNextSteps() {
    const nextSteps = openItems().slice(0, 5);
    document.getElementById("nextSteps").innerHTML = nextSteps.map((item) => `
        <li>
            <strong>${escapeHtml(item.title)}</strong>
            <small>${formatDate(item.sendDate)} · ${statusLabel(item.status)} · ${item.type === "mail" ? item.recipients.length + " Empfaenger" : "Platzhalter"}</small>
        </li>
    `).join("") || "<li><strong>Keine offenen Schritte</strong><small>Alles ist markiert als erledigt oder versendet.</small></li>";
}

function renderReminders() {
    const reminders = reminderItems().slice(0, 8);
    const reminderList = document.getElementById("reminderList");

    reminderList.innerHTML = reminders.map((item) => {
        const remaining = daysUntil(item.sendDate);
        const dueText = remaining < 0
            ? `${Math.abs(remaining)} Tage ueberfaellig`
            : remaining === 0
                ? "heute faellig"
                : `in ${remaining} Tagen faellig`;

        return `
            <article class="reminder-item ${remaining < 0 ? "overdue" : ""}">
                <strong>${escapeHtml(item.title)}</strong>
                <small>${dueText} · ${formatDate(item.sendDate)} · ${statusLabel(item.status)}</small>
            </article>
        `;
    }).join("") || "<div class=\"empty-state\">Keine Kommunikation innerhalb der naechsten 14 Tage faellig.</div>";
}

function renderTimeline() {
    const timeline = document.getElementById("timeline");
    const ordered = sortedItems();
    if (!ordered.length) {
        timeline.innerHTML = "<p>Keine Eintraege vorhanden.</p>";
        return;
    }

    const dates = ordered.map((item) => new Date(`${dateOnly(item.sendDate)}T12:00:00`).getTime());
    const minDate = Math.min(...dates);
    const maxDate = Math.max(...dates);
    const range = Math.max(maxDate - minDate, 1000 * 60 * 60 * 24);
    const marks = [0, 0.33, 0.66, 1].map((part) => {
        const date = new Date(minDate + range * part);
        return `<span>${formatDate(date.toISOString().slice(0, 10))}</span>`;
    }).join("");

    timeline.innerHTML = `
        <div class="timeline-scale"><span></span>${marks}</div>
        ${ordered.map((item) => {
            const itemDate = new Date(`${dateOnly(item.sendDate)}T12:00:00`).getTime();
            const left = Math.max(0, Math.min(96, ((itemDate - minDate) / range) * 96));
            const width = item.type === "mail" ? 14 : 7;
            return `
                <div class="timeline-row">
                    <div class="timeline-title">
                        <strong title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</strong>
                        <small>${formatDate(item.sendDate)} · ${item.type === "mail" ? "Mail" : "Meilenstein"}</small>
                    </div>
                    <div class="track">
                        <span class="bar ${item.type} ${item.status}" style="left:${left}%; width:${width}%;"></span>
                    </div>
                </div>
            `;
        }).join("")}
    `;
}

function renderItems() {
    const list = document.getElementById("mailList");
    list.innerHTML = sortedItems().map((item) => `
        <article class="mail-item ${String(item.id) === String(selectedId) ? "active" : ""}">
            <div>
                <h3>${escapeHtml(item.title)}</h3>
                <div class="meta-line">
                    <span>${formatDate(item.sendDate)}</span>
                    <span>${item.type === "mail" ? "Mail" : "Meilenstein"}</span>
                    <span>${escapeHtml(item.recipients.join(", ") || "keine Empfaenger")}</span>
                </div>
            </div>
            <div class="item-actions">
                <span class="badge ${item.status}">${statusLabel(item.status)}</span>
                <button class="icon-button" type="button" title="QS-Vorschau" data-select="${item.id}">QS</button>
                <button class="icon-button" type="button" title="Bearbeiten" data-edit="${item.id}">Edit</button>
                <button class="icon-button" type="button" title="Status weiter" data-advance="${item.id}">OK</button>
            </div>
        </article>
    `).join("") || "<div class=\"empty-state\">Noch keine Eintraege in der Datenbank.</div>";
}

function renderPreview() {
    const preview = document.getElementById("previewBox");
    const link = document.getElementById("mailtoLink");
    const item = items.find((entry) => String(entry.id) === String(selectedId) && entry.type === "mail");

    if (!item) {
        preview.textContent = "Waehle einen Mail-Eintrag aus, um die vorbereitete QS-Mail zu sehen.";
        link.href = "#";
        link.setAttribute("aria-disabled", "true");
        return;
    }

    const subject = `[QS BVT] ${item.subject || item.title}`;
    const plainBody = [
        "Bitte pruefen und danach an folgende Empfaenger weiterleiten:",
        item.recipients.join(", "),
        "",
        `Event: ${item.eventName}`,
        `Datum: ${formatDate(item.eventStart)} bis ${formatDate(item.eventEnd)}`,
        `Geplanter Versand: ${formatDate(item.sendDate)}`,
        "",
        "Mailtext:",
        stripHtml(item.bodyHtml || item.bodyText || "")
    ].join("\n");

    link.href = `mailto:${encodeURIComponent(item.metaEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(plainBody)}`;
    link.removeAttribute("aria-disabled");

    preview.innerHTML = `
        <strong>An QS-Adresse:</strong> ${escapeHtml(item.metaEmail)}<br>
        <strong>Nach Freigabe weiterleiten an:</strong> ${escapeHtml(item.recipients.join(", "))}<br>
        <strong>Betreff:</strong> ${escapeHtml(subject)}
        <code>${escapeHtml(plainBody)}</code>
        <strong>HTML-Text fuer spaeteren API-Versand:</strong>
        <div>${item.bodyHtml || escapeHtml(item.bodyText || "")}</div>
    `;
}

function renderEventOptions() {
    const names = [...new Set(items.map((item) => item.eventName).filter(Boolean))].sort();
    document.getElementById("eventNameOptions").innerHTML = names
        .map((name) => `<option value="${escapeHtml(name)}"></option>`)
        .join("");

    const source = document.getElementById("sourceEventName");
    if (!source.value && names.length) {
        source.value = names[names.length - 1];
    }
}

function stripHtml(html) {
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.textContent || div.innerText || "";
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function setFieldValue(id, value) {
    document.getElementById(id).value = value || "";
}

function payloadFromForm() {
    return {
        type: document.getElementById("entryType").value,
        eventName: document.getElementById("eventName").value.trim(),
        eventStart: document.getElementById("eventStart").value,
        eventEnd: document.getElementById("eventEnd").value,
        sendDate: document.getElementById("sendDate").value,
        title: document.getElementById("title").value.trim(),
        metaEmail: document.getElementById("metaEmail").value.trim(),
        recipients: document.getElementById("recipients").value
            .split(",")
            .map((mail) => mail.trim())
            .filter(Boolean),
        bodyHtml: document.getElementById("bodyHtml").innerHTML,
        bodyText: stripHtml(document.getElementById("bodyHtml").innerHTML),
        status: document.getElementById("status").value
    };
}

function fillForm(item) {
    editingId = item.id;
    selectedId = item.id;
    setFieldValue("entryType", item.type);
    setFieldValue("eventName", item.eventName);
    setFieldValue("eventStart", dateOnly(item.eventStart));
    setFieldValue("eventEnd", dateOnly(item.eventEnd));
    setFieldValue("sendDate", dateOnly(item.sendDate));
    setFieldValue("title", item.title);
    setFieldValue("metaEmail", item.metaEmail);
    setFieldValue("recipients", item.recipients.join(", "));
    setFieldValue("status", item.status);
    document.getElementById("bodyHtml").innerHTML = item.bodyHtml || escapeHtml(item.bodyText || "");
    document.getElementById("formTitle").textContent = "Eintrag bearbeiten";
    document.getElementById("saveEntryButton").textContent = "Aenderungen speichern";
    document.getElementById("cancelEditButton").classList.remove("hidden");
    document.getElementById("entryForm").scrollIntoView({ behavior: "smooth", block: "start" });
    render();
}

function resetFormMode() {
    editingId = null;
    document.getElementById("entryForm").reset();
    document.getElementById("bodyHtml").innerHTML = DEFAULT_BODY;
    document.getElementById("formTitle").textContent = "Mail oder Meilenstein anlegen";
    document.getElementById("saveEntryButton").textContent = "Eintrag speichern";
    document.getElementById("cancelEditButton").classList.add("hidden");
}

document.getElementById("entryForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = payloadFromForm();
    const url = editingId ? `${ENDPOINT}/${editingId}` : ENDPOINT;
    const method = editingId ? "PUT" : "POST";

    try {
        const response = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();
        selectedId = editingId || (payload.type === "mail" ? result.id : selectedId);
        resetFormMode();
        setFieldValue("eventName", payload.eventName);
        setFieldValue("eventStart", payload.eventStart);
        setFieldValue("eventEnd", payload.eventEnd);
        setFieldValue("metaEmail", payload.metaEmail);
        await loadItems();
    } catch (error) {
        renderError(`Eintrag konnte nicht gespeichert werden: ${error.message}`);
    }
});

document.getElementById("mailList").addEventListener("click", async (event) => {
    const selectButton = event.target.closest("[data-select]");
    const editButton = event.target.closest("[data-edit]");
    const advanceButton = event.target.closest("[data-advance]");

    if (selectButton) {
        selectedId = selectButton.dataset.select;
        render();
    }

    if (editButton) {
        const item = items.find((entry) => String(entry.id) === String(editButton.dataset.edit));
        if (item) fillForm(item);
    }

    if (advanceButton) {
        const item = items.find((entry) => String(entry.id) === String(advanceButton.dataset.advance));
        if (!item) return;
        const flow = ["draft", "review", "ready", "sent", "done"];
        const current = flow.indexOf(item.status);
        const nextStatus = flow[Math.min(Math.max(current, 0) + 1, flow.length - 1)];

        try {
            const response = await fetch(`${ENDPOINT}/${item.id}/status`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: nextStatus })
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            await loadItems();
        } catch (error) {
            renderError(`Status konnte nicht gespeichert werden: ${error.message}`);
        }
    }
});

document.getElementById("copyYearForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const copyStatus = document.getElementById("copyStatus");
    const payload = {
        sourceEventName: document.getElementById("sourceEventName").value.trim(),
        targetEventName: document.getElementById("targetEventName").value.trim(),
        targetEventStart: document.getElementById("targetEventStart").value,
        targetEventEnd: document.getElementById("targetEventEnd").value
    };

    copyStatus.textContent = "Kopiere Eintraege ...";
    try {
        const response = await fetch(COPY_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();
        copyStatus.textContent = `${result.inserted} Eintraege kopiert, ${result.skipped} vorhandene uebersprungen.`;
        await loadItems();
    } catch (error) {
        copyStatus.textContent = `Kopieren fehlgeschlagen: ${error.message}`;
    }
});

document.querySelector(".rich-toolbar").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;

    if (button.dataset.command) {
        document.execCommand(button.dataset.command, false, null);
    }

    if (button.dataset.smiley) {
        document.execCommand("insertText", false, button.dataset.smiley);
    }

    document.getElementById("bodyHtml").focus();
});

document.getElementById("reloadData").addEventListener("click", loadItems);
document.getElementById("cancelEditButton").addEventListener("click", resetFormMode);

document.getElementById("exportJson").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(items, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "bvt-kommunikation.json";
    link.click();
    URL.revokeObjectURL(url);
});

loadItems();
setInterval(loadItems, 15 * 60 * 1000);
