/* ═══════════════════════════════════════════════════════════════
   BMT Amal Muslim — app.js
   Frontend logic: auth, dashboard, tagihan, histori, admin
   ═══════════════════════════════════════════════════════════════ */

// ── STATE ──────────────────────────────────────────────────────
const state = {
  user: null,
  page: "dashboard",
  bulan: new Date().toISOString().slice(0, 7),
  tagihan: [],
  filterStatus: "",
  filterKolek: "",
  searchQ: "",
  activeBayarId: null,
  activeHpRek: null,
  tagihanOffset: 0,
  tagihanTotal: 0,
  tagihanLoading: false,
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
  const d = new Date(tglStr.replace(" ", "T"));
  if (isNaN(d)) return tglStr;
  return d.toLocaleDateString("id-ID") + " " + d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function bulanLabel(b) {
  const [y, m] = b.split("-");
  const namaBulan = ["","Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agt","Sep","Okt","Nov","Des"];
  return (namaBulan[parseInt(m)] || m) + " " + y;
}

function formatInputRibuan(el) {
  let val = el.value.replace(/[^0-9]/g, '');
  if (val) {
    el.value = parseInt(val, 10).toLocaleString('id-ID');
  } else {
    el.value = '';
  }
}

function extractTanggal(tglStr) {
  if (!tglStr) return "-";
  tglStr = String(tglStr).trim();
  if (/^\d{8}$/.test(tglStr)) return tglStr.substring(6, 8);
  if (/^\d{4}-\d{2}-\d{2}/.test(tglStr)) return tglStr.split('-')[2].substring(0, 2);
  if (/^\d{1,2}[/-]\d{1,2}/.test(tglStr)) return tglStr.split(/[/-]/)[0];
  const m1 = tglStr.match(/^(\d{1,2})\b/);
  if (m1) return m1[1];
  const m2 = tglStr.match(/\b(\d{1,2})$/);
  if (m2) return m2[1];
  return tglStr;
}

// ── API HELPER ─────────────────────────────────────────────────
async function api(path, method = "GET", body = null, isForm = false) {
  const opts = { method, credentials: "include" };
  if (body && !isForm) {
    opts.headers = { "Content-Type": "application/json" };
    opts.body = JSON.stringify(body);
  } else if (isForm) {
    opts.body = body;
  }
  const res = await fetch(path, opts);
  return res.json();
}

// ── TOAST ──────────────────────────────────────────────────────
let _toastTimer = null;
function toast(msg, type = "success") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "toast " + type;
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
  document.getElementById("loginPass").onkeydown = (e) => { if (e.key === "Enter") doLogin(); };
  document.getElementById("loginUser").onkeydown = (e) => { if (e.key === "Enter") document.getElementById("loginPass").focus(); };
}

function showApp() {
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("appShell").classList.remove("hidden");
  document.getElementById("topbarUser").textContent =
    state.user.nama + (state.user.role === "admin" ? " · Admin" : " · Marketing");
  if (state.user.role === "admin") {
    document.getElementById("navAdmin").style.display = "";
    document.getElementById("navTemplate").style.display = "";
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
    case "template":  renderTemplatePage(); break;
  }
}

// ── BULAN PICKER ───────────────────────────────────────────────
function bulanPickerHtml(currentBulan) {
  const options = [];
  const now = new Date();
  for (let i = -5; i <= 1; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const val = d.toISOString().slice(0, 7);
    const label = bulanLabel(val);
    options.push('<option value="' + val + '"' + (val === currentBulan ? " selected" : "") + '>' + label + '</option>');
  }
  return '<select class="search-bar" style="margin-bottom:12px;font-weight:700;" onchange="changeBulan(this.value)">' +
    options.join("") + '</select>';
}

function changeBulan(val) {
  state.bulan = val;
  renderPage();
}

// ── DASHBOARD ──────────────────────────────────────────────────
async function renderDashboard() {
  const main = document.getElementById("mainContent");
  const data = await api("/api/dashboard?bulan=" + state.bulan);

  if (data.error) {
    main.innerHTML = '<div class="empty-state"><p>' + data.error + '</p></div>';
    return;
  }

  const s = data.stats;
  const pct = s.total_tagihan > 0 ? Math.round((s.total_terkumpul / s.total_tagihan) * 100) : 0;

  let rekapHtml = "";
  if (state.user.role === "admin" && data.rekap_marketing.length > 0) {
    const rows = data.rekap_marketing.map((r) => {
      const pctM = r.total > 0 ? Math.round((r.lunas / r.total) * 100) : 0;
      return '<div class="rekap-row"><div>' +
        '<div class="rekap-name">' + (r.marketing_nama || "-") + '</div>' +
        '<div class="rekap-count">' + r.lunas + "/" + r.total + " nasabah · " + rpShort(r.nominal_lunas) + '</div>' +
        '</div><div class="rekap-badge">' + pctM + '%</div></div>';
    }).join("");
    rekapHtml = '<div class="section-title">Rekap per Marketing</div><div class="card">' + rows + '</div>';
  }

  main.innerHTML =
    bulanPickerHtml(state.bulan) +
    '<div class="stats-hero">' +
      '<div class="stats-hero-label">Total Tagihan ' + bulanLabel(state.bulan) + '</div>' +
      '<div class="stats-hero-value">' + rpShort(s.total_tagihan) + '</div>' +
      '<div class="stats-hero-sub">' + s.total_nasabah + ' nasabah aktif</div>' +
      '<div class="progress-wrap" style="margin-top:14px;"><div class="progress-bar" style="width:' + pct + '%"></div></div>' +
      '<div class="progress-label"><span>Terkumpul ' + pct + '%</span><span>' + rpShort(s.total_terkumpul) + '</span></div>' +
    '</div>' +
    '<div class="stats-grid">' +
      '<div class="stat-card green"><div class="stat-label">Sudah Bayar</div><div class="stat-value">' + s.sudah_bayar + '</div><div class="stat-sub">' + rpShort(s.total_terkumpul) + '</div></div>' +
      '<div class="stat-card red"><div class="stat-label">Belum Bayar</div><div class="stat-value">' + s.belum_bayar + '</div><div class="stat-sub">' + rpShort(s.total_tunggakan) + '</div></div>' +
    '</div>' +
    rekapHtml +
    '<button class="btn-primary full" onclick="navigate(\'tagihan\')">📋 Lihat Semua Tagihan</button>';
}

// ── TAGIHAN LIST ───────────────────────────────────────────────
async function renderTagihan() {
  const main = document.getElementById("mainContent");
  
  if (!document.getElementById("tagihanContainer")) {
    main.innerHTML = 
      '<div id="tagihanContainer">' +
        '<div id="rescheduleBanner" class="hidden" style="background:#fff3cd; color:#856404; padding:10px; border-radius:8px; margin-bottom:12px; font-size:13px; display:flex; justify-content:space-between; align-items:center;">' +
          '<span>Ada <b id="rescheduleBannerCount">0</b> nasabah perlu konfirmasi reschedule.</span>' +
          '<button class="btn-sm" style="background:#ffeeba; color:#856404; border:1px solid #ffeeba;" onclick="openModalReschedule()">Lihat</button>' +
        '</div>' +
        '<div id="bulanBox">' + bulanPickerHtml(state.bulan) + '</div>' +
        '<div class="filter-bar" id="filterStatusBox"></div>' +
        '<div class="filter-bar" id="filterKolekBox"></div>' +
        '<input class="search-bar" type="search" placeholder="🔍 Cari nama / no rekening..." id="searchInput" oninput="setSearch(this.value)"/>' +
        '<div class="section-title" id="tagihanCount">Memuat...</div>' +
        '<div id="tagihanList"><div class="loading"><div class="spinner"></div> Memuat...</div></div>' +
        '<div id="loadMoreBtn" style="text-align:center;padding:16px;"></div>' +
      '</div>';
    document.getElementById("searchInput").value = state.searchQ || "";
  } else {
    document.getElementById("tagihanList").innerHTML = '<div class="loading"><div class="spinner"></div> Memuat...</div>';
    document.getElementById("loadMoreBtn").innerHTML = '';
  }

  checkPendingReschedule();

  state.tagihanOffset = 0;
  state.tagihan = [];

  let url = "/api/tagihan?bulan=" + state.bulan + "&limit=50&offset=0";
  if (state.filterStatus) url += "&status=" + state.filterStatus;
  if (state.filterKolek)  url += "&kolek=" + state.filterKolek;
  if (state.searchQ)      url += "&q=" + encodeURIComponent(state.searchQ);

  const res = await api(url);
  state.tagihan = res.data || [];
  state.tagihanTotal = res.total || 0;
  state.tagihanOffset = state.tagihan.length;

  const cards = state.tagihan.length === 0
    ? '<div class="empty-state"><div class="empty-icon">🔭</div><p>Tidak ada tagihan ditemukan</p></div>'
    : state.tagihan.map(renderTagihanCard).join("");

  const filterStatus = ["","BELUM","LUNAS"].map((s) => {
    const label = s === "" ? "Semua" : s === "BELUM" ? "Belum Bayar" : "Lunas";
    return '<button class="filter-chip ' + (state.filterStatus === s ? "active" : "") + '" onclick="setFilter(\'' + s + '\')">' + label + '</button>';
  }).join("");

  const filterKolek = [["","Semua"],["1","✅ Lancar"],["2","⚠️ DPK"],["3","🟠 KL"],["4","🔴 Diragukan"],["5","⛔ Macet"]].map(([k, label]) => {
    return '<button class="filter-chip ' + (state.filterKolek === k ? "active" : "") + '" onclick="setFilterKolek(\'' + k + '\')">' + label + '</button>';
  }).join("");

  const sisaData = state.tagihanTotal - state.tagihanOffset;
  const loadMoreHtml = sisaData > 0
    ? '<button class="filter-chip" onclick="loadMoreTagihan()">⬇️ Load lebih (' + sisaData + ' lagi)</button>'
    : "";

  document.getElementById("bulanBox").innerHTML = bulanPickerHtml(state.bulan);
  document.getElementById("filterStatusBox").innerHTML = filterStatus;
  document.getElementById("filterKolekBox").innerHTML = filterKolek;
  document.getElementById("tagihanCount").textContent = state.tagihanTotal + ' tagihan · tampil ' + state.tagihan.length;
  document.getElementById("tagihanList").innerHTML = cards;
  document.getElementById("loadMoreBtn").innerHTML = loadMoreHtml;
}

async function loadMoreTagihan() {
  if (state.tagihanLoading) return;
  if (state.tagihanOffset >= state.tagihanTotal) return;

  state.tagihanLoading = true;
  const btn = document.getElementById("loadMoreBtn");
  if (btn) btn.innerHTML = '<div class="loading"><div class="spinner"></div> Memuat...</div>';

  let url = "/api/tagihan?bulan=" + state.bulan + "&limit=50&offset=" + state.tagihanOffset;
  if (state.filterStatus) url += "&status=" + state.filterStatus;
  if (state.filterKolek)  url += "&kolek=" + state.filterKolek;
  if (state.searchQ)      url += "&q=" + encodeURIComponent(state.searchQ);

  const res = await api(url);
  const newData = res.data || [];
  state.tagihan = [...state.tagihan, ...newData];
  state.tagihanOffset = state.tagihan.length;

  const list = document.getElementById("tagihanList");
  if (list) list.innerHTML += newData.map(renderTagihanCard).join("");

  const count = document.getElementById("tagihanCount");
  if (count) count.textContent = state.tagihanTotal + " tagihan · tampil " + state.tagihan.length;

  const sisa = state.tagihanTotal - state.tagihanOffset;
  if (btn) {
    btn.innerHTML = sisa > 0
      ? '<button class="filter-chip" onclick="loadMoreTagihan()">⬇️ Load lebih (' + sisa + ' lagi)</button>'
      : '<p style="color:var(--gray-400);font-size:12px;">✅ Semua data ditampilkan</p>';
  }

  state.tagihanLoading = false;
}

function renderTagihanCard(t) {
  const isLunas = t.status === "LUNAS";
  const kolClass = "kol-" + (t.kolektibilitas || 1);
  const kolLabel = ["","Lancar","DPK","Kurang Lancar","Diragukan","Macet"][t.kolektibilitas] || "Lancar";

  const noHpBtn = t.no_hp
    ? '<button class="btn-sm wa" onclick="openModalKonfirmasiWA(' + t.id + ', event)">📲 WA</button>' +
      '<button class="btn-sm outline" onclick="openModalHp(\'' + t.no_rekening + '\', event)" style="font-size:11px;padding:5px 8px;">✏️</button>'
    : '<button class="btn-sm outline" onclick="openModalHp(\'' + t.no_rekening + '\', event)">📱 Isi HP</button>';

  const bayarBtn = isLunas
    ? '<button class="btn-sm outline" style="color:var(--green-dark);border-color:var(--green-mid);" disabled>✅ Lunas</button>'
    : '<button class="btn-sm green" onclick="openModalBayar(' + t.id + ', event)">💰 Bayar</button>';

  const isReschedule = t.is_reschedule === 1 ? '<span class="badge" style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; font-size:10px; padding:2px 4px; margin-right:4px;">🔄 Reschedule</span>' : '';

  return '<div class="tagihan-card ' + (isLunas ? "lunas" : "belum") + '">' +
    '<div class="tagihan-header">' +
      '<div><div class="tagihan-nama">' + isReschedule + t.nama + '</div>' +
      '<div class="tagihan-rek">' + t.no_rekening + ' · ' + (t.marketing_nama || "-") + '</div>' +
      (t.alamat ? '<div style="font-size:10px;color:var(--gray-500);margin-top:2px;">📍 ' + t.alamat + '</div>' : '') +
      '</div>' +
      '<div class="tagihan-total">' + rp(t.total_tagihan) + '</div>' +
    '</div>' +
    '<div class="tagihan-meta">' +
      '<span class="badge ' + kolClass + '">' + kolLabel + '</span>' +
      (isLunas
        ? '<span class="badge badge-green">✅ LUNAS · ' + (t.cara_bayar || "") + '</span>'
        : '<span class="badge badge-red">⏳ BELUM</span>') +
      '<span class="badge badge-gray">JT: ' + (t.tanggal_jt || "-") + '</span>' +
    '</div>' +
    '<div style="font-size:11px;color:var(--gray-400);margin-bottom:8px;">Pokok: ' + rp(t.tunggakan_pokok) + ' · Margin: ' + rp(t.tunggakan_margin) + '</div>' +
    '<div class="tagihan-actions">' + bayarBtn + noHpBtn + '</div>' +
    '</div>';
}

function setFilter(status) {
  state.filterStatus = status;
  renderTagihan();
}

function setFilterKolek(k) {
  state.filterKolek = k;
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

  document.getElementById("modalNasabahInfo").innerHTML =
    '<div class="info-name">' + t.nama + '</div>' +
    '<div class="info-row">📋 ' + t.no_rekening + ' · ' + (t.marketing_nama || "-") + '</div>' +
    '<div class="info-row">📅 Jatuh tempo: ' + (t.tanggal_jt || "-") + '</div>' +
    '<div class="info-row" style="margin-top:6px;">Pokok: ' + rp(t.tunggakan_pokok) + ' · Margin: ' + rp(t.tunggakan_margin) + '</div>' +
    '<div class="info-total">' + rp(t.total_tagihan) + '</div>';

  document.getElementById("inputJumlah").value = parseInt(t.total_tagihan || 0).toLocaleString('id-ID');
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
  const jumlahStr = document.getElementById("inputJumlah").value;
  const jumlah = parseInt(jumlahStr.replace(/[^0-9]/g, ''));
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

  const t = state.tagihan.find((x) => x.id === state.activeBayarId);
  if (t && no_hp && no_hp !== t.no_hp) {
    await api("/api/nasabah/" + t.no_rekening + "/hp", "PUT", { no_hp });
  }

  const btn = document.querySelector("#modalBayar .btn-primary");
  btn.textContent = "Menyimpan...";
  btn.disabled = true;

  const res = await api("/api/bayar", "POST", { tagihan_id: state.activeBayarId, jumlah, cara_bayar, catatan });

  btn.textContent = "💾 Simpan";
  btn.disabled = false;

  if (res.error) {
    errEl.textContent = res.error;
    errEl.classList.remove("hidden");
    return;
  }

  closeModal();
  toast("✅ " + (res.message || "Pembayaran berhasil dicatat!"));
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

  const res = await api("/api/nasabah/" + state.activeHpRek + "/hp", "PUT", { no_hp });

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

// ── REMINDER WA (INDIVIDUAL) ──────────────────────────────────
let activeWAId = null;
function openModalKonfirmasiWA(id, e) {
  if (e) e.stopPropagation();
  const t = state.tagihan.find(x => x.id === id);
  if (!t) return;
  activeWAId = id;
  
  document.getElementById("modalWAKonfirmasiInfo").innerHTML =
    '<div class="info-name">' + t.nama + '</div>' +
    '<div class="info-row">📋 ' + t.no_rekening + '</div>' +
    '<div class="info-row" style="margin-bottom:12px;">📅 Jatuh tempo: ' + extractTanggal(t.tanggal_jt) + '</div>';
    
  document.getElementById("inputWAHp").value = t.no_hp || "";
  document.getElementById("inputWATagihan").value = parseInt(t.total_tagihan || 0).toLocaleString('id-ID');
  document.getElementById("modalWAError").classList.add("hidden");
  document.getElementById("modalKonfirmasiWA").classList.remove("hidden");
}

function closeModalKonfirmasiWA() {
  document.getElementById("modalKonfirmasiWA").classList.add("hidden");
}

async function submitKirimWA() {
  const noHp = document.getElementById("inputWAHp").value.trim();
  const nominalStr = document.getElementById("inputWATagihan").value;
  const nominal = nominalStr.replace(/[^0-9]/g, '');
  
  const btn = document.querySelector("#modalKonfirmasiWA .btn-primary");
  btn.disabled = true;
  btn.textContent = "Mengirim...";
  
  const res = await api("/api/reminder/" + activeWAId, "POST", { nominal: nominal, no_hp: noHp });
  
  btn.disabled = false;
  btn.textContent = "Kirim WA";
  
  if (res.error) {
    document.getElementById("modalWAError").textContent = res.error;
    document.getElementById("modalWAError").classList.remove("hidden");
  } else {
    closeModalKonfirmasiWA();
    toast("📲 Reminder WA terkirim!");
    renderTagihan(); // refresh if nominal changed
  }
}

// ── HISTORI ────────────────────────────────────────────────────
async function renderHistori() {
  const main = document.getElementById("mainContent");
  const rows = await api("/api/histori");

  if (!rows.length) {
    main.innerHTML = '<div class="empty-state"><div class="empty-icon">🕐</div><p>Belum ada histori pembayaran</p></div>';
    return;
  }

  const items = rows.map((p) =>
    '<div class="histori-item">' +
      '<div class="histori-left">' +
        '<div class="h-nama">' + p.nama + '</div>' +
        '<div class="h-meta">' + p.no_rekening + ' · ' + (p.cara_bayar || "TUNAI") + ' · ' + (p.dicatat_oleh || "-") + '</div>' +
        '<div class="h-meta">' + fmtTgl(p.tanggal) + '</div>' +
      '</div>' +
      '<div class="histori-right">' +
        '<div class="h-jumlah">' + rpShort(p.jumlah) + '</div>' +
        '<div class="h-cara">' + (p.catatan || "") + '</div>' +
      '</div>' +
    '</div>'
  ).join("");

  main.innerHTML = '<div class="section-title">' + rows.length + ' transaksi terakhir</div><div class="card">' + items + '</div>';
}

// ── ADMIN ──────────────────────────────────────────────────────
async function renderAdmin() {
  const main = document.getElementById("mainContent");

  if (state.user.role !== "admin") {
    main.innerHTML = '<div class="empty-state"><div class="empty-icon">🔒</div><p>Akses ditolak</p></div>';
    return;
  }

  const topAdminHtml = 
    '<div class="section-title" onclick="toggleUserList()" style="cursor:pointer; display:flex; justify-content:space-between; align-items:center;">' +
      '<span>Manajemen User (Marketing)</span>' +
      '<span id="toggleUserIcon">▶</span>' +
    '</div>' +
    '<div class="card admin-section" id="adminUserContainer" style="display:none;">' +
      '<button class="btn-primary" onclick="openModalUser()" style="margin-bottom:12px;">➕ Tambah Marketing</button>' +
      '<div id="adminUserList"><div class="loading"><div class="spinner"></div> Memuat...</div></div>' +
    '</div>';

  const logs = await api("/api/import/log");

  const logRows = logs.length === 0
    ? '<div class="empty-state" style="padding:24px"><p>Belum ada histori import</p></div>'
    : logs.map((l) =>
        '<div class="histori-item">' +
          '<div class="histori-left">' +
            '<div class="h-nama">' + bulanLabel(l.bulan) + '</div>' +
            '<div class="h-meta">+' + l.nasabah_baru + ' baru · ~' + l.nasabah_update + ' update · ' + l.nasabah_nonaktif + ' nonaktif</div>' +
            '<div class="h-meta">' + l.tagihan_baru + ' tagihan baru · ' + fmtTgl(l.waktu) + '</div>' +
          '</div>' +
          '<div class="histori-right"><div class="h-cara">' + l.diimport_oleh + '</div></div>' +
        '</div>'
      ).join("");

  main.innerHTML =
    topAdminHtml +
    '<div class="section-title">Import Data Excel</div>' +
    '<div class="card admin-section">' +
      '<div class="import-box" onclick="document.getElementById(\'fileImport\').click()">' +
        '<div style="font-size:36px">📂</div>' +
        '<p>Tap untuk pilih file Excel tagihan</p>' +
        '<p style="font-size:11px;margin-top:4px;">(.xlsx, .xls)</p>' +
      '</div>' +
      '<input type="file" id="fileImport" accept=".xlsx,.xls" style="display:none" onchange="doImport(this)"/>' +
      '<div id="importProgress" class="hidden" style="margin-top:12px;"></div>' +
    '</div>' +
    '<div class="section-title">Blast Reminder WA</div>' +
'<div class="card admin-section">' +
  '<p style="font-size:13px;color:var(--gray-600);margin-bottom:12px;">Kirim reminder ke nasabah BELUM BAYAR yang punya no HP.</p>' +
  bulanPickerHtml(state.bulan) +
  '<div style="display:flex;gap:8px;margin-bottom:8px;">' +
    '<button class="btn-primary" style="flex:1" onclick="doBlast(false)">📲 Blast Semua</button>' +
    '<button class="btn-primary" style="flex:1;background:var(--green-mid);" onclick="doBlast(true)">📅 Blast Hari Ini</button>' +
  '</div>' +
  '<p style="font-size:11px;color:var(--gray-400);">📅 Blast Hari Ini = hanya nasabah jatuh tempo tanggal ' + new Date().getDate() + '</p>' +
  '<div id="blastResult" class="hidden" style="margin-top:12px;"></div>' +
'</div>';
    '<div class="section-title">Histori Import</div>' +
'<div class="card">' + logRows + '</div>';

loadUsersAdmin();
}

async function renderTemplatePage() {
  const main = document.getElementById("mainContent");

  if (state.user.role !== "admin") {
    main.innerHTML = '<div class="empty-state"><div class="empty-icon">🔒</div><p>Akses ditolak</p></div>';
    return;
  }

  main.innerHTML = '<div class="section-title">Template Pesan WA</div>' +
    '<div id="templateSection"><div class="loading"><div class="spinner"></div> Memuat...</div></div>';

  loadTemplate();
}

async function doImport(input) {
  const file = input.files[0];
  if (!file) return;

  const progressEl = document.getElementById("importProgress");
  progressEl.innerHTML = '<div class="loading"><div class="spinner"></div> Mengimport ' + file.name + '...</div>';
  progressEl.classList.remove("hidden");

  const form = new FormData();
  form.append("file", file);

  const res = await api("/api/import", "POST", form, true);

  if (res.error) {
    progressEl.innerHTML = '<div class="error-msg">❌ ' + res.error + '</div>';
    return;
  }

  progressEl.innerHTML =
    '<div style="background:var(--green-pale);border-radius:var(--radius-sm);padding:14px;font-size:13px;line-height:1.8;">' +
    '✅ <strong>Import ' + bulanLabel(res.bulan) + ' berhasil!</strong><br>' +
    '👤 Nasabah baru: <strong>' + res.nasabah_baru + '</strong><br>' +
    '🔄 Nasabah update: <strong>' + res.nasabah_update + '</strong><br>' +
    '❌ Nonaktif: <strong>' + res.nasabah_nonaktif + '</strong><br>' +
    '📋 Tagihan baru: <strong>' + res.tagihan_baru + '</strong><br>' +
    '🔄 Tagihan update: <strong>' + res.tagihan_update + '</strong>' +
    '</div>';

  input.value = "";
  toast("✅ Import berhasil!");
}

let activeBlastData = null;

async function doBlast(hanyaHariIni = false) {
  const resultEl = document.getElementById("blastResult");
  const label = hanyaHariIni ? "📅 Menyiapkan data..." : "📲 Menyiapkan data...";
  resultEl.innerHTML = '<div class="loading"><div class="spinner"></div> ' + label + '</div>';
  resultEl.classList.remove("hidden");

  const res = await api("/api/reminder/preview_blast", "POST", {
    bulan: state.bulan,
    hanya_hari_ini: hanyaHariIni
  });

  if (res.error) {
    resultEl.innerHTML = '<div class="error-msg">❌ ' + res.error + '</div>';
    return;
  }
  
  resultEl.classList.add("hidden");
  activeBlastData = {
    hanya_hari_ini: hanyaHariIni,
    lancar: res.lancar,
    bermasalah: res.bermasalah
  };

  if (res.bermasalah.length === 0) {
    executeBlastRequest([]);
  } else {
    showBlastModal();
  }
}

function showBlastModal() {
  const container = document.getElementById("blastListContainer");
  
  container.innerHTML = activeBlastData.bermasalah.map(t => {
    return '<div class="histori-item" style="padding:10px 0; border-bottom:1px solid var(--gray-200); display:flex; flex-direction:column; gap:6px;">' +
      '<div style="display:flex; justify-content:space-between; align-items:center;">' +
        '<div>' +
          '<div class="h-nama" style="font-size:13px;">' + t.nama + '</div>' +
          '<div class="h-meta" style="font-size:10px;">' + t.no_rekening + ' · Kol: ' + t.kolektibilitas + '</div>' +
        '</div>' +
        '<div style="display:flex; align-items:center; gap:4px;">' +
          '<span style="font-size:12px; font-weight:700;">Rp</span>' +
          '<input type="text" id="blast_nom_' + t.id + '" value="' + parseInt(t.total_tagihan || 0).toLocaleString('id-ID') + '" style="width:90px; padding:4px 8px; font-size:12px; border:1px solid var(--gray-200); border-radius:4px; text-align:right;" oninput="formatInputRibuan(this)" />' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join("");
  
  document.getElementById("modalBlastWAError").classList.add("hidden");
  document.getElementById("modalBlastWA").classList.remove("hidden");
}

function closeModalBlastWA() {
  document.getElementById("modalBlastWA").classList.add("hidden");
}

async function submitBlastWA() {
  const updates = [];
  activeBlastData.bermasalah.forEach(t => {
    const el = document.getElementById('blast_nom_' + t.id);
    if (el) updates.push({ id: t.id, nominal: el.value.replace(/[^0-9]/g, '') });
  });
  
  const btn = document.getElementById("btnSubmitBlast");
  btn.disabled = true;
  btn.textContent = "Mengirim...";
  
  await executeBlastRequest(updates);
  
  btn.disabled = false;
  btn.textContent = "Kirim Semua";
  closeModalBlastWA();
}

async function executeBlastRequest(updates) {
  const resultEl = document.getElementById("blastResult");
  resultEl.innerHTML = '<div class="loading"><div class="spinner"></div> Sedang mengirim blast...</div>';
  resultEl.classList.remove("hidden");

  const res = await api("/api/reminder/execute_blast", "POST", {
    bulan: state.bulan,
    hanya_hari_ini: activeBlastData.hanya_hari_ini,
    updates: updates
  });

  if (res.error) {
    resultEl.innerHTML = '<div class="error-msg">❌ ' + res.error + '</div>';
    return;
  }

  resultEl.innerHTML =
    '<div style="background:var(--green-pale);border-radius:var(--radius-sm);padding:14px;font-size:13px;">' +
    '✅ Blast Selesai<br>Terkirim: <strong>' + res.terkirim + '</strong> · Gagal: <strong>' + res.gagal + '</strong>' +
    '</div>';
  toast("📲 " + res.terkirim + " WA terkirim!");
}
async function loadTemplate() {
  const sec = document.getElementById("templateSection");
  if (!sec) return;

  const templates = await api("/api/template");

  sec.innerHTML = templates.map((t) =>
    '<div class="card admin-section" style="margin-bottom:12px;">' +
      '<div style="font-size:13px;font-weight:700;margin-bottom:8px;">📝 ' + t.judul + '</div>' +
      '<div style="font-size:11px;color:var(--gray-400);margin-bottom:8px;">Variabel: ' +
        (t.id === "tagihan"
          ? '{nasabah_nama} {total} {jatuh_tempo} {marketing_nama}'
          : '{nasabah_nama} {jumlah} {tgl_sekarang} {marketing_nama}') +
      '</div>' +
      '<textarea id="tpl_' + t.id + '" style="width:100%;height:160px;padding:10px;border:1.5px solid var(--gray-200);border-radius:8px;font-size:12px;font-family:inherit;resize:vertical;">' +
        t.isi +
      '</textarea>' +
      '<button class="btn-primary full" style="margin-top:8px;" onclick="saveTemplate(\'' + t.id + '\')">' +
        '💾 Simpan Pesan ' + t.judul +
      '</button>' +
      '<div id="tpl_result_' + t.id + '" style="margin-top:8px;"></div>' +
    '</div>'
  ).join("");
}

async function saveTemplate(id) {
  const isi = document.getElementById("tpl_" + id).value.trim();
  const resultEl = document.getElementById("tpl_result_" + id);

  if (!isi) {
    resultEl.innerHTML = '<div class="error-msg">❌ Isi pesan tidak boleh kosong</div>';
    return;
  }

  const res = await api("/api/template/" + id, "PUT", { isi });

  if (res.error) {
    resultEl.innerHTML = '<div class="error-msg">❌ ' + res.error + '</div>';
    return;
  }

  resultEl.innerHTML = '<div style="background:var(--green-pale);border-radius:8px;padding:10px;font-size:12px;">✅ Template berhasil disimpan!</div>';
  toast("✅ Template pesan disimpan!");
  setTimeout(() => { resultEl.innerHTML = ""; }, 3000);
}

// ── MANAJEMEN USER ─────────────────────────────────────────────
function toggleUserList() {
  const container = document.getElementById("adminUserContainer");
  const icon = document.getElementById("toggleUserIcon");
  if (container.style.display === "none") {
    container.style.display = "block";
    icon.textContent = "▼";
  } else {
    container.style.display = "none";
    icon.textContent = "▶";
  }
}

async function loadUsersAdmin() {
  const list = document.getElementById("adminUserList");
  if (!list) return;
  const users = await api("/api/users");
  
  if (users.error) {
    list.innerHTML = '<div class="error-msg">❌ ' + users.error + '</div>';
    return;
  }
  
  state.adminUsers = users;
  
  list.innerHTML = users.map(u => {
    const isAktif = u.aktif === 1;
    const badge = isAktif ? '<span class="badge badge-green">Aktif</span>' : '<span class="badge badge-red">Nonaktif</span>';
    const btnReset = '<button class="btn-sm outline" onclick="resetPasswordUser(' + u.id + ', \'' + u.username + '\')" style="padding:4px 8px;font-size:10px;">🔑 Reset PW</button>';
    const btnEdit = '<button class="btn-sm green" onclick="openModalUser(' + u.id + ')" style="padding:4px 8px;font-size:10px;">✏️ Edit</button>';
    
    return '<div class="histori-item" style="padding:10px 0;">' +
      '<div class="histori-left">' +
        '<div class="h-nama">' + u.nama + ' ' + badge + '</div>' +
        '<div class="h-meta">@' + u.username + ' · AO: ' + (u.marketing_id || "-") + '</div>' +
      '</div>' +
      '<div class="histori-right" style="display:flex;gap:6px;">' +
        (u.role !== 'admin' ? btnReset + btnEdit : '<span class="badge badge-gray">Admin</span>') +
      '</div>' +
    '</div>';
  }).join("");
}

let activeUserId = null;

function openModalUser(id = null) {
  activeUserId = id;
  const errEl = document.getElementById("modalUserError");
  errEl.classList.add("hidden");
  
  if (id) {
    const u = state.adminUsers.find(x => x.id === id);
    document.getElementById("modalUserTitle").textContent = "✏️ Edit Marketing";
    document.getElementById("inputUserNama").value = u.nama;
    document.getElementById("inputUserUsername").value = u.username;
    document.getElementById("inputUserAO").value = u.marketing_id || "";
    document.getElementById("inputUserAktif").value = u.aktif;
    document.getElementById("statusUserWrap").classList.remove("hidden");
  } else {
    document.getElementById("modalUserTitle").textContent = "➕ Tambah Marketing";
    document.getElementById("inputUserNama").value = "";
    document.getElementById("inputUserUsername").value = "";
    document.getElementById("inputUserAO").value = "";
    document.getElementById("inputUserAktif").value = "1";
    document.getElementById("statusUserWrap").classList.add("hidden");
  }
  
  document.getElementById("modalUser").classList.remove("hidden");
}

function closeModalUser() {
  document.getElementById("modalUser").classList.add("hidden");
}

async function submitUser() {
  const nama = document.getElementById("inputUserNama").value.trim();
  const username = document.getElementById("inputUserUsername").value.trim();
  const marketing_id = document.getElementById("inputUserAO").value.trim();
  const aktif = document.getElementById("inputUserAktif").value;
  const errEl = document.getElementById("modalUserError");
  
  errEl.classList.add("hidden");
  if (!nama || !username) {
    errEl.textContent = "Nama dan username wajib diisi";
    errEl.classList.remove("hidden");
    return;
  }
  
  const btn = document.querySelector("#modalUser .btn-primary");
  btn.textContent = "Menyimpan...";
  btn.disabled = true;
  
  let res;
  if (activeUserId) {
    res = await api("/api/users/" + activeUserId, "PUT", { nama, username, marketing_id, aktif });
  } else {
    res = await api("/api/users", "POST", { nama, username, marketing_id, role: "marketing" });
  }
  
  btn.textContent = "💾 Simpan";
  btn.disabled = false;
  
  if (res.error) {
    errEl.textContent = res.error;
    errEl.classList.remove("hidden");
    return;
  }
  
  closeModalUser();
  toast(activeUserId ? "✅ User diupdate!" : "✅ User ditambahkan (Pass: bmt2026)");
  loadUsersAdmin();
}

async function resetPasswordUser(id, username) {
  if (!confirm('Reset password untuk ' + username + ' menjadi "bmt2026" ?')) return;
  
  const res = await api("/api/users/" + id + "/reset", "PUT");
  if (res.error) {
    toast("❌ " + res.error, "error");
  } else {
    toast("✅ Password " + username + " direset ke bmt2026");
  }
}

// ── RESCHEDULE LOGIC ───────────────────────────────────────────
async function checkPendingReschedule() {
  if (state.user.role !== "admin") return;
  const banner = document.getElementById("rescheduleBanner");
  if (!banner) return;
  try {
    const res = await api("/api/reschedule/pending");
    if (res && res.length > 0) {
      banner.classList.remove("hidden");
      document.getElementById("rescheduleBannerCount").textContent = res.length;
      state.pendingReschedule = res;
    } else {
      banner.classList.add("hidden");
      state.pendingReschedule = [];
    }
  } catch(e) {}
}

function openModalReschedule() {
  const listEl = document.getElementById("rescheduleList");
  if (!state.pendingReschedule || state.pendingReschedule.length === 0) {
    listEl.innerHTML = '<p>Tidak ada data.</p>';
  } else {
    listEl.innerHTML = state.pendingReschedule.map(n => `
      <div style="border:1px solid var(--gray-200); padding:10px; border-radius:8px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-weight:600; font-size:13px;">${n.nama}</div>
          <div style="font-size:11px; color:var(--gray-500);">${n.no_rekening}</div>
        </div>
        <div style="display:flex; gap:6px;">
          <button class="btn-sm green" onclick="submitReschedule('${n.no_rekening}', 1)">Ya</button>
          <button class="btn-sm outline" onclick="submitReschedule('${n.no_rekening}', 0)">Bukan</button>
        </div>
      </div>
    `).join('');
  }
  document.getElementById("modalReschedule").classList.remove("hidden");
}

function closeModalReschedule() {
  document.getElementById("modalReschedule").classList.add("hidden");
}

async function submitReschedule(no_rekening, is_reschedule) {
  await api("/api/reschedule/confirm", "POST", { no_rekening, is_reschedule });
  await checkPendingReschedule();
  openModalReschedule();
  if (state.pendingReschedule.length === 0) {
    closeModalReschedule();
    renderTagihan();
  }
}