"""
sync_mespro.py - Sync otomatis dari MySQL MESPro (knasabah) ke koperasi.db
Database: bmt_amw_01 (read-only via user reportamw)
Tunnel: SSH reverse tunnel port 13306

Jalankan: venv/bin/python3 sync_mespro.py
Discover: venv/bin/python3 sync_mespro.py --discove
"""
import sqlite3, json, os, sys
from datetime import datetime

CONFIG_FILE = os.path.join(os.path.dirname(__file__), "data", "mespro_config.json")
DB_PATH     = os.path.join(os.path.dirname(__file__), "data", "koperasi.db")
DATA_DIR        = os.path.join(os.path.dirname(__file__), "data")
SYNC_STATE_FILE = os.path.join(DATA_DIR, "sync_state.json")
NOTIF_THROTTLE_SEC = 6 * 3600  # maksimal 1 notif gagal per 6 jam (cegah spam cron 10 menit)

DEFAULT_CONFIG = {
    "host": "127.0.0.1",
    "port": 13306,
    "database": "bmt_amw_01",
    "username": "reportamw",
    "password": "bMt4m2u22606!",
}

def load_config():
    if os.path.exists(CONFIG_FILE):
        cfg = json.load(open(CONFIG_FILE))
        for k, v in DEFAULT_CONFIG.items():
            cfg.setdefault(k, v)
        if cfg.get("database") != "bmt_amw_01":
            cfg["database"] = "bmt_amw_01"
        return cfg
    os.makedirs(os.path.dirname(CONFIG_FILE), exist_ok=True)
    json.dump(DEFAULT_CONFIG, open(CONFIG_FILE, "w"), indent=2)
    print(f"[SETUP] Config dibuat: {CONFIG_FILE}")
    sys.exit(0)

def get_connection(cfg):
    import pymysql
    conn = pymysql.connect(
        host=cfg["host"], port=int(cfg["port"]),
        user=cfg["username"], password=cfg["password"],
        database=cfg["database"], charset="utf8",
        connect_timeout=15, read_timeout=30
    )
    cur = conn.cursor()
    try:
        cur.execute("SET SESSION TRANSACTION READ ONLY")
    except Exception:
        pass
    cur.execute("SHOW GRANTS FOR CURRENT_USER()")
    grants = " ".join(r[0].upper() for r in cur.fetchall())
    if any(w in grants for w in ["ALL PRIVILEGES", "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE"]):
        conn.close()
        raise PermissionError(
            "BAHAYA: User MySQL punya akses WRITE! "
            "Hanya SELECT yang diizinkan.")
    return conn

def discover_tables(mconn):
    cur = mconn.cursor()
    cur.execute("SHOW FULL TABLES")
    rows = cur.fetchall()
    dbname = mconn.db.decode() if isinstance(mconn.db, bytes) else mconn.db
    print(f"\n{'='*55}")
    print(f"  Tabel/View di database '{dbname}' ({len(rows)} total):")
    print(f"{'='*55}")
    for tname, ttype in rows:
        print(f"  [{ttype:16s}] {tname}")
    print(f"{'='*55}\n")

def get_mespro_kredit(mconn):
    cur = mconn.cursor()
    cur.execute("""
        SELECT
            k.no_rekk, k.nama, k.plafond, k.jw, k.tgl_real, k.jt_tempo,
            k.ang_pokok, k.ang_bunga, k.angsuran,
            k.sisa_aw, k.sisa_ak, k.sisa_b,
            k.tunggak_p, k.tunggak_b, k.klb, k.tgl_bayar,
            k.kao, k.alamat, k.kabupaten,
            k.no_rekt, k.no_cif,
            n.handphone, n.telp
        FROM knasabah k
        LEFT JOIN nasabah n ON k.no_cif = n.no_cif
        WHERE k.sisa_ak > 0
        ORDER BY k.no_rekk
    """)
    columns = [d[0] for d in cur.description]
    rows = cur.fetchall()
    print(f"[QUERY] {len(rows)} nasabah kredit aktif dari MESPro")
    return columns, rows

def sync_to_sqlite(columns, rows, bulan):
    sys.path.insert(0, os.path.dirname(__file__))
    from init_db import KODE_AO
    from status_logic import hitung_n_due, tentukan_status, selaraskan_tunggakan_berjalan

    conn = sqlite3.connect(DB_PATH)

    def ci(name):
        try:
            return columns.index(name)
        except ValueError:
            return None

    def v(row, i):
        if i is None:
            return None
        val = row[i]
        if val is None:
            return None
        s = str(val).strip()
        if s == "0000-00-00":
            return None
        return s if s else None

    def n(row, i):
        if i is None:
            return 0.0
        try:
            return float(row[i] or 0)
        except (ValueError, TypeError):
            return 0.0

    I = {c: ci(c) for c in columns}

    inserted = updated = skipped = 0
    for row in rows:
        no_rek = v(row, I["no_rekk"])
        if not no_rek:
            skipped += 1
            continue

        nama      = v(row, I["nama"]) or "-"
        hp        = v(row, I["handphone"]) or v(row, I["telp"]) or None
        kao       = v(row, I["kao"]) or ""
        mkt_nm    = KODE_AO.get(kao, kao)
        tgl_jt    = v(row, I["jt_tempo"])
        alamat    = v(row, I["alamat"])
        kabupaten = v(row, I["kabupaten"])
        tgl_real  = v(row, I["tgl_real"])
        saldo     = n(row, I["sisa_ak"])

        # --- Nasabah upsert ---
        ex = conn.execute(
            "SELECT no_rekening FROM nasabah WHERE no_rekening=?", (no_rek,)
        ).fetchone()
        if ex:
            conn.execute(
                """UPDATE nasabah SET nama=?, marketing_id=?, marketing_nama=?,
                   tanggal_jt=?, alamat=?, kabupaten=?, tgl_realisasi=?
                   WHERE no_rekening=?""",
                (nama, kao, mkt_nm, tgl_jt, alamat, kabupaten, tgl_real, no_rek),
            )
            if hp:
                conn.execute(
                    "UPDATE nasabah SET no_hp=? WHERE no_rekening=? AND (no_hp IS NULL OR no_hp='')",
                    (hp, no_rek),
                )
        else:
            conn.execute(
                """INSERT INTO nasabah (no_rekening, nama, no_hp, marketing_id, marketing_nama,
                   tanggal_jt, alamat, kabupaten, tgl_realisasi, aktif)
                   VALUES (?,?,?,?,?,?,?,?,?,1)""",
                (no_rek, nama, hp, kao, mkt_nm, tgl_jt, alamat, kabupaten, tgl_real),
            )

        # --- Tunggakan: langsung dari MESPro (source of truth) ---
        tung_pokok = n(row, I["tunggak_p"])
        tung_margin = n(row, I["tunggak_b"])

        if saldo < 1:
            tung_pokok = 0.0
            tung_margin = 0.0

        total = tung_pokok + tung_margin
        angsuran = n(row, I["angsuran"])
        plafond = n(row, I["plafond"])

        # Kolektibilitas langsung dari MESPro
        kolek = int(n(row, I["klb"])) or 1

        tgl_bayar = v(row, I["tgl_bayar"])

        # Status berbasis JADWAL ANGSURAN (pakai ang_pokok asli MESPro).
        # Lihat status_logic.py. SUDAH bila sesuai jadwal ATAU ada bayar bulan ini.
        ang_pokok_real = n(row, I["ang_pokok"])
        jw_real = int(n(row, I["jw"]) or 0)
        n_due = hitung_n_due(tgl_real, jw_real)
        paid_this_month = bool(
            tgl_bayar and str(tgl_bayar).replace('-', '')[:6] == bulan.replace('-', ''))
        status = tentukan_status(saldo, plafond, ang_pokok_real, n_due,
                                 jw_real, total, paid_this_month)

        # Selaraskan tunggakan dgn JADWAL: top-up angsuran bln berjalan yang
        # sudah jatuh tempo tetapi BELUM digulung MESPro (lihat status_logic).
        # MESPro tetap jadi basis; nilai hanya naik, tidak pernah diturunkan.
        if status == "BELUM":
            tung_pokok, tung_margin, total = selaraskan_tunggakan_berjalan(
                tung_pokok, tung_margin, plafond, saldo,
                ang_pokok_real, angsuran, jw_real, n_due)

        # --- Tagihan upsert ---
        ex_t = conn.execute(
            "SELECT id, status FROM tagihan WHERE no_rekening=? AND bulan=?",
            (no_rek, bulan),
        ).fetchone()
        if ex_t:
            if ex_t[1] == "LUNAS":
                skipped += 1
                continue
            conn.execute(
                """UPDATE tagihan SET plafond_pokok=?, saldo_pinjaman=?,
                   tunggakan_pokok=?, tunggakan_margin=?, total_tagihan=?,
                   angsuran_per_bulan=?, kolektibilitas=?, tgl_bayar=?, status=?
                   WHERE no_rekening=? AND bulan=?""",
                (plafond, saldo, tung_pokok, tung_margin, total,
                 angsuran, kolek, tgl_bayar, status, no_rek, bulan),
            )
            updated += 1
        else:
            conn.execute(
                """INSERT INTO tagihan (no_rekening, bulan, plafond_pokok, saldo_pinjaman,
                   tunggakan_pokok, tunggakan_margin, total_tagihan, angsuran_per_bulan,
                   kolektibilitas, tgl_bayar, status, keterangan)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                (no_rek, bulan, plafond, saldo, tung_pokok, tung_margin, total,
                 angsuran, kolek, tgl_bayar, status, "[SYNC-MESPRO]"),
            )
            inserted += 1

    conn.commit()
    conn.close()
    return inserted, updated, skipped

def reconcile_lunas(mconn, bulan):
    """Tandai LUNAS nasabah yang sudah lunas di MESPro (sisa_ak<=0) tapi
    masih berstatus BELUM di SQLite. Penyebab: query utama hanya mengambil
    sisa_ak>0, sehingga nasabah yang baru lunas hilang dari hasil sync dan
    record tagihan-nya beku di status BELUM selamanya."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    belum = conn.execute(
        "SELECT no_rekening FROM tagihan WHERE bulan=? AND status='BELUM'", (bulan,)
    ).fetchall()
    reks = [r["no_rekening"] for r in belum]
    if not reks:
        conn.close()
        return 0
    cur = mconn.cursor()
    fixed = 0
    CHUNK = 500
    for i in range(0, len(reks), CHUNK):
        chunk = reks[i:i+CHUNK]
        ph = ",".join(["%s"] * len(chunk))
        cur.execute(
            "SELECT no_rekk, sisa_ak, tgl_bayar, klb FROM knasabah "
            "WHERE no_rekk IN (" + ph + ") AND sisa_ak <= 0", chunk)
        for r in cur.fetchall():
            no_rek = str(r[0]).strip()
            tgl_b = r[2]
            tgl_bayar = None
            if tgl_b and str(tgl_b) != "0000-00-00":
                tgl_bayar = str(tgl_b)
            kolek = int(r[3] or 1)
            conn.execute(
                "UPDATE tagihan SET saldo_pinjaman=0, tunggakan_pokok=0, "
                "tunggakan_margin=0, total_tagihan=0, kolektibilitas=?, "
                "tgl_bayar=?, status='LUNAS' WHERE no_rekening=? AND bulan=?",
                (kolek, tgl_bayar, no_rek, bulan))
            fixed += 1
    conn.commit()
    conn.close()
    return fixed

def _read_state():
    if os.path.exists(SYNC_STATE_FILE):
        try:
            return json.load(open(SYNC_STATE_FILE))
        except Exception:
            return {}
    return {}

def write_sync_state(status, total_query=0, ins=0, upd=0, skip=0, fixed=0, error=""):
    """Simpan status sync TERAKHIR ke data/sync_state.json. Selalu di-update
    tiap run (termasuk run cron 10 menit yang 0 perubahan), jadi inilah sumbe
    kebenaran 'kapan sync terakhir & berhasil/gagal' -- bukan import_log."""
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        st = _read_state()
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        st.update({
            "last_run": now, "last_status": status, "total_query": total_query,
            "baru": ins, "update": upd, "skip": skip, "lunas_fix": fixed,
            "error": error,
        })
        if status == "ok":
            st["last_ok"] = now
        json.dump(st, open(SYNC_STATE_FILE, "w"), indent=2)
    except Exception as e:
        print(f"[WARN] Gagal tulis sync_state: {e}")

def log_to_import_log(bulan, ins, upd, skip, status, error=""):
    """Catat sync ke import_log supaya muncul di 'Histori Import'. Hanya dicatat
    bila ADA perubahan (ins/upd>0) atau GAGAL -- agar histori tidak dibanjiri
    run cron rutin tiap 10 menit yang 0 perubahan. Aman bila skema beda
    (dibungkus try/except)."""
    if status == "ok" and (ins + upd) == 0:
        return
    try:
        conn = sqlite3.connect(DB_PATH)
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        oleh = "[SYNC-MESPRO]" if status == "ok" else "[SYNC-MESPRO GAGAL]"
        ket = ("MESPro: " + error)[:200] if error else "MESPro (auto-sync)"
        conn.execute(
            """INSERT INTO import_log
               (bulan, filepath, nasabah_baru, nasabah_update, nasabah_nonaktif,
                tagihan_baru, tagihan_update, diimport_oleh, waktu)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (bulan, ket, 0, 0, 0, ins, upd, oleh, now))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[WARN] Gagal tulis import_log: {e}")

def _is_jam_kerja():
    """Hanya kirim notif di hari & jam kerja (Senin-Jumat 07:30-17:30).
    Tunnel memang mati saat libur/malam -- tidak perlu notif."""
    now = datetime.now()
    if now.weekday() >= 5:  # Sabtu=5, Minggu=6
        return False
    jam = now.hour * 60 + now.minute
    return 7 * 60 + 30 <= jam <= 17 * 60 + 30

def notify_admin_failure(error):
    """Kirim WA ke admin saat sync gagal, dengan throttle agar tidak spam tiap
    10 menit. Hanya dikirim di hari & jam kerja. Butuh env FONNTE_TOKEN & ADMIN_HP."""
    token = os.environ.get("FONNTE_TOKEN", "")
    admin_hp = os.environ.get("ADMIN_HP", "")
    if not token or not admin_hp:
        return
    if not _is_jam_kerja():
        print("[NOTIF] Lewati notif -- di luar jam kerja/hari libur")
        return
    try:
        import time as _t
        st = _read_state()
        last = float(st.get("last_notif_ts", 0) or 0)
        nowts = _t.time()
        if nowts - last < NOTIF_THROTTLE_SEC:
            return
        import requests
        no = admin_hp.replace("-", "").replace(" ", "")
        if no.startswith("0"):
            no = "62" + no[1:]
        pesan = ("⚠️ *Sync MESPro GAGAL*\n"
                 + datetime.now().strftime("%d/%m/%Y %H:%M")
                 + "\n\n" + str(error)[:300]
                 + "\n\nData tagihan TIDAK ter-update. Cek SSH tunnel (tunnel.bat) di PC server.")
        requests.post("https://api.fonnte.com/send",
                      headers={"Authorization": token},
                      data={"target": no, "message": pesan}, timeout=10)
        st = _read_state()
        st["last_notif_ts"] = nowts
        json.dump(st, open(SYNC_STATE_FILE, "w"), indent=2)
        print("[NOTIF] WA kegagalan sync dikirim ke admin")
    except Exception as e:
        print(f"[WARN] Gagal kirim notif admin: {e}")

def _fail(bulan, msg):
    """Catat kegagalan (state + import_log + notif) lalu keluar."""
    write_sync_state("error", error=msg)
    log_to_import_log(bulan, 0, 0, 0, "error", msg)
    notify_admin_failure(msg)

def main():
    print(f"\n{'='*55}")
    print(f"  SYNC MESPro (MySQL) => koperasi.db")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*55}")

    cfg = load_config()
    bulan = datetime.now().strftime("%Y-%m")

    print(f"\n[CONNECT] {cfg['host']}:{cfg['port']} db={cfg['database']} ...")
    try:
        mconn = get_connection(cfg)
        print("[CONNECT] Terhubung ke MySQL MESPro (READ-ONLY)")
    except PermissionError as e:
        print(f"[SECURITY] {e}")
        _fail(bulan, str(e))
        sys.exit(1)
    except Exception as e:
        print(f"[ERROR] Gagal koneksi: {e}")
        print("  Pastikan SSH tunnel aktif (tunnel.bat di PC server)")
        _fail(bulan, "Gagal koneksi: " + str(e))
        sys.exit(1)

    if "--discover" in sys.argv:
        discover_tables(mconn)
        mconn.close()
        return

    try:
        columns, rows = get_mespro_kredit(mconn)
    except Exception as e:
        print(f"[ERROR] Query gagal: {e}")
        mconn.close()
        _fail(bulan, "Query gagal: " + str(e))
        sys.exit(1)

    print(f"[IMPORT] Sinkronisasi bulan {bulan} ...")
    ins, upd, skip = sync_to_sqlite(columns, rows, bulan)

    try:
        fixed_lunas = reconcile_lunas(mconn, bulan)
    except Exception as e:
        print(f"[WARN] Reconcile lunas gagal: {e}")
        fixed_lunas = 0
    mconn.close()

    write_sync_state("ok", total_query=len(rows), ins=ins, upd=upd,
                     skip=skip, fixed=fixed_lunas)
    log_to_import_log(bulan, ins, upd, skip, "ok")

    print(f"\n[HASIL]")
    print(f"  Baru    : {ins}")
    print(f"  Update  : {upd}")
    print(f"  Skip     : {skip}")
    print(f"  LUNAS-fix: {fixed_lunas}")
    print(f"{'='*55}\n")

if __name__ == "__main__":
    main()
