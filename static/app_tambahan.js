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
  main.innerHTML='<div class="section-title">🔔 Notifikasi Terjadwal</div><div style="background:var(--yellow-pale);border-radius:8px;padding:12px;font-size:12px;color:var(--yellow-dark);margin-bottom:12px;">⚠️ Notifikasi otomatis selama app aktif di browser.</div>'+jadwalHtml+'<div class="section-title">📲 Kirim Manual</div><div class="card admin-section"><div style="display:flex;flex-direction:column;gap:10px;"><button class="btn-primary" onclick="testNotif(\'reminder_h3\')">⏰ Reminder H-3</button><button class="btn-primary" style="background:var(--green-mid);" onclick="testNotif(\'laporan_harian\')">📊 Laporan Harian</button><button class="btn-primary" style="background:var(--yellow-dark);" onclick="testNotif(\'rekap_mingguan\')">📋 Rekap Mingguan</button></div><div id="testNotifResult" style="margin-top:12px;"></div></div>';
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
