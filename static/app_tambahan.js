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
