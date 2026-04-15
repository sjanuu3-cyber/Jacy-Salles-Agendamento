const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

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
        return parsed && Array.isArray(parsed.bookings) ? parsed : { bookings: [] };
    } catch {
        return { bookings: [] };
    }
}

function writeBookingsFile(data) {
    ensureDataFile();
    fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(data, null, 2));
}

function sendJson(res, status, data) {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
}

function sendText(res, status, msg) {
    res.writeHead(status, { "Content-Type": "text/plain" });
    res.end(msg);
}

function parseDateInput(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [y, m, d] = value.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return date.getFullYear() === y ? date : null;
}

function getAvailability(dateValue, data = readBookingsFile()) {
    const date = parseDateInput(dateValue);
    if (!date) throw new Error("Data invalida.");

    const weekday = date.getDay();
    const schedule = WEEKLY_SCHEDULE[weekday] || [];

    const booked = data.bookings
        .filter(b => b.date === dateValue)
        .map(b => b.time);

    const available = schedule.filter(t => !booked.includes(t));

    return {
        date: dateValue,
        weekday,
        weekdayLabel: WEEKDAY_LABELS[weekday],
        schedule,
        booked,
        available
    };
}

function getBookingsByDate(dateValue, data = readBookingsFile()) {
    const date = parseDateInput(dateValue);
    if (!date) throw new Error("Data invalida.");

    return {
        date: dateValue,
        bookings: data.bookings.filter(b => b.date === dateValue)
    };
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = "";
        req.on("data", chunk => data += chunk);
        req.on("end", () => {
            try {
                resolve(JSON.parse(data || "{}"));
            } catch {
                reject(new Error("JSON invalido"));
            }
        });
    });
}

function serveStatic(res, pathname) {
    const file = path.join(PUBLIC_DIR, pathname === "/" ? "index.html" : pathname);

    if (!fs.existsSync(file)) {
        return sendText(res, 404, "Arquivo nao encontrado");
    }

    const ext = path.extname(file);
    const content = fs.readFileSync(file);

    res.writeHead(200, { "Content-Type": CONTENT_TYPES[ext] || "text/plain" });
    res.end(content);
}

async function handleApi(req, res, url) {
    if (req.method === "GET" && url.pathname === "/api/availability") {
        const date = url.searchParams.get("date");
        return sendJson(res, 200, getAvailability(date));
    }

    if (req.method === "GET" && url.pathname === "/api/bookings") {
        const date = url.searchParams.get("date");
        return sendJson(res, 200, getBookingsByDate(date));
    }

    if (req.method === "POST" && url.pathname === "/api/bookings") {
        const body = await readBody(req);
        const data = readBookingsFile();

        const booking = {
            id: crypto.randomUUID(),
            ...body
        };

        data.bookings.push(booking);
        writeBookingsFile(data);

        return sendJson(res, 201, booking);
    }

    sendJson(res, 404, { error: "Rota nao encontrada" });
}

function createServer() {
    return http.createServer(async (req, res) => {
        const url = new URL(req.url, `http://${req.headers.host}`);

        if (url.pathname.startsWith("/api")) {
            return handleApi(req, res, url);
        }

        serveStatic(res, url.pathname);
    });
}

// 🚀 CORREÇÃO IMPORTANTE
const server = createServer();

server.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});