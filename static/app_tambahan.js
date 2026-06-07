// ── TAMBAHAN FITUR BMT ──────────────────────────────────────────
state.activeRiwayatRek = null;
const _origNavigate = navigate;
function navigate(page) {
  if (["marketing_dashboard","riwayat_anggota","jadwal_notif"].includes(page)) {
    state.page = page;
    document.querySelectorAll(".nav-item").forEach((el) => {
      el.classList.toggle("active", el.dataset.page === page);
    });
    const main = document.getElementById("mainContent");
    main.innerHTML = '<div class="loading"><div class="spinner"></div> Memuat...</div>';
    if (page === "marketing_dashboard") renderMarketingDashboard();
    if (page === "riwayat_anggota") renderRiwayatAnggota();
    if (page === "jadwal_notif") renderJadwalNotif();
  } else { _origNavigate(page); }
}
function initTambahanNav() {
  const nav = document.querySelector(".bottom-nav");
  if (!nav || document.getElementById("navMarketing")) return;
  const btnMkt = document.createElement("button");
  btnMkt.className = "nav-item"; btnMkt.id = "navMarketing";
  btnMkt.dataset.page = "marketing_dashboard";
  btnMkt.innerHTML = '<span class="nav-icon">📈</span>Statistik';
  btnMkt.onclick = () => navigate("marketing_dashboard");
  nav.appendChild(btnMkt);
  if (state.user && state.user.role === "admin") {
    const btnJadwal = document.createElement("button");
    btnJadwal.className = "nav-item"; btnJadwal.id = "navJadwal";
    btnJadwal.dataset.page = "jadwal_notif";
    btnJadwal.innerHTML = '<span class="nav-icon">🔔</span>Notif';
    btnJadwal.onclick = () => navigate("jadwal_notif");
    nav.appendChild(btnJadwal);
  }
}
const _origShowApp = showApp;
function showApp() { _origShowApp(); setTimeout(initTambahanNav, 100); }
