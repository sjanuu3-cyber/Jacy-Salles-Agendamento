const bookingForm = document.getElementById("bookingForm");
const dateInput = document.getElementById("date");
const timeSelect = document.getElementById("time");
const availabilityMessage = document.getElementById("availabilityMessage");
const feedbackMessage = document.getElementById("feedbackMessage");
const totalAmount = document.getElementById("totalAmount");
const submitButton = document.getElementById("submitButton");
const serviceCheckboxes = Array.from(document.querySelectorAll('input[name="service"]'));

function getTodayAsInputValue() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function parseInputDate(value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
}

function formatDate(value) {
    return parseInputDate(value).toLocaleDateString("pt-BR");
}

function setFeedback(message, type) {
    feedbackMessage.hidden = false;
    feedbackMessage.textContent = message;
    feedbackMessage.className = `feedback feedback-${type}`;
}

function clearFeedback() {
    feedbackMessage.hidden = true;
    feedbackMessage.textContent = "";
    feedbackMessage.className = "feedback";
}

function updateTotal() {
    let total = 0;

    serviceCheckboxes.forEach((checkbox) => {
        if (checkbox.checked) {
            total += Number(checkbox.value);
        }
    });

    totalAmount.textContent = `R$ ${total.toFixed(2).replace(".", ",")}`;
}

function resetTimeSelect(message) {
    timeSelect.innerHTML = '<option value="">Escolha primeiro uma data</option>';
    timeSelect.disabled = true;
    availabilityMessage.textContent = message;
}

function buildWhatsappMessage(formData) {
    let message = "*Novo agendamento - Jacy Sallys*\n\n";
    message += `*Nome:* ${formData.name}\n`;
    message += `*Telefone:* ${formData.phone}\n`;
    message += `*Data:* ${formatDate(formData.date)}\n`;
    message += `*Horario:* ${formData.time}\n\n`;
    message += "*Servicos:*\n";

    formData.services.forEach((service) => {
        message += `- ${service.name}\n`;
    });

    message += `\n*Total:* ${formData.total}`;

    if (formData.notes) {
        message += `\n\n*Observacoes:* ${formData.notes}`;
    }

    return message;
}

async function fetchAvailability(dateValue) {
    const response = await fetch(`/api/availability?date=${encodeURIComponent(dateValue)}`, {
        headers: {
            Accept: "application/json"
        }
    });
    const payload = await response.json();

    if (!response.ok) {
        throw new Error(payload.error || "Nao foi possivel consultar a disponibilidade.");
    }

    return payload;
}

function renderAvailability(payload) {
    timeSelect.innerHTML = "";

    if (!payload.date) {
        resetTimeSelect("Escolha uma data para consultar os horarios disponiveis.");
        return;
    }

    const defaultOption = document.createElement("option");
    defaultOption.value = "";

    if (payload.schedule.length === 0) {
        defaultOption.textContent = "Nao ha atendimento neste dia";
        timeSelect.appendChild(defaultOption);
        timeSelect.disabled = true;
        availabilityMessage.textContent = `${payload.weekdayLabel} nao possui horarios de atendimento.`;
        return;
    }

    if (payload.available.length === 0) {
        defaultOption.textContent = "Sem horarios disponiveis";
        timeSelect.appendChild(defaultOption);
        timeSelect.disabled = true;
        availabilityMessage.textContent = `Todos os horarios de ${payload.weekdayLabel} em ${formatDate(payload.date)} ja foram reservados.`;
        return;
    }

    defaultOption.textContent = "Selecione um horario";
    timeSelect.appendChild(defaultOption);

    payload.available.forEach((timeValue) => {
        const option = document.createElement("option");
        option.value = timeValue;
        option.textContent = timeValue;
        timeSelect.appendChild(option);
    });

    timeSelect.disabled = false;
    availabilityMessage.textContent = `${payload.weekdayLabel} com ${payload.available.length} horario(s) disponivel(is).`;
}

async function loadAvailability(dateValue) {
    if (!dateValue) {
        resetTimeSelect("Escolha uma data para consultar os horarios disponiveis.");
        return;
    }

    resetTimeSelect("Consultando disponibilidade...");

    try {
        const payload = await fetchAvailability(dateValue);
        renderAvailability(payload);
    } catch (error) {
        resetTimeSelect("Nao foi possivel carregar os horarios agora.");
        setFeedback(error.message, "error");
    }
}

function getSelectedServices() {
    return serviceCheckboxes
        .filter((checkbox) => checkbox.checked)
        .map((checkbox) => ({
            name: checkbox.dataset.name,
            price: Number(checkbox.value)
        }));
}

async function handleSubmit(event) {
    event.preventDefault();
    clearFeedback();

    const services = getSelectedServices();
    const formData = {
        name: document.getElementById("name").value.trim(),
        phone: document.getElementById("phone").value.trim(),
        date: dateInput.value,
        time: timeSelect.value,
        services,
        total: totalAmount.textContent,
        notes: document.getElementById("notes").value.trim()
    };

    if (!formData.date || !formData.time) {
        setFeedback("Escolha uma data e um horario disponivel para continuar.", "error");
        return;
    }

    if (services.length === 0) {
        setFeedback("Selecione pelo menos um servico.", "error");
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Confirmando...";

    try {
        const response = await fetch("/api/bookings", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json"
            },
            body: JSON.stringify(formData)
        });
        const payload = await response.json();

        if (response.status === 409) {
            setFeedback(payload.error || "Esse horario acabou de ser reservado.", "error");
            await loadAvailability(formData.date);
            return;
        }

        if (!response.ok) {
            throw new Error(payload.error || "Nao foi possivel concluir o agendamento.");
        }

        setFeedback("Agendamento registrado com sucesso. O horario escolhido foi removido da disponibilidade.", "success");

        const whatsappNumber = "5511978751758";
        const whatsappMessage = buildWhatsappMessage(formData);
        const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}`;
        window.open(whatsappUrl, "_blank");

        bookingForm.reset();
        updateTotal();
        dateInput.value = formData.date;
        await loadAvailability(formData.date);
    } catch (error) {
        setFeedback(error.message || "Erro inesperado ao salvar o agendamento.", "error");
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Confirmar agendamento";
    }
}

dateInput.min = getTodayAsInputValue();

serviceCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", updateTotal);
});

dateInput.addEventListener("change", async () => {
    clearFeedback();
    await loadAvailability(dateInput.value);
});

bookingForm.addEventListener("submit", handleSubmit);

updateTotal();
resetTimeSelect("Escolha uma data para consultar os horarios disponiveis.");
