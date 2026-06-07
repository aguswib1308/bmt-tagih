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
// ── TAMBAHAN FITUR BMT ─────────────────────────────────────────
// Patch navigate - dipanggil setelah DOM ready
state.activeRiwayatRek = null;

document.addEventListener("DOMContentLoaded", function() {
  const origRenderPage = window.renderPage;
  window.renderPage = function() {
    const p = state.page;
    if (p === "marketing_dashboard") {
      document.getElementById("mainContent").innerHTML = '<div class="loading"><div class="spinner"></div> Memuat...</div>';
      renderMarketingDashboard();
    } else if (p === "riwayat_anggota") {
      document.getElementById("mainContent").innerHTML = '<div class="loading"><div class="spinner"></div> Memuat...</div>';
      renderRiwayatAnggota();
    } else if (p === "jadwal_notif") {
      document.getElementById("mainContent").innerHTML = '<div class="loading"><div class="spinner"></div> Memuat...</div>';
      renderJadwalNotif();
    } else if (p === "monitoring_kol") {
      document.getElementById("mainContent").innerHTML = '<div class="loading"><div class="spinner"></div> Memuat...</div>';
      renderMonitoringKol();
    } else {
      origRenderPage();
    }
  };
});

function initTambahanNav() {
  const nav = document.querySelector(".bottom-nav");
  if (!nav || document.getElementById("navMarketing")) return;
  const b1 = document.createElement("button");
  b1.className="nav-item"; b1.id="navMarketing"; b1.dataset.page="marketing_dashboard";
  b1.innerHTML='<span class="nav-icon">📈</span>Statistik';
  b1.onclick=function(){ state.page="marketing_dashboard"; document.querySelectorAll(".nav-item").forEach(el=>el.classList.toggle("active",el.dataset.page==="marketing_dashboard")); renderPage(); };
  nav.appendChild(b1);
  const b3 = document.createElement("button");
  b3.className="nav-item"; b3.id="navMonitor"; b3.dataset.page="monitoring_kol";
  b3.innerHTML='<span class="nav-icon">🔍</span>Monitor';
  b3.onclick=function(){ state.page="monitoring_kol"; document.querySelectorAll(".nav-item").forEach(el=>el.classList.toggle("active",el.dataset.page==="monitoring_kol")); renderPage(); };
  nav.appendChild(b3);
  if (state.user && state.user.role==="admin") {
    const b2 = document.createElement("button");
    b2.className="nav-item"; b2.id="navJadwal"; b2.dataset.page="jadwal_notif";
    b2.innerHTML='<span class="nav-icon">🔔</span>Notif';
    b2.onclick=function(){ state.page="jadwal_notif"; document.querySelectorAll(".nav-item").forEach(el=>el.classList.toggle("active",el.dataset.page==="jadwal_notif")); renderPage(); };
    nav.appendChild(b2);
  }
}
async function renderMarketingDashboard() {
  const main = document.getElementById("mainContent");
  const [data, ranking] = await Promise.all([
    api("/api/dashboard/marketing?bulan=" + state.bulan),
    api("/api/dashboard/ranking?bulan=" + state.bulan)
  ]);
  if (data.error) { main.innerHTML = '<div class="empty-state"><p>' + data.error + '</p></div>'; return; }
  const kolLabel = ["","Lancar","DPK","Kurang Lancar","Diragukan","Macet"];
  const kolColor = ["","#27ae60","#f39c12","#e67e22","#e74c3c","#922b21"];
  const kolHtml = data.kolektibilitas.map(k => {
    const pct = k.total > 0 ? Math.round(k.lunas/k.total*100) : 0;
    return '<div style="margin-bottom:10px;"><div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;margin-bottom:4px;"><span style="color:'+kolColor[k.kolektibilitas]+'">'+kolLabel[k.kolektibilitas]+'</span><span>'+k.lunas+'/'+k.total+' · '+pct+'%</span></div><div style="background:var(--gray-200);border-radius:99px;height:8px;overflow:hidden;"><div style="background:'+kolColor[k.kolektibilitas]+';width:'+pct+'%;height:100%;border-radius:99px;"></div></div></div>';
  }).join("");
  const rankHtml = ranking.map((r,i) => {
    const medal = i===0?"🥇":i===1?"🥈":i===2?"🥉":(i+1)+".";
    const pct = r.pct_kolektibilitas||0;
    const bg = pct>=80?'var(--green-pale)':pct>=50?'var(--yellow-pale)':'var(--red-pale)';
    const col = pct>=80?'var(--green-dark)':pct>=50?'var(--yellow-dark)':'var(--red-dark)';
    return '<div class="rekap-row"><div><div class="rekap-name">'+medal+' '+(r.marketing_nama||"-")+'</div><div class="rekap-count">'+r.lunas+'/'+r.total_nasabah+' nasabah · '+rpShort(r.nominal_lunas)+'</div></div><div class="rekap-badge" style="background:'+bg+';color:'+col+';">'+pct+'%</div></div>';
  }).join("");
  const tunggakHtml = data.top_tunggak.length===0
    ? '<div class="empty-state" style="padding:16px;"><p>Semua nasabah sudah bayar 🎉</p></div>'
    : data.top_tunggak.map(t=>'<div class="rekap-row" onclick="bukaRiwayat(\''+t.no_rekening+'\')" style="cursor:pointer;"><div><div class="rekap-name">'+t.nama+'</div><div class="rekap-count">'+t.no_rekening+' · '+(t.marketing_nama||"-")+'</div></div><div style="text-align:right;"><div style="font-size:14px;font-weight:800;color:var(--red-dark);">'+rpShort(t.total_tagihan)+'</div><div style="font-size:10px;color:var(--gray-400);">Kol '+t.kolektibilitas+'</div></div></div>').join("");
  const maxN = Math.max(...data.tren_harian.map(t=>t.total_nominal||0),1);
  const trenHtml = data.tren_harian.length===0
    ? '<div style="text-align:center;color:var(--gray-400);padding:16px;font-size:13px;">Belum ada transaksi bulan ini</div>'
    : '<div style="display:flex;align-items:flex-end;gap:4px;height:80px;padding:8px 0;">'+data.tren_harian.map(t=>{const p=Math.round((t.total_nominal/maxN)*100);return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;"><div style="width:100%;background:var(--primary);border-radius:3px 3px 0 0;height:'+p+'%;min-height:3px;"></div><div style="font-size:8px;color:var(--gray-400);">'+t.hari+'</div></div>';}).join("")+'</div>';
  main.innerHTML = bulanPickerHtml(state.bulan)+
    '<div class="section-title">📊 Kolektibilitas</div><div class="card" style="padding:16px;">'+kolHtml+'</div>'+
    '<div class="section-title">📈 Tren Pembayaran Harian</div><div class="card" style="padding:16px;">'+trenHtml+'</div>'+
    '<div class="section-title">🏆 Ranking Marketing '+bulanLabel(state.bulan)+'</div><div class="card">'+(rankHtml||'<div class="empty-state" style="padding:16px;"><p>Belum ada data</p></div>')+'</div>'+
    '<div class="section-title">🔴 Top 5 Tunggakan Terbesar</div><div class="card">'+tunggakHtml+'</div>'+
    '<div class="section-title">📅 Belum Bayar Minggu Ini</div><div id="belumMingguIniBox"><div class="loading"><div class="spinner"></div> Memuat...</div></div>';
  loadBelumMingguIni();
}
async function loadBelumMingguIni() {
  const box = document.getElementById("belumMingguIniBox");
  if (!box) return;
  const res = await api("/api/dashboard/belum-minggu-ini?bulan="+state.bulan);
  if (!res.data||res.data.length===0) { box.innerHTML='<div class="card"><div class="empty-state" style="padding:16px;"><p>✅ Tidak ada jatuh tempo minggu ini</p></div></div>'; return; }
  box.innerHTML='<div class="card">'+res.data.map(t=>'<div class="rekap-row"><div><div class="rekap-name">'+t.nama+'</div><div class="rekap-count">JT tgl '+t.tgl_jt_num+' · '+(t.marketing_nama||"-")+'</div></div><div style="text-align:right;"><div style="font-size:13px;font-weight:800;color:var(--red-dark);">'+rpShort(t.total_tagihan)+'</div></div></div>').join("")+'</div>';
}
async function bukaRiwayat(no_rekening) {
  state.activeRiwayatRek = no_rekening;
  state.page = "riwayat_anggota";
  document.querySelectorAll(".nav-item").forEach(el=>el.classList.remove("active"));
  renderPage();
}
async function renderRiwayatAnggota() {
  const main = document.getElementById("mainContent");
  if (!state.activeRiwayatRek) {
    main.innerHTML = '<div class="section-title">Cari Anggota</div><input class="search-bar" type="search" placeholder="🔍 Ketik nama / no rekening..." id="searchRiwayat" oninput="searchAnggota(this.value)"/><div id="hasilCariAnggota" class="card" style="display:none;max-height:60vh;overflow-y:auto;"></div><div class="empty-state" id="emptyRiwayat"><div class="empty-icon">🔍</div><p>Ketik nama atau no rekening anggota</p></div>';
    return;
  }
  const res = await api("/api/nasabah/"+state.activeRiwayatRek+"/riwayat");
  if (res.error) { main.innerHTML='<div class="empty-state"><p>'+res.error+'</p></div>'; return; }
  const n = res.nasabah;
  const totalLunas = res.tagihan.filter(t=>t.status==="LUNAS").length;
  const totalBelum = res.tagihan.length-totalLunas;
  const totalNominalLunas = res.tagihan.filter(t=>t.status==="LUNAS").reduce((a,b)=>a+(b.total_tagihan||0),0);
  const riwayatRows = res.tagihan.map(t=>{
    const isLunas=t.status==="LUNAS";
    return '<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:12px 16px;border-bottom:1px solid var(--gray-100);"><div><div style="font-size:13px;font-weight:700;">'+bulanLabel(t.bulan)+'</div><div style="font-size:11px;color:var(--gray-400);margin-top:2px;">Pokok: '+rpShort(t.tunggakan_pokok)+' · Margin: '+rpShort(t.tunggakan_margin)+'</div>'+(isLunas&&t.tgl_bayar_app?'<div style="font-size:10px;color:var(--green-dark);">Dibayar: '+fmtTgl(t.tgl_bayar_app)+'</div>':'')+'</div><div style="text-align:right;"><div style="font-size:14px;font-weight:800;color:'+(isLunas?'var(--green-dark)':'var(--red-dark)')+';">'+rpShort(t.total_tagihan)+'</div><span class="badge '+(isLunas?'badge-green':'badge-red')+'">'+(isLunas?'✅ LUNAS':'⏳ BELUM')+'</span></div></div>';
  }).join("");
  main.innerHTML =
    '<button class="btn-sm outline" onclick="state.activeRiwayatRek=null;renderPage();" style="margin-bottom:12px;">← Cari Lain</button>'+
    '<div class="card" style="padding:16px;margin-bottom:12px;"><div style="font-size:17px;font-weight:800;">'+n.nama+'</div><div style="font-size:12px;color:var(--gray-400);margin-top:4px;">📋 '+n.no_rekening+'</div><div style="font-size:12px;color:var(--gray-400);">👤 '+(n.marketing_nama||"-")+'</div><div style="font-size:12px;color:var(--gray-400);">📱 '+(n.no_hp||"Belum diisi")+'</div></div>'+
    '<div class="stats-grid" style="margin-bottom:12px;"><div class="stat-card green"><div class="stat-label">Lunas</div><div class="stat-value">'+totalLunas+'</div><div class="stat-sub">'+rpShort(totalNominalLunas)+'</div></div><div class="stat-card red"><div class="stat-label">Belum</div><div class="stat-value">'+totalBelum+'</div><div class="stat-sub">dari '+res.tagihan.length+' bulan</div></div></div>'+
    '<div class="section-title">Riwayat per Bulan</div><div class="card">'+(riwayatRows||'<div class="empty-state" style="padding:16px;"><p>Belum ada data</p></div>')+'</div>';
}
let _searchAnggotaTimer=null;
async function searchAnggota(q) {
  if (_searchAnggotaTimer) clearTimeout(_searchAnggotaTimer);
  _searchAnggotaTimer = setTimeout(async()=>{
    if (!q||q.length<2) { document.getElementById("hasilCariAnggota").style.display="none"; return; }
    const res = await api("/api/tagihan?bulan="+state.bulan+"&q="+encodeURIComponent(q)+"&limit=20&offset=0");
    const hasil = document.getElementById("hasilCariAnggota");
    if (!res.data||res.data.length===0) { hasil.innerHTML='<div class="empty-state" style="padding:16px;"><p>Tidak ditemukan</p></div>'; hasil.style.display="block"; return; }
    hasil.innerHTML=res.data.map(t=>'<div class="rekap-row" onclick="bukaRiwayat(\''+t.no_rekening+'\')" style="cursor:pointer;"><div><div class="rekap-name">'+t.nama+'</div><div class="rekap-count">'+t.no_rekening+' · '+(t.marketing_nama||"-")+'</div></div><span class="badge '+(t.status==="LUNAS"?"badge-green":"badge-red")+'">'+t.status+'</span></div>').join("");
    hasil.style.display="block";
  },350);
}
async function renderJadwalNotif() {
  const main=document.getElementById("mainContent");
  if (state.user.role!=="admin") { main.innerHTML='<div class="empty-state"><div class="empty-icon">🔒</div><p>Akses admin saja</p></div>'; return; }
  const jadwal=await api("/api/jadwal-notif");
  const tipeLabel={"reminder_h3":"⏰ Reminder H-3","laporan_harian":"📊 Laporan Harian","rekap_mingguan":"📋 Rekap Mingguan"};
  const jadwalHtml=jadwal.map(j=>'<div class="card admin-section" style="margin-bottom:12px;"><div style="font-size:13px;font-weight:800;margin-bottom:8px;">'+(tipeLabel[j.tipe]||j.tipe)+'</div><div style="font-size:12px;color:var(--gray-500);margin-bottom:12px;">'+j.keterangan+'</div><div style="display:flex;gap:10px;align-items:center;margin-bottom:10px;"><div style="flex:1;"><div class="modal-label">Jam</div><input type="time" id="jam_'+j.id+'" value="'+j.jam+'" class="modal-input" style="margin-bottom:0;"/></div><div><div class="modal-label">Status</div><select id="aktif_'+j.id+'" class="modal-input" style="margin-bottom:0;"><option value="1" '+(j.aktif?"selected":"")+'>✅ Aktif</option><option value="0" '+(!j.aktif?"selected":"")+'>⏸️ Nonaktif</option></select></div></div><div style="display:flex;gap:8px;"><button class="btn-sm green" onclick="simpanJadwal('+j.id+')">💾 Simpan</button><button class="btn-sm outline" onclick="testNotif(\''+j.tipe+'\')">🧪 Test</button></div><div id="jadwal_result_'+j.id+'" style="margin-top:8px;"></div></div>').join("");
  main.innerHTML='<div class="section-title">🔔 Status Notifikasi</div><div class="card" id="toggleNotifBox"><div class="loading"><div class="spinner"></div> Memuat...</div></div><div class="section-title">⚙️ Jadwal Notifikasi</div><div style="background:var(--yellow-pale);border-radius:8px;padding:12px;font-size:12px;color:var(--yellow-dark);margin-bottom:12px;">⚠️ Notifikasi otomatis selama app aktif di browser.</div>'+jadwalHtml+'<div class="section-title">📲 Kirim Manual</div><div class="card admin-section"><div style="display:flex;flex-direction:column;gap:10px;"><button class="btn-primary" onclick="testNotif(\'reminder_h3\')">⏰ Reminder H-3</button><button class="btn-primary" style="background:var(--green-mid);" onclick="testNotif(\'laporan_harian\')">📊 Laporan Harian</button><button class="btn-primary" style="background:var(--yellow-dark);" onclick="testNotif(\'rekap_mingguan\')">📋 Rekap Mingguan</button></div><div id="testNotifResult" style="margin-top:12px;"></div></div>';
  loadToggleNotif();
}
async function simpanJadwal(id) {
  const res=await api("/api/jadwal-notif/"+id,"PUT",{jam:document.getElementById("jam_"+id).value,aktif:document.getElementById("aktif_"+id).value});
  const el=document.getElementById("jadwal_result_"+id);
  if (res.success) { el.innerHTML='<div style="color:var(--green-dark);font-size:12px;font-weight:700;">✅ Tersimpan!</div>'; toast("✅ Jadwal disimpan"); setTimeout(()=>{el.innerHTML=""},3000); }
}
async function testNotif(tipe) {
  const el=document.getElementById("testNotifResult");
  if (el) el.innerHTML='<div class="loading"><div class="spinner"></div> Mengirim...</div>';
  const ep={"reminder_h3":"/api/notif/reminder-h3","laporan_harian":"/api/notif/laporan-harian","rekap_mingguan":"/api/notif/rekap-mingguan"};
  const res=await api(ep[tipe],"POST");
  if (el) {
    if (res.success) { el.innerHTML='<div style="background:var(--green-pale);border-radius:8px;padding:10px;font-size:12px;">✅ Terkirim: <strong>'+(res.terkirim||0)+'</strong> · Gagal: <strong>'+(res.gagal||0)+'</strong>'+(res.preview_pesan?'<details style="margin-top:8px;"><summary style="cursor:pointer;">Preview Pesan</summary><pre style="font-size:10px;white-space:pre-wrap;background:#f5f5f5;padding:8px;border-radius:4px;">'+res.preview_pesan+'</pre></details>':'')+'</div>'; }
    else { el.innerHTML='<div class="error-msg">❌ '+(res.error||"Gagal")+'</div>'; }
  }
  toast("📲 "+(res.terkirim||0)+" notifikasi terkirim");
}
// Init nav setelah login
document.addEventListener("DOMContentLoaded", function() {
  const origShowApp = window.showApp;
  if (origShowApp) {
    window.showApp = function() {
      origShowApp.call(this);
      setTimeout(initTambahanNav, 300);
    };
  }
});
// ── TOGGLE NOTIF UI ─────────────────────────────────────────────
async function loadToggleNotif() {
  const res = await api("/api/notif/status");
  const aktif = res.aktif;
  const el = document.getElementById("toggleNotifBox");
  if (!el) return;
  el.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:16px;">' +
    '<div>' +
    '<div style="font-size:14px;font-weight:800;">📲 Notifikasi WA ke Anggota</div>' +
    '<div style="font-size:12px;color:var(--gray-400);margin-top:2px;">' + (aktif ? '✅ Aktif — WA akan terkirim ke anggota' : '⏸️ Nonaktif — semua WA diblokir') + '</div>' +
    '</div>' +
    '<button onclick="toggleNotif(' + !aktif + ')" class="btn-sm ' + (aktif ? 'outline" style="color:var(--red-dark);border-color:var(--red-dark);"' : 'green"') + '>' +
    (aktif ? '🔴 Matikan' : '✅ Aktifkan') +
    '</button></div>';
}

async function toggleNotif(aktif) {
  const res = await api("/api/notif/toggle", "POST", { aktif });
  if (res.success) {
    toast(aktif ? "✅ Notifikasi WA diaktifkan!" : "⏸️ Notifikasi WA dimatikan!");
    loadToggleNotif();
  }
}

// ── MONITORING KOLEKTIBILITAS 2-5 ─────────────────────────────────
const KOL_LABEL = ["","Lancar","DPK","Kurang Lancar","Diragukan","Macet"];
const KOL_COLOR = ["","#27ae60","#e67e22","#e74c3c","#c0392b","#7b241c"];
const KOL_BG    = ["","#eafaf1","#fef9e7","#fdedec","#f9ebea","#f4ecf7"];

state.monitorKolFilter = 0; // 0=semua
state.monitorTabRekap = false;

async function renderMonitoringKol() {
  const main = document.getElementById("mainContent");
  const bulan = state.bulan;
  const isAdmin = state.user && state.user.role === "admin";

  const filterBtns = [0,2,3,4,5].map(k=>
    '<button onclick="setMonitorFilter('+k+')" id="mfBtn'+k+'" class="btn-sm '+(state.monitorKolFilter===k?'green':'outline')+'" style="font-size:11px;padding:4px 10px;">'+(k===0?'Semua':KOL_LABEL[k])+'</button>'
  ).join("");

  const tabHtml = isAdmin
    ? '<div style="display:flex;gap:0;margin-bottom:12px;border-radius:8px;overflow:hidden;border:1px solid var(--gray-200);">'
      + '<button onclick="setMonitorTab(false)" style="flex:1;padding:8px;font-size:12px;font-weight:700;border:none;cursor:pointer;background:'+(state.monitorTabRekap?'#fff':'var(--green-mid)')+';color:'+(state.monitorTabRekap?'var(--gray-500)':'#fff')+';">Daftar Nasabah</button>'
      + '<button onclick="setMonitorTab(true)" style="flex:1;padding:8px;font-size:12px;font-weight:700;border:none;cursor:pointer;background:'+(state.monitorTabRekap?'var(--green-mid)':'#fff')+';color:'+(state.monitorTabRekap?'#fff':'var(--gray-500)')+';">Rekap Bulanan</button>'
      + '</div>'
    : '';

  main.innerHTML = '<div class="section-title">🔍 Monitoring Kolektibilitas 2–5</div>'
    + tabHtml
    + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">'+filterBtns+'</div>'
    + '<div id="monitorContent"><div class="loading"><div class="spinner"></div> Memuat...</div></div>';

  if (state.monitorTabRekap && isAdmin) {
    loadMonitorRekap(bulan);
  } else {
    loadMonitorList(bulan);
  }
}

function setMonitorFilter(k) {
  state.monitorKolFilter = k;
  renderMonitoringKol();
}

function setMonitorTab(isRekap) {
  state.monitorTabRekap = isRekap;
  renderMonitoringKol();
}

async function loadMonitorList(bulan) {
  const box = document.getElementById("monitorContent");
  const rows = await api("/api/monitoring/nasabah?bulan=" + bulan);
  if (!Array.isArray(rows) || rows.length === 0) {
    box.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><p>Tidak ada nasabah kolektibilitas 2–5 bulan ini</p></div>';
    return;
  }
  const filtered = state.monitorKolFilter > 0 ? rows.filter(r => r.kolektibilitas === state.monitorKolFilter) : rows;
  if (filtered.length === 0) {
    box.innerHTML = '<div class="empty-state"><p>Tidak ada nasabah untuk filter ini</p></div>';
    return;
  }
  const html = filtered.map(r => {
    const kol = r.kolektibilitas;
    const tunggakan = (r.tunggakan_pokok||0) + (r.tunggakan_margin||0);
    const visited = r.jumlah_kunjungan > 0;
    return '<div class="card" style="margin-bottom:8px;padding:0;overflow:hidden;">'
      + '<div style="padding:12px 14px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;">'
      + '<div style="flex:1;min-width:0;">'
      + '<div style="font-size:13px;font-weight:800;color:var(--gray-800);margin-bottom:2px;">'+r.nama+'</div>'
      + '<div style="font-size:11px;color:var(--gray-500);">'+r.no_rekening+' · '+(r.marketing_nama||"-")+'</div>'
      + '</div>'
      + '<span style="background:'+KOL_BG[kol]+';color:'+KOL_COLOR[kol]+';font-size:10px;font-weight:800;padding:3px 8px;border-radius:99px;white-space:nowrap;margin-left:8px;">'+KOL_LABEL[kol]+'</span>'
      + '</div>'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">'
      + '<div>'
      + '<div style="font-size:12px;font-weight:700;color:var(--red-dark);">'+rpShort(r.total_tagihan)+'</div>'
      + (tunggakan>0?'<div style="font-size:11px;color:var(--gray-500);">Tunggakan: '+rpShort(tunggakan)+'</div>':'')
      + '</div>'
      + '<div style="display:flex;gap:6px;align-items:center;">'
      + (visited ? '<span style="font-size:11px;color:var(--green-dark);font-weight:700;">✅ '+r.jumlah_kunjungan+'x kunjungan</span>' : '<span style="font-size:11px;color:var(--gray-400);">Belum dikunjungi</span>')
      + '<button onclick="bukaFormKunjungan(\''+r.no_rekening+'\',\''+r.nama.replace(/'/g,"\\'")+'\',\''+bulan+'\')" class="btn-sm green" style="font-size:11px;padding:4px 10px;">+ Kunjungan</button>'
      + '</div>'
      + '</div>'
      + '</div>'
      + '</div>';
  }).join("");
  const total = rows.length;
  const sudahKunjung = rows.filter(r=>r.jumlah_kunjungan>0).length;
  box.innerHTML = '<div class="card" style="padding:12px 14px;margin-bottom:10px;display:flex;gap:16px;">'
    + '<div style="text-align:center;flex:1;"><div style="font-size:18px;font-weight:800;color:var(--red-dark);">'+total+'</div><div style="font-size:11px;color:var(--gray-500);">Total</div></div>'
    + '<div style="text-align:center;flex:1;"><div style="font-size:18px;font-weight:800;color:var(--green-dark);">'+sudahKunjung+'</div><div style="font-size:11px;color:var(--gray-500);">Dikunjungi</div></div>'
    + '<div style="text-align:center;flex:1;"><div style="font-size:18px;font-weight:800;color:var(--yellow-dark);">'+(total-sudahKunjung)+'</div><div style="font-size:11px;color:var(--gray-500);">Belum</div></div>'
    + '</div>' + html;
}

async function loadMonitorRekap(bulan) {
  const box = document.getElementById("monitorContent");
  const rows = await api("/api/monitoring/rekap?bulan=" + bulan);
  if (!Array.isArray(rows) || rows.length === 0) {
    box.innerHTML = '<div class="empty-state"><p>Tidak ada data rekap</p></div>';
    return;
  }
  const filtered = state.monitorKolFilter > 0 ? rows.filter(r => r.kolektibilitas === state.monitorKolFilter) : rows;
  const totalTagihan = filtered.reduce((s,r)=>s+(r.total_tagihan||0),0);
  const sudahKunjung = filtered.filter(r=>r.jumlah_kunjungan>0).length;
  const html = filtered.map(r => {
    const kol = r.kolektibilitas;
    const tunggakan = (r.tunggakan_pokok||0)+(r.tunggakan_margin||0);
    const statusBadge = r.status==="LUNAS"?'<span class="badge badge-green">LUNAS</span>':'<span class="badge badge-red">BELUM</span>';
    return '<tr style="border-bottom:1px solid var(--gray-100);">'
      + '<td style="padding:8px 6px;font-size:12px;font-weight:700;">'+r.nama+'<div style="font-size:10px;color:var(--gray-500);">'+r.no_rekening+'</div></td>'
      + '<td style="padding:8px 6px;font-size:11px;">'+( r.marketing_nama||"-")+'</td>'
      + '<td style="padding:8px 6px;text-align:center;"><span style="background:'+KOL_BG[kol]+';color:'+KOL_COLOR[kol]+';font-size:10px;font-weight:800;padding:2px 6px;border-radius:99px;">'+KOL_LABEL[kol]+'</span></td>'
      + '<td style="padding:8px 6px;font-size:11px;font-weight:700;color:var(--red-dark);text-align:right;">'+rpShort(r.total_tagihan)+'</td>'
      + '<td style="padding:8px 6px;font-size:11px;text-align:right;">'+(tunggakan>0?rpShort(tunggakan):'-')+'</td>'
      + '<td style="padding:8px 6px;text-align:center;">'+statusBadge+'</td>'
      + '<td style="padding:8px 6px;text-align:center;font-size:11px;">'+(r.jumlah_kunjungan>0?'<span style="color:var(--green-dark);font-weight:700;">✅ '+r.jumlah_kunjungan+'x</span><div style="font-size:10px;color:var(--gray-400);">'+r.terakhir_kunjungan+'</div>':'<span style="color:var(--gray-400);">-</span>')+'</td>'
      + '<td style="padding:8px 6px;font-size:10px;color:var(--gray-600);max-width:120px;word-break:break-word;">'+( r.catatan_kunjungan||"")+'</td>'
      + '</tr>';
  }).join("");
  box.innerHTML = '<div class="card" style="padding:12px 14px;margin-bottom:10px;display:flex;gap:16px;">'
    + '<div style="text-align:center;flex:1;"><div style="font-size:16px;font-weight:800;color:var(--red-dark);">'+filtered.length+'</div><div style="font-size:11px;color:var(--gray-500);">Nasabah</div></div>'
    + '<div style="text-align:center;flex:1;"><div style="font-size:16px;font-weight:800;color:var(--green-dark);">'+sudahKunjung+'</div><div style="font-size:11px;color:var(--gray-500);">Dikunjungi</div></div>'
    + '<div style="text-align:center;flex:1;"><div style="font-size:16px;font-weight:800;color:var(--yellow-dark);">'+rpShort(totalTagihan)+'</div><div style="font-size:11px;color:var(--gray-500);">Total Tagihan</div></div>'
    + '</div>'
    + '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">'
    + '<thead><tr style="background:var(--gray-50);"><th style="padding:8px 6px;text-align:left;font-size:11px;">Nasabah</th><th style="padding:8px 6px;text-align:left;font-size:11px;">Marketing</th><th style="padding:8px 6px;font-size:11px;">Kol</th><th style="padding:8px 6px;font-size:11px;text-align:right;">Tagihan</th><th style="padding:8px 6px;font-size:11px;text-align:right;">Tunggakan</th><th style="padding:8px 6px;font-size:11px;">Status</th><th style="padding:8px 6px;font-size:11px;">Kunjungan</th><th style="padding:8px 6px;font-size:11px;">Catatan</th></tr></thead>'
    + '<tbody>' + html + '</tbody></table></div>';
}

function bukaFormKunjungan(no_rek, nama, bulan) {
  const existing = document.getElementById("modalKunjungan");
  if (existing) existing.remove();
  const modal = document.createElement("div");
  modal.id = "modalKunjungan";
  modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:flex-end;";
  modal.innerHTML = '<div style="background:#fff;border-radius:16px 16px 0 0;width:100%;max-height:90vh;overflow-y:auto;padding:20px;">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'
    + '<div><div style="font-size:15px;font-weight:800;">Catat Kunjungan</div><div style="font-size:12px;color:var(--gray-500);">'+nama+'</div></div>'
    + '<button onclick="document.getElementById(\'modalKunjungan\').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--gray-400);">✕</button>'
    + '</div>'
    + '<form id="formKunjungan" onsubmit="submitKunjungan(event,\''+no_rek+'\',\''+bulan+'\')">'
    + '<div class="modal-label">Catatan Kunjungan</div>'
    + '<textarea id="kunjCatatan" class="modal-input" rows="4" placeholder="Kondisi nasabah, alasan tunggakan, janji bayar, dll..." style="resize:none;"></textarea>'
    + '<div class="modal-label" style="margin-top:12px;">Foto Kunjungan (opsional)</div>'
    + '<div id="fotoPreviewBox" style="margin-bottom:12px;">'
    + '<label style="display:flex;flex-direction:column;align-items:center;justify-content:center;border:2px dashed var(--gray-300);border-radius:10px;padding:20px;cursor:pointer;gap:8px;">'
    + '<span style="font-size:28px;">📷</span><span style="font-size:12px;color:var(--gray-500);">Tap untuk ambil/pilih foto</span>'
    + '<input type="file" id="kunjFoto" accept="image/*" style="display:none;" onchange="previewFoto(this)">'
    + '</label></div>'
    + '<div id="kunjunganRiwayat" style="margin-bottom:12px;"></div>'
    + '<button type="submit" class="btn-primary" style="width:100%;">💾 Simpan Kunjungan</button>'
    + '</form></div>';
  document.body.appendChild(modal);
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
  loadRiwayatKunjungan(no_rek, bulan);
}

function previewFoto(input) {
  const box = document.getElementById("fotoPreviewBox");
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = e => {
      box.innerHTML = '<div style="position:relative;display:inline-block;width:100%;">'
        + '<img src="'+e.target.result+'" style="width:100%;max-height:200px;object-fit:cover;border-radius:10px;display:block;">'
        + '<button onclick="hapusFotoPreview()" style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.6);color:#fff;border:none;border-radius:99px;width:28px;height:28px;cursor:pointer;font-size:14px;">✕</button>'
        + '</div>';
    };
    reader.readAsDataURL(input.files[0]);
  }
}

function hapusFotoPreview() {
  document.getElementById("fotoPreviewBox").innerHTML =
    '<label style="display:flex;flex-direction:column;align-items:center;justify-content:center;border:2px dashed var(--gray-300);border-radius:10px;padding:20px;cursor:pointer;gap:8px;">'
    + '<span style="font-size:28px;">📷</span><span style="font-size:12px;color:var(--gray-500);">Tap untuk ambil/pilih foto</span>'
    + '<input type="file" id="kunjFoto" accept="image/*" style="display:none;" onchange="previewFoto(this)">'
    + '</label>';
}

async function submitKunjungan(e, no_rek, bulan) {
  e.preventDefault();
  const catatan = document.getElementById("kunjCatatan").value.trim();
  const fotoInput = document.getElementById("kunjFoto");
  if (!catatan) { toast("❗ Catatan tidak boleh kosong"); return; }
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true; btn.textContent = "Menyimpan...";
  const fd = new FormData();
  fd.append("no_rekening", no_rek);
  fd.append("bulan", bulan);
  fd.append("catatan", catatan);
  if (fotoInput && fotoInput.files[0]) fd.append("foto", fotoInput.files[0]);
  try {
    const res = await fetch("/api/kunjungan", { method:"POST", body: fd });
    const data = await res.json();
    if (data.success) {
      toast("✅ Kunjungan berhasil dicatat!");
      document.getElementById("modalKunjungan").remove();
      renderMonitoringKol();
    } else {
      toast("❌ " + (data.error || "Gagal menyimpan"));
      btn.disabled = false; btn.textContent = "💾 Simpan Kunjungan";
    }
  } catch(err) {
    toast("❌ Koneksi gagal"); btn.disabled = false; btn.textContent = "💾 Simpan Kunjungan";
  }
}

async function loadRiwayatKunjungan(no_rek, bulan) {
  const box = document.getElementById("kunjunganRiwayat");
  if (!box) return;
  const rows = await api("/api/kunjungan/" + no_rek + "?bulan=" + bulan);
  if (!Array.isArray(rows) || rows.length === 0) return;
  box.innerHTML = '<div style="font-size:12px;font-weight:700;margin-bottom:8px;color:var(--gray-600);">Riwayat Kunjungan Bulan Ini</div>'
    + rows.map(r =>
      '<div style="background:var(--gray-50);border-radius:8px;padding:10px;margin-bottom:6px;">'
      + '<div style="font-size:11px;color:var(--gray-500);margin-bottom:4px;">'+r.tanggal+' · '+( r.dicatat_oleh||"-")+'</div>'
      + (r.foto_path ? '<img src="/foto_kunjungan/'+r.foto_path+'" style="width:100%;max-height:150px;object-fit:cover;border-radius:6px;margin-bottom:6px;display:block;">' : '')
      + '<div style="font-size:12px;">'+r.catatan+'</div>'
      + '</div>'
    ).join("");
}

