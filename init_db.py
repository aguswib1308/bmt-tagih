import sqlite3
import os
import hashlib
from datetime import datetime

DB_PATH = "data/koperasi.db"

# Mapping kode AO → nama marketing
KODE_AO = {
    "01001": "RAAFI",
    "01002": "RIZAL",
    "01003": "NIKKO",
    "01004": "LILIK",
    "01005": "WIDI",
    "01006": "SISWANTO",
    "01007": "SURATMAN",
    "01008": "TUMINO",
    "01009": "AGUS",
    "01010": "SDIT",
    "01011": "EDHI",
    "01012": "JOKO",
    "01013": "EKO MEY",
    "01014": "BAM",
    "01015": "LILIS",
    "01016": "AGUS S",
}

def init_db():
    os.makedirs("data", exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    c.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            nama TEXT NOT NULL,
            role TEXT DEFAULT 'marketing',
            marketing_id TEXT,
            aktif INTEGER DEFAULT 1
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS nasabah (
            no_rekening TEXT PRIMARY KEY,
            nama TEXT,
            no_hp TEXT,
            marketing_id TEXT,
            marketing_nama TEXT,
            tanggal_jt TEXT,
            alamat TEXT,
            kabupaten TEXT,
            aktif INTEGER DEFAULT 1
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS tagihan (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            no_rekening TEXT,
            bulan TEXT,
            plafond_pokok REAL DEFAULT 0,
            saldo_pinjaman REAL DEFAULT 0,
            tunggakan_pokok REAL DEFAULT 0,
            tunggakan_margin REAL DEFAULT 0,
            total_tagihan REAL DEFAULT 0,
            angsuran_per_bulan REAL DEFAULT 0,
            kolektibilitas INTEGER DEFAULT 1,
            tgl_bayar TEXT,
            status TEXT DEFAULT 'BELUM',
            cara_bayar TEXT,
            tgl_angsuran TEXT,
            keterangan TEXT,
            UNIQUE(no_rekening, bulan)
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS pembayaran (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            no_rekening TEXT,
            tagihan_id INTEGER,
            jumlah REAL,
            cara_bayar TEXT,
            marketing_id TEXT,
            catatan TEXT,
            dicatat_oleh TEXT,
            tanggal TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS import_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bulan TEXT,
            filepath TEXT,
            nasabah_baru INTEGER DEFAULT 0,
            nasabah_update INTEGER DEFAULT 0,
            nasabah_nonaktif INTEGER DEFAULT 0,
            tagihan_baru INTEGER DEFAULT 0,
            tagihan_update INTEGER DEFAULT 0,
            diimport_oleh TEXT,
            waktu TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Default admin (password: admin123)
    default_pw = hashlib.sha256("admin123".encode()).hexdigest()
    c.execute("""
        INSERT OR IGNORE INTO users (username, password, nama, role, marketing_id)
        VALUES ('admin', ?, 'Administrator', 'admin', NULL)
    """, (default_pw,))

    # Default marketing users (password: bmt2026)
    default_pw_mkt = hashlib.sha256("bmt2026".encode()).hexdigest()
    marketing_list = [
        ("raafi",    "RAAFI",    "01001"),
        ("rizal",    "RIZAL",    "01002"),
        ("nikko",    "NIKKO",    "01003"),
        ("lilik",    "LILIK",    "01004"),
        ("widi",     "WIDI",     "01005"),
        ("siswanto", "SISWANTO", "01006"),
        ("suratman", "SURATMAN", "01007"),
        ("tumino",   "TUMINO",   "01008"),
        ("agus",     "AGUS",     "01009"),
        ("sdit",     "SDIT",     "01010"),
        ("edhi",     "EDHI",     "01011"),
        ("joko",     "JOKO",     "01012"),
        ("ekomey",   "EKO MEY",  "01013"),
        ("bam",      "BAM",      "01014"),
        ("lilis",    "LILIS",    "01015"),
        ("aguss",    "AGUS S",   "01016"),
    ]
    for username, nama, mkt_id in marketing_list:
        c.execute("""
            INSERT OR IGNORE INTO users (username, password, nama, role, marketing_id)
            VALUES (?, ?, ?, 'marketing', ?)
        """, (username, default_pw_mkt, nama, mkt_id))

    conn.commit()
    conn.close()
    print("✅ Database berhasil diinisialisasi!")


def import_excel(filepath, diimport_oleh="admin"):
    try:
        import pandas as pd

        ext = os.path.splitext(filepath)[1].lower()
        if ext == '.xls':
            df = pd.read_excel(filepath, engine='xlrd', dtype=str)
        else:
            df = pd.read_excel(filepath, dtype=str)

        # Normalisasi nama kolom
        df.columns = [str(c).strip().lower().replace(' ', '_') for c in df.columns]

        print("Kolom ditemukan:", list(df.columns))

        def find_col(df, candidates):
            for c in candidates:
                if c in df.columns:
                    return c
            return None

        COL_REK     = find_col(df, ['no_rekening','norek','no_rek','rekening'])
        COL_NAMA    = find_col(df, ['nama'])
        COL_HP      = find_col(df, ['handphone','hp','telp','telepon','no_hp','no_handphone'])
        COL_MKT_ID  = find_col(df, ['kode_ao','kode_marketing','marketing_id','ao','kodeao'])
        COL_JT      = find_col(df, ['jatuh_tempo','tgl_jt','tanggal_jt','jt','jatuh tempo'])
        COL_ALAMAT  = find_col(df, ['alamat'])
        COL_KAB     = find_col(df, ['kabupaten','dati2'])
        COL_SALDO   = find_col(df, ['bakidebet','baki_debet','saldo_pinjaman','saldo','baki debet'])
        COL_T_POK   = find_col(df, ['tunggak_pokok','tunggakan_pokok','t_pokok','tunggak pokok'])
        COL_T_MAR   = find_col(df, ['tunggak_margin','tunggakan_margin','t_margin','tunggak margin'])
        COL_ANGS    = find_col(df, ['angsuran_per_bulan','angsuran','angs_per_bulan','angsuran per bulan'])
        COL_PLAFOND = find_col(df, ['plafond_pokok','plafond'])
        COL_KOLEK   = find_col(df, ['kolek','kolektibilitas','kol'])
        COL_TGL_BAYAR = find_col(df, ['tgl_bayar','tanggal_bayar','tgl bayar'])

        print(f"Mapping: rek={COL_REK} nama={COL_NAMA} hp={COL_HP} mkt={COL_MKT_ID} saldo={COL_SALDO} t_pok={COL_T_POK} t_mar={COL_T_MAR} kolek={COL_KOLEK}")

        # Deteksi bulan dari nama file
        import re
        bulan = datetime.now().strftime('%Y-%m')
        fname = os.path.basename(filepath).lower()
        m = re.search(r'(20\d{2})(0[1-9]|1[0-2])', fname)
        if m:
            bulan = f"{m.group(1)}-{m.group(2)}"
        else:
            bulan_map = {
                'januari':'01','februari':'02','maret':'03','april':'04',
                'mei':'05','juni':'06','juli':'07','agustus':'08',
                'september':'09','oktober':'10','november':'11','desember':'12'
            }
            for nama_bln, num in bulan_map.items():
                if nama_bln in fname:
                    tahun_match = re.search(r'20\d{2}', fname)
                    tahun = tahun_match.group() if tahun_match else str(datetime.now().year)
                    bulan = f"{tahun}-{num}"
                    break

        def v(row, col_name):
            if not col_name or col_name not in row.index:
                return None
            val = row[col_name]
            if val is None or str(val).strip().lower() in ('nan','none',''):
                return None
            return str(val).strip()

        def n(row, col_name):
            val = v(row, col_name)
            if not val:
                return 0
            try:
                clean = val.replace(',','').replace(' ','')
                return float(clean)
            except:
                return 0

        conn = sqlite3.connect(DB_PATH)
        nasabah_baru = nasabah_update = nasabah_nonaktif = 0
        tagihan_baru = tagihan_update = 0
        no_rek_excel = set()

        for _, row in df.iterrows():
            no_rek = v(row, COL_REK)
            if not no_rek:
                continue

            no_rek_excel.add(no_rek)
            nama    = v(row, COL_NAMA)
            no_hp   = v(row, COL_HP)
            tgl_jt  = v(row, COL_JT)
            alamat  = v(row, COL_ALAMAT)
            kabupaten = v(row, COL_KAB)

            # Kode AO → nama marketing pakai mapping
            kode_ao = v(row, COL_MKT_ID)
            if kode_ao:
                # Normalisasi: pastikan 5 digit dengan leading zero
                kode_ao = kode_ao.zfill(5)
            mkt_nm = KODE_AO.get(kode_ao, kode_ao)  # fallback ke kode kalau tidak ada di mapping

            # UPSERT nasabah
            existing = conn.execute(
                "SELECT no_rekening FROM nasabah WHERE no_rekening=?", (no_rek,)
            ).fetchone()

            if existing:
                conn.execute("""
                    UPDATE nasabah SET nama=?, no_hp=COALESCE(NULLIF(no_hp,''), ?),
                    marketing_id=?, marketing_nama=?, tanggal_jt=?,
                    alamat=?, kabupaten=?, aktif=1 WHERE no_rekening=?
                """, (nama, no_hp, kode_ao, mkt_nm, tgl_jt, alamat, kabupaten, no_rek))
                nasabah_update += 1
            else:
                conn.execute("""
                    INSERT INTO nasabah (no_rekening, nama, no_hp, marketing_id,
                    marketing_nama, tanggal_jt, alamat, kabupaten)
                    VALUES (?,?,?,?,?,?,?,?)
                """, (no_rek, nama, no_hp, kode_ao, mkt_nm, tgl_jt, alamat, kabupaten))
                nasabah_baru += 1

            # Nilai tagihan
            saldo       = n(row, COL_SALDO)
            tung_pokok  = n(row, COL_T_POK)
            tung_margin = n(row, COL_T_MAR)
            total       = tung_pokok + tung_margin
            angsuran    = n(row, COL_ANGS)
            plafond     = n(row, COL_PLAFOND)
            tgl_bayar   = v(row, COL_TGL_BAYAR)

            kolek_raw = v(row, COL_KOLEK)
            kolek = 1
            if kolek_raw:
                try:
                    kolek = int(float(kolek_raw))
                    kolek = max(1, min(5, kolek))
                except:
                    kolek = 1

            # UPSERT tagihan
            existing_t = conn.execute(
                "SELECT id, status FROM tagihan WHERE no_rekening=? AND bulan=?",
                (no_rek, bulan)
            ).fetchone()

            if existing_t:
                status_lama = existing_t[1]
                if status_lama == 'LUNAS':
                    # Sudah lunas di app — update angka saja, status tetap LUNAS
                    conn.execute("""
                        UPDATE tagihan SET plafond_pokok=?, saldo_pinjaman=?,
                        tunggakan_pokok=?, tunggakan_margin=?, total_tagihan=?,
                        angsuran_per_bulan=?, kolektibilitas=?, tgl_bayar=?
                        WHERE no_rekening=? AND bulan=?
                    """, (plafond, saldo, tung_pokok, tung_margin, total,
                          angsuran, kolek, tgl_bayar, no_rek, bulan))
                else:
                    # Cek tgl_bayar — format YYYYMMDD ambil 6 digit pertama = YYYYMM
                    bulan_bayar = None
                    if tgl_bayar and len(str(tgl_bayar)) == 8:
                        bulan_bayar = str(tgl_bayar)[0:6]
                    bulan_import = bulan.replace("-", "")  # 2026-06 → 202606

                    if total == 0 and tung_pokok == 0 and tung_margin == 0:
                        # Tunggakan 0 → LUNAS SISTEM
                        status_baru = 'LUNAS'
                        cara_baru   = 'SISTEM'
                    elif bulan_bayar and bulan_bayar == bulan_import:
                        # Ada tgl_bayar bulan ini → LUNAS SETOR
                        status_baru = 'LUNAS'
                        cara_baru   = 'SETOR'
                    else:
                        # Belum bayar bulan ini → tetap BELUM
                        status_baru = 'BELUM'
                        cara_baru   = None

                    if status_baru == 'LUNAS':
                        conn.execute("""
                            UPDATE tagihan SET plafond_pokok=?, saldo_pinjaman=?,
                            tunggakan_pokok=?, tunggakan_margin=?, total_tagihan=?,
                            angsuran_per_bulan=?, kolektibilitas=?, tgl_bayar=?,
                            status='LUNAS', cara_bayar=?
                            WHERE no_rekening=? AND bulan=?
                        """, (plafond, saldo, tung_pokok, tung_margin, total,
                              angsuran, kolek, tgl_bayar, cara_baru, no_rek, bulan))
                    else:
                        conn.execute("""
                            UPDATE tagihan SET plafond_pokok=?, saldo_pinjaman=?,
                            tunggakan_pokok=?, tunggakan_margin=?, total_tagihan=?,
                            angsuran_per_bulan=?, kolektibilitas=?, tgl_bayar=?,
                            status='BELUM', cara_bayar=NULL
                            WHERE no_rekening=? AND bulan=?
                        """, (plafond, saldo, tung_pokok, tung_margin, total,
                              angsuran, kolek, tgl_bayar, no_rek, bulan))
                tagihan_update += 1
            else:
                conn.execute("""
                    INSERT INTO tagihan (no_rekening, bulan, plafond_pokok, saldo_pinjaman,
                    tunggakan_pokok, tunggakan_margin, total_tagihan,
                    angsuran_per_bulan, kolektibilitas, tgl_bayar)
                    VALUES (?,?,?,?,?,?,?,?,?,?)
                """, (no_rek, bulan, plafond, saldo, tung_pokok, tung_margin,
                      total, angsuran, kolek, tgl_bayar))
                tagihan_baru += 1

        # Auto-nonaktifkan nasabah tidak ada di Excel
        all_aktif = conn.execute(
            "SELECT no_rekening FROM nasabah WHERE aktif=1"
        ).fetchall()
        for row in all_aktif:
            if row[0] not in no_rek_excel:
                conn.execute("UPDATE nasabah SET aktif=0 WHERE no_rekening=?", (row[0],))
                nasabah_nonaktif += 1

        # Log import
        conn.execute("""
            INSERT INTO import_log (bulan, filepath, nasabah_baru, nasabah_update,
            nasabah_nonaktif, tagihan_baru, tagihan_update, diimport_oleh)
            VALUES (?,?,?,?,?,?,?,?)
        """, (bulan, os.path.basename(filepath), nasabah_baru, nasabah_update,
              nasabah_nonaktif, tagihan_baru, tagihan_update, diimport_oleh))

        conn.commit()
        conn.close()

        return {
            "success": True,
            "bulan": bulan,
            "nasabah_baru": nasabah_baru,
            "nasabah_update": nasabah_update,
            "nasabah_nonaktif": nasabah_nonaktif,
            "tagihan_baru": tagihan_baru,
            "tagihan_update": tagihan_update
        }

    except Exception as e:
        import traceback
        return {"success": False, "error": str(e), "detail": traceback.format_exc()}


if __name__ == "__main__":
    init_db()
    print("DB siap!")
