require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const jwt = require("jsonwebtoken");
const db = require("./db");

const app = express();

app.use(helmet());
app.use(express.json());
app.use(morgan("dev"));

app.use(
    cors({
        origin: "*",
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    })
);

app.use(express.static("public"));

// ------------------- Helpers -------------------
function signToken() {
    return jwt.sign({ role: "admin" }, process.env.JWT_SECRET, { expiresIn: "12h" });
}

function auth(req, res, next) {
    const h = req.headers.authorization;
    if (!h) return res.status(401).json({ ok: false, message: "Sem token" });
    const [type, token] = h.split(" ");
    if (type !== "Bearer" || !token)
        return res.status(401).json({ ok: false, message: "Token inválido" });

    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        return next();
    } catch {
        return res.status(401).json({ ok: false, message: "Token expirado/inválido" });
    }
}

// Helpers sqlite3 (promises)
function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });
}
function get(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
    });
}
function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) return reject(err);
            resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

// ------------------- Auth -------------------
app.post("/api/admin/login", (req, res) => {
    const { user, pass } = req.body || {};
    if (user === process.env.ADMIN_USER && pass === process.env.ADMIN_PASS) {
        return res.json({ ok: true, token: signToken() });
    }
    return res.status(401).json({ ok: false, message: "Credenciais inválidas" });
});

// ------------------- API Pública -------------------
app.get("/api/boloes/ativos", async (req, res) => {
    try {
        const base = process.env.PUBLIC_BASE_URL || "https://superjogo.loteriabr.com/combo/";
        const rows = await all(
            `
      SELECT id, nome, modalidade, destaque, valor_cota, jogos, dezenas, premiacao, premiacao_sub,
             hash_combo, status, ativo, ordem, data_sorteio
      FROM boloes
      WHERE ativo = 1
      ORDER BY ordem ASC, id ASC
    `
        );

        const boloes = rows.map((r) => ({
            id: r.id,
            nome: r.nome,
            modalidade: r.modalidade,
            destaque: r.destaque,
            valorCota: r.valor_cota,
            jogos: r.jogos,
            dezenas: r.dezenas,
            premiacao: r.premiacao,
            premiacaoSub: r.premiacao_sub,
            status: r.status, // disponivel | esgotado
            dataSorteio: r.data_sorteio,
            hash: r.hash_combo,
            url: base + r.hash_combo,
        }));

        res.json({ ok: true, baseUrl: base, boloes });
    } catch (err) {
        res.status(500).json({ ok: false, message: err.message });
    }
});

// ------------------- Admin CRUD (protegido) -------------------
app.get("/api/admin/boloes", auth, async (req, res) => {
    try {
        const rows = await all(`SELECT * FROM boloes ORDER BY ordem ASC, id DESC`);
        res.json({ ok: true, rows });
    } catch (err) {
        res.status(500).json({ ok: false, message: err.message });
    }
});

app.post("/api/admin/boloes", auth, async (req, res) => {
    try {
        const b = req.body || {};
        const info = await run(
            `
      INSERT INTO boloes
      (nome, modalidade, destaque, valor_cota, jogos, dezenas, premiacao, premiacao_sub, hash_combo, status, ativo, ordem, data_sorteio)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
            [
                b.nome || "COMBO",
                b.modalidade || "lotinha",
                b.destaque || "",
                Number(b.valorCota ?? 0),
                Number(b.jogos ?? 0),
                Number(b.dezenas ?? 0),
                Number(b.premiacao ?? 0),
                b.premiacaoSub || "por bilhete",
                b.hash || "",
                b.status || "disponivel",
                b.ativo ? 1 : 0,
                Number(b.ordem ?? 0),
                b.dataSorteio || "",
            ]
        );

        res.json({ ok: true, id: info.lastID });
    } catch (err) {
        res.status(500).json({ ok: false, message: err.message });
    }
});

app.put("/api/admin/boloes/:id", auth, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const b = req.body || {};

        await run(
            `
      UPDATE boloes SET
        nome=?,
        modalidade=?,
        destaque=?,
        valor_cota=?,
        jogos=?,
        dezenas=?,
        premiacao=?,
        premiacao_sub=?,
        hash_combo=?,
        status=?,
        ativo=?,
        ordem=?,
        data_sorteio=?,
        updated_at=datetime('now')
      WHERE id=?
    `,
            [
                b.nome,
                b.modalidade,
                b.destaque,
                Number(b.valorCota),
                Number(b.jogos),
                Number(b.dezenas),
                Number(b.premiacao),
                b.premiacaoSub,
                b.hash,
                b.status,
                b.ativo ? 1 : 0,
                Number(b.ordem),
                b.dataSorteio || "",
                id,
            ]
        );

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, message: err.message });
    }
});

app.patch("/api/admin/boloes/:id/ativo", auth, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { ativo } = req.body || {};
        await run(`UPDATE boloes SET ativo=?, updated_at=datetime('now') WHERE id=?`, [
            ativo ? 1 : 0,
            id,
        ]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, message: err.message });
    }
});

app.post("/api/admin/boloes/:id/duplicar", auth, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const row = await get(`SELECT * FROM boloes WHERE id=?`, [id]);
        if (!row) return res.status(404).json({ ok: false, message: "Não encontrado" });

        const info = await run(
            `
      INSERT INTO boloes
      (nome, modalidade, destaque, valor_cota, jogos, dezenas, premiacao, premiacao_sub, hash_combo, status, ativo, ordem, data_sorteio)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
            [
                row.nome,
                row.modalidade || "lotinha",
                row.destaque,
                row.valor_cota,
                row.jogos,
                row.dezenas,
                row.premiacao,
                row.premiacao_sub,
                row.hash_combo,
                row.status,
                1,
                Number(row.ordem || 0) + 1,
                row.data_sorteio,
            ]
        );

        res.json({ ok: true, id: info.lastID });
    } catch (err) {
        res.status(500).json({ ok: false, message: err.message });
    }
});

app.delete("/api/admin/boloes/:id", auth, async (req, res) => {
    try {
        const id = Number(req.params.id);
        await run(`DELETE FROM boloes WHERE id=?`, [id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, message: err.message });
    }
});

// ------------------- Start -------------------
app.listen(process.env.PORT || 3000, () => {
    console.log("Servidor rodando na porta", process.env.PORT || 3000);
});
