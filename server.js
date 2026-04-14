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
        return JSON.parse(raw);
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

function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = "";
        req.on("data", chunk => data += chunk);
        req.on("end", () => {
            try {
                resolve(JSON.parse(data || "{}"));
            } catch {
                reject("JSON inválido");
            }
        });
    });
}

function serveStatic(res, filePath) {
    if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        return res.end("Não encontrado");
    }

    const ext = path.extname(filePath);
    const content = fs.readFileSync(filePath);

    res.writeHead(200, {
        "Content-Type": CONTENT_TYPES[ext] || "text/plain"
    });

    res.end(content);
}

function createServer() {
    ensureDataFile();

    return http.createServer(async (req, res) => {
        const url = new URL(req.url, `http://${req.headers.host}`);

        // API
        if (url.pathname === "/api/bookings" && req.method === "GET") {
            return sendJson(res, 200, readBookingsFile());
        }

        if (url.pathname === "/api/bookings" && req.method === "POST") {
            try {
                const body = await readBody(req);
                const data = readBookingsFile();

                const booking = {
                    id: crypto.randomUUID(),
                    ...body
                };

                data.bookings.push(booking);
                writeBookingsFile(data);

                return sendJson(res, 201, booking);
            } catch (err) {
                return sendJson(res, 400, { error: err });
            }
        }

        // Arquivos estáticos
        let filePath = path.join(PUBLIC_DIR, url.pathname === "/" ? "index.html" : url.pathname);
        serveStatic(res, filePath);
    });
}

// 🚀 SERVIDOR CORRIGIDO
const server = createServer();

server.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});