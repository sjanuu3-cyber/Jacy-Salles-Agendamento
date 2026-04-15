const bookingForm = document.getElementById("bookingForm");
const dateInput = document.getElementById("date");
const timeSelect = document.getElementById("time");
const availabilityMessage = document.getElementById("availabilityMessage");
const bookingFeedback = document.getElementById("bookingFeedback");
const totalAmount = document.getElementById("totalAmount");
const notesInput = document.getElementById("notes");
const serviceCheckboxes = document.querySelectorAll('input[name="service"]');

const loginBox = document.getElementById("loginBox");
const loginForm = document.getElementById("loginForm");
const authMessage = document.getElementById("authMessage");
const logoutButton = document.getElementById("logoutButton");
const managerPanel = document.getElementById("managerPanel");
const manageDate = document.getElementById("manageDate");
const manageMessage = document.getElementById("manageMessage");
const bookingList = document.getElementById("bookingList");

const STATUS_LABELS = {
    pending: "Agendado",
    completed: "Finalizado",
    cancelled: "Cancelado"
};

const WHATSAPP_NUMBER = "5575981754628";
const WHATSAPP_EMOJIS = {
    butterfly: "\u{1F98B}",
    person: "\u{1F464}",
    phone: "\u{1F4F1}",
    date: "\u{1F4C5}",
    time: "\u{1F550}",
    services: "\u{1F485}",
    total: "\u{1F4B0}",
    notes: "\u{1F4DD}"
};

let adminAuthenticated = false;

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function formatCurrencyBRL(value) {
    return `R$ ${Number(value || 0).toFixed(2).replace(".", ",")}`;
}

function formatDateBR(dateValue) {
    if (!dateValue) {
        return "";
    }

    const [year, month, day] = dateValue.split("-");

    if (!year || !month || !day) {
        return dateValue;
    }

    return `${day}/${month}/${year}`;
}

function setTimePlaceholder(message) {
    timeSelect.innerHTML = `<option value="">${escapeHTML(message)}</option>`;
    timeSelect.disabled = true;
}

function showBookingFeedback(message, isError = false) {
    bookingFeedback.hidden = !message;
    bookingFeedback.textContent = message;
    bookingFeedback.classList.toggle("error", Boolean(message) && isError);
    bookingFeedback.classList.toggle("success", Boolean(message) && !isError);
}

function updateTotal() {
    const total = [...serviceCheckboxes].reduce((sum, checkbox) => {
        return checkbox.checked ? sum + Number(checkbox.value) : sum;
    }, 0);

    totalAmount.textContent = formatCurrencyBRL(total);
}

function buildWhatsAppMessage(body) {
    const servicesText = body.services.map(service => `* ${service.name}`).join("\n");

    let message = `${WHATSAPP_EMOJIS.butterfly} *Novo agendamento - Jacy Sallys* ${WHATSAPP_EMOJIS.butterfly}

${WHATSAPP_EMOJIS.person} Nome: ${body.name}
${WHATSAPP_EMOJIS.phone} Telefone: ${body.phone}
${WHATSAPP_EMOJIS.date} Data: ${formatDateBR(body.date)}
${WHATSAPP_EMOJIS.time} Horario: ${body.time}

${WHATSAPP_EMOJIS.services} Servicos:
${servicesText}

${WHATSAPP_EMOJIS.total} Total: ${body.total}`;

    if (body.notes) {
        message += `\n\n${WHATSAPP_EMOJIS.notes} Observacoes:\n${body.notes}`;
    }

    return message;
}

function prepareWhatsAppWindow(whatsappWindow) {
    if (!whatsappWindow || whatsappWindow.closed) {
        return;
    }

    try {
        whatsappWindow.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>Abrindo WhatsApp...</title>
</head>
<body style="margin:0;font-family:Arial,sans-serif;background:#f6efe9;color:#5f3f37;display:grid;place-items:center;min-height:100vh;">
    <div style="text-align:center;padding:32px;">
        <p style="font-size:18px;font-weight:bold;margin:0 0 12px;">Abrindo WhatsApp...</p>
        <p style="margin:0;">Estamos preparando a mensagem do agendamento.</p>
    </div>
</body>
</html>`);
        whatsappWindow.document.close();
    } catch {
        // Ignore cross-origin or popup rendering issues.
    }
}

function openWhatsApp(whatsappMessage, whatsappWindow) {
    const encodedMessage = encodeURIComponent(whatsappMessage);
    const appUrl = `whatsapp://send?phone=${WHATSAPP_NUMBER}&text=${encodedMessage}`;
    const webUrl = `https://api.whatsapp.com/send?phone=${WHATSAPP_NUMBER}&text=${encodedMessage}`;

    let fallbackTimer = null;

    const cancelFallback = () => {
        if (fallbackTimer) {
            clearTimeout(fallbackTimer);
            fallbackTimer = null;
        }

        window.removeEventListener("blur", cancelFallback);
        document.removeEventListener("visibilitychange", handleVisibilityChange);
    };

    const handleVisibilityChange = () => {
        if (document.hidden) {
            cancelFallback();
        }
    };

    window.addEventListener("blur", cancelFallback, { once: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);

    fallbackTimer = setTimeout(() => {
        if (whatsappWindow && !whatsappWindow.closed) {
            whatsappWindow.location.replace(webUrl);
        } else {
            window.location.href = webUrl;
        }

        cancelFallback();
    }, 1200);

    if (whatsappWindow && !whatsappWindow.closed) {
        whatsappWindow.location.replace(appUrl);
        return;
    }

    window.location.href = appUrl;
}

function setAdminState(authenticated) {
    adminAuthenticated = authenticated;
    loginBox.hidden = authenticated;
    managerPanel.hidden = !authenticated;
    logoutButton.hidden = !authenticated;

    if (!authenticated) {
        bookingList.innerHTML = "";
        manageMessage.textContent = "Entre para visualizar os agendamentos.";
        return;
    }

    authMessage.textContent = "";

    if (!manageDate.value && dateInput.value) {
        manageDate.value = dateInput.value;
    }

    manageMessage.textContent = manageDate.value
        ? "Selecione uma data para atualizar a lista de agendamentos."
        : "Escolha uma data para carregar os agendamentos.";
}

function handleSessionExpired() {
    setAdminState(false);
    authMessage.textContent = "Sua sessao expirou. Entre novamente.";
}

async function checkAdminSession() {
    try {
        const response = await fetch("/api/admin/session");
        const data = await response.json();

        setAdminState(Boolean(data.authenticated));

        if (data.authenticated && manageDate.value) {
            await loadBookings();
        }
    } catch {
        setAdminState(false);
        authMessage.textContent = "Nao foi possivel verificar o login do admin.";
    }
}

async function loadAvailability(date) {
    if (!date) {
        setTimePlaceholder("Escolha primeiro uma data");
        availabilityMessage.textContent = "Escolha uma data para ver os horarios disponiveis.";
        return;
    }

    availabilityMessage.textContent = "Carregando horarios...";

    try {
        const response = await fetch(`/api/availability?date=${encodeURIComponent(date)}`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Erro ao carregar horarios");
        }

        timeSelect.innerHTML = "";

        if (!data.available.length) {
            setTimePlaceholder("Sem horarios disponiveis");
            availabilityMessage.textContent = `Sem horarios disponiveis para ${data.weekdayLabel} (${data.formattedDate}).`;
            return;
        }

        timeSelect.disabled = false;
        timeSelect.innerHTML = '<option value="">Selecione um horario</option>';

        data.available.forEach(time => {
            const option = document.createElement("option");
            option.value = time;
            option.textContent = time;
            timeSelect.appendChild(option);
        });

        availabilityMessage.textContent = `${data.weekdayLabel} com ${data.available.length} horario(s) disponivel(is) em ${data.formattedDate}.`;
    } catch (error) {
        setTimePlaceholder("Nao foi possivel carregar");
        availabilityMessage.textContent = error.message || "Erro ao carregar horarios.";
    }
}

function renderActionButtons(booking) {
    if (booking.status !== "pending") {
        return "<p class=\"booking-hint\">Status atualizado pelo administrador.</p>";
    }

    return `
        <div class="booking-actions">
            <button type="button" class="success-button" data-action="complete" data-booking-id="${escapeHTML(booking.id)}">Finalizar</button>
            <button type="button" class="danger-button" data-action="cancel" data-booking-id="${escapeHTML(booking.id)}">Cancelar</button>
        </div>
    `;
}

function renderBookingList(bookings) {
    bookingList.innerHTML = "";

    if (!bookings.length) {
        bookingList.innerHTML = '<div class="empty-state">Nenhum agendamento encontrado para a data selecionada.</div>';
        return;
    }

    bookings.forEach(booking => {
        const servicesText = Array.isArray(booking.services) && booking.services.length
            ? booking.services.map(service => service.name).join(", ")
            : "Sem servicos informados";

        const article = document.createElement("article");
        article.className = `booking-item ${booking.status}`;
        article.innerHTML = `
            <div class="booking-header">
                <div>
                    <p class="booking-time">${escapeHTML(booking.time)}</p>
                    <p class="booking-name">${escapeHTML(booking.name || "Cliente sem nome")}</p>
                </div>
                <span class="status-badge ${escapeHTML(booking.status)}">${escapeHTML(STATUS_LABELS[booking.status] || "Agendado")}</span>
            </div>
            <p class="booking-meta">${escapeHTML(booking.phone || "Sem telefone informado")}</p>
            <p class="booking-meta">${escapeHTML(servicesText)}</p>
            ${booking.total ? `<p class="booking-meta">Total: ${escapeHTML(booking.total)}</p>` : ""}
            ${booking.notes ? `<p class="booking-notes">${escapeHTML(booking.notes)}</p>` : ""}
            ${renderActionButtons(booking)}
        `;

        bookingList.appendChild(article);
    });
}

async function loadBookings() {
    if (!adminAuthenticated) {
        return;
    }

    const date = manageDate.value;

    if (!date) {
        bookingList.innerHTML = "";
        manageMessage.textContent = "Escolha uma data para carregar os agendamentos.";
        return;
    }

    manageMessage.textContent = "Carregando agendamentos...";
    bookingList.innerHTML = "";

    try {
        const response = await fetch(`/api/bookings?date=${encodeURIComponent(date)}`);
        const data = await response.json();

        if (response.status === 401) {
            handleSessionExpired();
            return;
        }

        if (!response.ok) {
            throw new Error(data.error || "Erro ao carregar agendamentos");
        }

        manageMessage.textContent = data.message;
        renderBookingList(data.bookings);
    } catch (error) {
        bookingList.innerHTML = "";
        manageMessage.textContent = error.message || "Nao foi possivel carregar os agendamentos.";
    }
}

async function updateBookingStatus(bookingId, status) {
    const actionLabel = status === "completed" ? "finalizar" : "cancelar";

    if (!window.confirm(`Deseja realmente ${actionLabel} este agendamento?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/bookings/${bookingId}/status`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ status })
        });

        const data = await response.json();

        if (response.status === 401) {
            handleSessionExpired();
            return;
        }

        if (!response.ok) {
            throw new Error(data.error || "Nao foi possivel atualizar o agendamento");
        }

        await loadBookings();

        if (dateInput.value === data.booking.date || manageDate.value === data.booking.date) {
            await loadAvailability(data.booking.date);
        }
    } catch (error) {
        manageMessage.textContent = error.message || "Nao foi possivel atualizar o agendamento.";
    }
}

async function handleLogin(event) {
    event.preventDefault();
    authMessage.textContent = "Validando acesso...";

    try {
        const user = document.getElementById("user").value.trim();
        const pass = document.getElementById("pass").value;

        const response = await fetch("/api/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ user, pass })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Login invalido");
        }

        setAdminState(true);

        if (manageDate.value) {
            await loadBookings();
        }
    } catch (error) {
        authMessage.textContent = error.message || "Nao foi possivel fazer login.";
    }
}

async function handleLogout() {
    try {
        await fetch("/api/logout", { method: "POST" });
    } finally {
        setAdminState(false);
        loginForm.reset();
        authMessage.textContent = "Sessao encerrada.";
    }
}

async function handleBookingSubmit(event) {
    event.preventDefault();
    showBookingFeedback("");

    const services = [...serviceCheckboxes]
        .filter(checkbox => checkbox.checked)
        .map(checkbox => ({
            name: checkbox.dataset.name,
            price: Number(checkbox.value)
        }));

    const body = {
        name: document.getElementById("name").value.trim(),
        phone: document.getElementById("phone").value.trim(),
        date: dateInput.value,
        time: timeSelect.value,
        services,
        total: totalAmount.textContent,
        notes: notesInput.value.trim()
    };

    if (!body.name) {
        showBookingFeedback("Digite o nome da cliente.", true);
        return;
    }

    if (!body.phone) {
        showBookingFeedback("Digite o telefone ou WhatsApp da cliente.", true);
        return;
    }

    if (!body.date) {
        showBookingFeedback("Escolha uma data para o agendamento.", true);
        return;
    }

    if (!body.time) {
        showBookingFeedback("Escolha um horario disponivel.", true);
        return;
    }

    if (!body.services.length) {
        showBookingFeedback("Selecione pelo menos um servico.", true);
        return;
    }

    const whatsappWindow = window.open("", "_blank");

    prepareWhatsAppWindow(whatsappWindow);

    try {
        const response = await fetch("/api/bookings", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (response.status === 409) {
            if (whatsappWindow) {
                whatsappWindow.close();
            }

            showBookingFeedback("Este horario ja foi reservado. Escolha outro horario.", true);
            await loadAvailability(body.date);
            return;
        }

        if (!response.ok) {
            throw new Error(data.error || "Nao foi possivel salvar o agendamento");
        }

        const whatsappMessage = buildWhatsAppMessage(body);
        openWhatsApp(whatsappMessage, whatsappWindow);

        showBookingFeedback("Agendamento salvo com sucesso. A mensagem do WhatsApp foi preparada.");
        bookingForm.reset();
        dateInput.value = body.date;
        updateTotal();
        await loadAvailability(body.date);

        if (adminAuthenticated && manageDate.value === body.date) {
            await loadBookings();
        }
    } catch (error) {
        if (whatsappWindow) {
            whatsappWindow.close();
        }

        showBookingFeedback(error.message || "Nao foi possivel salvar o agendamento.", true);
    }
}

loginForm.addEventListener("submit", handleLogin);
logoutButton.addEventListener("click", handleLogout);
manageDate.addEventListener("change", loadBookings);
dateInput.addEventListener("change", () => loadAvailability(dateInput.value));
bookingForm.addEventListener("submit", handleBookingSubmit);

serviceCheckboxes.forEach(checkbox => {
    checkbox.addEventListener("change", updateTotal);
});

bookingList.addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");

    if (!button) {
        return;
    }

    const { action, bookingId } = button.dataset;

    if (action === "complete") {
        updateBookingStatus(bookingId, "completed");
    }

    if (action === "cancel") {
        updateBookingStatus(bookingId, "cancelled");
    }
});

setTimePlaceholder("Escolha primeiro uma data");
availabilityMessage.textContent = "Escolha uma data para ver os horarios disponiveis.";
manageMessage.textContent = "Entre para visualizar os agendamentos.";
updateTotal();
checkAdminSession();
