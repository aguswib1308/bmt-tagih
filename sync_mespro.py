"""
sync_mespro.py — Sinkronisasi langsung dari SQL Server MESPro ke koperasi.db
============================================================================
Jalankan: python3 sync_mespro.py
Atau otomatis via cron: 0 23 * * * cd /var/www/bmt-tagihan/bmt-tagih && venv/bin/python3 sync_mespro.py

Konfigurasi koneksi di: data/mespro_config.json
"""

import pyodbc
import sqlite3
import json
import os
import sys
from datetime import datetime

# ─────────────────────────────────────────────
# KONFIGURASI — isi setelah developer kasih akses
# ─────────────────────────────────────────────
CONFIG_FILE = os.path.join(os.path.dirname(__file__), "data", "mespro_config.json")
DB_PATH     = os.path.join(os.path.dirname(__file__), "data", "koperasi.db")

DEFAULT_CONFIG = {
    "host":     "26.119.237.180",   # IP MICRODATA-PUTRA via Radmin VPN
    "port":     1433,
    "instance": "SQLEXPRESS",       # nama instance SQL Server
    "database": "bmt_amw",
    "username": "bmt_readonly",
    "password": "GANTI_INI",
    "query":    "",                 # kosong = pakai query default
    "driver":   "ODBC Driver 18 for SQL Server"
}


def load_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE) as f:
            cfg = json.load(f)
        # Merge dengan default untuk field yang belum ada
        for k, v in DEFAULT_CONFIG.items():
            cfg.setdefault(k, v)
        return cfg
    # Buat file config template jika belum ada
    os.makedirs(os.path.dirname(CONFIG_FILE), exist_ok=True)
    with open(CONFIG_FILE, "w") as f:
        json.dump(DEFAULT_CONFIG, f, indent=2)
    print(f"[SETUP] File konfigurasi dibuat: {CONFIG_FILE}")
    print("[SETUP] Isi username, password, dan host sebelum menjalankan sync.")
    sys.exit(0)


def get_connection(cfg):
    server = cfg["host"]
    if cfg.get("instance"):
        server = f"{server}\\{cfg['instance']}"
    if cfg.get("port") and cfg["port"] != 1433:
        server = f"{server},{cfg['port']}"

    conn_str = (
        f"DRIVER={{{cfg['driver']}}};"
        f"SERVER={server};"
        f"DATABASE={cfg['database']};"
        f"UID={cfg['username']};"
        f"PWD={cfg['password']};"
        f"TrustServerCertificate=yes;"
        f"Encrypt=yes;"
    )
    return pyodbc.connect(conn_str, timeout=15)


def discover_tables(mconn):
    """List semua tabel/view di database — untuk eksplorasi awal."""
    cur = mconn.cursor()
    cur.execute("""
        SELECT TABLE_TYPE, TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        ORDER BY TABLE_TYPE, TABLE_NAME
    """)
    rows = cur.fetchall()
    print(f"\n{'='*50}")
    print(f"Tabel/View di database ({len(rows)} total):")
    print(f"{'='*50}")
    for ttype, tname in rows:
        print(f"  [{ttype:5s}] {tname}")
    return [r[1] for r in rows]


def get_mespro_data(mconn, cfg):
    """
    Ambil data pembiayaan dari MESPro.
    Query default menggunakan kolom yang sesuai dengan format Excel ekspor MESPro.
    Sesuaikan nama tabel/view setelah developer konfirmasi.
    """
    query = cfg.get("query") or """
        SELECT
            no_rekening,
            nama,
            no_cif,
            jenis_kredit,
            tgl_realisasi,
            tgl_awal,
            jangka_waktu,
            periode_angsur,
            jatuh_tempo,
            plafond_pokok,
            margin,
            plafond_margin,
            cara_hitung,
            periode_berjalan,
            sisa_awal,
            mutasi_pokok,
            mutasi_margin,
            bakidebet,
            sisa_margin,
            angsuran_pokok,
            angsuran_margin,
            angsuran_per_bulan,
            harus_pokok,
            total_pokok,
            tunggak_pokok,
            frek_t_pokok,
            harus_margin,
            total_margin,
            tunggak_margin,
            frek_t_margin,
            kolek,
            kolektibilitas,
            tgl_bayar,
            tgl_macet,
            kode_ao,
            nama_ao,
            pos,
            nama_pos_layanan,
            alamat,
            kabupaten,
            handphone
        FROM v_pembiayaan_aktif   -- SESUAIKAN nama tabel/view
        WHERE jenis_kredit NOT IN ('TABUNGAN', 'DEPOSITO')
        ORDER BY no_rekening
    """
    cur = mconn.cursor()
    cur.execute(query)
    columns = [desc[0].lower() for desc in cur.description]
    rows = cur.fetchall()
    print(f"[QUERY] {len(rows)} baris data diambil dari MESPro")
    return columns, rows


def sync_to_sqlite(columns, rows, bulan):
    """Import data MESPro ke koperasi.db — menggunakan logika sama dengan import_excel."""
    # Import fungsi dari init_db
    sys.path.insert(0, os.path.dirname(__file__))
    from init_db import (
        hitung_tunggakan_baru, hitung_kol, KODE_AO, DB_PATH as _DB
    )

    conn = sqlite3.connect(DB_PATH)

    def fc(col):
        """Find column index."""
        return columns.index(col) if col in columns else None

    def v(row, idx):
        if idx is None: return None
        val = row[idx]
        return str(val).strip() if val is not None else None

    def n(row, idx):
        if idx is None: return 0.0
        try: return float(row[idx] or 0)
        except: return 0.0

    # Column indices
    I_REK      = fc('no_rekening')
    I_NAMA     = fc('nama')
    I_HP       = fc('handphone')
    I_MKT      = fc('kode_ao')
    I_JT       = fc('jatuh_tempo')
    I_ALAMAT   = fc('alamat')
    I_KAB      = fc('kabupaten')
    I_SALDO    = fc('bakidebet')
    I_T_POK    = fc('tunggak_pokok')
    I_T_MAR    = fc('tunggak_margin')
    I_ANGS     = fc('angsuran_per_bulan')
    I_PLAFOND  = fc('plafond_pokok')
    I_SISA     = fc('sisa_awal')
    I_JW       = fc('jangka_waktu')
    I_ANGS_POK = fc('angsuran_pokok')
    I_MUTASI   = fc('mutasi_pokok')
    I_KOLEK    = fc('kolek')
    I_TGL_BAYAR= fc('tgl_bayar')
    I_REALISASI= fc('tgl_realisasi')
    I_RS       = fc('is_reschedule')

    inserted = updated = skipped = 0

    for row in rows:
        no_rek = v(row, I_REK)
        if not no_rek:
            skipped += 1
            continue

        nama        = v(row, I_NAMA) or "-"
        no_hp       = v(row, I_HP)
        kode_ao     = v(row, I_MKT) or ""
        mkt_nm      = KODE_AO.get(kode_ao, kode_ao)
        tgl_jt      = v(row, I_JT)
        alamat      = v(row, I_ALAMAT)
        kabupaten   = v(row, I_KAB)
        tgl_real    = v(row, I_REALISASI)
        is_rs       = 1 if v(row, I_RS) in ("1", "true", "True", "yes") else 0

        # UPSERT nasabah
        existing_n = conn.execute(
            "SELECT no_rekening FROM nasabah WHERE no_rekening=?", (no_rek,)
        ).fetchone()
        if existing_n:
            conn.execute("""UPDATE nasabah SET nama=?, no_hp=?, marketing_id=?, marketing_nama=?,
                tanggal_jt=?, alamat=?, kabupaten=?, tgl_realisasi=?, is_reschedule=?
                WHERE no_rekening=?""",
                (nama, no_hp, kode_ao, mkt_nm, tgl_jt, alamat, kabupaten, tgl_real, is_rs, no_rek))
        else:
            conn.execute("""INSERT INTO nasabah (no_rekening, nama, no_hp, marketing_id, marketing_nama,
                tanggal_jt, alamat, kabupaten, tgl_realisasi, is_reschedule)
                VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (no_rek, nama, no_hp, kode_ao, mkt_nm, tgl_jt, alamat, kabupaten, tgl_real, is_rs))

        # Hitung tagihan
        saldo      = n(row, I_SALDO)
        tung_margin= n(row, I_T_MAR)
        angsuran   = n(row, I_ANGS)
        plafond    = n(row, I_PLAFOND)
        tgl_bayar  = v(row, I_TGL_BAYAR)

        # Formula tunggakan baru
        tung_pokok = hitung_tunggakan_baru(
            plafon_pokok         = n(row, I_PLAFOND),
            jangka_waktu         = n(row, I_JW),
            sisa_awal            = n(row, I_SISA),
            baki_debet           = saldo,
            tgl_realisasi        = tgl_real,
            tanggal_jt           = tgl_jt,
            angsuran_pokok_excel = n(row, I_ANGS_POK) if I_ANGS_POK else None,
            mutasi_pokok_excel   = n(row, I_MUTASI)   if I_MUTASI   else None,
        ) if I_SISA else None

        if tung_pokok is None:
            tung_pokok = n(row, I_T_POK)

        # Pinjaman lunas jika baki_debet < 1
        if saldo is not None and saldo < 1:
            tung_pokok  = 0.0
            tung_margin = 0.0

        total = tung_pokok + tung_margin

        kolek_raw = v(row, I_KOLEK)
        try:   kolek = max(1, min(5, int(float(kolek_raw))))
        except: kolek = 1

        # Status
        tgl_bayar_app = None
        if tgl_bayar:
            status = "LUNAS"
            tgl_bayar_app = tgl_bayar
        elif total < 1:
            status = "LUNAS"
        else:
            status = "BELUM"

        existing_t = conn.execute(
            "SELECT id, status FROM tagihan WHERE no_rekening=? AND bulan=?",
            (no_rek, bulan)
        ).fetchone()

        if existing_t:
            if existing_t[1] in ("LUNAS", "SUDAH_BAYAR"):
                skipped += 1
                continue
            conn.execute("""UPDATE tagihan SET plafond_pokok=?, saldo_pinjaman=?,
                tunggakan_pokok=?, tunggakan_margin=?, total_tagihan=?,
                angsuran_per_bulan=?, kolektibilitas=?, tgl_bayar=?
                WHERE no_rekening=? AND bulan=?""",
                (plafond, saldo, tung_pokok, tung_margin, total,
                 angsuran, kolek, tgl_bayar_app, no_rek, bulan))
            updated += 1
        else:
            conn.execute("""INSERT INTO tagihan (no_rekening, bulan, plafond_pokok, saldo_pinjaman,
                tunggakan_pokok, tunggakan_margin, total_tagihan, angsuran_per_bulan,
                kolektibilitas, tgl_bayar, status, cara_bayar, diimport_oleh)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (no_rek, bulan, plafond, saldo, tung_pokok, tung_margin, total,
                 angsuran, kolek, tgl_bayar_app, status, None, "[AUTO-SYNC]"))
            inserted += 1

    conn.commit()
    conn.close()
    return inserted, updated, skipped


def main():
    print(f"\n{'='*50}")
    print(f"  SYNC MESPro → koperasi.db")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*50}")

    cfg = load_config()

    if cfg["password"] == "GANTI_INI":
        print("[ERROR] Password belum diisi di data/mespro_config.json")
        sys.exit(1)

    bulan = datetime.now().strftime("%Y-%m")

    # Koneksi ke SQL Server
    print(f"\n[CONNECT] Menghubungi {cfg['host']}\\{cfg.get('instance','')} ...")
    try:
        mconn = get_connection(cfg)
        print("[CONNECT] Berhasil terhubung ke SQL Server MESPro ✓")
    except Exception as e:
        print(f"[ERROR] Gagal koneksi: {e}")
        sys.exit(1)

    # Mode discover: python3 sync_mespro.py --discover
    if "--discover" in sys.argv:
        discover_tables(mconn)
        mconn.close()
        return

    # Ambil data
    try:
        columns, rows = get_mespro_data(mconn, cfg)
    except Exception as e:
        print(f"[ERROR] Query gagal: {e}")
        print("  Coba jalankan: python3 sync_mespro.py --discover")
        print("  lalu sesuaikan nama tabel di data/mespro_config.json (field 'query')")
        mconn.close()
        sys.exit(1)
    mconn.close()

    # Import ke SQLite
    print(f"[IMPORT] Sinkronisasi bulan {bulan} ...")
    inserted, updated, skipped = sync_to_sqlite(columns, rows, bulan)
    print(f"[DONE] Baru: {inserted} | Update: {updated} | Skip (sudah bayar): {skipped}")
    print(f"{'='*50}\n")


if __name__ == "__main__":
    main()
