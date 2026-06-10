"""
sync_mespro.py - Sinkronisasi langsung dari MySQL MESPro ke koperasi.db
Jalankan: venv/bin/python3 sync_mespro.py
Discover : venv/bin/python3 sync_mespro.py --discover
"""
import sqlite3, json, os, sys
from datetime import datetime

CONFIG_FILE = os.path.join(os.path.dirname(__file__), "data", "mespro_config.json")
DB_PATH     = os.path.join(os.path.dirname(__file__), "data", "koperasi.db")

DEFAULT_CONFIG = {
    "host":     "192.168.1.200",
    "port":     3306,
    "database": "bmt_amw",
    "username": "reportamw",
    "password": "bMt4m2u22606!",
    "query":    "",
    "table":    ""
}

def load_config():
    if os.path.exists(CONFIG_FILE):
        cfg = json.load(open(CONFIG_FILE))
        for k, v in DEFAULT_CONFIG.items():
            cfg.setdefault(k, v)
        return cfg
    os.makedirs(os.path.dirname(CONFIG_FILE), exist_ok=True)
    json.dump(DEFAULT_CONFIG, open(CONFIG_FILE,"w"), indent=2)
    print(f"[SETUP] Config dibuat: {CONFIG_FILE}")
    sys.exit(0)

def get_connection(cfg):
    import pymysql
    return pymysql.connect(
        host=cfg["host"], port=int(cfg["port"]),
        user=cfg["username"], password=cfg["password"],
        database=cfg["database"], charset="utf8mb4",
        connect_timeout=15
    )

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

def get_mespro_data(mconn, cfg):
    query = cfg.get("query") or ""
    if not query:
        table = cfg.get("table") or "v_pembiayaan_aktif"
        query = f"SELECT * FROM `{table}`"
    cur = mconn.cursor()
    cur.execute(query)
    columns = [d[0].lower() for d in cur.description]
    rows = cur.fetchall()
    print(f"[QUERY] {len(rows)} baris dari MESPro (tabel: {table if not cfg.get('query') else 'custom'})")
    return columns, rows

def sync_to_sqlite(columns, rows, bulan):
    sys.path.insert(0, os.path.dirname(__file__))
    from init_db import hitung_tunggakan_baru, hitung_kol, KODE_AO

    conn = sqlite3.connect(DB_PATH)

    def idx(candidates):
        for c in candidates:
            if c.lower() in columns:
                return columns.index(c.lower())
        return None

    def v(row, i):
        if i is None: return None
        val = row[i]
        return str(val).strip() if val is not None else None

    def n(row, i):
        if i is None: return 0.0
        try: return float(row[i] or 0)
        except: return 0.0

    I_REK       = idx(["no_rekening","norek"])
    I_NAMA      = idx(["nama"])
    I_HP        = idx(["handphone","hp","no_hp"])
    I_MKT       = idx(["kode_ao","kodeao"])
    I_JT        = idx(["jatuh_tempo","tanggal_jt"])
    I_ALAMAT    = idx(["alamat"])
    I_KAB       = idx(["kabupaten","dati2"])
    I_SALDO     = idx(["bakidebet","baki_debet"])
    I_T_POK     = idx(["tunggak_pokok","tunggakan_pokok"])
    I_T_MAR     = idx(["tunggak_margin","tunggakan_margin"])
    I_ANGS      = idx(["angsuran_per_bulan","angsuran"])
    I_PLAFOND   = idx(["plafond_pokok","plafond"])
    I_SISA      = idx(["sisa_awal"])
    I_JW        = idx(["jangka_waktu"])
    I_ANGS_POK  = idx(["angsuran_pokok"])
    I_MUTASI    = idx(["mutasi_pokok"])
    I_KOLEK     = idx(["kolek","kolektibilitas"])
    I_TGL_BAYAR = idx(["tgl_bayar"])
    I_REALISASI = idx(["tgl_realisasi"])
    I_RS        = idx(["is_reschedule","reschedule"])

    print(f"[MAP] rek={I_REK} saldo={I_SALDO} sisa={I_SISA} jw={I_JW} angs_pok={I_ANGS_POK} mutasi={I_MUTASI}")

    inserted = updated = skipped = 0
    for row in rows:
        no_rek = v(row, I_REK)
        if not no_rek:
            skipped += 1
            continue

        nama      = v(row, I_NAMA) or "-"
        no_hp     = v(row, I_HP)
        kode_ao   = v(row, I_MKT) or ""
        mkt_nm    = KODE_AO.get(kode_ao, kode_ao)
        tgl_jt    = v(row, I_JT)
        alamat    = v(row, I_ALAMAT)
        kabupaten = v(row, I_KAB)
        tgl_real  = v(row, I_REALISASI)
        is_rs     = 1 if v(row, I_RS) in ("1","true","True","yes") else 0

        ex_n = conn.execute("SELECT no_rekening FROM nasabah WHERE no_rekening=?", (no_rek,)).fetchone()
        if ex_n:
            conn.execute("""UPDATE nasabah SET nama=?,no_hp=?,marketing_id=?,marketing_nama=?,
                tanggal_jt=?,alamat=?,kabupaten=?,tgl_realisasi=?,is_reschedule=? WHERE no_rekening=?""",
                (nama,no_hp,kode_ao,mkt_nm,tgl_jt,alamat,kabupaten,tgl_real,is_rs,no_rek))
        else:
            conn.execute("""INSERT INTO nasabah (no_rekening,nama,no_hp,marketing_id,marketing_nama,
                tanggal_jt,alamat,kabupaten,tgl_realisasi,is_reschedule) VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (no_rek,nama,no_hp,kode_ao,mkt_nm,tgl_jt,alamat,kabupaten,tgl_real,is_rs))

        saldo       = n(row, I_SALDO)
        tung_margin = n(row, I_T_MAR)
        angsuran    = n(row, I_ANGS)
        plafond     = n(row, I_PLAFOND)
        tgl_bayar   = v(row, I_TGL_BAYAR)

        tung_pokok = None
        if I_SISA is not None:
            tung_pokok = hitung_tunggakan_baru(
                plafon_pokok         = n(row, I_PLAFOND),
                jangka_waktu         = n(row, I_JW),
                sisa_awal            = n(row, I_SISA),
                baki_debet           = saldo,
                tgl_realisasi        = tgl_real,
                tanggal_jt           = tgl_jt,
                angsuran_pokok_excel = n(row, I_ANGS_POK) if I_ANGS_POK is not None else None,
                mutasi_pokok_excel   = n(row, I_MUTASI)   if I_MUTASI   is not None else None,
            )
        if tung_pokok is None:
            tung_pokok = n(row, I_T_POK)
        if saldo is not None and saldo < 1:
            tung_pokok = 0.0
            tung_margin = 0.0

        total = tung_pokok + tung_margin
        try:    kolek = max(1, min(5, int(float(v(row, I_KOLEK) or 1))))
        except: kolek = 1

        tgl_bayar_app = None
        if tgl_bayar:   status = "LUNAS"; tgl_bayar_app = tgl_bayar
        elif total < 1: status = "LUNAS"
        else:           status = "BELUM"

        ex_t = conn.execute("SELECT id,status FROM tagihan WHERE no_rekening=? AND bulan=?", (no_rek,bulan)).fetchone()
        if ex_t:
            if ex_t[1] in ("LUNAS","SUDAH_BAYAR"): skipped += 1; continue
            conn.execute("""UPDATE tagihan SET plafond_pokok=?,saldo_pinjaman=?,tunggakan_pokok=?,
                tunggakan_margin=?,total_tagihan=?,angsuran_per_bulan=?,kolektibilitas=?,tgl_bayar=?
                WHERE no_rekening=? AND bulan=?""",
                (plafond,saldo,tung_pokok,tung_margin,total,angsuran,kolek,tgl_bayar_app,no_rek,bulan))
            updated += 1
        else:
            conn.execute("""INSERT INTO tagihan (no_rekening,bulan,plafond_pokok,saldo_pinjaman,
                tunggakan_pokok,tunggakan_margin,total_tagihan,angsuran_per_bulan,
                kolektibilitas,tgl_bayar,status,cara_bayar,diimport_oleh)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (no_rek,bulan,plafond,saldo,tung_pokok,tung_margin,total,angsuran,kolek,
                 tgl_bayar_app,status,None,"[AUTO-SYNC]"))
            inserted += 1

    conn.commit()
    conn.close()
    return inserted, updated, skipped

def main():
    print(f"\n{'='*55}")
    print(f"  SYNC MESPro (MySQL) => koperasi.db")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*55}")

    cfg   = load_config()
    bulan = datetime.now().strftime("%Y-%m")

    print(f"\n[CONNECT] {cfg['host']}:{cfg['port']} db={cfg['database']} ...")
    try:
        mconn = get_connection(cfg)
        print("[CONNECT] Terhubung ke MySQL MESPro")
    except Exception as e:
        print(f"[ERROR] Gagal koneksi: {e}")
        sys.exit(1)

    if "--discover" in sys.argv:
        discover_tables(mconn)
        mconn.close()
        return

    try:
        columns, rows = get_mespro_data(mconn, cfg)
    except Exception as e:
        print(f"[ERROR] Query gagal: {e}")
        print("  Coba: venv/bin/python3 sync_mespro.py --discover")
        mconn.close()
        sys.exit(1)
    mconn.close()

    print(f"[IMPORT] Sinkronisasi bulan {bulan} ...")
    ins, upd, skip = sync_to_sqlite(columns, rows, bulan)
    print(f"[DONE] Baru:{ins} | Update:{upd} | Skip:{skip}")
    print(f"{'='*55}\n")

if __name__ == "__main__":
    main()