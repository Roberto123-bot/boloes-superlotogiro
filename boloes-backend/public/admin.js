let token = "";

const $ = (id) => document.getElementById(id);

async function api(path, opts = {}) {
    const headers = opts.headers || {};
    if (token) headers.Authorization = `Bearer ${token}`;
    headers["Content-Type"] = "application/json";
    const res = await fetch(path, { ...opts, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "Erro");
    return data;
}

function brToIsoDate(br) {
    // "25/02/2026" -> "2026-02-25"
    if (!br) return "";
    const m = String(br).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return "";
    const [, dd, mm, yyyy] = m;
    return `${yyyy}-${mm}-${dd}`;
}

function isoToBrDate(iso) {
    // "2026-02-25" -> "25/02/2026"
    if (!iso) return "";
    const m = String(iso).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return "";
    const [, yyyy, mm, dd] = m;
    return `${dd}/${mm}/${yyyy}`;
}

function fillForm(row) {
    $("f_id").value = row?.id ?? "";
    $("f_nome").value = row?.nome ?? "";
    $("f_modalidade").value = row?.modalidade ?? "super6";
    $("f_destaque").value = row?.destaque ?? "";
    $("f_hash").value = row?.hash_combo ?? "";
    $("f_valor").value = row?.valor_cota ?? "";
    $("f_jogos").value = row?.jogos ?? "";
    $("f_dezenas").value = row?.dezenas ?? "";
    $("f_premio").value = row?.premiacao ?? "";
    $("f_premioSub").value = row?.premiacao_sub ?? "por bilhete";
    const d = row?.data_sorteio ?? "";
    $("f_data").value = d.includes("/") ? brToIsoDate(d) : d; // aceita BR ou ISO
    $("f_ordem").value = row?.ordem ?? 0;
    $("f_status").value = row?.status ?? "disponivel";
    $("f_ativo").checked = (row?.ativo ?? 1) === 1;
    // ✅ AQUI
    if (window.__syncDestaqueSelect) window.__syncDestaqueSelect();
}

function getForm() {
    return {
        nome: $("f_nome").value.trim(),
        modalidade: $("f_modalidade").value,
        destaque: $("f_destaque").value.trim(),
        hash: $("f_hash").value.trim(),
        valorCota: Number($("f_valor").value || 0),
        jogos: Number($("f_jogos").value || 0),
        dezenas: Number($("f_dezenas").value || 0),
        premiacao: Number($("f_premio").value || 0),
        premiacaoSub: $("f_premioSub").value.trim() || "por bilhete",
        dataSorteio: isoToBrDate($("f_data").value.trim()),
        ordem: Number($("f_ordem").value || 0),
        status: $("f_status").value,
        ativo: $("f_ativo").checked
    };
}

async function loadList() {
    const out = await api("/api/admin/boloes");
    const list = $("list");
    list.innerHTML = "";

    out.rows.forEach((r) => {
        const div = document.createElement("div");
        div.className = "item";
        div.innerHTML = `
      <b>#${r.id} - ${r.nome}</b> <small>(${r.ativo ? "ATIVO" : "INATIVO"} • ${r.status})</small><br/>
      <small>valor: R$ ${Number(r.valor_cota).toFixed(2)} • dezenas: ${r.dezenas} • jogos: ${r.jogos} • hash: ${r.hash_combo}</small>
      <div class="actions">
        <button data-act="edit" data-id="${r.id}">Editar</button>
        <button class="ghost" data-act="dup" data-id="${r.id}">Duplicar</button>
        <button class="ghost" data-act="toggle" data-id="${r.id}">${r.ativo ? "Desativar" : "Ativar"}</button>
        <button class="ghost" data-act="del" data-id="${r.id}">Excluir</button>
      </div>
    `;
        div.querySelectorAll("button").forEach((b) => {
            b.addEventListener("click", async () => {
                const act = b.dataset.act;
                const id = Number(b.dataset.id);

                if (act === "edit") {
                    fillForm(r);
                    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
                }
                if (act === "dup") {
                    await api(`/api/admin/boloes/${id}/duplicar`, { method: "POST" });
                    await loadList();
                }
                if (act === "toggle") {
                    await api(`/api/admin/boloes/${id}/ativo`, {
                        method: "PATCH",
                        body: JSON.stringify({ ativo: r.ativo ? 0 : 1 })
                    });
                    await loadList();
                }
                if (act === "del") {
                    if (!confirm("Excluir este bolão?")) return;
                    await api(`/api/admin/boloes/${id}`, { method: "DELETE" });
                    await loadList();
                }
            });
        });

        list.appendChild(div);
    });
}

// Login
$("btnLogin").addEventListener("click", async () => {
    $("loginMsg").textContent = "";
    try {
        const out = await api("/api/admin/login", {
            method: "POST",
            body: JSON.stringify({ user: $("user").value, pass: $("pass").value })
        });
        token = out.token;
        $("loginCard").classList.add("hidden");
        $("appCard").classList.remove("hidden");
        await loadList();
    } catch (e) {
        $("loginMsg").textContent = e.message;
    }
});

// Novo / Limpar
$("btnNovo").addEventListener("click", () => fillForm(null));
$("btnLimpar").addEventListener("click", () => fillForm(null));

// Salvar
$("btnSalvar").addEventListener("click", async () => {
    $("msg").textContent = "";
    try {
        const id = $("f_id").value;
        const payload = getForm();

        if (!payload.hash) throw new Error("Informe o hash do combo (uuid).");

        if (!id) {
            await api("/api/admin/boloes", { method: "POST", body: JSON.stringify(payload) });
        } else {
            await api(`/api/admin/boloes/${id}`, { method: "PUT", body: JSON.stringify(payload) });
        }
        $("msg").textContent = "Salvo ✅";
        fillForm(null);
        await loadList();
    } catch (e) {
        $("msg").textContent = e.message;
    }
});

function initDestaqueSelect() {
    const sel = document.getElementById("f_destaque_select");
    const inp = document.getElementById("f_destaque");
    if (!sel || !inp) return;

    function applySelectToInput() {
        const v = sel.value;

        if (v === "custom") {
            inp.style.display = "block";
            inp.focus();
            return;
        }

        inp.style.display = "none";
        inp.value = v;
    }

    sel.addEventListener("change", applySelectToInput);

    function syncSelectWithInput() {
        const current = (inp.value || "").trim();
        const option = [...sel.options].find((o) => o.value === current);

        if (current === "") {
            sel.value = "";
            inp.style.display = "none";
        } else if (option) {
            sel.value = current;
            inp.style.display = "none";
        } else {
            sel.value = "custom";
            inp.style.display = "block";
        }
    }

    window.__syncDestaqueSelect = syncSelectWithInput;

    applySelectToInput();
}

// ✅ CHAMAR
initDestaqueSelect();
