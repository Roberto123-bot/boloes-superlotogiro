// sync.js
const axios = require("axios");
const cheerio = require("cheerio");

// 1) Detecta status externo pelo HTML
async function statusComboExterno(hash) {
    const url = `https://superjogo.loteriabr.com/combo/${hash}`;
    const { data: html } = await axios.get(url, {
        timeout: 15000,
        headers: { "User-Agent": "Mozilla/5.0" },
    });

    const $ = cheerio.load(html);
    const texto = $("body").text().toLowerCase();

    // Ajuste os termos conforme você viu no HTML do site
    if (texto.includes("combo encerrado") || texto.includes("fechado") || texto.includes("sorteado")) {
        return "fechado";
    }

    // se tiver “disponível” explícito, pode reforçar:
    // if (texto.includes("disponível")) return "disponivel";

    return "disponivel";
}

// 2) Sincroniza todos (recebe helpers do sqlite para não duplicar)
async function syncStatusCombo({ all, run }) {
    const rows = await all(`SELECT id, hash_combo, status FROM boloes WHERE ativo=1`);
    let mudou = 0;

    for (const r of rows) {
        if (!r.hash_combo) continue;

        const novo = await statusComboExterno(r.hash_combo);
        if (novo !== r.status) {
            await run(`UPDATE boloes SET status=?, updated_at=datetime('now') WHERE id=?`, [novo, r.id]);
            mudou++;
            console.log(`✅ Status atualizado: id=${r.id} ${r.status} -> ${novo}`);
        }
    }

    return { total: rows.length, mudou };
}

module.exports = { statusComboExterno, syncStatusCombo };
