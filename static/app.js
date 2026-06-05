/* ═══════════════════════════════════════════════════════════════
   BMT Amal Muslim — app.js
   Frontend logic: auth, dashboard, tagihan, histori, admin
   ═══════════════════════════════════════════════════════════════ */

// ── STATE ──────────────────────────────────────────────────────
const state = {
  user: null,           // { nama, role, marketing_id }
  page: "dashboard",
  bulan: "2026-05",
  tagihan: [],
  filterStatus: "",
  searchQ: "",
  activeBayarId: null,
  activeHpRek: null,
};

// ── FORMAT HELPERS ─────────────────────────────────────────────
function rp(n) {
  if (!n && n !== 0) return "Rp 0";
  return "Rp " + parseInt(n).toLocaleString("id-ID");
}

function rpShort(n) {
  n = parseInt(n) || 0;
  if (n >= 1_000_000_000) return "Rp " + (n / 1_000_000_000).toFixed(1) + "M";
  if (n >= 1_000_000)     return "Rp " + (n / 1_000_000).toFixed(1) + "jt";
  if (n >= 1_000)         return "Rp " + (n / 1_000).toFixed(0) + "rb";
  return "Rp " + n;
}

function fmtTgl(tglStr) {
  if (!tglStr) return "-";
  // ISO datetime "2026-05-15 10:30:00" → "15/05/2026 10:30"
  const d = new Date(tglStr.replace(" ", "T"));
  if (isNaN(d)) return tglStr;
  return d.toLocaleDateString("id-ID") + " " + d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function bulanLabel(b) {
  // "2026-05" → "Mei 2026"
  const [y, m] = b.split("-");
  const namaBulan = ["","Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agt","Sep","Okt","Nov","Des"];
  return (namaBulan[parseInt(m)] || m) + " " + y;
}

// ── API HELPER ─────────────────────────────────────────────────
async function api(path, method = "GET", body = null, isForm = false) {
  const opts = { method, credentials: "include" };
  if (body && !isForm) {
    opts.headers = { "Content-Type": "application/json" };
    opts.body = JSON.stringify(body);
  } else if (isForm) {
    opts.body = body; // FormData
  }
  const res = await fetch(path, opts);
  return res.json();
}

// ── TOAST ──────────────────────────────────────────────────────
let _toastTimer = null;
function toast(msg, type = "success") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = `toast ${type}`;
  el.classList.remove("hidden");
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.add("hidden"), 3000);
}

// ── AUTH ───────────────────────────────────────────────────────
async function initApp() {
  const me = await api("/api/me");
  if (me.login) {
    state.user = { nama: me.nama, role: me.role, marketing_id: me.marketing_id };
    showApp();
  } else {
    showLogin();
  }
}

function showLogin() {
  document.getElementById("loginScreen").classList.remove("hidden");
  document.getElementById("appShell").classList.add("hidden");
  // Enter key on password field
  document.getElementById("loginPass").onkeydown = (e) => {
    if (e.key === "Enter") doLogin();
  };
  document.getElementById("loginUser").onkeydown = (e) => {
    if (e.key === "Enter") document.getElementById("loginPass").focus();
  };
}

function showApp() {
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("appShell").classList.remove("hidden");
  document.getElementById("topbarUser").textContent =
    state.user.nama + (state.user.role === "admin" ? " · Admin" : " · Marketing");
  // Tampilkan menu admin kalau role admin
  if (state.user.role === "admin") {
    document.getElementById("navAdmin").style.display = "";
  }
  navigate("dashboard");
}

async function doLogin() {
  const username = document.getElementById("loginUser").value.trim();
  const password = document.getElementById("loginPass").value.trim();
  const errEl = document.getElementById("loginError");
  errEl.classList.add("hidden");

  if (!username || !password) {
    errEl.textContent = "Username dan password wajib diisi";
    errEl.classList.remove("hidden");
    return;
  }

  const btn = document.querySelector("#loginScreen .btn-primary");
  btn.textContent = "Masuk...";
  btn.disabled = true;

  const res = await api("/api/login", "POST", { username, password });

  btn.textContent = "Masuk →";
  btn.disabled = false;

  if (res.error) {
    errEl.textContent = res.error;
    errEl.classList.remove("hidden");
    return;
  }

  state.user = { nama: res.nama, role: res.role, marketing_id: res.marketing_id };
  showApp();
}

async function doLogout() {
  await api("/api/logout", "POST");
  state.user = null;
  showLogin();
}

// ── NAVIGATION ─────────────────────────────────────────────────
function navigate(page) {
  state.page = page;
  // Update nav active state
  document.querySelectorAll(".nav-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.page === page);
  });
  renderPage();
}

function renderPage() {
  const main = document.getElementById("mainContent");
  main.innerHTML = '<div class="loading"><div class="spinner"></div> Memuat...</div>';
  switch (state.page) {
    case "dashboard": renderDashboard(); break;
    case "tagihan":   renderTagihan();   break;
    case "histori":   renderHistori();   break;
    case "admin":     renderAdmin();     break;
  }
}

// ── BULAN PICKER ───────────────────────────────────────────────
function bulanPickerHtml(currentBulan) {
  // Generate 6 bulan terakhir + 1 ke depan
  const options = [];
  const now = new Date(2026, 4, 1); // Mei 2026 — sesuai data real
  for (let i = -5; i <= 1; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const val = d.toISOString().slice(0, 7);
    const label = bulanLabel(val);
    options.push(`<option value="${val}" ${val === currentBulan ? "selected" : ""}>${label}</option>`);
  }
  return `<select class="search-bar" style="margin-bottom:12px;font-weight:700;" onchange="changeBulan(this.value)">
    ${options.join("")}
  </select>`;
}

function changeBulan(val) {
  state.bulan = val;
  renderPage();
}

// ── DASHBOARD ──────────────────────────────────────────────────
async function renderDashboard() {
  const main = document.getElementById("mainContent");
  const data = await api(`/api/dashboard?bulan=${state.bulan}`);

  if (data.error) {
    main.innerHTML = `<div class="empty-state"><p>${data.error}</p></div>`;
    return;
  }

  const s = data.stats;
  const pct = s.total_tagihan > 0
    ? Math.round((s.total_terkumpul / s.total_tagihan) * 100)
    : 0;

  let rekapHtml = "";
  if (state.user.role === "admin" && data.rekap_marketing.length > 0) {
    const rows = data.rekap_marketing.map((r) => {
      const pctM = r.total > 0 ? Math.round((r.lunas / r.total) * 100) : 0;
      return `<div class="rekap-row">
        <div>
          <div class="rekap-name">${r.marketing_nama || "-"}</div>
          <div class="rekap-count">${r.lunas}/${r.total} nasabah · ${rpShort(r.nominal_lunas)}</div>
        </div>
        <div class="rekap-badge">${pctM}%</div>
      </div>`;
    }).join("");

    rekapHtml = `
      <div class="section-title">Rekap per Marketing</div>
      <div class="card">${rows}</div>`;
  }

  main.innerHTML = `
    ${bulanPickerHtml(state.bulan)}

    <div class="stats-hero">
      <div class="stats-hero-label">Total Tagihan ${bulanLabel(state.bulan)}</div>
      <div class="stats-hero-value">${rpShort(s.total_tagihan)}</div>
      <div class="stats-hero-sub">${s.total_nasabah} nasabah aktif</div>
      <div class="progress-wrap" style="margin-top:14px;">
        <div class="progress-bar" style="width:${pct}%"></div>
      </div>
      <div class="progress-label">
        <span>Terkumpul ${pct}%</span>
        <span>${rpShort(s.total_terkumpul)}</span>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card green">
        <div class="stat-label">Sudah Bayar</div>
        <div class="stat-value">${s.sudah_bayar}</div>
        <div class="stat-sub">${rpShort(s.total_terkumpul)}</div>
      </div>
      <div class="stat-card red">
        <div class="stat-label">Belum Bayar</div>
        <div class="stat-value">${s.belum_bayar}</div>
        <div class="stat-sub">${rpShort(s.total_tunggakan)}</div>
      </div>
    </div>

    ${rekapHtml}

    <button class="btn-primary full" onclick="navigate('tagihan')">
      📋 Lihat Semua Tagihan
    </button>
  `;
}

// ── TAGIHAN LIST ───────────────────────────────────────────────
// ── STATE tambahan untuk infinite scroll
state.tagihanOffset = 0;
state.tagihanTotal  = 0;
state.tagihanLoading = false;

async function renderTagihan() {
  const main = document.getElementById("mainContent");
  state.tagihanOffset  = 0;
  state.tagihan        = [];

  let url = `/api/tagihan?bulan=${state.bulan}&limit=50&offset=0`;
  if (state.filterStatus) url += `&status=${state.filterStatus}`;
  if (state.searchQ)      url += `&q=${encodeURIComponent(state.searchQ)}`;

  const res = await api(url);
  state.tagihan      = res.data || [];
  state.tagihanTotal = res.total || 0;
  state.tagihanOffset = state.tagihan.length;

  const cards = state.tagihan.length === 0
    ? `<div class="empty-state"><div class="empty-icon">🔭</div><p>Tidak ada tagihan ditemukan</p></div>`
    : state.tagihan.map(renderTagihanCard).join("");

  main.innerHTML = `
    ${bulanPickerHtml(state.bulan)}
    <div class="filter-bar">
      ${["","BELUM","LUNAS"].map((s) => {
        const label = s===""?"Semua":s==="BELUM"?"Belum Bayar":"Lunas";
        return `<button class="filter-chip ${state.filterStatus===s?"active":""}"
          onclick="setFilter('${s}')">${label}</button>`;
      }).join("")}
    </div>
    <input class="search-bar" type="search" placeholder="🔍 Cari nama / no rekening..."
      value="${state.searchQ}" oninput="setSearch(this.value)"/>
    <div class="section-title" id="tagihanCount">${state.tagihanTotal} tagihan · tampil ${state.tagihan.length}</div>
    <div id="tagihanList">${cards}</div>
    <div id="loadMoreBtn" style="text-align:center;padding:16px;">
      ${state.tagihanOffset < state.tagihanTotal
        ? `<button class="filter-chip" onclick="loadMoreTagihan()">⬇️ Load lebih banyak (${state.tagihanTotal - state.tagihanOffset} lagi)</button>`
        : ""}
    </div>
  `;
}

async function loadMoreTagihan() {
  if (state.tagihanLoading) return;
  if (state.tagihanOffset >= state.tagihanTotal) return;

  state.tagihanLoading = true;
  const btn = document.getElementById("loadMoreBtn");
  if (btn) btn.innerHTML = `<div class="loading"><div class="spinner"></div> Memuat...</div>`;

  let url = `/api/tagihan?bulan=${state.bulan}&limit=50&offset=${state.tagihanOffset}`;
  if (state.filterStatus) url += `&status=${state.filterStatus}`;
  if (state.searchQ)      url += `&q=${encodeURIComponent(state.searchQ)}`;

  const res = await api(url);
  const newData = res.data || [];
  state.tagihan = [...state.tagihan, ...newData];
  state.tagihanOffset = state.tagihan.length;

  const list = document.getElementById("tagihanList");
  if (list) list.innerHTML += newData.map(renderTagihanCard).join("");

  const count = document.getElementById("tagihanCount");
  if (count) count.textContent = `${state.tagihanTotal} tagihan · tampil ${state.tagihan.length}`;

  if (btn) {
    const sisa = state.tagihanTotal - state.tagihanOffset;
    btn.innerHTML = sisa > 0
      ? `<button class="filter-chip" onclick="loadMoreTagihan()">⬇️ Load lebih banyak (${sisa} lagi)</button>`
      : `<p style="color:var(--gray-400);font-size:12px;">✅ Semua data sudah ditampilkan</p>`;
  }

  state.tagihanLoading = false;
}

function renderTagihanCard(t) {
  const isLunas = t.status === "LUNAS";
  const kolClass = `kol-${t.kolektibilitas || 1}`;
  const kolLabel = ["", "Lancar", "DPK", "Kurang Lancar", "Diragukan", "Macet"][t.kolektibilitas] || "Lancar";

  const noHpBtn = t.no_hp
    ? `<button class="btn-sm wa" onclick="kirimReminderWA(${t.id}, event)">📲 WA</button>`
    : `<button class="btn-sm outline" onclick="openModalHp('${t.no_rekening}', event)">📱 Isi HP</button>`;

  const bayarBtn = isLunas
    ? `<button class="btn-sm outline" style="color:var(--green-dark);border-color:var(--green-mid);" disabled>✅ Lunas</button>`
    : `<button class="btn-sm green" onclick="openModalBayar(${t.id}, event)">💰 Bayar</button>`;

  return `
    <div class="tagihan-card ${isLunas ? "lunas" : "belum"}">
      <div class="tagihan-header">
        <div>
          <div class="tagihan-nama">${t.nama}</div>
          <div class="tagihan-rek">${t.no_rekening} · ${t.marketing_nama || "-"}</div>
        </div>
        <div class="tagihan-total">${rp(t.total_tagihan)}</div>
      </div>
      <div class="tagihan-meta">
        <span class="badge ${kolClass}">${kolLabel}</span>
        ${isLunas
          ? `<span class="badge badge-green">✅ LUNAS · ${t.cara_bayar || ""}</span>`
          : `<span class="badge badge-red">⏳ BELUM</span>`}
        <span class="badge badge-gray">JT: ${t.tanggal_jt || "-"}</span>
      </div>
      <div style="font-size:11px;color:var(--gray-400);margin-bottom:8px;">
        Pokok: ${rp(t.tunggakan_pokok)} · Margin: ${rp(t.tunggakan_margin)}
      </div>
      <div class="tagihan-actions">
        ${bayarBtn}
        ${noHpBtn}
      </div>
    </div>`;
}

function setFilter(status) {
  state.filterStatus = status;
  renderTagihan();
}

let _searchTimer = null;
function setSearch(q) {
  state.searchQ = q;
  if (_searchTimer) clearTimeout(_searchTimer);
  _searchTimer = setTimeout(() => renderTagihan(), 400);
}

// ── MODAL BAYAR ────────────────────────────────────────────────
function openModalBayar(tagihan_id, e) {
  if (e) e.stopPropagation();
  const t = state.tagihan.find((x) => x.id === tagihan_id);
  if (!t) return;

  state.activeBayarId = tagihan_id;

  document.getElementById("modalNasabahInfo").innerHTML = `
    <div class="info-name">${t.nama}</div>
    <div class="info-row">📋 ${t.no_rekening} · ${t.marketing_nama || "-"}</div>
    <div class="info-row">📅 Jatuh tempo: ${t.tanggal_jt || "-"}</div>
    <div class="info-row" style="margin-top:6px;">Pokok: ${rp(t.tunggakan_pokok)} · Margin: ${rp(t.tunggakan_margin)}</div>
    <div class="info-total">${rp(t.total_tagihan)}</div>
  `;

  // Pre-fill jumlah dengan total tagihan
  document.getElementById("inputJumlah").value = t.total_tagihan || "";
  document.getElementById("inputCaraBayar").value = "TUNAI";
  document.getElementById("inputCatatan").value = "";
  document.getElementById("inputNoHp").value = t.no_hp || "";
  document.getElementById("modalError").classList.add("hidden");

  document.getElementById("modalBayar").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("modalBayar").classList.add("hidden");
  state.activeBayarId = null;
}

async function submitBayar() {
  const jumlah = parseInt(document.getElementById("inputJumlah").value);
  const cara_bayar = document.getElementById("inputCaraBayar").value;
  const catatan = document.getElementById("inputCatatan").value.trim();
  const no_hp = document.getElementById("inputNoHp").value.trim();
  const errEl = document.getElementById("modalError");

  errEl.classList.add("hidden");
  if (!jumlah || jumlah <= 0) {
    errEl.textContent = "Jumlah bayar tidak valid";
    errEl.classList.remove("hidden");
    return;
  }

  // Update no HP dulu kalau diisi
  const t = state.tagihan.find((x) => x.id === state.activeBayarId);
  if (t && no_hp && no_hp !== t.no_hp) {
    await api(`/api/nasabah/${t.no_rekening}/hp`, "PUT", { no_hp });
  }

  const btn = document.querySelector("#modalBayar .btn-primary");
  btn.textContent = "Menyimpan...";
  btn.disabled = true;

  const res = await api("/api/bayar", "POST", {
    tagihan_id: state.activeBayarId,
    jumlah,
    cara_bayar,
    catatan,
  });

  btn.textContent = "💾 Simpan";
  btn.disabled = false;

  if (res.error) {
    errEl.textContent = res.error;
    errEl.classList.remove("hidden");
    return;
  }

  closeModal();
  toast("✅ " + (res.message || "Pembayaran berhasil dicatat!"));
  // Reload tagihan list
  renderTagihan();
}

// ── MODAL HP ───────────────────────────────────────────────────
function openModalHp(no_rekening, e) {
  if (e) e.stopPropagation();
  state.activeHpRek = no_rekening;
  document.getElementById("inputHpBaru").value = "";
  document.getElementById("modalHp").classList.remove("hidden");
}

function closeModalHp() {
  document.getElementById("modalHp").classList.add("hidden");
  state.activeHpRek = null;
}

async function submitHp() {
  const no_hp = document.getElementById("inputHpBaru").value.trim();
  if (!no_hp) return;

  const btn = document.querySelector("#modalHp .btn-primary");
  btn.textContent = "Menyimpan...";
  btn.disabled = true;

  const res = await api(`/api/nasabah/${state.activeHpRek}/hp`, "PUT", { no_hp });

  btn.textContent = "Simpan";
  btn.disabled = false;

  if (res.error) {
    toast("❌ Gagal simpan HP: " + res.error, "error");
    return;
  }

  closeModalHp();
  toast("📱 No HP berhasil diupdate");
  renderTagihan();
}

// ── REMINDER WA ────────────────────────────────────────────────
async function kirimReminderWA(tagihan_id, e) {
  if (e) e.stopPropagation();
  const btn = e.target;
  const origText = btn.textContent;
  btn.textContent = "...";
  btn.disabled = true;

  const res = await api(`/api/reminder/${tagihan_id}`, "POST");

  btn.textContent = origText;
  btn.disabled = false;

  if (res.error) {
    toast("❌ " + res.error, "error");
  } else {
    toast("📲 Reminder WA terkirim!");
  }
}

// ── HISTORI ────────────────────────────────────────────────────
async function renderHistori() {
  const main = document.getElementById("mainContent");
  const rows = await api("/api/histori");

  if (!rows.length) {
    main.innerHTML = `<div class="empty-state"><div class="empty-icon">🕐</div><p>Belum ada histori pembayaran</p></div>`;
    return;
  }

  const items = rows.map((p) => `
    <div class="histori-item">
      <div class="histori-left">
        <div class="h-nama">${p.nama}</div>
        <div class="h-meta">${p.no_rekening} · ${p.cara_bayar || "TUNAI"} · ${p.dicatat_oleh || "-"}</div>
        <div class="h-meta">${fmtTgl(p.tanggal)}</div>
      </div>
      <div class="histori-right">
        <div class="h-jumlah">${rpShort(p.jumlah)}</div>
        <div class="h-cara">${p.catatan || ""}</div>
      </div>
    </div>
  `).join("");

  main.innerHTML = `
    <div class="section-title">${rows.length} transaksi terakhir</div>
    <div class="card">${items}</div>
  `;
}

// ── ADMIN ──────────────────────────────────────────────────────
async function renderAdmin() {
  const main = document.getElementById("mainContent");

  if (state.user.role !== "admin") {
    main.innerHTML = `<div class="empty-state"><div class="empty-icon">🔒</div><p>Akses ditolak</p></div>`;
    return;
  }

  // Load histori import
  const logs = await api("/api/import/log");

  const logRows = logs.length === 0
    ? `<div class="empty-state" style="padding:24px"><p>Belum ada histori import</p></div>`
    : logs.map((l) => `
      <div class="histori-item">
        <div class="histori-left">
          <div class="h-nama">${bulanLabel(l.bulan)}</div>
          <div class="h-meta">+${l.nasabah_baru} baru · ~${l.nasabah_update} update · ${l.nasabah_nonaktif} nonaktif</div>
          <div class="h-meta">${l.tagihan_baru} tagihan baru · ${fmtTgl(l.waktu)}</div>
        </div>
        <div class="histori-right">
          <div class="h-cara">${l.diimport_oleh}</div>
        </div>
      </div>`).join("");

  main.innerHTML = `
    <!-- Import Excel -->
    <div class="section-title">Import Data Excel</div>
    <div class="card admin-section">
      <div class="import-box" onclick="document.getElementById('fileImport').click()">
        <div style="font-size:36px">📂</div>
        <p>Tap untuk pilih file Excel tagihan</p>
        <p style="font-size:11px;margin-top:4px;">(.xlsx, .xls)</p>
      </div>
      <input type="file" id="fileImport" accept=".xlsx,.xls" style="display:none" onchange="doImport(this)"/>
      <div id="importProgress" class="hidden" style="margin-top:12px;"></div>
    </div>

    <!-- Blast WA -->
    <div class="section-title">Blast Reminder WA</div>
    <div class="card admin-section">
      <p style="font-size:13px;color:var(--gray-600);margin-bottom:12px;">
        Kirim reminder ke semua nasabah BELUM BAYAR yang punya no HP.
      </p>
      ${bulanPickerHtml(state.bulan)}
      <button class="btn-primary full" onclick="doBlast()">📲 Kirim Blast WA</button>
      <div id="blastResult" class="hidden" style="margin-top:12px;"></div>
    </div>

    <!-- Histori Import -->
    <div class="section-title">Histori Import</div>
    <div class="card">${logRows}</div>
  `;
}

async function doImport(input) {
  const file = input.files[0];
  if (!file) return;

  const progressEl = document.getElementById("importProgress");
  progressEl.innerHTML = `<div class="loading"><div class="spinner"></div> Mengimport ${file.name}...</div>`;
  progressEl.classList.remove("hidden");

  const form = new FormData();
  form.append("file", file);

  const res = await api("/api/import", "POST", form, true);

  if (res.error) {
    progressEl.innerHTML = `<div class="error-msg">❌ ${res.error}</div>`;
    return;
  }

  progressEl.innerHTML = `
    <div style="background:var(--green-pale);border-radius:var(--radius-sm);padding:14px;font-size:13px;line-height:1.8;">
      ✅ <strong>Import ${bulanLabel(res.bulan)} berhasil!</strong><br>
      👤 Nasabah baru: <strong>${res.nasabah_baru}</strong><br>
      🔄 Nasabah update: <strong>${res.nasabah_update}</strong><br>
      ❌ Nonaktif: <strong>${res.nasabah_nonaktif}</strong><br>
      📋 Tagihan baru: <strong>${res.tagihan_baru}</strong><br>
      🔄 Tagihan update: <strong>${res.tagihan_update}</strong>
    </div>`;

  // Reset file input
  input.value = "";
  toast("✅ Import berhasil!");
}

async function doBlast() {
  const resultEl = document.getElementById("blastResult");
  const btn = document.querySelector("#mainContent .btn-primary.full");
  if (btn) { btn.textContent = "📲 Mengirim..."; btn.disabled = true; }

  resultEl.innerHTML = `<div class="loading"><div class="spinner"></div> Mengirim WA...</div>`;
  resultEl.classList.remove("hidden");

  const res = await api("/api/reminder/blast", "POST", { bulan: state.bulan });

  if (btn) { btn.textContent = "📲 Kirim Blast WA"; btn.disabled = false; }

  if (res.error) {
    resultEl.innerHTML = `<div class="error-msg">❌ ${res.error}</div>`;
    return;
  }

  resultEl.innerHTML = `
    <div style="background:var(--green-pale);border-radius:var(--radius-sm);padding:14px;font-size:13px;">
      ✅ Blast selesai!<br>
      📲 Terkirim: <strong>${res.terkirim}</strong> · ❌ Gagal: <strong>${res.gagal}</strong>
    </div>`;
  toast(`📲 ${res.terkirim} WA terkirim!`);
}

// ── INIT ───────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", initApp);
