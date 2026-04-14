const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const BOOKINGS_FILE = path.join(DATA_DIR, "bookings.json");

const WEEKLY_SCHEDULE = {
    0: [],
    1: ["14:00", "15:30", "16:00", "17:30"],
    2: ["08:00", "09:30", "10:00", "11:30", "14:00", "15:30", "16:00", "17:30"],
    3: ["08:00", "09:30", "10:00", "11:30", "14:00", "15:30", "16:00", "17:30"],
    4: ["08:00", "09:30", "10:00", "11:30", "14:00", "15:30", "16:00", "17:30"],
    5: ["08:00", "09:30", "10:00", "11:30", "14:00", "15:30", "16:00", "17:30"],
    6: ["08:00", "09:30", "10:00", "11:30", "12:30", "14:00", "15:30"]
};

const WEEKDAY_LABELS = {
    0: "Domingo",
    1: "Segunda-feira",
    2: "Terca-feira",
    3: "Quarta-feira",
    4: "Quinta-feira",
    5: "Sexta-feira",
    6: "Sabado"
};

const CONTENT_TYPES = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml"
};

function ensureDataFile() {
    fs.mkdirSync(DATA_DIR, { recursive: true });

    if (!fs.existsSync(BOOKINGS_FILE)) {
        fs.writeFileSync(BOOKINGS_FILE, JSON.stringify({ bookings: [] }, null, 2));
    }
}

function readBookingsFile() {
    ensureDataFile();

    try {
        const raw = fs.readFileSync(BOOKINGS_FILE, "utf8");
        const parsed = JSON.parse(raw);

        if (!parsed || !Array.isArray(parsed.bookings)) {
            return { bookings: [] };
        }

        return parsed;
    } catch (error) {
        return { bookings: [] };
    }
}

function writeBookingsFile(data) {
    ensureDataFile();
    fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(data, null, 2));
}

function sendJson(response, statusCode, payload) {
    response.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
    });
    response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, message) {
    response.writeHead(statusCode, {
        "Content-Type": "text/plain; charset=utf-8"
    });
    response.end(message);
}

function parseDateInput(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return null;
    }

    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);

    if (
        Number.isNaN(date.getTime()) ||
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    ) {
        return null;
    }

    return date;
}

function getAvailability(dateValue, bookingsData = readBookingsFile()) {
    const parsedDate = parseDateInput(dateValue);

    if (!parsedDate) {
        throw new Error("Data invalida.");
    }

    const weekday = parsedDate.getDay();
    const schedule = WEEKLY_SCHEDULE[weekday] || [];
    const booked = bookingsData.bookings
        .filter((booking) => booking.date === dateValue)
        .map((booking) => booking.time)
        .sort();
    const available = schedule.filter((time) => !booked.includes(time));

    return {
        date: dateValue,
        weekday,
        weekdayLabel: WEEKDAY_LABELS[weekday],
        schedule,
        booked,
        available
    };
}

function validateServices(services) {
    return Array.isArray(services) && services.length > 0 && services.every((service) => {
        return service && typeof service.name === "string" && Number.isFinite(service.price);
    });
}

function validateBookingPayload(payload) {
    if (!payload || typeof payload !== "object") {
        return "Dados do agendamento invalidos.";
    }

    const { name, phone, date, time, services } = payload;

    if (!name || typeof name !== "string" || !name.trim()) {
        return "Informe o nome completo.";
    }

    if (!phone || typeof phone !== "string" || !phone.trim()) {
        return "Informe o telefone.";
    }

    if (!date || !parseDateInput(date)) {
        return "Informe uma data valida.";
    }

    if (!time || typeof time !== "string") {
        return "Informe um horario valido.";
    }

    const availability = getAvailability(date);

    if (!availability.schedule.includes(time)) {
        return "Esse horario nao faz parte da grade disponivel para a data escolhida.";
    }

    if (!validateServices(services)) {
        return "Selecione pelo menos um servico.";
    }

    return null;
}

function readRequestBody(request) {
    return new Promise((resolve, reject) => {
        let raw = "";

        request.on("data", (chunk) => {
            raw += chunk;

            if (raw.length > 1_000_000) {
                reject(new Error("Corpo da requisicao muito grande."));
                request.destroy();
            }
        });

        request.on("end", () => {
            if (!raw) {
                resolve({});
                return;
            }

            try {
                resolve(JSON.parse(raw));
            } catch (error) {
                reject(new Error("JSON invalido."));
            }
        });

        request.on("error", reject);
    });
}

function resolveStaticPath(pathname) {
    const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const targetPath = path.resolve(path.join(PUBLIC_DIR, relativePath));
    const rootPath = path.resolve(PUBLIC_DIR);

    if (!targetPath.startsWith(rootPath)) {
        return null;
    }

    return targetPath;
}

function serveStatic(response, pathname) {
    const targetPath = resolveStaticPath(pathname);

    if (!targetPath || !fs.existsSync(targetPath) || fs.statSync(targetPath).isDirectory()) {
        sendText(response, 404, "Arquivo nao encontrado.");
        return;
    }

    const extension = path.extname(targetPath).toLowerCase();
    const contentType = CONTENT_TYPES[extension] || "application/octet-stream";
    const fileContent = fs.readFileSync(targetPath);

    response.writeHead(200, {
        "Content-Type": contentType
    });
    response.end(fileContent);
}

async function handleApi(request, response, urlObject) {
    if (request.method === "GET" && urlObject.pathname === "/api/availability") {
        const dateValue = urlObject.searchParams.get("date");

        if (!dateValue) {
            sendJson(response, 400, { error: "Informe a data no formato YYYY-MM-DD." });
            return;
        }

        try {
            sendJson(response, 200, getAvailability(dateValue));
        } catch (error) {
            sendJson(response, 400, { error: error.message });
        }

        return;
    }

    if (request.method === "POST" && urlObject.pathname === "/api/bookings") {
        try {
            const payload = await readRequestBody(request);
            const validationError = validateBookingPayload(payload);

            if (validationError) {
                sendJson(response, 400, { error: validationError });
                return;
            }

            const bookingsData = readBookingsFile();
            const availability = getAvailability(payload.date, bookingsData);

            if (!availability.available.includes(payload.time)) {
                sendJson(response, 409, { error: "Esse horario ja foi reservado por outra pessoa." });
                return;
            }

            const booking = {
                id: crypto.randomUUID(),
                createdAt: new Date().toISOString(),
                name: payload.name.trim(),
                phone: payload.phone.trim(),
                date: payload.date,
                time: payload.time,
                notes: typeof payload.notes === "string" ? payload.notes.trim() : "",
                services: payload.services,
                total: typeof payload.total === "string" ? payload.total : "",
                weekday: availability.weekdayLabel
            };

            bookingsData.bookings.push(booking);
            bookingsData.bookings.sort((first, second) => {
                const firstKey = `${first.date}T${first.time}`;
                const secondKey = `${second.date}T${second.time}`;
                return firstKey.localeCompare(secondKey);
            });
            writeBookingsFile(bookingsData);

            sendJson(response, 201, {
                message: "Agendamento criado com sucesso.",
                booking,
                availability: getAvailability(payload.date, bookingsData)
            });
        } catch (error) {
            sendJson(response, 400, { error: error.message || "Nao foi possivel salvar o agendamento." });
        }

        return;
    }

    sendJson(response, 404, { error: "Rota da API nao encontrada." });
}

function createServer() {
    ensureDataFile();

    return http.createServer(async (request, response) => {
        const host = request.headers.host || `${HOST}:${PORT}`;
        const urlObject = new URL(request.url, `http://${host}`);

        if (urlObject.pathname.startsWith("/api/")) {
            await handleApi(request, response, urlObject);
            return;
        }

        if (request.method !== "GET" && request.method !== "HEAD") {
            sendText(response, 405, "Metodo nao permitido.");
            return;
        }

        serveStatic(response, urlObject.pathname);
    });
}

if (require.main === module) {
    const server = createServer();
    server.listen(PORT, HOST, () => {
        console.log(`Servidor iniciado em http://${HOST}:${PORT}`);
    });
}

module.exports = {
    BOOKINGS_FILE,
    HOST,
    PORT,
    WEEKLY_SCHEDULE,
    createServer,
    getAvailability
};
