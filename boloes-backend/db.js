const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "database.sqlite");
const db = new sqlite3.Database(DB_PATH);

// Cria tabela na primeira execução
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS boloes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      destaque TEXT DEFAULT '',
      modalidade TEXT DEFAULT 'lotinha',
      valor_cota REAL NOT NULL,
      jogos INTEGER NOT NULL,
      dezenas INTEGER NOT NULL,
      premiacao REAL DEFAULT 0,
      premiacao_sub TEXT DEFAULT 'por bilhete',
      hash_combo TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'disponivel',
      ativo INTEGER NOT NULL DEFAULT 1,
      ordem INTEGER NOT NULL DEFAULT 0,
      data_sorteio TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
});

module.exports = db;
