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
  try {
    const res = await fetch(path, opts);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return { error: "Server error (status " + res.status + ")" };
    }
  } catch (e) {
    return { error: "Koneksi gagal: " + e.message };
  }
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
    setTimeout(initTambahanNav, 300);
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
    (function(){
    const r = state.user.role;
    const label = r==="admin" ? " · Admin" : r==="leader" ? " · Leader" : r==="petugas" ? " · Petugas" : " · Marketing";
    return state.user.nama + label;
  })();
  // navAdmin/navTemplate sudah dihapus dari static HTML, ditangani initTambahanNav
  applyDesktopModeFromStorage();
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
  setTimeout(initTambahanNav, 300);
}

async function doLogout() {
  await api("/api/logout", "POST");
  state.user = null;
  showLogin();
}

// ── DESKTOP MODE ───────────────────────────────────────────────
function toggleDesktopMode() {
  var isDesktop = document.body.classList.toggle('desktop-mode');
  localStorage.setItem('bmt_desktop_mode', isDesktop ? '1' : '0');
  var btn = document.getElementById('btnModeToggle');
  if (btn) { btn.style.display='inline-block'; btn.innerHTML = isDesktop ? '&#128241;' : '&#128421;&#65039;'; }
  if (isDesktop) {
    initDesktopSidebar();
    updateDesktopSidebarActive(state.page);
  }
}

function initDesktopSidebar() {
  var nav = document.getElementById('dsSidebarNav');
  var userEl = document.getElementById('dsSidebarUser');
  if (!nav) return;
  if (userEl && state.user) userEl.textContent = state.user.nama + ' \xb7 Admin';

  var menus = [
    { page:'dashboard',          icon:'&#128202;', label:'Dashboard' },
    { page:'tagihan',            icon:'&#128203;', label:'Tagihan' },
    { page:'histori',            icon:'&#128336;', label:'Histori' },
    { page:'monitoring_kol',     icon:'&#128269;', label:'Monitor' },
    { page:'marketing_dashboard',icon:'&#128200;', label:'Statistik' },
    { sep:true },
    { grp:'ADMIN' },
    { page:'admin',              icon:'&#9881;&#65039;', label:'Admin Panel' },
    { page:'template',           icon:'&#128172;', label:'Pesan & Template' },
    { page:'jadwal_notif',       icon:'&#128276;', label:'Jadwal Notif' },
  ];

  nav.innerHTML = menus.map(function(m) {
    if (m.sep) return '<div class="ds-nav-sep"></div>';
    if (m.grp) return '<div class="ds-nav-label">'+m.grp+'</div>';
    var active = state.page === m.page ? ' active' : '';
    return '<button class="ds-nav-item'+active+'" data-dspage="'+m.page+'" onclick="navigate(\''+m.page+'\')">'
      +'<span class="ds-icon">'+m.icon+'</span>'+m.label+'</button>';
  }).join('');
}

function updateDesktopSidebarActive(page) {
  document.querySelectorAll('[data-dspage]').forEach(function(el) {
    el.classList.toggle('active', el.dataset.dspage === page);
  });
}

function applyDesktopModeFromStorage() {
  if (state.user && state.user.role === 'admin') {
    var btn = document.getElementById('btnModeToggle');
    if (btn) btn.style.display = 'inline-block';
    if (localStorage.getItem('bmt_desktop_mode') === '1') {
      document.body.classList.add('desktop-mode');
      if (btn) btn.innerHTML = '&#128241;';
      initDesktopSidebar();
    }
  }
}

// ── NAVIGATION ─────────────────────────────────────────────────
function navigate(page) {
  state.page = page;
  var _adminPgs = ["admin","template","jadwal_notif","blast"];
  document.querySelectorAll(".nav-item").forEach((el) => {
    var _match = el.dataset.page === page;
    if (el.id === "navAdminBtn") _match = _adminPgs.indexOf(page) >= 0;
    el.classList.toggle("active", _match);
  });
  if (typeof closeAdminMenu === "function") closeAdminMenu();
  updateDesktopSidebarActive(page);
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

// ── JATUH TEMPO HARI INI (Dashboard Admin) ────────────────────
async function loadJatuhTempoHariIni(bulan) {
  if (!state.user || state.user.role !== 'admin') return '';
  try {
    var data = await api('/api/tagihan/jatuh-tempo?bulan=' + bulan);
    var todayStr = String(data.today_day || 0).padStart(2,'0');
    var rows = (data.data || []).filter(function(r) {
      return String(r.tanggal_jt || '').substr(6,2) === todayStr;
    });
    if (rows.length === 0) return '';

    var items = rows.map(function(r) {
      var isReschedule = r.is_reschedule === 1;
      var hp = r.no_hp ? '✅' : '❌';
      var rsBadge = isReschedule
        ? '<span style="display:inline-block;font-size:9px;background:#ea580c;color:#fff;padding:1px 6px;border-radius:99px;margin-left:5px;font-weight:800;vertical-align:middle;">⚠️ RESCHEDULE</span>'
        : '';
      var aksiBtn = isReschedule
        ? '<span style="font-size:10px;color:#92400e;background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:5px 8px;flex-shrink:0;">🔄 Reschedule</span>'
        : (r.no_hp
          ? '<button class="btn-jt-kirim" onclick="kirimNotifJT(' + r.id + ',this)" title="Kirim WA">📨</button>'
        : '<button class="btn-jt-kirim btn-jt-hp" onclick="isiHpJT(\'' + r.no_rekening + '\',\'' + r.id + '\')" title="Isi No HP" style="background:#fff3cd;font-size:12px;padding:6px 8px;">📱 Isi HP</button>');
      var bgStyle = isReschedule ? 'background:#fff7ed;border-left:3px solid #ea580c;' : '';
      return '<div class="jt-item" id="jt-item-' + r.id + '" style="' + bgStyle + '">'
        + '<div class="jt-info">'
        +   '<div class="jt-nama">' + (r.nama || '-') + ' ' + hp + rsBadge + '</div>'
        +   '<div class="jt-sub">' + r.no_rekening + ' &middot; ' + rpShort(r.total_tagihan) + '</div>'
        +   (!r.no_hp && !isReschedule ? '<div id="jt-hp-form-' + r.id + '" style="display:none;margin-top:6px;display:none;">'
        +     '<input type="tel" id="jt-hp-input-' + r.id + '" placeholder="08xx / 628xx" '
        +     'style="border:1px solid #ddd;border-radius:6px;padding:5px 8px;font-size:12px;width:140px;font-family:inherit;" />'
        +     '<button onclick="simpanHpJT(\'' + r.no_rekening + '\',\'' + r.id + '\')" '
        +     'style="margin-left:6px;background:var(--primary);color:#fff;border:none;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;font-family:inherit;">Simpan</button>'
        +   '</div>' : '')
        + '</div>'
        + aksiBtn
        + '</div>';
    }).join('');

    var adaHP = rows.filter(function(r){ return !!r.no_hp; }).length;

    return '<div class="section-title" style="margin-top:12px;">🔔 Jatuh Tempo Hari Ini</div>'
      + '<div class="card" style="padding:0;overflow:hidden;">'
      +   '<div style="padding:10px 14px 6px;display:flex;align-items:center;justify-content:space-between;">'
      +     '<span style="font-size:13px;color:#555;">' + rows.length + ' anggota'
      +       (adaHP < rows.length ? ' &middot; <span style="color:#e74c3c;">' + (rows.length-adaHP) + ' no HP kosong</span>' : '')
      +     '</span>'
      +     (adaHP > 0
              ? '<button class="btn-blast-jt" id="btnBlastJT" onclick="blastNotifJT(\'' + bulan + '\')" style="font-size:12px;padding:6px 12px;">📨 Kirim Semua (' + adaHP + ')</button>'
              : '')
      +   '</div>'
      +   '<div class="jt-list">' + items + '</div>'
      + '</div>';
  } catch(e) { return ''; }
}

async function loadJatuhTempoMarketing(bulan) {
  try {
    var data = await api('/api/tagihan/jatuh-tempo?bulan=' + bulan);
    var rows = data.data || [];
    if (rows.length === 0) {
      return '<div class="section-title" style="margin-top:4px;">📅 Sudah Jatuh Tempo</div>'
        + '<div class="card"><div class="empty-state" style="padding:16px;">'
        + '<p>✅ Semua nasabah Anda belum melewati jatuh tempo</p></div></div>';
    }
    var today = String(data.today_day || 0).padStart(2,'0');
    var items = rows.map(function(r) {
      var tglRaw = String(r.tanggal_jt || '').substr(6,2) || '--';
      var isToday = tglRaw === today;
      var isReschedule = r.is_reschedule === 1;
      var bgRow = isReschedule ? 'background:#fff7ed;border-left:3px solid #ea580c;'
                 : isToday ? 'background:#fff8e1;' : '';
      var todayBadge = isToday ? '<span style="font-size:9px;background:#f39c12;color:#fff;padding:1px 5px;border-radius:99px;margin-left:4px;font-weight:700;">HARI INI</span>' : '';
      var rsBadge = isReschedule ? '<span style="font-size:9px;background:#ea580c;color:#fff;padding:1px 5px;border-radius:99px;margin-left:4px;font-weight:800;">⚠️ RESCHEDULE</span>' : '';
      var aksiBtn = isReschedule
        ? '<span style="font-size:10px;color:#92400e;background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:5px 8px;flex-shrink:0;">🔄</span>'
        : (r.no_hp
          ? '<button onclick="kirimNotifJT(' + r.id + ',this)" title="Kirim WA" '
            + 'style="background:var(--primary);color:#fff;border:none;border-radius:8px;'
            + 'padding:6px 10px;font-size:14px;cursor:pointer;flex-shrink:0;">📨</button>'
          : '<button onclick="isiHpJT(\'' + r.no_rekening + '\',\'' + r.id + '\')" title="Isi No HP" '
            + 'style="background:#fff3cd;border:1px solid #fcd34d;color:#92400e;border-radius:8px;'
            + 'padding:5px 8px;font-size:11px;cursor:pointer;flex-shrink:0;font-family:inherit;">📱 HP</button>');
      return '<div id="jt-item-' + r.id + '" style="display:flex;align-items:center;gap:8px;'
        + 'padding:8px 12px;border-bottom:1px solid #f0f0f0;' + bgRow + '">'
        + '<div style="font-size:12px;font-weight:800;color:#c0392b;flex-shrink:0;width:26px;text-align:center;">'
        +   tglRaw + '</div>'
        + '<div style="flex:1;min-width:0;">'
        +   '<div style="font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'
        +     (r.nama || '-') + todayBadge + rsBadge + '</div>'
        +   '<div style="font-size:10px;color:#999;margin-top:1px;">'
        +     rpShort(r.total_tagihan) + (r.no_hp ? '' : ' · <span style="color:#e74c3c;">no HP</span>')
        +   '</div>'
        + '</div>'
        + aksiBtn
        + '</div>';
    }).join('');

    var adaHP = rows.filter(function(r){ return !!r.no_hp; }).length;
    var noHP  = rows.length - adaHP;

    return '<div class="section-title" style="margin-top:4px;">'
      + '📅 Sudah Jatuh Tempo (' + rows.length + ' nasabah)</div>'
      + '<div class="card" style="padding:0;overflow:hidden;">'
      +   '<div style="padding:8px 12px 6px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #f5f5f5;">'
      +     '<span style="font-size:11px;color:#888;">'
      +       (noHP > 0 ? '<span style="color:#e74c3c;font-weight:700;">' + noHP + ' no HP kosong</span> &nbsp;· ' : '')
      +       adaHP + ' siap kirim WA'
      +     '</span>'
      +   '</div>'
      +   '<div style="max-height:280px;overflow-y:auto;">' + items + '</div>'
      + '</div>';
  } catch(e) { return ''; }
}


window.kirimNotifJT = async function(id, btn) {
  btn.disabled = true; btn.textContent = '⏳';
  var item = document.getElementById('jt-item-' + id);
  try {
    var res = await api('/api/reminder/' + id, 'POST', {});
    if (res.success) {
      btn.textContent = '✅';
      if (item) item.style.background = '#f0fff4';
    } else {
      btn.textContent = '❌'; btn.disabled = false;
      alert('Gagal: ' + (res.error || 'Unknown'));
    }
  } catch(e) { btn.textContent = '❌'; btn.disabled = false; }
};


window.isiHpJT = function(noRek, jtId) {
  var form = document.getElementById('jt-hp-form-' + jtId);
  if (!form) {
    // Fallback: gunakan modal HP yang sudah ada
    openModalHp(noRek, null);
    return;
  }
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
  var input = document.getElementById('jt-hp-input-' + jtId);
  if (input && form.style.display !== 'none') input.focus();
};

window.simpanHpJT = async function(noRek, jtId) {
  var input = document.getElementById('jt-hp-input-' + jtId);
  if (!input) return;
  var hp = input.value.trim();
  if (!hp) { alert('Masukkan nomor HP terlebih dahulu'); return; }
  var res = await api('/api/nasabah/' + noRek + '/hp', 'PUT', {no_hp: hp});
  if (res.error) { toast('❌ Gagal: ' + res.error, 'error'); return; }
  toast('✅ No HP disimpan');
  // Refresh dashboard agar card terupdate
  renderDashboard();
};

window.blastNotifJT = async function(bulan) {
  var btn = document.getElementById('btnBlastJT');
  if (!confirm('Kirim notif WA ke semua anggota jatuh tempo hari ini?')) return;
  btn.disabled = true; btn.textContent = '⏳ Mengirim...';
  try {
    var res = await api('/api/reminder/blast-jt-hari-ini', 'POST', {bulan: bulan});
    if (res.success) {
      btn.textContent = '✅ Terkirim ' + res.terkirim + (res.gagal > 0 ? ' | ❌ ' + res.gagal + ' gagal' : '');
      renderDashboard();
    } else { btn.textContent = '❌ Gagal'; btn.disabled = false; }
  } catch(e) { btn.textContent = '❌ Error'; btn.disabled = false; }
};

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
  const isAdminRole = state.user.role === 'admin';
  const isMktRole   = !isAdminRole; // semua non-admin: marketing, leader, petugas
  const jtHtml = isAdminRole ? await loadJatuhTempoHariIni(state.bulan)
               : await loadJatuhTempoMarketing(state.bulan);
  if ((state.user.role === "admin" || state.user.role === "leader") && data.rekap_marketing.length > 0) {
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
    jtHtml +
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

  let res;
  if (state.filterStatus === "JT") {
    res = await api("/api/tagihan/jatuh-tempo?bulan=" + state.bulan);
  } else {
    let url = "/api/tagihan?bulan=" + state.bulan + "&limit=50&offset=0";
    if (state.filterStatus) url += "&status=" + state.filterStatus;
    if (state.filterKolek)  url += "&kolek=" + state.filterKolek;
    if (state.searchQ)      url += "&q=" + encodeURIComponent(state.searchQ);
    res = await api(url);
  }
  state.tagihan = res.data || [];
  state.tagihanTotal = res.total || 0;
  state.tagihanOffset = state.tagihan.length;

  const cards = state.tagihan.length === 0
    ? '<div class="empty-state"><div class="empty-icon">🔭</div><p>Tidak ada tagihan ditemukan</p></div>'
    : state.tagihan.map(renderTagihanCard).join("");

  const jtActive = state.filterStatus === "JT";
  const jtChip = '<button class="filter-chip' + (jtActive ? ' active' : '') + '" onclick="setFilter(\'JT\')"'
    + ' style="' + (!jtActive ? 'background:#fef3c7;color:#92400e;border-color:#fcd34d;' : '') + '">🗓️ s/d Hari Ini</button>';
const filterStatus = ["","BELUM","LUNAS"].map((s) => {
    const label = s === "" ? "Semua" : s === "BELUM" ? "Belum Bayar" : "Lunas";
    return '<button class="filter-chip ' + (state.filterStatus === s ? "active" : "") + '" onclick="setFilter(\'' + s + '\')">' + label + '</button>';
  }).join("") + jtChip;

  const filterKolek = [["","Semua"],["1","✅ Lancar"],["2","⚠️ DPK"],["3","🟠 KL"],["4","🔴 Diragukan"],["5","⛔ Macet"]].map(([k, label]) => {
    return '<button class="filter-chip ' + (state.filterKolek === k ? "active" : "") + '" onclick="setFilterKolek(\'' + k + '\')">' + label + '</button>';
  }).join("");

  const sisaData = state.filterStatus !== "JT" ? (state.tagihanTotal - state.tagihanOffset) : 0;
  const loadMoreHtml = sisaData > 0
    ? '<button class="filter-chip" onclick="loadMoreTagihan()">⬇️ Load lebih (' + sisaData + ' lagi)</button>'
    : "";

  document.getElementById("bulanBox").innerHTML = bulanPickerHtml(state.bulan);
  document.getElementById("filterStatusBox").innerHTML = filterStatus;
  document.getElementById("filterKolekBox").innerHTML = filterKolek;
  document.getElementById("tagihanCount").textContent = state.filterStatus === "JT"
    ? state.tagihanTotal + ' nasabah jatuh tempo s/d hari ini (belum bayar)'
    : state.tagihanTotal + ' tagihan · tampil ' + state.tagihan.length;
  document.getElementById("tagihanList").innerHTML = cards;
  document.getElementById("loadMoreBtn").innerHTML = loadMoreHtml;
}

async function loadMoreTagihan() {
  if (state.tagihanLoading) return;
  if (state.filterStatus === "JT") return;
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
  const isSudahBayar = !isLunas && parseFloat(t.total_tagihan || 0) < 1;
  const kolClass = "kol-" + (t.kolektibilitas || 1);
  const kolLabel = ["","Lancar","DPK","Kurang Lancar","Diragukan","Macet"][t.kolektibilitas] || "Lancar";

  const noHpBtn = t.no_hp
    ? '<button class="btn-sm wa" onclick="openModalKonfirmasiWA(' + t.id + ', event)">📲 WA</button>' +
      '<button class="btn-sm outline" onclick="openModalHp(\'' + t.no_rekening + '\', event)" style="font-size:11px;padding:5px 8px;">✏️</button>'
    : '<button class="btn-sm outline" onclick="openModalHp(\'' + t.no_rekening + '\', event)">📱 Isi HP</button>';

  const canBayar = state.user && state.user.role !== "marketing";
  const bayarBtn = (isLunas || isSudahBayar)
    ? '<button class="btn-sm outline" style="color:var(--green-dark);border-color:var(--green-mid);" disabled>' + (isLunas ? "✅ Lunas" : "✅ Sudah Bayar") + '</button>'
    : canBayar ? '<button class="btn-sm green" onclick="openModalBayar(' + t.id + ', event)">💰 Bayar</button>' : '';

  const isReschedule = t.is_reschedule === 1 ? '<span class="badge" style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; font-size:10px; padding:2px 4px; margin-right:4px;">🔄 Reschedule</span>' : '';

  return '<div class="tagihan-card ' + (isLunas || isSudahBayar ? "lunas" : "belum") + '">' +
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
        : isSudahBayar
        ? '<span class="badge badge-green">✅ Sudah Bayar</span>'
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

  function buildHistoriItems(data) {
    if (!data.length) return '<div style="padding:24px;text-align:center;color:var(--gray-400);font-size:13px;">🔍 Tidak ada hasil</div>';
    return data.map((p) => {
      const cbLabel = p.cara_bayar === 'SISTEM' ? '⚡ Auto' : (p.cara_bayar || 'TUNAI');
      const isBulanFmt = p.catatan && /^\d{4}-\d{2}$/.test(p.catatan);
      const bulanInfo = p.catatan ? (' · ' + (isBulanFmt ? bulanLabel(p.catatan) : p.catatan)) : '';
      return '<div class="histori-item">' +
        '<div class="histori-left">' +
          '<div class="h-nama">' + p.nama + '</div>' +
          '<div class="h-meta">' + p.no_rekening + bulanInfo + '</div>' +
          '<div class="h-meta">' + fmtTgl(p.tanggal) + ' · ' + cbLabel + '</div>' +
        '</div>' +
        '<div class="histori-right">' +
          '<div class="h-jumlah" style="color:var(--green-dark)">+' + rpShort(p.jumlah) + '</div>' +
        '</div>' +
      '</div>';
    }).join("");
  }

  window.filterHistori = function(q) {
    const kw = q.trim().toLowerCase();
    const filtered = kw ? rows.filter(p =>
      (p.nama || '').toLowerCase().includes(kw) ||
      (p.no_rekening || '').toLowerCase().includes(kw)
    ) : rows;
    document.getElementById('historiCount').textContent = filtered.length + ' data';
    document.getElementById('historiList').innerHTML = buildHistoriItems(filtered);
  }

  main.innerHTML =
    '<div class="section-title">📅 Histori Pembayaran <span id="historiCount" style="font-size:12px;font-weight:600;color:var(--gray-400);">' + rows.length + ' data</span></div>' +
    '<div style="padding:0 0 12px;">' +
      '<div style="position:relative;">' +
        '<span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);font-size:16px;pointer-events:none;">🔍</span>' +
        '<input id="historiSearch" type="text" placeholder="Cari nama atau no. rekening..."' +
          ' style="width:100%;padding:11px 14px 11px 38px;border-radius:var(--radius-sm);border:1.5px solid var(--gray-200);font-size:14px;font-family:inherit;outline:none;background:#fff;"' +
          ' oninput="filterHistori(this.value)" autocomplete="off"/>' +
      '</div>' +
    '</div>' +
    '<div class="card" id="historiList">' + buildHistoriItems(rows) + '</div>';

  var inp = document.getElementById('historiSearch');
  if (inp) inp.addEventListener('focus', function() { this.style.borderColor='var(--primary-light)'; });
  if (inp) inp.addEventListener('blur',  function() { this.style.borderColor='var(--gray-200)'; });
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
    '<div class="section-title">📋 Histori Import</div>' +
    '<div id="histImportCard" class="card" style="padding:0;max-height:340px;overflow-y:auto;">' + logRows + '</div>' +
    '<div class="section-title">Blast Reminder WA</div>' +
'<div class="card admin-section">' +
  '<p style="font-size:13px;color:var(--gray-600);margin-bottom:12px;">Kirim reminder ke nasabah BELUM BAYAR yang punya no HP.</p>' +
  bulanPickerHtml(state.bulan) +
  '<div style="margin-bottom:8px;">' +
    '<button class="btn-primary" style="width:100%;background:var(--green-mid);" onclick="doBlast(true)">📅 Blast Hari Ini</button>' +
  '</div>' +
  '<p style="font-size:11px;color:var(--gray-400);">📅 Blast Hari Ini = hanya nasabah jatuh tempo tanggal ' + new Date().getDate() + '</p>' +
  '<div id="blastResult" class="hidden" style="margin-top:12px;"></div>' +
'</div>';

loadUsersAdmin();
}

async function loadPasswordMgmt() {
  var box = document.getElementById('passwordMgmtBox');
  if (!box) return;
  var users = await api('/api/users');
  if (!users || users.error) { box.innerHTML = '<div class="empty-state"><p>Gagal memuat</p></div>'; return; }
  var roleLabel = {admin:'Admin', leader:'Leader', marketing:'Marketing', petugas:'Petugas'};
  var rows = users.map(function(u) {
    return '<div style="padding:10px 0;border-bottom:1px solid var(--gray-100);">'
      + '<div style="display:flex;align-items:center;gap:8px;">'
      +   '<div style="flex:1;min-width:0;">'
      +     '<div style="font-size:13px;font-weight:700;">' + (u.nama||'-') + '</div>'
      +     '<div style="font-size:11px;color:#888;">' + u.username + ' &nbsp;·&nbsp; ' + (roleLabel[u.role]||u.role)
      +     (u.aktif ? '' : ' &nbsp;<span style="color:#e74c3c;font-size:10px;">(nonaktif)</span>') + '</div>'
      +   '</div>'
      +   '<button class="btn-sm outline" style="flex-shrink:0;font-size:11px;" '
      +     'onclick="togglePwForm(' + u.id + ')">Ganti Password</button>'
      + '</div>'
      + '<div id="pw-form-' + u.id + '" style="display:none;padding:8px 0 4px;">'
      +   '<div style="display:flex;gap:8px;align-items:center;">'
      +     '<input type="password" id="pw-input-' + u.id + '" placeholder="Password baru (min 4 karakter)" '
      +       'style="flex:1;border:1px solid var(--gray-200);border-radius:8px;padding:7px 10px;font-size:12px;font-family:inherit;" />'
      +     '<button class="btn-sm green" onclick="simpanPassword(' + u.id + ')">Simpan</button>'
      +     '<button class="btn-sm outline" onclick="togglePwForm(' + u.id + ')">Batal</button>'
      +   '</div>'
      +   '<div id="pw-result-' + u.id + '" style="font-size:11px;margin-top:4px;"></div>'
      + '</div>'
      + '</div>';
  }).join('');
  box.innerHTML = '<div style="padding:0 4px;">' + rows + '</div>';
}

window.togglePwForm = function(uid) {
  var form = document.getElementById('pw-form-' + uid);
  if (!form) return;
  var isOpen = form.style.display !== 'none';
  document.querySelectorAll('[id^="pw-form-"]').forEach(function(el){ el.style.display='none'; });
  document.querySelectorAll('[id^="pw-result-"]').forEach(function(el){ el.innerHTML=''; });
  if (!isOpen) {
    form.style.display = 'block';
    var inp = document.getElementById('pw-input-' + uid);
    if (inp) { inp.value = ''; inp.focus(); }
  }
};

window.simpanPassword = async function(uid) {
  var inp = document.getElementById('pw-input-' + uid);
  var resEl = document.getElementById('pw-result-' + uid);
  if (!inp || !resEl) return;
  var pw = inp.value.trim();
  if (pw.length < 4) { resEl.innerHTML='<span style="color:#e74c3c;">Minimal 4 karakter</span>'; return; }
  resEl.innerHTML = '<span style="color:#888;">Menyimpan...</span>';
  var res = await api('/api/users/' + uid + '/password', 'PUT', {password: pw});
  if (res && res.success) {
    resEl.innerHTML = '<span style="color:var(--green-dark);">Password berhasil diganti</span>';
    inp.value = '';
    setTimeout(function(){ togglePwForm(uid); }, 1500);
  } else {
    resEl.innerHTML = '<span style="color:#e74c3c;">' + ((res && res.error) || 'Gagal') + '</span>';
  }
};


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

  let res;
  try {
    res = await api("/api/import", "POST", form, true);
  } catch (e) {
    progressEl.innerHTML = '<div class="error-msg">❌ Gagal upload: ' + e.message + '</div>';
    return;
  }

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
  refreshHistoriImport();
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
    const roleColor = u.role==='admin'?'#7d3c98':u.role==='leader'?'#1a5276':'#1e8449';
    const roleLabel = u.role==='admin'?'Admin':u.role==='leader'?'Leader':u.role==='petugas'?'Petugas':'Marketing';
    const pwForm =
        '<div id="pw-form-' + u.id + '" style="display:none;margin-top:8px;padding:8px 10px;background:#f8f9fa;border-radius:8px;">'
      + '<div style="font-size:11px;font-weight:700;color:#555;margin-bottom:6px;">Ganti Password — ' + u.nama + '</div>'
      + '<div style="display:flex;gap:6px;align-items:center;">'
      +   '<input type="password" id="pw-input-' + u.id + '" placeholder="Password baru (min 4 karakter)" '
      +     'style="flex:1;border:1px solid var(--gray-200);border-radius:7px;padding:7px 10px;font-size:12px;font-family:inherit;"/>'
      +   '<button class="btn-sm green" style="white-space:nowrap;" onclick="simpanPassword(' + u.id + ')">Simpan</button>'
      +   '<button class="btn-sm outline" onclick="togglePwForm(' + u.id + ')">✕</button>'
      + '</div>'
      + '<div id="pw-result-' + u.id + '" style="font-size:11px;margin-top:4px;"></div>'
      + '</div>';

    return '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--gray-100);">'
      + '<div style="width:36px;height:36px;border-radius:50%;background:' + roleColor + '22;display:flex;align-items:center;justify-content:center;flex-shrink:0;">'
      +   '<span style="font-size:15px;font-weight:800;color:' + roleColor + ';">' + (u.nama||'?')[0].toUpperCase() + '</span>'
      + '</div>'
      + '<div style="flex:1;min-width:0;">'
      +   '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">'
      +     '<span style="font-size:13px;font-weight:700;">' + u.nama + '</span>'
      +     '<span style="font-size:10px;font-weight:700;color:' + roleColor + ';background:' + roleColor + '18;padding:2px 7px;border-radius:99px;">' + roleLabel + '</span>'
      +     (isAktif ? '' : '<span style="font-size:10px;color:#e74c3c;background:#fdedec;padding:2px 7px;border-radius:99px;">Nonaktif</span>')
      +   '</div>'
      +   '<div style="font-size:11px;color:#999;margin-top:1px;">@' + u.username + (u.marketing_id ? ' · AO: ' + u.marketing_id : '') + '</div>'
      + '</div>'
      + '<div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0;">'
      +   '<button onclick="togglePwForm(' + u.id + ')" style="background:none;border:1px solid var(--gray-200);border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;font-family:inherit;color:#555;white-space:nowrap;">🔑 Password</button>'
      +   (u.role !== 'admin' ? '<button onclick="openModalUser(' + u.id + ')" style="background:var(--green-mid);border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;font-family:inherit;color:#fff;white-space:nowrap;">✏️ Edit</button>' : '')
      + '</div>'
      + '</div>'
      + pwForm
      + '</div>';
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
// ── XSS Protection ──────────────────────────────────────────────────────
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// ── XSS Protection ──────────────────────────────────────────────────────
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// ── XSS Protection ──────────────────────────────────────────────────────
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// ── XSS Protection ──────────────────────────────────────────────────────
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// ── XSS Protection ──────────────────────────────────────────────────────
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// ── XSS Protection ──────────────────────────────────────────────────────
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// ── XSS Protection ──────────────────────────────────────────────────────
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// ── XSS Protection ──────────────────────────────────────────────────────
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// ── XSS Protection ──────────────────────────────────────────────────────
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// ── XSS Protection ──────────────────────────────────────────────────────
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// ── XSS Protection ──────────────────────────────────────────────────────
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// ── XSS Protection ──────────────────────────────────────────────────────
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// ── XSS Protection ──────────────────────────────────────────────────────
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// ── XSS Protection ──────────────────────────────────────────────────────
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// ── XSS Protection ──────────────────────────────────────────────────────
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// ── XSS Protection ──────────────────────────────────────────────────────
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// ── XSS Protection ──────────────────────────────────────────────────────
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// ── XSS Protection ──────────────────────────────────────────────────────
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// ── XSS Protection ──────────────────────────────────────────────────────
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// ── XSS Protection ──────────────────────────────────────────────────────
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// ── XSS Protection ──────────────────────────────────────────────────────
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// ── XSS Protection ──────────────────────────────────────────────────────
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// ── XSS Protection ──────────────────────────────────────────────────────
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// ── XSS Protection ──────────────────────────────────────────────────────
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// ── XSS Protection ──────────────────────────────────────────────────────
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// ── XSS Protection ──────────────────────────────────────────────────────
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// ── XSS Protection ──────────────────────────────────────────────────────
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// ── XSS Protection ──────────────────────────────────────────────────────
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

function openAdminMenu() {
  if (document.getElementById('adminMenuOverlay')) return;
  var ov = document.createElement('div');
  ov.className='admin-sheet-overlay'; ov.id='adminMenuOverlay';
  ov.onclick=function(e){ if(e.target===ov) closeAdminMenu(); };
  ov.innerHTML='<div class="admin-sheet">'
    +'<div class="admin-sheet-handle"></div>'
    +'<button class="admin-sheet-item" onclick="closeAdminMenu();navigate(\'admin\')">'
    +'<span class="asi-icon">&#9881;&#65039;</span>'
    +'<div><div class="asi-title">Admin Panel</div><div class="asi-sub">Kelola nasabah, user, &amp; data</div></div></button>'
    +'<button class="admin-sheet-item" onclick="closeAdminMenu();navigate(\'template\')">'
    +'<span class="asi-icon">&#128172;</span>'
    +'<div><div class="asi-title">Pesan &amp; Template WA</div><div class="asi-sub">Blast &amp; template pesan</div></div></button>'
    +'<button class="admin-sheet-item" onclick="closeAdminMenu();navigate(\'jadwal_notif\')">'
    +'<span class="asi-icon">&#128276;</span>'
    +'<div><div class="asi-title">Jadwal Notifikasi</div><div class="asi-sub">Pengaturan notif otomatis</div></div></button>'
    +'<button style="width:100%;margin-top:8px;padding:12px;border:1px solid #e8e8e8;border-radius:10px;font-size:13px;color:#888;cursor:pointer;background:none;font-family:inherit;" onclick="closeAdminMenu()">Tutup</button>'
    +'</div>';
  document.body.appendChild(ov);
}
function closeAdminMenu() {
  var ov=document.getElementById('adminMenuOverlay'); if(ov) ov.remove();
}

async function refreshHistoriImport() {
  var card = document.getElementById('histImportCard');
  if (!card) return;
  var logs = await api('/api/import/log');
  if (!logs || logs.error) return;
  if (logs.length === 0) {
    card.innerHTML = '<div class=empty-state style=padding:24px><p>Belum ada histori import</p></div>';
    return;
  }
  card.innerHTML = logs.map(function(l) {
    return '<div class=histori-item>'
      + '<div class=histori-left>'
      +   '<div class=h-nama>' + bulanLabel(l.bulan) + '</div>'
      +   '<div class=h-meta>+' + l.nasabah_baru + ' baru · ~' + l.nasabah_update + ' update · ' + l.nasabah_nonaktif + ' nonaktif</div>'
      +   '<div class=h-meta>' + l.tagihan_baru + ' tagihan baru · ' + fmtTgl(l.waktu) + '</div>'
      + '</div>'
      + '<div class=histori-right><div class=h-cara>' + l.diimport_oleh + '</div></div>'
      + '</div>';
  }).join('');
}

function initTambahanNav() {
  const nav = document.querySelector(".bottom-nav");
  ["navMarketing","navMonitor","navNotif","navJadwal","navStatistik","navAdminBtn"].forEach(function(id){
    var el=document.getElementById(id); if(el) el.parentNode.removeChild(el);
  });
  const navRole = (state.user && state.user.role) ? state.user.role : "marketing";
  const isAdmin  = navRole === "admin";
  const isLeader = navRole === "leader";

  // Monitor: semua role
  var bMon = document.createElement("button");
  bMon.className="nav-item"; bMon.id="navMonitor"; bMon.dataset.page="monitoring_kol";
  bMon.innerHTML='<span class="nav-icon">&#128269;</span>Monitor';
  bMon.onclick=function(){ closeAdminMenu(); state.page="monitoring_kol"; document.querySelectorAll(".nav-item").forEach(function(el){el.classList.toggle("active",el.dataset.page==="monitoring_kol");}); renderPage(); };
  nav.appendChild(bMon);

  // Task 1: Sembunyikan tab Histori (Pembayaran) dari akun marketing
  if (navRole === 'marketing') {
    var histBtn = document.querySelector('.nav-item[data-page="histori"]');
    if (histBtn) histBtn.parentNode.removeChild(histBtn);
  }

  // Statistik: admin, leader & petugas
  if (isAdmin || isLeader || navRole === "petugas") {
    var bStat = document.createElement("button");
    bStat.className="nav-item"; bStat.id="navStatistik"; bStat.dataset.page="marketing_dashboard";
    bStat.innerHTML='<span class="nav-icon">&#128200;</span>Statistik';
    bStat.onclick=function(){ closeAdminMenu(); state.page="marketing_dashboard"; document.querySelectorAll(".nav-item").forEach(function(el){el.classList.toggle("active",el.dataset.page==="marketing_dashboard");}); renderPage(); };
    nav.appendChild(bStat);
  }

  // Admin: hanya admin (sub-menu)
  if (isAdmin) {
    var bAdm = document.createElement("button");
    bAdm.className="nav-item"; bAdm.id="navAdminBtn"; bAdm.dataset.page="admin";
    bAdm.innerHTML='<span class="nav-icon">&#9881;&#65039;</span>Admin';
    bAdm.onclick=function(){ openAdminMenu(); };
    nav.appendChild(bAdm);
  }
}
// ── GRAFIK TREN TAHUNAN ────────────────────────────────────────
var _trenChart = null;

async function renderTrenTahunan(container) {
  if (!container) return;
  var tahun = state.trenTahun || new Date().getFullYear().toString();
  var view  = state.trenView  || 'nominal';
  var prevY = (parseInt(tahun)-1).toString();
  var nextY = (parseInt(tahun)+1).toString();
  var curY  = new Date().getFullYear().toString();
  var btnStyle = 'background:none;border:none;font-size:16px;cursor:pointer;padding:2px 6px;';
  var viewBtns = ['nominal','nasabah','marketing'].map(function(v){
    var label = v==='nominal'?'💰 Nominal':v==='nasabah'?'👥 Nasabah':'🏢 Per Marketing';
    return '<button class="filter-chip'+(view===v?' active':'')+'" data-trenview="'+v+'" onclick="switchTrenView(\''+v+'\')" style="font-size:11px;">'+label+'</button>';
  }).join('');
  container.innerHTML =
    '<div class="section-title" style="display:flex;justify-content:space-between;align-items:center;">'
    + '<span>📅 Performa Tahunan</span>'
    + '<span><button onclick="switchTrenTahun(\''+prevY+'\')" style="'+btnStyle+'">◀</button>'
    + '<b style="font-size:13px;"> '+tahun+' </b>'
    + (tahun < curY ? '<button onclick="switchTrenTahun(\''+nextY+'\')" style="'+btnStyle+'">▶</button>' : '')
    + '</span></div>'
    + '<div class="card" style="padding:12px 14px;">'
    + '<div class="filter-bar" style="margin-bottom:12px;gap:6px;">'+viewBtns+'</div>'
    + '<div style="position:relative;height:200px;"><canvas id="trenChartCanvas"></canvas></div>'
    + '<div id="trenChartInfo" style="margin-top:8px;font-size:10px;color:var(--gray-500);text-align:center;"></div>'
    + '</div>';
  var data = await api('/api/dashboard/tren-tahunan?tahun='+tahun);
  state._trenData = data;
  buildTrenChart(data, view);
}

function switchTrenView(v) {
  state.trenView = v;
  document.querySelectorAll('[data-trenview]').forEach(function(b){
    b.classList.toggle('active', b.dataset.trenview===v);
  });
  if (state._trenData) buildTrenChart(state._trenData, v);
}

function switchTrenTahun(tahun) {
  state.trenTahun = tahun;
  var box = document.getElementById('trenTahunanBox');
  if (box) renderTrenTahunan(box);
}

function buildTrenChart(data, view) {
  if (_trenChart) { try { _trenChart.destroy(); } catch(e){} _trenChart = null; }
  var canvas = document.getElementById('trenChartCanvas');
  if (!canvas || typeof Chart === 'undefined') {
    var info = document.getElementById('trenChartInfo');
    if (info) info.textContent = 'Chart.js belum dimuat';
    return;
  }
  var labels = data.bulanan.map(function(b){ return b.label; });
  var hasData = data.bulanan.some(function(b){ return b.total > 0; });
  var info = document.getElementById('trenChartInfo');

  if (!hasData) {
    if (info) info.textContent = 'Belum ada data untuk tahun '+data.tahun;
    canvas.style.display = 'none';
    return;
  }
  canvas.style.display = '';

  var datasets = [];
  var chartType = 'bar';
  var stacked = false;
  var colors = ['#3b82f6','#f97316','#a855f7','#14b8a6','#ec4899','#eab308','#6366f1'];

  if (view === 'nominal') {
    stacked = true;
    datasets = [
      { label:'Terkumpul (jt)', data: data.bulanan.map(function(b){ return Math.round((b.terkumpul||0)/1e6); }),
        backgroundColor:'#22c55e', stack:'s', borderRadius:3 },
      { label:'Tunggakan (jt)', data: data.bulanan.map(function(b){ return Math.round((b.tunggakan||0)/1e6); }),
        backgroundColor:'#ef4444', stack:'s', borderRadius:3 }
    ];
    if (info) info.textContent = 'Satuan: Juta Rupiah (Rp)';
  } else if (view === 'nasabah') {
    datasets = [
      { label:'Lunas', data: data.bulanan.map(function(b){ return b.lunas||0; }),
        backgroundColor:'#22c55e', borderRadius:3, barPercentage:0.6 },
      { label:'Belum', data: data.bulanan.map(function(b){ return b.belum||0; }),
        backgroundColor:'#ef4444', borderRadius:3, barPercentage:0.6 }
    ];
    if (info) info.textContent = 'Satuan: Jumlah nasabah';
  } else {
    chartType = 'line';
    datasets = data.per_marketing.map(function(m, i){
      return {
        label: m.nama,
        data: m.data.map(function(d){ return d.lunas||0; }),
        borderColor: colors[i%colors.length],
        backgroundColor: colors[i%colors.length]+'44',
        tension: 0.35, fill: false, pointRadius: 3, pointHoverRadius: 5,
        borderWidth: 2
      };
    });
    if (info) info.textContent = 'Jumlah nasabah lunas per marketing';
  }

  _trenChart = new Chart(canvas, {
    type: chartType,
    data: { labels: labels, datasets: datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position:'bottom', labels:{ font:{size:10}, boxWidth:10, padding:8 } },
        tooltip: { mode:'index', intersect:false,
          callbacks: { label: function(ctx){
            if (view==='nominal') return ctx.dataset.label+': Rp '+ctx.raw+' jt';
            return ctx.dataset.label+': '+ctx.raw+' nasabah';
          }}
        }
      },
      scales: {
        x: { ticks:{ font:{size:9} }, grid:{ display:false } },
        y: { stacked:stacked, ticks:{ font:{size:9} },
             grid:{ color:'#f0f0f0' },
             beginAtZero: true }
      }
    }
  });
}
// ── END GRAFIK TREN TAHUNAN ────────────────────────────────────

async function renderMarketingDashboard() {
  const main = document.getElementById("mainContent");
  const [data, ranking] = await Promise.all([
    api("/api/dashboard/marketing?bulan=" + state.bulan),
    api("/api/dashboard/ranking?bulan=" + state.bulan)
  ]);
  if (data.error) { main.innerHTML = '<div class="empty-state"><p>' + data.error + '</p></div>'; return; }
  const kolLabel = ["","Lancar","DPK","Kurang Lancar","Diragukan","Macet"];
  const kolColor = ["","#27ae60","#f39c12","#e67e22","#e74c3c","#922b21"];
  // ── Kolektibilitas: Jumlah view
  const kolHtml = data.kolektibilitas.map(k => {
    const pct = k.total > 0 ? Math.round(k.lunas/k.total*100) : 0;
    const belum = k.total - k.lunas;
    const belumPct = k.total > 0 ? Math.round(belum/k.total*100) : 0;
    return '<div style="margin-bottom:12px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:700;margin-bottom:4px;">'
      +   '<span style="color:'+kolColor[k.kolektibilitas]+';">'+kolLabel[k.kolektibilitas]+'</span>'
      +   '<span style="font-size:11px;font-weight:400;color:var(--gray-500);">'
      +     '<span style="color:var(--green-dark);font-weight:700;">'+k.lunas+'</span>'
      +     ' lunas · '
      +     '<span style="color:var(--red-dark);font-weight:700;">'+belum+'</span>'
      +     ' belum · '+k.total+' total'
      +   '</span>'
      + '</div>'
      + '<div style="background:var(--gray-200);border-radius:99px;height:8px;overflow:hidden;">'
      +   '<div style="background:'+kolColor[k.kolektibilitas]+';width:'+pct+'%;height:100%;border-radius:99px;"></div>'
      + '</div>'
      + '<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--gray-400);margin-top:2px;">'
      +   '<span>Lunas '+pct+'%</span><span>Belum '+belumPct+'%</span>'
      + '</div>'
      + '</div>';
  }).join("");

  // ── Kolektibilitas: Nominal view
  const totalNominal = data.kolektibilitas.reduce(function(s,k){ return s+(k.nominal||0); }, 0);
  const maxNominal = Math.max(...data.kolektibilitas.map(k=>k.nominal||0), 1);
  const kolNominalHtml = (function(){
    var sorted = data.kolektibilitas.slice().sort(function(a,b){ return (b.nominal||0)-(a.nominal||0); });
    return sorted.map(function(k) {
      var nom = k.nominal || 0;
      var barW = Math.round((nom / maxNominal) * 100);
      var pctOfTotal = totalNominal > 0 ? Math.round(nom/totalNominal*100) : 0;
      return '<div style="margin-bottom:14px;">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:700;margin-bottom:5px;">'
        +   '<span style="color:'+kolColor[k.kolektibilitas]+';">'+kolLabel[k.kolektibilitas]+'</span>'
        +   '<span style="font-size:12px;font-weight:800;color:'+kolColor[k.kolektibilitas]+'">' + rpShort(nom) + '</span>'
        + '</div>'
        + '<div style="background:var(--gray-100);border-radius:6px;height:20px;overflow:hidden;position:relative;">'
        +   '<div style="background:'+kolColor[k.kolektibilitas]+';opacity:0.85;width:'+barW+'%;height:100%;border-radius:6px;transition:width 0.4s;"></div>'
        +   '<div style="position:absolute;right:8px;top:50%;transform:translateY(-50%);font-size:10px;font-weight:700;color:#555;">'
        +     k.total + ' nasabah · ' + pctOfTotal + '%'
        +   '</div>'
        + '</div>'
        + '</div>';
    }).join('');
  })();

  // ── Toggle wrapper for kolektibilitas
  const kolSectionHtml = '<div style="display:flex;gap:8px;margin-bottom:14px;">'
    + '<button id="kolTabJml" onclick="setKolTab(\'jumlah\')" style="flex:1;padding:7px 0;border:1.5px solid var(--primary);border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;background:var(--primary);color:#fff;">👥 Jumlah</button>'
    + '<button id="kolTabNom" onclick="setKolTab(\'nominal\')" style="flex:1;padding:7px 0;border:1.5px solid var(--primary);border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;background:#fff;color:var(--primary);">💰 Nominal</button>'
    + '</div>'
    + '<div id="kolJumlahView">' + kolHtml + '</div>'
    + '<div id="kolNominalView" style="display:none;">' + kolNominalHtml + '</div>';

  window.setKolTab = function(tab) {
    var jv = document.getElementById('kolJumlahView');
    var nv = document.getElementById('kolNominalView');
    var bj = document.getElementById('kolTabJml');
    var bn = document.getElementById('kolTabNom');
    if (!jv || !nv) return;
    if (tab === 'jumlah') {
      jv.style.display = ''; nv.style.display = 'none';
      if (bj) { bj.style.background = 'var(--primary)'; bj.style.color = '#fff'; }
      if (bn) { bn.style.background = '#fff'; bn.style.color = 'var(--primary)'; }
    } else {
      jv.style.display = 'none'; nv.style.display = '';
      if (bj) { bj.style.background = '#fff'; bj.style.color = 'var(--primary)'; }
      if (bn) { bn.style.background = 'var(--primary)'; bn.style.color = '#fff'; }
    }
  };
  const rankHtml = ranking.map((r,i) => {
    const medal = i===0?"🥇":i===1?"🥈":i===2?"🥉":(i+1)+".";
    const pct = r.pct_kolektibilitas||0;
    const bg = pct>=80?'var(--green-pale)':pct>=50?'var(--yellow-pale)':'var(--red-pale)';
    const col = pct>=80?'var(--green-dark)':pct>=50?'var(--yellow-dark)':'var(--red-dark)';
    return '<div class="rekap-row"><div><div class="rekap-name">'+medal+' '+(r.marketing_nama||"-")+'</div><div class="rekap-count">'+r.lunas+'/'+r.total_nasabah+' nasabah · '+rpShort(r.nominal_lunas)+'</div></div><div class="rekap-badge" style="background:'+bg+';color:'+col+';">'+pct+'%</div></div>';
  }).join("");
  const tunggakHtml = data.top_tunggak.length===0
    ? '<div class="empty-state" style="padding:16px;"><p>Semua nasabah sudah bayar 🎉</p></div>'
    : data.top_tunggak.map(t=>{
        const expo = (t.kolektibilitas >= 2 && t.saldo_pinjaman) ? t.saldo_pinjaman : t.total_tagihan;
        const expoLabel = (t.kolektibilitas >= 2 && t.saldo_pinjaman) ? 'Saldo' : 'Tagihan';
        return '<div class="rekap-row" onclick="bukaRiwayat(\''+t.no_rekening+'\')" style="cursor:pointer;">'
          + '<div><div class="rekap-name">'+t.nama+'</div>'
          + '<div class="rekap-count">'+t.no_rekening+' · '+(t.marketing_nama||"-")+'</div></div>'
          + '<div style="text-align:right;">'
          + '<div style="font-size:14px;font-weight:800;color:var(--red-dark);">'+rpShort(expo)+'</div>'
          + '<div style="font-size:10px;color:var(--gray-400);">'+expoLabel+' · Kol '+t.kolektibilitas+'</div>'
          + '</div></div>';
      }).join("");
  const tren_data = Array.isArray(data.tren_harian) ? data.tren_harian : [];
  const maxN = Math.max(...tren_data.map(t=>t.total_nominal||0),1);
  const trenHtml = tren_data.length===0
    ? '<div style="text-align:center;color:var(--gray-400);padding:16px;font-size:13px;">Belum ada transaksi bulan ini</div>'
    : (function(){
        var bars = tren_data.map(function(t){
          var bh = Math.max(Math.round((t.total_nominal / maxN) * 56), 3);
          var nm = t.total_nominal >= 1e6
            ? (t.total_nominal/1e6).toFixed(1) + 'jt'
            : Math.round(t.total_nominal/1e3) + 'rb';
          return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:1px;">'
            + '<div style="font-size:7px;color:var(--gray-400);margin-bottom:1px;">' + nm + '</div>'
            + '<div style="width:100%;background:var(--primary);border-radius:3px 3px 0 0;height:' + bh + 'px;"></div>'
            + '<div style="font-size:8px;color:var(--gray-500);margin-top:2px;">' + t.hari + '</div>'
            + '</div>';
        });
        return '<div style="display:flex;align-items:flex-end;gap:3px;height:80px;padding:4px 0 0;">'
          + bars.join('') + '</div>';
      })();
  // NPL = Kol 2-5 berdasarkan saldo_pinjaman (sisa pokok pembiayaan)
  const nplSaldo = data.kolektibilitas.filter(function(k){ return k.kolektibilitas >= 2; }).reduce(function(s,k){ return s+(k.nominal||0); }, 0);
  const totalSaldo = data.kolektibilitas.reduce(function(s,k){ return s+(k.nominal||0); }, 0);
  const nplPct = totalSaldo > 0 ? Math.round(nplSaldo / totalSaldo * 1000) / 10 : 0;
  const nplCount = data.kolektibilitas.filter(function(k){ return k.kolektibilitas >= 2; }).reduce(function(s,k){ return s+k.total; }, 0);
  const totalKolCount = data.kolektibilitas.reduce(function(s,k){ return s+k.total; }, 0);
  const nplColor = nplPct < 5 ? '#166534' : nplPct < 10 ? '#92400e' : '#991b1b';
  const nplBg    = nplPct < 5 ? '#f0fdf4' : nplPct < 10 ? '#fffbeb' : '#fff1f2';
  const nplBorder= nplPct < 5 ? '#bbf7d0' : nplPct < 10 ? '#fde68a' : '#fecdd3';
  const nplIcon  = nplPct < 5 ? '✅' : nplPct < 10 ? '⚠️' : '🔴';
  const nplLabel = nplPct < 5 ? 'Aman' : nplPct < 10 ? 'Perlu Perhatian' : 'Kritis';
  const nplHtml  = '<div style="background:'+nplBg+';border:1.5px solid '+nplBorder+';border-radius:12px;padding:14px 16px;">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">'
    +   '<div>'
    +     '<div style="font-size:12px;color:'+nplColor+';font-weight:700;">NPL — Saldo Kol 2–5</div>'
    +     '<div style="font-size:11px;color:#888;margin-top:2px;">'+nplCount+' dari '+totalKolCount+' nasabah · Batas aman: <b>5%</b></div>'
    +   '</div>'
    +   '<div style="text-align:right;">'
    +     '<div style="font-size:22px;font-weight:900;color:'+nplColor+';">'+nplPct+'%</div>'
    +     '<div style="font-size:11px;font-weight:700;color:'+nplColor+';">'+nplIcon+' '+nplLabel+'</div>'
    +   '</div>'
    + '</div>'
    + '<div style="background:var(--gray-200);border-radius:99px;height:6px;overflow:hidden;">'
    +   '<div style="background:'+nplColor+';width:'+Math.min(nplPct,100)+'%;height:100%;border-radius:99px;transition:width 0.4s;"></div>'
    + '</div>'
    + '<div style="display:flex;justify-content:space-between;font-size:10px;color:#888;margin-top:4px;">'
    +   '<span>Saldo NPL: <b style="color:'+nplColor+';">'+rpShort(nplSaldo)+'</b></span>'
    +   '<span>Total saldo: '+rpShort(totalSaldo)+'</span>'
    + '</div>'
    + '</div>';

  main.innerHTML = bulanPickerHtml(state.bulan)+
    '<div class="section-title">📉 Rasio NPL</div><div class="card" style="padding:14px;">'+nplHtml+'</div>'+
    '<div class="section-title">📊 Kolektibilitas</div><div class="card" style="padding:16px;">'+kolSectionHtml+'</div>'+
    '<div class="section-title">📈 Tren Pembayaran Harian</div><div class="card" style="padding:16px;">'+trenHtml+'</div>'+
    '<div class="section-title">🏆 Ranking Marketing '+bulanLabel(state.bulan)+'</div><div class="card">'+(rankHtml||'<div class="empty-state" style="padding:16px;"><p>Belum ada data</p></div>')+'</div>'+
    '<div class="section-title">🔴 Top 25 Tunggakan Terbesar</div><div class="card" style="padding:0;"><div style="max-height:420px;overflow-y:auto;">'+tunggakHtml+'</div></div>'+
    '<div class="section-title">📅 Belum Bayar Minggu Ini</div><div id="belumMingguIniBox"><div class="loading"><div class="spinner"></div> Memuat...</div></div>'
    + '<div id="trenTahunanBox" style="margin-top:4px;"><div class="loading"><div class="spinner"></div> Memuat grafik...</div></div>';
  loadBelumMingguIni();
  renderTrenTahunan(document.getElementById('trenTahunanBox'));
}
async function loadBelumMingguIni() {
  const box = document.getElementById("belumMingguIniBox");
  if (!box) return;
  const res = await api("/api/dashboard/belum-minggu-ini?bulan="+state.bulan);
  if (!res.data||res.data.length===0) { box.innerHTML='<div class="card"><div class="empty-state" style="padding:16px;"><p>✅ Tidak ada jatuh tempo minggu ini</p></div></div>'; return; }
  box.innerHTML='<div class="card">'+res.data.map(t=>{
    var isRs = t.is_reschedule === 1;
    var rsBadge = isRs ? '<span style="display:inline-block;font-size:9px;background:#ea580c;color:#fff;padding:1px 5px;border-radius:99px;margin-left:4px;font-weight:800;">&#9888; RS</span>' : '';
    var bgRs = isRs ? 'background:#fff7ed;border-left:3px solid #ea580c;padding-left:9px;' : '';
    return '<div class="rekap-row" style="'+bgRs+'">'
      + '<div><div class="rekap-name">'+t.nama+rsBadge+'</div>'
      + '<div class="rekap-count">JT tgl '+t.tgl_jt_num+' · '+(t.marketing_nama||"-")+'</div></div>'
      + '<div style="text-align:right;"><div style="font-size:13px;font-weight:800;color:var(--red-dark);">'+rpShort(t.total_tagihan)+'</div>'
      + (isRs ? '<div style="font-size:9px;color:#92400e;font-weight:700;">Reschedule</div>' : '')
      + '</div></div>';
  }).join("")+'</div>';
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

// ── HELPER FOTO URL ────────────────────────────────────────────────
let _selectedFotoFile = null;

function getFotoUrl(foto_path) {
  if (!foto_path) return null;
  if (foto_path.startsWith('gdrive:')) {
    const fileId = foto_path.replace('gdrive:', '');
    return 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w800';
  }
  return '/foto_kunjungan/' + foto_path;
}

// ── MONITORING KOLEKTIBILITAS 2-5 ─────────────────────────────────
const KOL_LABEL = ["","Lancar","DPK","Kurang Lancar","Diragukan","Macet"];
const KOL_COLOR = ["","#27ae60","#e67e22","#e74c3c","#c0392b","#7b241c"];
const KOL_BG    = ["","#eafaf1","#fef9e7","#fdedec","#f9ebea","#f4ecf7"];

state.monitorKolFilter = 0; // 0=semua
state.monitorTab = false;

async function renderMonitoringKol() {
  const main = document.getElementById("mainContent");
  const bulan = state.bulan;
  const userRole = state.user ? state.user.role : "marketing";
  const canFullReport = ['admin','leader'].includes(userRole);

  const filterBtns = [0,2,3,4,5].map(k=>
    '<button onclick="setMonitorFilter('+k+')" id="mfBtn'+k+'" class="btn-sm '+(state.monitorKolFilter===k?'green':'outline')+'" style="font-size:11px;padding:4px 10px;">'+(k===0?'Semua':KOL_LABEL[k])+'</button>'
  ).join("");

  const tabHtml = canFullReport
    ? '<div style="display:flex;gap:0;margin-bottom:12px;border-radius:8px;overflow:hidden;border:1px solid var(--gray-200);">'
      + '<button onclick="setMonitorTab(0)" style="flex:1;padding:8px;font-size:12px;font-weight:700;border:none;cursor:pointer;background:'+(state.monitorTab===0?'var(--green-mid)':'#fff')+';color:'+(state.monitorTab===0?'#fff':'var(--gray-500)')+';">Daftar</button>'
      + '<button onclick="setMonitorTab(1)" style="flex:1;padding:8px;font-size:12px;font-weight:700;border:none;cursor:pointer;background:'+(state.monitorTab===1?'var(--green-mid)':'#fff')+';color:'+(state.monitorTab===1?'#fff':'var(--gray-500)')+';">Rekap Bulanan</button>'
      + '<button onclick="setMonitorTab(2)" style="flex:1;padding:8px;font-size:12px;font-weight:700;border:none;cursor:pointer;background:'+(state.monitorTab===2?'var(--green-mid)':'#fff')+';color:'+(state.monitorTab===2?'#fff':'var(--gray-500)')+';">Rekap Harian</button>'
      + '</div>'
    : '';

  const searchVal = state.monitorSearch || "";
  main.innerHTML = '<div class="section-title">🔍 Monitoring Kolektibilitas 2–5</div>'
    + tabHtml
    + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">'+filterBtns+'</div>'
    + '<div style="margin-bottom:12px;position:relative;">'
    + '<input id="monitorSearchInput" type="text" placeholder="Cari nama, no rekening, atau marketing..." value="'+searchVal.replace(/"/g,'&quot;')+'"'
    + ' oninput="setMonitorSearch(this.value)"'
    + ' style="width:100%;box-sizing:border-box;padding:9px 36px 9px 12px;border:1.5px solid var(--gray-200);border-radius:8px;font-size:13px;outline:none;">'
    + (searchVal ? '<button onclick="clearMonitorSearch()" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:16px;color:var(--gray-400);">✕</button>' : '<span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:14px;color:var(--gray-400);">🔍</span>')
    + '</div>'
    + '<div id="monitorContent"><div class="loading"><div class="spinner"></div> Memuat...</div></div>';

  if (state.monitorTab === 1 && canFullReport) {
    loadMonitorRekap(bulan);
  } else if (state.monitorTab === 2) {
    loadRekapHarian();
  } else {
    loadMonitorList(bulan);
  }
}

function setMonitorFilter(k) {
  state.monitorKolFilter = k;
  renderMonitoringKol();
}

function setMonitorTab(idx) {
  state.monitorTab = idx;
  renderMonitoringKol();
}

function clearMonitorSearch() { setMonitorSearch(""); }
function setMonitorSearch(val) {
  state.monitorSearch = val;
  if (state._monitorListRows) {
    renderMonitorListData(state._monitorListRows);
  } else if (state._rekapBulanRows && state.monitorTab === 1) {
    renderRekapBulanIsi(state._rekapBulanRows, state.bulan);
  } else {
    renderMonitoringKol();
  }
  const inp = document.getElementById('monitorSearchInput');
  if (inp && !val) { inp.value = ''; }
}

async function loadMonitorList(bulan) {
  const box = document.getElementById("monitorContent");
  const rows = await api("/api/monitoring/nasabah?bulan=" + bulan);
  state._monitorListRows = rows;
  renderMonitorListData(rows);
}

function renderMonitorListData(rows) {
  const bulan = state.bulan;
  const box = document.getElementById("monitorContent");
  if (!box) return;
  if (!Array.isArray(rows) || rows.length === 0) {
    box.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><p>Tidak ada nasabah kolektibilitas 2–5 bulan ini</p></div>';
    return;
  }
  const q = (state.monitorSearch || "").toLowerCase().trim();
  let filtered = state.monitorKolFilter > 0 ? rows.filter(r => r.kolektibilitas === state.monitorKolFilter) : rows;
  if (q) filtered = filtered.filter(r =>
    (r.nama || "").toLowerCase().includes(q) ||
    (r.no_rekening || "").toLowerCase().includes(q) ||
    (r.marketing_nama || "").toLowerCase().includes(q)
  );
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
      + '<button onclick="bukaFormKunjungan(\''+r.no_rekening+'\',\''+r.nama.replace(/'/g,"\\'")+'\',\''+bulan+'\','+r.tagihan_id+')" class="btn-sm green" style="font-size:11px;padding:4px 10px;">+ Kunjungan</button>'
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
  if (!state.rekapBulanView) state.rekapBulanView = 'kartu';
  const box = document.getElementById("monitorContent");
  box.innerHTML = '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">'
    + '<div style="display:flex;border:1px solid var(--gray-200);border-radius:8px;overflow:hidden;">'
    + '<button id="rbKartu" onclick="setRekapBulanView(\'kartu\')" style="padding:7px 12px;border:none;cursor:pointer;font-size:12px;font-weight:700;">Kartu</button>'
    + '<button id="rbList"  onclick="setRekapBulanView(\'list\')"  style="padding:7px 12px;border:none;cursor:pointer;font-size:12px;font-weight:700;">List</button>'
    + '</div>'
    + '<div style="display:flex;border:1px solid var(--gray-200);border-radius:8px;overflow:hidden;flex:1;">'
    + '<button id="rfSemua" onclick="setRekapBulanKunjFilter(\'semua\')" style="padding:7px 0;border:none;cursor:pointer;font-size:11px;font-weight:700;flex:1;">Semua</button>'
    + '<button id="rfDikunjungi" onclick="setRekapBulanKunjFilter(\'dikunjungi\')" style="padding:7px 0;border:none;cursor:pointer;font-size:11px;font-weight:700;flex:1;">✅ Dikunjungi</button>'
    + '<button id="rfBelum" onclick="setRekapBulanKunjFilter(\'belum\')" style="padding:7px 0;border:none;cursor:pointer;font-size:11px;font-weight:700;flex:1;">⬜ Belum</button>'
    + '</div>'
    + '</div>'
    + '<div id="rbIsi"><div class="loading"><div class="spinner"></div> Memuat...</div></div>';
  syncRekapBulanBtn();
  const rows = await api("/api/monitoring/rekap?bulan=" + bulan);
  renderRekapBulanIsi(rows, bulan);
}

function syncRekapBulanBtn() {
  const bk = document.getElementById('rbKartu'), bl = document.getElementById('rbList');
  if (!bk || !bl) return;
  const isK = state.rekapBulanView === 'kartu';
  bk.style.background = isK ? 'var(--green-mid)' : '#fff';
  bk.style.color = isK ? '#fff' : 'var(--gray-500)';
  bl.style.background = !isK ? 'var(--green-mid)' : '#fff';
  bl.style.color = !isK ? '#fff' : 'var(--gray-500)';
  syncRekapBulanKunjFilterBtn();
}

function setRekapBulanKunjFilter(v) {
  state.rekapBulanKunjFilter = v;
  syncRekapBulanKunjFilterBtn();
  if (state._rekapBulanRows) renderRekapBulanIsi(state._rekapBulanRows, state.bulan);
}
function syncRekapBulanKunjFilterBtn() {
  const cur = state.rekapBulanKunjFilter || 'semua';
  [['rfSemua','semua'],['rfDikunjungi','dikunjungi'],['rfBelum','belum']].forEach(([id,val]) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const active = cur === val;
    btn.style.background = active ? 'var(--green-mid)' : '#fff';
    btn.style.color = active ? '#fff' : 'var(--gray-500)';
  });
}
function setRekapBulanView(v) {
  state.rekapBulanView = v;
  syncRekapBulanBtn();
  if (state._rekapBulanRows) renderRekapBulanIsi(state._rekapBulanRows, state.bulan);
}

function renderRekapBulanIsi(rows, bulan) {
  state._rekapBulanRows = rows;
  const box = document.getElementById('rbIsi');
  if (!box) return;
  if (!Array.isArray(rows) || rows.length === 0) {
    box.innerHTML = '<div class="empty-state"><p>Tidak ada data rekap</p></div>';
    return;
  }
  let filtered = state.monitorKolFilter > 0 ? rows.filter(r => r.kolektibilitas === state.monitorKolFilter) : rows;
  if (state.rekapBulanKunjFilter === 'dikunjungi') {
    filtered = filtered.filter(r => r.jumlah_kunjungan > 0);
  } else if (state.rekapBulanKunjFilter === 'belum') {
    filtered = filtered.filter(r => !(r.jumlah_kunjungan > 0));
  }
  const totalTagihan = filtered.reduce((s, r) => s + (r.total_tagihan || 0), 0);
  const sudahKunjung = filtered.filter(r => r.jumlah_kunjungan > 0).length;

  let html = '<div class="card" style="padding:12px 14px;margin-bottom:10px;display:flex;gap:16px;">'
    + '<div style="text-align:center;flex:1;"><div style="font-size:18px;font-weight:800;color:var(--red-dark);">'+filtered.length+'</div><div style="font-size:11px;color:var(--gray-500);">Nasabah</div></div>'
    + '<div style="text-align:center;flex:1;"><div style="font-size:18px;font-weight:800;color:var(--green-dark);">'+sudahKunjung+'</div><div style="font-size:11px;color:var(--gray-500);">Dikunjungi</div></div>'
    + '<div style="text-align:center;flex:1;"><div style="font-size:18px;font-weight:800;color:var(--yellow-dark);">'+rpShort(totalTagihan)+'</div><div style="font-size:11px;color:var(--gray-500);">Total Tagihan</div></div>'
    + '</div>';

  if (state.rekapBulanView === 'kartu') {
    html += filtered.map(r => {
      const kol = r.kolektibilitas;
      const tunggakan = (r.tunggakan_pokok||0) + (r.tunggakan_margin||0);
      const statusBadge = r.status === "LUNAS"
        ? '<span style="background:#eafaf1;color:#27ae60;font-size:10px;font-weight:800;padding:2px 8px;border-radius:99px;">LUNAS</span>'
        : '<span style="background:#fdedec;color:#e74c3c;font-size:10px;font-weight:800;padding:2px 8px;border-radius:99px;">BELUM</span>';
      const kunjInfo = r.jumlah_kunjungan > 0
        ? '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">'
          + '<div><span style="color:var(--green-dark);font-weight:700;font-size:11px;">✅ '+r.jumlah_kunjungan+'x \xb7 '+r.terakhir_kunjungan+'</span>'
          + (r.catatan_kunjungan ? '<div style="font-size:11px;color:var(--gray-600);margin-top:2px;font-style:italic;">'+r.catatan_kunjungan+'</div>' : '')
          + '</div>'
          + '<button onclick="lihatFotoKunjungan(\''+r.no_rekening+'\',\''+r.nama.replace(/\'/g,"\\'")+'\',\''+bulan+'\')" class="btn-sm outline" style="font-size:11px;padding:4px 10px;white-space:nowrap;">🖼️ Foto</button>'
          + '</div>'
        : '<span style="color:var(--gray-400);font-size:11px;">Belum dikunjungi</span>';
      return '<div class="card" style="margin-bottom:8px;padding:12px 14px;">'
        + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">'
        + '<div style="flex:1;min-width:0;">'
        + '<div style="font-size:13px;font-weight:800;">'+r.nama+'</div>'
        + '<div style="font-size:11px;color:var(--gray-500);">'+r.no_rekening+' \xb7 '+(r.marketing_nama||"-")+'</div>'
        + '</div>'
        + '<span style="background:'+KOL_BG[kol]+';color:'+KOL_COLOR[kol]+';font-size:10px;font-weight:800;padding:3px 8px;border-radius:99px;margin-left:8px;white-space:nowrap;">'+KOL_LABEL[kol]+'</span>'
        + '</div>'
        + '<div style="display:flex;gap:12px;align-items:center;margin-bottom:6px;">'
        + '<div><div style="font-size:11px;color:var(--gray-500);">Tagihan</div><div style="font-size:12px;font-weight:800;color:var(--red-dark);">'+rpShort(r.total_tagihan)+'</div></div>'
        + (tunggakan>0?'<div><div style="font-size:11px;color:var(--gray-500);">Tunggakan</div><div style="font-size:12px;font-weight:700;color:var(--yellow-dark);">'+rpShort(tunggakan)+'</div></div>':'')
        + '<div>'+statusBadge+'</div>'
        + '</div>'
        + '<div style="border-top:1px solid var(--gray-100);padding-top:6px;">'+kunjInfo+'</div>'
        + '</div>';
    }).join("");
  } else {
    // List view - compact
    html += '<div class="card" style="padding:0;overflow:hidden;">'
      + filtered.map((r, i) => {
        const kol = r.kolektibilitas;
        const tunggakan = (r.tunggakan_pokok||0) + (r.tunggakan_margin||0);
        const visited = r.jumlah_kunjungan > 0;
        return '<div style="padding:10px 14px;'+(i?'border-top:1px solid var(--gray-100);':'')+'display:flex;gap:10px;align-items:center;">'
          + '<div style="width:36px;height:36px;border-radius:8px;background:'+KOL_BG[kol]+';display:flex;align-items:center;justify-content:center;flex-shrink:0;">'
          + '<span style="font-size:10px;font-weight:800;color:'+KOL_COLOR[kol]+';">K'+kol+'</span>'
          + '</div>'
          + '<div style="flex:1;min-width:0;">'
          + '<div style="font-size:13px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+r.nama+'</div>'
          + '<div style="font-size:11px;color:var(--gray-500);">'+(r.marketing_nama||"-")+' \xb7 '+rpShort(r.total_tagihan)+(tunggakan>0?' \xb7 tung '+rpShort(tunggakan):'')+' \xb7 '+(r.status||"-")+'</div>'
          + (visited?'<div style="font-size:11px;color:var(--green-dark);font-weight:700;">✅ '+r.jumlah_kunjungan+'x \xb7 '+r.terakhir_kunjungan+'</div>':'')
          + (r.catatan_kunjungan?'<div style="font-size:11px;color:var(--gray-600);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-style:italic;">'+esc(r.catatan_kunjungan)+'</div>':'')
          + '</div>'
          + '<button onclick="lihatFotoKunjungan(\''+r.no_rekening+'\',\''+r.nama.replace(/\'/g,"\\'")+'\',\''+bulan+'\')" style="background:none;border:1px solid var(--gray-200);border-radius:6px;padding:6px 8px;font-size:16px;cursor:pointer;white-space:nowrap;flex-shrink:0;">'+(visited?'🖼️':'➕')+'</button>'
          + '</div>';
      }).join('') + '</div>';
  }
  box.innerHTML = html;
}


function bukaFormKunjungan(no_rek, nama, bulan, tagihan_id) {
  tagihan_id = tagihan_id || null;
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
    + '<form id="formKunjungan" onsubmit="submitKunjungan(event,\''+no_rek+'\',\''+bulan+'\',' + (tagihan_id||'null') + ')">'
    + '<div class="modal-label">Catatan Kunjungan</div>'
    + '<textarea id="kunjCatatan" class="modal-input" rows="4" placeholder="Kondisi nasabah, alasan tunggakan, janji bayar, dll..." style="resize:none;"></textarea>'
    + '<div class="modal-label" style="margin-top:12px;">Foto Kunjungan (opsional)</div>'
    + '<div id="fotoPreviewBox" style="margin-bottom:12px;">'
    + '<div style="display:flex;gap:8px;">'
    + '<label style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;border:2px dashed var(--gray-300);border-radius:10px;padding:14px;cursor:pointer;gap:6px;">'
    + '<span style="font-size:24px;">📷</span><span style="font-size:11px;color:var(--gray-500);">Kamera</span>'
    + '<input type="file" id="kunjFotoKamera" accept="image/*" capture="environment" style="display:none;" onchange="previewFoto(this)">'
    + '</label>'
    + '<label style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;border:2px dashed var(--gray-300);border-radius:10px;padding:14px;cursor:pointer;gap:6px;">'
    + '<span style="font-size:24px;">🖼️</span><span style="font-size:11px;color:var(--gray-500);">Galeri</span>'
    + '<input type="file" id="kunjFoto" accept="image/*" style="display:none;" onchange="previewFoto(this)">'
    + '</label></div></div>'
    + '<div id="kunjunganRiwayat" style="margin-bottom:12px;"></div>'
    + (tagihan_id ? '<div style="margin-bottom:14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:12px;">'
        + '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;">'
        + '<input type="checkbox" id="adaBayar" onchange="toggleBayarForm(this.checked)" style="width:18px;height:18px;cursor:pointer;accent-color:var(--green-mid);">'
        + '<span style="font-size:13px;font-weight:700;color:#166534;">💰 Nasabah membayar saat kunjungan ini</span>'
        + '</label>'
        + '<div id="bayarForm" style="display:none;margin-top:12px;">'
        + '<div class="modal-label">Nominal Pembayaran (Rp)</div>'
        + '<input type="text" id="bayarNominal" class="modal-input" placeholder="Contoh: 500.000" inputmode="numeric" oninput="formatInputRibuan(this)" style="font-size:16px;font-weight:700;letter-spacing:0.5px;">'
        + '<div class="modal-label" style="margin-top:8px;">Cara Bayar</div>'
        + '<select id="bayarCara" class="modal-input"><option value="TUNAI">💵 Tunai</option><option value="TRANSFER">🏦 Transfer</option><option value="QRIS">📱 QRIS</option></select>'
        + '</div></div>' : '')
    + '<button type="submit" class="btn-primary" style="width:100%;">💾 Simpan Kunjungan</button>'
    + '</form></div>';
  document.body.appendChild(modal);
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
  loadRiwayatKunjungan(no_rek, bulan);
}

function previewFoto(input) {
  const box = document.getElementById("fotoPreviewBox");
  if (input.files && input.files[0]) {
    _selectedFotoFile = input.files[0];
    const reader = new FileReader();
    reader.onload = e => {
      box.innerHTML = '<div style="position:relative;display:inline-block;width:100%;">'
        + '<img src="'+e.target.result+'" style="width:100%;max-height:200px;object-fit:cover;border-radius:10px;display:block;">'
        + '<button type="button" onclick="hapusFotoPreview()" style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.6);color:#fff;border:none;border-radius:99px;width:28px;height:28px;cursor:pointer;font-size:14px;">✕</button>'
        + '</div>';
    };
    reader.readAsDataURL(input.files[0]);
  }
}

function hapusFotoPreview() {
  _selectedFotoFile = null;
  document.getElementById("fotoPreviewBox").innerHTML =
    '<div style="display:flex;gap:8px;">'
    + '<label style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;border:2px dashed var(--gray-300);border-radius:10px;padding:14px;cursor:pointer;gap:6px;">'
    + '<span style="font-size:24px;">📷</span><span style="font-size:11px;color:var(--gray-500);">Kamera</span>'
    + '<input type="file" id="kunjFotoKamera" accept="image/*" capture="environment" style="display:none;" onchange="previewFoto(this)">'
    + '</label>'
    + '<label style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;border:2px dashed var(--gray-300);border-radius:10px;padding:14px;cursor:pointer;gap:6px;">'
    + '<span style="font-size:24px;">🖼️</span><span style="font-size:11px;color:var(--gray-500);">Galeri</span>'
    + '<input type="file" id="kunjFoto" accept="image/*" style="display:none;" onchange="previewFoto(this)">'
    + '</label></div>';
}

async function submitKunjungan(e, no_rek, bulan, tagihan_id) {
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
  if (_selectedFotoFile) fd.append("foto", _selectedFotoFile);
  try {
    const res = await fetch("/api/kunjungan", { method:"POST", body: fd });
    const data = await res.json();
    if (data.success) {
      _selectedFotoFile = null;
      // Cek pembayaran
      const adaBayarEl = document.getElementById("adaBayar");
      let bayarMsg = "";
      if (adaBayarEl && adaBayarEl.checked && tagihan_id) {
        const jumlah = parseInt((document.getElementById("bayarNominal").value||"").replace(/[^0-9]/g,"")) || 0;
        const cara   = (document.getElementById("bayarCara")||{value:"TUNAI"}).value;
        if (jumlah > 0) {
          try {
            const br = await fetch("/api/bayar", {
              method:"POST", headers:{"Content-Type":"application/json"},
              body: JSON.stringify({tagihan_id:tagihan_id, jumlah:jumlah, cara_bayar:cara, catatan:catatan})
            });
            const bd = await br.json();
            bayarMsg = bd.success ? " + Pembayaran ✅" : " (Bayar: "+(bd.error||"gagal")+")";
          } catch(ex) { bayarMsg = " (Bayar gagal)"; }
        }
      }
      toast("✅ Kunjungan" + bayarMsg + " berhasil dicatat!");
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

async function lihatFotoKunjungan(no_rek, nama, bulan) {
  const existing = document.getElementById("modalLihatFoto");
  if (existing) existing.remove();
  const modal = document.createElement("div");
  modal.id = "modalLihatFoto";
  modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:flex-end;";
  modal.innerHTML = '<div style="background:#fff;border-radius:16px 16px 0 0;width:100%;max-height:85vh;overflow-y:auto;padding:20px;">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'
    + '<div><div style="font-size:15px;font-weight:800;">Foto Kunjungan</div><div style="font-size:12px;color:var(--gray-500);">'+nama+' · '+bulan+'</div></div>'
    + '<button onclick="document.getElementById(\'modalLihatFoto\').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--gray-400);">✕</button>'
    + '</div>'
    + '<div id="fotoKunjunganList"><div class="loading"><div class="spinner"></div> Memuat...</div></div>'
    + '</div>';
  document.body.appendChild(modal);
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });

  const rows = await api("/api/kunjungan/" + no_rek + "?bulan=" + bulan);
  const box = document.getElementById("fotoKunjunganList");
  if (!box) return;
  if (!Array.isArray(rows) || rows.length === 0) {
    box.innerHTML = '<div class="empty-state"><p>Tidak ada data kunjungan</p></div>';
    return;
  }
  const isAdminDel = state.user && state.user.role === "admin";
  box.innerHTML = rows.map(r => {
    const fotoUrl = r.foto_path ? getFotoUrl(r.foto_path) : null;
    return '<div style="margin-bottom:16px;border-bottom:1px solid var(--gray-100);padding-bottom:16px;">'
      + '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--gray-500);margin-bottom:8px;">'
      + '<span>📅 '+r.tanggal+'</span><span>👤 '+(r.dicatat_oleh||"-")+'</span>'
      + '</div>'
      + (fotoUrl
        ? '<a href="'+fotoUrl+'" target="_blank"><img src="'+fotoUrl+'" style="width:100%;max-height:260px;object-fit:cover;border-radius:10px;display:block;margin-bottom:8px;" loading="lazy" onerror="this.style.display=\'none\'"></a>'
        : '<div style="background:var(--gray-100);border-radius:10px;padding:20px;text-align:center;color:var(--gray-400);font-size:12px;margin-bottom:8px;">Tidak ada foto</div>')
      + (r.catatan ? '<div style="font-size:13px;color:var(--gray-700);">'+esc(r.catatan)+'</div>' : '')
      + (isAdminDel ? '<div style="text-align:right;margin-top:8px;"><button onclick="hapusKunjungan('+r.id+',\''+no_rek+'\',\''+bulan+'\')" style="background:#fee2e2;border:none;border-radius:6px;padding:4px 12px;font-size:11px;color:#dc2626;cursor:pointer;font-weight:700;">🗑️ Hapus</button></div>' : '')
      + '</div>';
  }).join("");
}

async function hapusKunjungan(id, no_rek, bulan) {
  if (!confirm("Hapus kunjungan ini? Tindakan tidak dapat dibatalkan.")) return;
  try {
    const res = await fetch("/api/kunjungan/" + id, {method: "DELETE"});
    const data = await res.json();
    if (data.success) {
      toast("✅ Kunjungan dihapus");
      // Reload daftar foto dalam modal
      const box = document.getElementById("fotoKunjunganList");
      if (box) {
        const rows2 = await api("/api/kunjungan/" + no_rek + "?bulan=" + bulan);
        if (!Array.isArray(rows2) || rows2.length === 0) {
          box.innerHTML = '<div class="empty-state"><p>Tidak ada data kunjungan</p></div>';
        } else {
          const fns = window._lihatFotoRows;
          if (fns) fns(rows2);
        }
        // Fallback: tutup modal dan biarkan user buka ulang
        setTimeout(() => {
          const modal = document.getElementById("modalLihatFoto");
          if (modal) modal.remove();
        }, 800);
      }
    } else {
      toast("❌ " + (data.error || "Gagal menghapus"));
    }
  } catch(e) {
    toast("❌ Koneksi gagal");
  }
}

function toggleBayarForm(checked) {
  var f = document.getElementById('bayarForm');
  if (f) f.style.display = checked ? 'block' : 'none';
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
      + (r.foto_path ? '<img src="'+getFotoUrl(r.foto_path)+'" style="width:100%;max-height:150px;object-fit:cover;border-radius:6px;margin-bottom:6px;display:block;" loading="lazy">' : '')
      + '<div style="font-size:12px;">'+esc(r.catatan)+'</div>'
      + '</div>'
    ).join("");
}


// == REKAP HARIAN ==
async function loadRekapHarian(){
  const box=document.getElementById("monitorContent");
  if(!state.rekapHarianTgl) state.rekapHarianTgl=todayStr();
  if(!state.rekapHarianView) state.rekapHarianView='kartu';
  box.innerHTML='<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap;">'
    +'<input type="date" id="rhTgl" value="'+state.rekapHarianTgl+'" onchange="gantiTglRekap(this.value)" style="flex:1;padding:8px 10px;border:1px solid var(--gray-200);border-radius:8px;font-size:13px;min-width:0;">'
    +'<div style="display:flex;border:1px solid var(--gray-200);border-radius:8px;overflow:hidden;">'
    +'<button onclick="setRekapView(\'kartu\')" id="rvKartu" style="padding:7px 12px;border:none;cursor:pointer;font-size:12px;font-weight:700;">Kartu</button>'
    +'<button onclick="setRekapView(\'list\')" id="rvList" style="padding:7px 12px;border:none;cursor:pointer;font-size:12px;font-weight:700;">List</button>'
    +'</div></div><div id="rhIsi"><div class="loading"><div class="spinner"></div> Memuat...</div></div>';
  syncRekapViewBtn();
  await renderRekapHarianIsi(state.rekapHarianTgl);
}
function todayStr(){
  const d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function syncRekapViewBtn(){
  const bk=document.getElementById('rvKartu'), bl=document.getElementById('rvList');
  if(!bk||!bl) return;
  const isK=state.rekapHarianView==='kartu';
  bk.style.background=isK?'var(--green-mid)':'#fff'; bk.style.color=isK?'#fff':'var(--gray-500)';
  bl.style.background=!isK?'var(--green-mid)':'#fff'; bl.style.color=!isK?'#fff':'var(--gray-500)';
}
function gantiTglRekap(val){
  state.rekapHarianTgl=val;
  renderRekapHarianIsi(val);
}
function setRekapView(v){
  state.rekapHarianView=v;
  syncRekapViewBtn();
  renderRekapHarianIsi(state.rekapHarianTgl);
}
async function renderRekapHarianIsi(tgl){
  const box=document.getElementById('rhIsi');
  if(!box) return;
  box.innerHTML='<div class="loading"><div class="spinner"></div> Memuat...</div>';
  const rows=await api('/api/kunjungan/rekap-harian?tanggal='+tgl);
  if(!Array.isArray(rows)){box.innerHTML='<div class="empty-state"><p>Gagal memuat data</p></div>';return;}
  if(!rows.length){box.innerHTML='<div class="empty-state"><div class="empty-icon">📋</div><p>Tidak ada kunjungan pada '+tgl+'</p></div>';return;}
  const mktSet=new Set(rows.map(r=>r.dicatat_oleh||'-'));
  const dFoto=rows.filter(r=>r.foto_path).length;
  let html='<div class="card" style="padding:12px 14px;margin-bottom:10px;display:flex;gap:0;">'
    +'<div style="text-align:center;flex:1;border-right:1px solid var(--gray-100);"><div style="font-size:20px;font-weight:800;color:var(--green-dark);">'+rows.length+'</div><div style="font-size:11px;color:var(--gray-500);">Kunjungan</div></div>'
    +'<div style="text-align:center;flex:1;border-right:1px solid var(--gray-100);"><div style="font-size:20px;font-weight:800;color:#2980b9;">'+mktSet.size+'</div><div style="font-size:11px;color:var(--gray-500);">Marketing</div></div>'
    +'<div style="text-align:center;flex:1;"><div style="font-size:20px;font-weight:800;color:var(--yellow-dark);">'+dFoto+'</div><div style="font-size:11px;color:var(--gray-500);">Ada Foto</div></div>'
    +'</div>';
  if(state.rekapHarianView==='kartu'){
    html+=rows.map(r=>{
      const kol=r.kolektibilitas||0;
      const tung=(r.tunggakan_pokok||0)+(r.tunggakan_margin||0);
      const fu=r.foto_path?getFotoUrl(r.foto_path):null;
      const isLunas = r.status === 'LUNAS';
      return '<div class="card" style="margin-bottom:10px;padding:0;overflow:hidden;'+(isLunas?'border:2px solid #27ae60;':'')+'">'
        +(isLunas?'<div style="background:#27ae60;color:#fff;padding:7px 14px;font-size:12px;font-weight:800;display:flex;align-items:center;gap:6px;"><span style="font-size:15px;">✅</span> SUDAH BAYAR — Tagihan bulan ini LUNAS</div>':'')
        +(fu?'<a href="'+fu+'" target="_blank"><img src="'+fu+'" style="width:100%;max-height:180px;object-fit:cover;display:block;" loading="lazy" onerror="this.parentElement.style.display=\'none\'"></a>':'')
        +'<div style="padding:12px 14px;">'
        +'<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">'
        +'<div><div style="font-size:13px;font-weight:800;">'+r.nama+'</div><div style="font-size:11px;color:var(--gray-500);">'+r.no_rekening+'</div></div>'
        +(kol?'<span style="background:'+KOL_BG[kol]+';color:'+KOL_COLOR[kol]+';font-size:10px;font-weight:800;padding:3px 8px;border-radius:99px;">'+KOL_LABEL[kol]+'</span>':'')
        +'</div><div style="display:flex;gap:12px;margin-bottom:8px;">'
        +'<div><div style="font-size:10px;color:var(--gray-400);">Tagihan</div><div style="font-size:12px;font-weight:700;color:var(--red-dark);">'+(r.total_tagihan?rpShort(r.total_tagihan):'-')+'</div></div>'
        +(tung?'<div><div style="font-size:10px;color:var(--gray-400);">Tunggakan</div><div style="font-size:12px;font-weight:700;color:var(--yellow-dark);">'+rpShort(tung)+'</div></div>':'')
        +'<div><div style="font-size:10px;color:var(--gray-400);">Marketing</div><div style="font-size:12px;font-weight:600;">'+(r.dicatat_oleh||'-')+'</div></div>'
        +'</div>'+(r.catatan?'<div style="background:var(--gray-50);border-radius:8px;padding:8px 10px;font-size:12px;color:var(--gray-700);">'+esc(r.catatan)+'</div>':'')
        +'</div></div>';
    }).join('');
  } else {
    const listRows = rows.slice(0,25);
    const moreCount = rows.length - listRows.length;
    html+='<div style="font-size:11px;color:var(--gray-400);margin-bottom:6px;">'
      +(rows.length > 25 ? 'Menampilkan 25 dari '+rows.length+' kunjungan' : 'Total '+rows.length+' kunjungan')
      +'</div>';
    html+='<div class="card" style="padding:0;overflow:hidden;">'
      +listRows.map((r,i)=>{
        const kol=r.kolektibilitas||0;
        const tung=(r.tunggakan_pokok||0)+(r.tunggakan_margin||0);
        const fu=r.foto_path?getFotoUrl(r.foto_path):null;
        const statusBadge = r.status==='LUNAS'
          ? '<span style="background:#eafaf1;color:#27ae60;font-weight:800;font-size:10px;padding:1px 7px;border-radius:99px;">✅ LUNAS</span>'
          : '<span style="background:#fdedec;color:#e74c3c;font-weight:700;font-size:10px;padding:1px 7px;border-radius:99px;">BELUM</span>';
        return '<div style="padding:10px 14px;'+(i?'border-top:1px solid var(--gray-100);':'')+';display:flex;gap:10px;align-items:center;">'
          +(fu?'<a href="'+fu+'" target="_blank"><img src="'+fu+'" style="width:48px;height:48px;object-fit:cover;border-radius:8px;flex-shrink:0;" loading="lazy" onerror="this.style.display=\'none\'"></a>'
             :'<div style="width:48px;height:48px;background:var(--gray-100);border-radius:8px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:18px;">📷</div>')
          +'<div style="flex:1;min-width:0;">'
          +'<div style="display:flex;justify-content:space-between;align-items:center;">'
            +'<div style="font-size:13px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;">'+r.nama+'</div>'
            +(kol?'<span style="background:'+KOL_BG[kol]+';color:'+KOL_COLOR[kol]+';font-size:10px;font-weight:800;padding:2px 6px;border-radius:99px;margin-left:4px;white-space:nowrap;">'+KOL_LABEL[kol]+'</span>':'')
          +'</div>'
          +'<div style="font-size:11px;color:var(--gray-500);margin-top:2px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">'
            +'<span>'+(r.dicatat_oleh||'-')+'</span>'
            +(r.total_tagihan?'<span>·</span><span>'+rpShort(r.total_tagihan)+'</span>':'')
            +(tung?'<span>·</span><span style="color:var(--yellow-dark);">tung '+rpShort(tung)+'</span>':'')
            +'<span>·</span>'+statusBadge
          +'</div>'
          +(r.catatan?'<div style="font-size:11px;color:var(--gray-600);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(r.catatan)+'</div>':'')
          +'</div></div>';
      }).join('')
      +(moreCount>0?'<div style="padding:10px 14px;border-top:1px solid var(--gray-100);font-size:11px;color:var(--gray-400);text-align:center;">... dan '+moreCount+' kunjungan lainnya</div>':'')
      +'</div>';
  }
  box.innerHTML=html;
}

// ── INIT ──────────────────────────────────────────────────────

// Fix 5: Override loadJatuhTempoHariIni — make btn-jt-kirim visible
(function() {
  var _origLJTH = window.loadJatuhTempoHariIni;
  if (!_origLJTH) return;
  window.loadJatuhTempoHariIni = async function(bulan) {
    var html = await _origLJTH.call(this, bulan);
    if (!html) return html;
    // Ganti tombol btn-jt-kirim jadi warna hijau agar terlihat
    return html.replace(/class="btn-jt-kirim"([^>]*title="Kirim WA")/g,
      'class="btn-jt-kirim" style="background:var(--primary);color:#fff;font-size:14px;" ' + "$1");
  };
})();

// ── TASK 7: Batasi kirim WA hanya untuk admin ─────────────────────────────
(function() {
  // Override renderTagihanCard to hide WA button for non-admin
  var _origRTC = window.renderTagihanCard;
  if (_origRTC) {
    window.renderTagihanCard = function(t) {
      var html = _origRTC(t);
      if (!state.user || state.user.role !== 'admin') {
        var tmp = document.createElement('div');
        tmp.innerHTML = html;
        tmp.querySelectorAll('.btn-sm.wa').forEach(function(btn) {
          var next = btn.nextElementSibling;
          if (next && next.textContent.trim() === '✏️') next.remove();
          btn.remove();
        });
        return tmp.innerHTML;
      }
      return html;
    };
  }

  // Override loadJatuhTempoMarketing to hide WA buttons for non-admin
  var _origLJTM = window.loadJatuhTempoMarketing;
  if (_origLJTM) {
    window.loadJatuhTempoMarketing = async function(bulan) {
      var html = await _origLJTM.call(this, bulan);
      if (state.user && state.user.role === 'admin') return html;
      var div = document.createElement('div');
      div.innerHTML = html || '';
      div.querySelectorAll('[title="Kirim WA"]').forEach(function(el){ el.remove(); });
      return div.innerHTML;
    };
  }

  // Safety net + WA sent tracking for kirimNotifJT
  if (!window._waSentJT) window._waSentJT = new Set();
  var _origKNJT = window.kirimNotifJT;
  window.kirimNotifJT = async function(id, btn) {
    if (!state.user || state.user.role !== 'admin') {
      if (typeof toast === 'function') toast('⛔ Hanya admin yang dapat mengirim notif WA');
      return;
    }
    // Cek reschedule dari style border item
    var jtItem = document.getElementById('jt-item-' + id);
    if (jtItem && (jtItem.style.borderLeft || '').indexOf('ea580c') >= 0) {
      if (typeof toast === 'function') toast('⚠️ Nasabah reschedule — WA tidak dikirim. Hubungi langsung.');
      return;
    }
    if (_origKNJT) {
      await _origKNJT.call(this, id, btn);
      // Tambah badge setelah kirim — cek sukses dengan setTimeout agar DOM update dulu
      setTimeout(function() {
        // Sukses jika btn disabled (tidak bisa klik ulang) dan bukan error
        var txt = btn ? (btn.textContent || btn.innerText || '') : '';
        var isError = txt.indexOf('❌') >= 0;  // ❌
        if (!isError) {
          window._waSentJT.add(String(id));
          var item = document.getElementById('jt-item-' + id);
          if (item && !item.querySelector('.wa-sent-badge')) {
            var namaEl = item.querySelector('.jt-nama');
            if (namaEl) {
              var badge = document.createElement('span');
              badge.className = 'wa-sent-badge';
              badge.style.cssText = 'display:inline-block;font-size:10px;background:#dcfce7;color:#166534;'
                + 'border:1px solid #86efac;padding:2px 8px;border-radius:99px;margin-left:6px;font-weight:600;vertical-align:middle;';
              badge.textContent = '📨 Terkirim';
              namaEl.appendChild(badge);
            }
          }
        }
      }, 200);
    }
  };

  // Safety net: block blastNotifJT for non-admin
  var _origBNJT = window.blastNotifJT;
  window.blastNotifJT = async function(bulan) {
    if (!state.user || state.user.role !== 'admin') {
      if (typeof toast === 'function') toast('⛔ Hanya admin yang dapat mengirim blast WA');
      return;
    }
    if (_origBNJT) return _origBNJT.call(this, bulan);
  };
})();



// ── BLAST LOG HISTORY ─────────────────────────────────────────────────────
async function loadBlastHistori(bulan) {
  const box = document.getElementById('blastHistoriBox');
  if (!box) return;
  box.innerHTML = '<div style="text-align:center;padding:12px;color:var(--gray-400);font-size:12px;">⏳ Memuat histori...</div>';
  try {
    const b = bulan || state.bulan;
    const rows = await api('/api/blast/log?limit=15');
    if (!rows || rows.error || rows.length === 0) {
      box.innerHTML = '<div style="text-align:center;padding:16px;color:var(--gray-400);font-size:12px;">Belum ada histori blast</div>';
      return;
    }
    const tipeLabel = { 'execute_blast': '📨 Blast Tagihan', 'blast_jt': '🔔 Blast JT Hari Ini' };
    const html = rows.map(function(r) {
      const tgl = r.dibuat_at ? r.dibuat_at.replace('T',' ').substring(0,16) : '-';
      const label = tipeLabel[r.tipe] || r.tipe;
      const bulanBadge = r.bulan ? '<span style="font-size:10px;background:#e0f2fe;color:#0369a1;padding:1px 6px;border-radius:99px;margin-left:4px;">' + r.bulan + '</span>' : '';
      // Parse catatan: 'Blast Hari Ini | nama1, nama2, ...'
      var catParts = r.catatan ? r.catatan.split(' | ') : [];
      var catTipe = catParts[0] || '';
      var catNama = catParts[1] || '';
      var catTipeBadge = catTipe ? '<span style="font-size:10px;background:#f0fdf4;color:#166534;padding:1px 6px;border-radius:99px;margin-left:4px;">' + catTipe + '</span>' : '';
      var catNamaHtml = catNama ? '<div style="font-size:10px;color:var(--gray-400);margin-top:3px;line-height:1.4;">👥 ' + catNama + '</div>' : '';
      return '<div style="padding:10px 14px;border-bottom:1px solid var(--gray-100);">'
        + '<div style="display:flex;align-items:flex-start;gap:8px;">'
        + '<div style="flex:1;min-width:0;">'
        +   '<div style="font-size:12px;font-weight:700;">' + label + bulanBadge + catTipeBadge + '</div>'
        +   catNamaHtml
        +   '<div style="font-size:11px;color:var(--gray-500);margin-top:3px;">👤 ' + (r.dilakukan_oleh||'-') + ' &nbsp;·&nbsp; 🕐 ' + tgl + '</div>'
        + '</div>'
        + '<div style="text-align:right;flex-shrink:0;">'
        +   '<div style="font-size:13px;font-weight:700;color:var(--green-dark);">✅ ' + (r.terkirim||0) + '</div>'
        +   (r.gagal > 0 ? '<div style="font-size:12px;font-weight:700;color:var(--red-dark);">❌ ' + r.gagal + '</div>' : '')
        + '</div>'
        + '</div>'
        + '</div>';
    }).join('');
    box.innerHTML = html;
  } catch(e) {
    box.innerHTML = '<div style="padding:12px;color:var(--gray-400);font-size:12px;">Gagal memuat histori</div>';
  }
}

function injectBlastHistoriUI() {
  if (document.getElementById('blastHistoriSection')) return;
  const main = document.getElementById('mainContent');
  if (!main) return;
  const sec = document.createElement('div');
  sec.id = 'blastHistoriSection';
  sec.innerHTML =
    '<div class="section-title">📋 Histori Blast WA</div>'
    + '<div class="card" style="padding:0;overflow:hidden;" id="blastHistoriBox">'
    + '<div style="text-align:center;padding:16px;color:var(--gray-400);font-size:12px;">⏳ Memuat...</div>'
    + '</div>';
  // Sisipkan tepat setelah card Blast Reminder (setelah blastResult.parentNode)
  const blastResult = document.getElementById('blastResult');
  if (blastResult && blastResult.parentNode && blastResult.parentNode.parentNode) {
    const blastCard = blastResult.parentNode;
    blastCard.parentNode.insertBefore(sec, blastCard.nextSibling);
  } else {
    main.appendChild(sec);
  }
  loadBlastHistori(state.bulan);
}

// Override renderAdmin (async) — inject histori SETELAH render selesai
(function() {
  var _origRA = window.renderAdmin;
  if (_origRA) {
    window.renderAdmin = async function() {
      await _origRA.call(this);
      injectBlastHistoriUI();
    };
  }
})();

// Override doBlast — cek histori bulan ini sebelum blast
(function() {
  var _origDoBlast = window.doBlast;
  window.doBlast = async function(hanyaHariIni) {
    try {
      var check = await api('/api/blast/log/check?bulan=' + state.bulan);
      if (check && check.sudah_blast && check.history && check.history.length > 0) {
        var last = check.history[0];
        var tgl = last.dibuat_at ? last.dibuat_at.replace('T',' ').substring(0,16) : '-';
        var msg = '⚠️ PERHATIAN!\n\nBlast tagihan bulan ini sudah pernah dilakukan:\n'
          + '📅 ' + tgl + '\n'
          + '👤 Oleh: ' + (last.dilakukan_oleh||'-') + '\n'
          + '✅ Terkirim: ' + (last.terkirim||0) + ' · ❌ Gagal: ' + (last.gagal||0) + '\n\n'
          + 'Apakah Anda yakin ingin blast lagi?';
        if (!confirm(msg)) return;
      }
    } catch(e) { /* lanjut jika cek gagal */ }
    if (_origDoBlast) return _origDoBlast.call(this, hanyaHariIni);
  };
})();

// Override executeBlastRequest — background blast dengan live polling progress
(function() {
  window.executeBlastRequest = async function(updates) {
    const resultEl = document.getElementById('blastResult');
    if (!resultEl) return;

    resultEl.innerHTML = '<div class="loading"><div class="spinner"></div> Memulai blast...</div>';
    resultEl.classList.remove('hidden');

    const res = await api('/api/reminder/execute_blast', 'POST', {
      bulan: state.bulan,
      hanya_hari_ini: (typeof activeBlastData !== 'undefined' && activeBlastData) ? activeBlastData.hanya_hari_ini : false,
      updates: updates
    });

    if (!res || res.error) {
      resultEl.innerHTML = '<div class="error-msg">❌ ' + (res ? res.error : 'Koneksi gagal') + '</div>';
      return;
    }

    // Background mode: polling progress
    if (res.background && res.task_id) {
      var taskId = res.task_id;
      var total = res.total || 0;
      var pollInterval;

      function updateBlastProgress(terkirim, gagal, tot, status) {
        var pct = tot > 0 ? Math.round(terkirim / tot * 100) : 0;
        var barColor = status === 'done' ? 'var(--green-dark)' : '#3b82f6';
        var statusLabel = status === 'done'
          ? '<span style="color:var(--green-dark);font-weight:700;">✅ Selesai</span>'
          : status === 'error'
            ? '<span style="color:var(--red-dark);">❌ Error</span>'
            : '<span style="color:#3b82f6;">⏳ Mengirim...</span>';

        resultEl.innerHTML =
          '<div style="background:var(--green-pale);border-radius:var(--radius-sm);padding:14px;font-size:13px;">'
          + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'
          + '<span style="font-weight:700;">' + statusLabel + '</span>'
          + '<span style="font-size:12px;color:var(--gray-500);">' + terkirim + '/' + tot + '</span>'
          + '</div>'
          + '<div style="background:#e5e7eb;border-radius:99px;height:8px;overflow:hidden;margin-bottom:8px;">'
          + '<div style="background:' + barColor + ';height:100%;border-radius:99px;transition:width 0.4s;width:' + pct + '%;"></div>'
          + '</div>'
          + '<div style="font-size:12px;display:flex;gap:12px;">'
          + '<span style="color:var(--green-dark);">✅ Terkirim: <strong>' + terkirim + '</strong></span>'
          + (gagal > 0 ? ' <span style="color:var(--red-dark);">❌ Gagal: <strong>' + gagal + '</strong></span>' : '')
          + '</div>'
          + '</div>';
      }

      updateBlastProgress(0, 0, total, 'running');

      pollInterval = setInterval(async function() {
        try {
          var task = await api('/api/blast/task/' + taskId);
          if (!task || task.error) return;
          updateBlastProgress(task.terkirim || 0, task.gagal || 0, task.total || total, task.status);
          if (task.status === 'done' || task.status === 'error') {
            clearInterval(pollInterval);
            if (task.status === 'done') {
              toast('📲 ' + (task.terkirim || 0) + ' WA terkirim!');
            } else {
              toast('❌ Blast error: ' + (task.catatan || ''));
            }
            setTimeout(function() { loadBlastHistori(state.bulan); }, 800);
          }
        } catch(e) { /* ignore poll error */ }
      }, 2000);

    } else {
      // Fallback: response langsung (non-background)
      resultEl.innerHTML =
        '<div style="background:var(--green-pale);border-radius:var(--radius-sm);padding:14px;font-size:13px;">'
        + '✅ Blast Selesai<br>Terkirim: <strong>' + (res.terkirim||0) + '</strong> · Gagal: <strong>' + (res.gagal||0) + '</strong>'
        + '</div>';
      toast('📲 ' + (res.terkirim||0) + ' WA terkirim!');
      setTimeout(function() { loadBlastHistori(state.bulan); }, 600);
    }
  };
})();


document.addEventListener("DOMContentLoaded", initApp);
