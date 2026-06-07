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
    const statusBadge = r.status==="LUNAS"
      ? '<span style="background:#eafaf1;color:#27ae60;font-size:10px;font-weight:800;padding:2px 8px;border-radius:99px;">LUNAS</span>'
      : '<span style="background:#fdedec;color:#e74c3c;font-size:10px;font-weight:800;padding:2px 8px;border-radius:99px;">BELUM</span>';
    const kunjInfo = r.jumlah_kunjungan > 0
      ? '<span style="color:var(--green-dark);font-weight:700;font-size:11px;">✅ '+r.jumlah_kunjungan+'x · '+r.terakhir_kunjungan+'</span>'
        + (r.catatan_kunjungan ? '<div style="font-size:11px;color:var(--gray-600);margin-top:2px;font-style:italic;">'+r.catatan_kunjungan+'</div>' : '')
      : '<span style="color:var(--gray-400);font-size:11px;">Belum dikunjungi</span>';
    return '<div class="card" style="margin-bottom:8px;padding:12px 14px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">'
      + '<div style="flex:1;min-width:0;">'
      + '<div style="font-size:13px;font-weight:800;">'+r.nama+'</div>'
      + '<div style="font-size:11px;color:var(--gray-500);">'+r.no_rekening+' · '+(r.marketing_nama||"-")+'</div>'
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
  box.innerHTML = '<div class="card" style="padding:12px 14px;margin-bottom:10px;display:flex;gap:16px;">'
    + '<div style="text-align:center;flex:1;"><div style="font-size:18px;font-weight:800;color:var(--red-dark);">'+filtered.length+'</div><div style="font-size:11px;color:var(--gray-500);">Nasabah</div></div>'
    + '<div style="text-align:center;flex:1;"><div style="font-size:18px;font-weight:800;color:var(--green-dark);">'+sudahKunjung+'</div><div style="font-size:11px;color:var(--gray-500);">Dikunjungi</div></div>'
    + '<div style="text-align:center;flex:1;"><div style="font-size:18px;font-weight:800;color:var(--yellow-dark);">'+rpShort(totalTagihan)+'</div><div style="font-size:11px;color:var(--gray-500);">Total Tagihan</div></div>'
    + '</div>'
    + html;
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
  if (_selectedFotoFile) fd.append("foto", _selectedFotoFile);
  try {
    const res = await fetch("/api/kunjungan", { method:"POST", body: fd });
    const data = await res.json();
    if (data.success) {
      _selectedFotoFile = null;
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
      + (r.foto_path ? '<img src="'+getFotoUrl(r.foto_path)+'" style="width:100%;max-height:150px;object-fit:cover;border-radius:6px;margin-bottom:6px;display:block;" loading="lazy">' : '')
      + '<div style="font-size:12px;">'+r.catatan+'</div>'
      + '</div>'
    ).join("");
}

