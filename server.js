const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SESSION_COOKIE = "admin_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const ADMIN_FILE = path.join(DATA_DIR, "admin.json");
const BOOKINGS_FILE = path.join(DATA_DIR, "bookings.json");
const PUBLIC_ROOT = path.resolve(PUBLIC_DIR);

const sessions = new Map();

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

const MIME_TYPES = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml"
};

function ensureDataFile() {
    fs.mkdirSync(DATA_DIR, { recursive: true });

    if (!fs.existsSync(BOOKINGS_FILE)) {
        fs.writeFileSync(BOOKINGS_FILE, JSON.stringify({ bookings: [] }, null, 2));
    }
}

function readAdminCredentials() {
    fs.mkdirSync(DATA_DIR, { recursive: true });

    if (process.env.ADMIN_USER && process.env.ADMIN_PASS) {
        return {
            user: process.env.ADMIN_USER,
            pass: process.env.ADMIN_PASS
        };
    }

    if (fs.existsSync(ADMIN_FILE)) {
        try {
            const parsed = JSON.parse(fs.readFileSync(ADMIN_FILE, "utf8"));

            if (
                parsed &&
                typeof parsed.user === "string" &&
                parsed.user.trim() &&
                typeof parsed.pass === "string" &&
                parsed.pass.trim()
            ) {
                return {
                    user: parsed.user.trim(),
                    pass: parsed.pass.trim()
                };
            }
        } catch {
            // Fall through and recreate a valid local credentials file.
        }
    }

    const credentials = {
        user: "admin",
        pass: crypto.randomBytes(8).toString("hex")
    };

    fs.writeFileSync(ADMIN_FILE, JSON.stringify(credentials, null, 2));
    console.log(`Credenciais admin criadas em ${ADMIN_FILE}`);

    return credentials;
}

const ADMIN_CREDENTIALS = readAdminCredentials();

function parseDateInput(value) {
    if (!value || typeof value !== "string") return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [year, month, day] = value.split("-").map(Number);
        return new Date(year, month - 1, day);
    }

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
        const [day, month, year] = value.split("/").map(Number);
        return new Date(year, month - 1, day);
    }

    return null;
}

function normalizeDateInput(value) {
    const date = parseDateInput(value);

    if (!date || Number.isNaN(date.getTime())) {
        return null;
    }

    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function formatDate(dateValue) {
    const normalized = normalizeDateInput(dateValue);
    if (!normalized) return "";

    const [year, month, day] = normalized.split("-");
    return `${day}/${month}/${year}`;
}

function normalizeServices(services) {
    if (!Array.isArray(services)) return [];

    return services
        .filter(service => service && typeof service.name === "string")
        .map(service => ({
            name: service.name.trim(),
            price: Number(service.price || 0)
        }));
}

function normalizeStatus(status) {
    return ["pending", "completed", "cancelled"].includes(status)
        ? status
        : "pending";
}

function normalizeBooking(booking) {
    if (!booking || typeof booking !== "object") return null;

    const normalizedDate = normalizeDateInput(booking.date);
    const normalizedTime = typeof booking.time === "string" ? booking.time.trim() : "";

    if (!normalizedDate || !normalizedTime) {
        return null;
    }

    const createdAt = booking.createdAt || new Date().toISOString();

    return {
        id: typeof booking.id === "string" && booking.id ? booking.id : crypto.randomUUID(),
        name: typeof booking.name === "string" ? booking.name.trim() : "",
        phone: typeof booking.phone === "string" ? booking.phone.trim() : "",
        date: normalizedDate,
        time: normalizedTime,
        services: normalizeServices(booking.services),
        notes: typeof booking.notes === "string" ? booking.notes.trim() : "",
        total: typeof booking.total === "string" ? booking.total.trim() : "",
        status: normalizeStatus(booking.status),
        createdAt,
        updatedAt: booking.updatedAt || createdAt
    };
}

function readBookingsFile() {
    ensureDataFile();

    try {
        const raw = fs.readFileSync(BOOKINGS_FILE, "utf8");
        const parsed = JSON.parse(raw);
        const sourceBookings = parsed && Array.isArray(parsed.bookings) ? parsed.bookings : [];
        const normalizedBookings = sourceBookings
            .map(normalizeBooking)
            .filter(Boolean)
            .sort((left, right) => {
                if (left.date !== right.date) {
                    return left.date.localeCompare(right.date);
                }

                return left.time.localeCompare(right.time);
            });

        const normalized = { bookings: normalizedBookings };

        if (JSON.stringify(sourceBookings) !== JSON.stringify(normalizedBookings)) {
            fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(normalized, null, 2));
        }

        return normalized;
    } catch {
        return { bookings: [] };
    }
}

function writeBookingsFile(data) {
    ensureDataFile();
    fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(data, null, 2));
}

function sendJson(res, status, data, headers = {}) {
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        ...headers
    });

    res.end(JSON.stringify(data));
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = "";

        req.on("data", chunk => {
            data += chunk;
        });

        req.on("end", () => {
            try {
                resolve(JSON.parse(data || "{}"));
            } catch {
                reject(new Error("JSON invalido"));
            }
        });
    });
}

function parseCookies(req) {
    const header = req.headers.cookie;
    if (!header) return {};

    return header.split(";").reduce((cookies, item) => {
        const [rawName, ...rawValue] = item.trim().split("=");

        if (!rawName) {
            return cookies;
        }

        cookies[rawName] = decodeURIComponent(rawValue.join("=") || "");
        return cookies;
    }, {});
}

function buildSessionCookie(token, maxAgeSeconds) {
    return `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

function createSession() {
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
    return token;
}

function clearSession(req) {
    const token = parseCookies(req)[SESSION_COOKIE];

    if (token) {
        sessions.delete(token);
    }
}

function isAuthenticated(req) {
    const token = parseCookies(req)[SESSION_COOKIE];

    if (!token) {
        return false;
    }

    const expiresAt = sessions.get(token);

    if (!expiresAt) {
        return false;
    }

    if (expiresAt <= Date.now()) {
        sessions.delete(token);
        return false;
    }

    sessions.set(token, Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
    return true;
}

function requireAdmin(req, res) {
    if (!isAuthenticated(req)) {
        sendJson(res, 401, { error: "Nao autorizado" });
        return false;
    }

    return true;
}

function getAvailability(dateValue, data = readBookingsFile()) {
    const normalizedDate = normalizeDateInput(dateValue);

    if (!normalizedDate) {
        return { error: "Data invalida" };
    }

    const date = parseDateInput(normalizedDate);
    const weekday = date.getDay();
    const schedule = WEEKLY_SCHEDULE[weekday] || [];

    const booked = data.bookings
        .filter(booking => booking.date === normalizedDate && booking.status !== "cancelled")
        .map(booking => booking.time);

    return {
        date: normalizedDate,
        formattedDate: formatDate(normalizedDate),
        weekday,
        weekdayLabel: WEEKDAY_LABELS[weekday],
        schedule,
        booked,
        available: schedule.filter(time => !booked.includes(time))
    };
}

function getBookingsByDate(dateValue, data = readBookingsFile()) {
    const normalizedDate = normalizeDateInput(dateValue);

    if (!normalizedDate) {
        return { error: "Data invalida" };
    }

    const date = parseDateInput(normalizedDate);
    const weekday = date.getDay();
    const bookings = data.bookings.filter(booking => booking.date === normalizedDate);
    const weekdayLabel = WEEKDAY_LABELS[weekday] || "Dia selecionado";
    const formattedDate = formatDate(normalizedDate);

    return {
        date: normalizedDate,
        formattedDate,
        weekday,
        weekdayLabel,
        message: `${weekdayLabel} com ${bookings.length} agendamento(s) salvo(s) em ${formattedDate}.`,
        summary: {
            total: bookings.length,
            pending: bookings.filter(booking => booking.status === "pending").length,
            completed: bookings.filter(booking => booking.status === "completed").length,
            cancelled: bookings.filter(booking => booking.status === "cancelled").length
        },
        bookings
    };
}

function serveStatic(res, pathname) {
    const requestedPath = pathname === "/" ? "/index.html" : pathname;
    const resolvedFile = path.resolve(PUBLIC_DIR, `.${requestedPath}`);
    const isInsidePublic = resolvedFile === PUBLIC_ROOT || resolvedFile.startsWith(`${PUBLIC_ROOT}${path.sep}`);

    if (!isInsidePublic || !fs.existsSync(resolvedFile) || fs.statSync(resolvedFile).isDirectory()) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Arquivo nao encontrado");
        return;
    }

    const extension = path.extname(resolvedFile).toLowerCase();

    res.writeHead(200, {
        "Content-Type": MIME_TYPES[extension] || "application/octet-stream"
    });

    res.end(fs.readFileSync(resolvedFile));
}

async function handleApi(req, res, url) {
    if (req.method === "POST" && url.pathname === "/api/login") {
        const body = await readBody(req).catch(() => ({}));

        if (body.user === ADMIN_CREDENTIALS.user && body.pass === ADMIN_CREDENTIALS.pass) {
            const token = createSession();

            return sendJson(
                res,
                200,
                { success: true },
                { "Set-Cookie": buildSessionCookie(token, SESSION_MAX_AGE_SECONDS) }
            );
        }

        return sendJson(res, 401, { error: "Login invalido" });
    }

    if (req.method === "POST" && url.pathname === "/api/logout") {
        clearSession(req);

        return sendJson(
            res,
            200,
            { success: true },
            { "Set-Cookie": buildSessionCookie("", 0) }
        );
    }

    if (req.method === "GET" && url.pathname === "/api/admin/session") {
        return sendJson(res, 200, { authenticated: isAuthenticated(req) });
    }

    if (req.method === "GET" && url.pathname === "/api/availability") {
        const availability = getAvailability(url.searchParams.get("date"));

        if (availability.error) {
            return sendJson(res, 400, availability);
        }

        return sendJson(res, 200, availability);
    }

    if (req.method === "GET" && url.pathname === "/api/bookings") {
        if (!requireAdmin(req, res)) {
            return;
        }

        const result = getBookingsByDate(url.searchParams.get("date"));

        if (result.error) {
            return sendJson(res, 400, result);
        }

        return sendJson(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/api/bookings") {
        const body = await readBody(req).catch(() => ({}));
        const normalizedDate = normalizeDateInput(body.date);
        const time = typeof body.time === "string" ? body.time.trim() : "";
        const data = readBookingsFile();

        if (!normalizedDate || !time || !body.name || !body.phone) {
            return sendJson(res, 400, { error: "Preencha nome, telefone, data e horario" });
        }

        const availability = getAvailability(normalizedDate, data);

        if (!availability.schedule.includes(time)) {
            return sendJson(res, 400, { error: "Horario indisponivel para esta data" });
        }

        const alreadyBooked = data.bookings.some(
            booking =>
                booking.date === normalizedDate &&
                booking.time === time &&
                booking.status !== "cancelled"
        );

        if (alreadyBooked) {
            return sendJson(res, 409, { error: "Horario ja reservado" });
        }

        const now = new Date().toISOString();

        const booking = {
            id: crypto.randomUUID(),
            name: String(body.name).trim(),
            phone: String(body.phone).trim(),
            date: normalizedDate,
            time,
            services: normalizeServices(body.services),
            notes: typeof body.notes === "string" ? body.notes.trim() : "",
            total: typeof body.total === "string" ? body.total.trim() : "",
            status: "pending",
            createdAt: now,
            updatedAt: now
        };

        data.bookings.push(booking);
        data.bookings.sort((left, right) => {
            if (left.date !== right.date) {
                return left.date.localeCompare(right.date);
            }

            return left.time.localeCompare(right.time);
        });

        writeBookingsFile(data);

        return sendJson(res, 201, { success: true, booking });
    }

    if (req.method === "PATCH" && /^\/api\/bookings\/[^/]+\/status$/.test(url.pathname)) {
        if (!requireAdmin(req, res)) {
            return;
        }

        const body = await readBody(req).catch(() => ({}));
        const nextStatus = normalizeStatus(body.status);

        if (!body.status || nextStatus !== body.status) {
            return sendJson(res, 400, { error: "Status invalido" });
        }

        const id = url.pathname.split("/")[3];
        const data = readBookingsFile();
        const booking = data.bookings.find(item => item.id === id);

        if (!booking) {
            return sendJson(res, 404, { error: "Agendamento nao encontrado" });
        }

        booking.status = nextStatus;
        booking.updatedAt = new Date().toISOString();
        writeBookingsFile(data);

        return sendJson(res, 200, { success: true, booking });
    }

    sendJson(res, 404, { error: "Rota nao encontrada" });
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname.startsWith("/api")) {
        return handleApi(req, res, url);
    }

    serveStatic(res, url.pathname);
});

server.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});

