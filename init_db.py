import sqlite3
import os
import hashlib
from datetime import datetime

DB_PATH = "data/koperasi.db"

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

    # Default admin
    default_pw = hashlib.sha256("admin123".encode()).hexdigest()
    c.execute("""
        INSERT OR IGNORE INTO users (username, password, nama, role, marketing_id)
        VALUES ('admin', ?, 'Administrator', 'admin', NULL)
    """, (default_pw,))

    # Default marketing users (password: bmt2026)
    default_pw_mkt = hashlib.sha256("bmt2026".encode()).hexdigest()
    marketing_list = [
        ("raafi",    "RAAFI",    "MKT001"),
        ("rizal",    "RIZAL",    "MKT002"),
        ("nikko",    "NIKKO",    "MKT003"),
        ("lilik",    "LILIK",    "MKT004"),
        ("widi",     "WIDI",     "MKT005"),
        ("siswanto", "SISWANTO", "MKT006"),
        ("suratman", "SURATMAN", "MKT007"),
        ("tumino",   "TUMINO",   "MKT008"),
        ("agus",     "AGUS",     "MKT009"),
        ("sdit",     "SDIT",     "MKT010"),
        ("edhi",     "EDHI",     "MKT011"),
        ("joko",     "JOKO",     "MKT012"),
        ("ekomey",   "EKO MEY",  "MKT013"),
        ("bam",      "BAM",      "MKT014"),
        ("lilis",    "LILIS",    "MKT015"),
        ("aguss",    "AGUS S",   "MKT016"),
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
    """
    Import dari file Excel format Eks Nominatif Kredit BMT.
    
    Kolom yang dipakai dari file asli:
    - no_rekening     → no_rekening nasabah
    - nama            → nama nasabah  
    - handphone/telp  → no HP
    - kode_ao         → marketing_id
    - nama_ao         → nama marketing
    - jatuh_tempo     → tanggal jatuh tempo
    - alamat          → alamat
    - kabupaten       → kabupaten
    - bakidebet       → saldo pinjaman (baki debet)
    - tunggak_pokok   → tunggakan pokok
    - tunggak_margin  → tunggakan margin
    - angsuran_per_bulan → angsuran per bulan
    - plafond_pokok   → plafond pokok
    - kolek           → kode kolektibilitas (1-5)
    - kolektibilitas  → label kolektibilitas
    - tgl_bayar       → tanggal bayar terakhir
    """
    try:
        import pandas as pd

        # Baca file — support .xls dan .xlsx
        ext = os.path.splitext(filepath)[1].lower()
        if ext == '.xls':
            try:
                import xlrd
                df = pd.read_excel(filepath, engine='xlrd', dtype=str)
            except ImportError:
                # Fallback: coba openpyxl (kalau file sebenarnya xlsx)
                df = pd.read_excel(filepath, dtype=str)
        else:
            df = pd.read_excel(filepath, dtype=str)

        # Normalisasi nama kolom: lowercase + strip
        df.columns = [str(c).strip().lower().replace(' ', '_') for c in df.columns]

        def col(df, names):
            """Cari kolom pertama yang cocok dari list nama"""
            for n in names:
                if n in df.columns:
                    return n
            return None

        # Mapping kolom dari file asli
        COL_REK     = col(df, ['no_rekening', 'norek', 'no_rek', 'rekening'])
        COL_NAMA    = col(df, ['nama'])
        COL_HP      = col(df, ['handphone', 'hp', 'telp', 'telepon', 'no_hp'])
        COL_MKT_ID  = col(df, ['kode_ao', 'kode_marketing', 'marketing_id', 'ao'])
        COL_MKT_NM  = col(df, ['nama_ao', 'nama_marketing', 'marketing', 'nama_ao'])
        COL_JT      = col(df, ['jatuh_tempo', 'tgl_jt', 'tanggal_jt', 'jt'])
        COL_ALAMAT  = col(df, ['alamat'])
        COL_KAB     = col(df, ['kabupaten', 'dati2'])
        COL_SALDO   = col(df, ['bakidebet', 'baki_debet', 'saldo_pinjaman', 'saldo'])
        COL_T_POK   = col(df, ['tunggak_pokok', 'tunggakan_pokok', 't_pokok'])
        COL_T_MAR   = col(df, ['tunggak_margin', 'tunggakan_margin', 't_margin'])
        COL_ANGS    = col(df, ['angsuran_per_bulan', 'angsuran', 'angs_per_bulan'])
        COL_PLAFOND = col(df, ['plafond_pokok', 'plafond'])
        COL_KOLEK   = col(df, ['kolek', 'kolektibilitas_kode', 'kol'])
        COL_TGL_BAYAR = col(df, ['tgl_bayar', 'tanggal_bayar'])

        # Deteksi bulan dari nama file
        import re
        bulan_map = {
            'januari':'01','februari':'02','maret':'03','april':'04',
            'mei':'05','juni':'06','juli':'07','agustus':'08',
            'september':'09','oktober':'10','november':'11','desember':'12'
        }
        bulan = datetime.now().strftime('%Y-%m')
        fname = os.path.basename(filepath).lower()
        
        # Coba dari nama file format 202605 atau 2026-05
        m = re.search(r'(20\d{2})(0[1-9]|1[0-2])', fname)
        if m:
            bulan = f"{m.group(1)}-{m.group(2)}"
        else:
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
            if val is None or str(val).strip().lower() in ('nan', 'none', ''):
                return None
            return str(val).strip()

        def n(row, col_name):
            val = v(row, col_name)
            if not val:
                return 0
            try:
                # Hapus karakter non-numerik kecuali titik & koma
                clean = val.replace(',', '').replace(' ', '')
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
            mkt_id  = v(row, COL_MKT_ID)
            mkt_nm  = v(row, COL_MKT_NM)
            tgl_jt  = v(row, COL_JT)
            alamat  = v(row, COL_ALAMAT)
            kabupaten = v(row, COL_KAB)

            # UPSERT nasabah
            existing = conn.execute(
                "SELECT no_rekening FROM nasabah WHERE no_rekening=?", (no_rek,)
            ).fetchone()

            if existing:
                conn.execute("""
                    UPDATE nasabah SET nama=?, no_hp=COALESCE(no_hp, ?),
                    marketing_id=?, marketing_nama=?, tanggal_jt=?,
                    alamat=?, kabupaten=?, aktif=1 WHERE no_rekening=?
                """, (nama, no_hp, mkt_id, mkt_nm, tgl_jt, alamat, kabupaten, no_rek))
                nasabah_update += 1
            else:
                conn.execute("""
                    INSERT INTO nasabah (no_rekening, nama, no_hp, marketing_id,
                    marketing_nama, tanggal_jt, alamat, kabupaten)
                    VALUES (?,?,?,?,?,?,?,?)
                """, (no_rek, nama, no_hp, mkt_id, mkt_nm, tgl_jt, alamat, kabupaten))
                nasabah_baru += 1

            # Hitung nilai tagihan
            saldo       = n(row, COL_SALDO)
            tung_pokok  = n(row, COL_T_POK)
            tung_margin = n(row, COL_T_MAR)
            total       = tung_pokok + tung_margin
            angsuran    = n(row, COL_ANGS)
            plafond     = n(row, COL_PLAFOND)
            tgl_bayar   = v(row, COL_TGL_BAYAR)

            # Kolektibilitas — ambil angka 1-5
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
                # Jangan overwrite kalau sudah LUNAS
                if existing_t[1] != 'LUNAS':
                    conn.execute("""
                        UPDATE tagihan SET plafond_pokok=?, saldo_pinjaman=?,
                        tunggakan_pokok=?, tunggakan_margin=?, total_tagihan=?,
                        angsuran_per_bulan=?, kolektibilitas=?, tgl_bayar=?
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

        # Auto-nonaktifkan nasabah yang tidak ada di Excel bulan ini
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
