"""Logika penentuan status pembayaran berbasis JADWAL ANGSURAN.
Dipakai oleh sync_mespro.py (ang_pokok asli MESPro) & recompute_status.py (ang_pokok turunan).
"""
from datetime import date

def parse_date(s):
    """Terima 'YYYY-MM-DD', 'YYYY/MM/DD', 'YYYYMMDD', atau datetime/date.
    Semua sumber (MESPro & Excel) memakai urutan TAHUN-bulan-tanggal."""
    if s is None:
        return None
    # objek date/datetime langsung
    try:
        if hasattr(s, "year") and hasattr(s, "month") and hasattr(s, "day"):
            return date(s.year, s.month, s.day)
    except Exception:
        pass
    s = str(s).strip()
    if not s or s.startswith("0000"):
        return None
    s = s.split(" ")[0]  # buang jam jika ada
    digits = s.replace("-", "").replace("/", "").replace(".", "")
    if len(digits) >= 8 and digits[:8].isdigit():
        try:
            return date(int(digits[:4]), int(digits[4:6]), int(digits[6:8]))
        except Exception:
            return None
    return None

def bulan_diff(a, b):
    return (b.year - a.year) * 12 + (b.month - a.month)

def hitung_n_due(tgl_real, jw, today=None):
    """Jumlah angsuran yang seharusnya sudah jatuh tempo s/d hari ini."""
    today = today or date.today()
    real = parse_date(tgl_real)
    if not real or not jw or jw <= 0:
        return None
    # Angsuran bulan berjalan IKUT dihitung (jatuh tempo di bulan ini),
    # walau tanggal jatuh temponya belum lewat. Tidak ada pengurangan hari.
    # TIDAK di-cap ke jw di sini -> caller pakai utk deteksi past-maturity.
    n = bulan_diff(real, today)
    return max(0, n)

def tentukan_status(sisa_ak, plafond, ang_pokok, n_due, jw, tunggakan, paid_this_month):
    """Kembalikan 'LUNAS' / 'SUDAH_BAYAR' / 'BELUM'.
    - LUNAS: pinjaman lunas (sisa<1)
    - SUDAH_BAYAR: sesuai jadwal ATAU ada bayar bulan ini
    - BELUM: telat jadwal & tidak ada bayar bulan ini
    """
    sisa = float(sisa_ak or 0)
    if sisa < 1:
        return 'LUNAS'
    tung = float(tunggakan or 0)
    # Tentukan apakah sesuai jadwal (on schedule)
    if (n_due is None or not jw or jw <= 0 or not ang_pokok or ang_pokok <= 0
            or n_due > jw):
        # Tidak bisa/relevan pakai jadwal (loan tempo, data kurang, tenor SUDAH LEWAT)
        # -> ikut tunggakan MESPro
        on_schedule = tung < 1
    else:
        # n_due <= jw (termasuk angsuran terakhir yg jatuh tempo bulan ini)
        plaf = float(plafond or 0)
        exp_remain = max(0.0, plaf - float(ang_pokok) * n_due)
        tol = max(5000.0, float(ang_pokok) * 0.25)
        on_schedule = sisa <= exp_remain + tol
    if on_schedule or paid_this_month:
        return 'SUDAH_BAYAR'
    return 'BELUM'

def angpokok_turunan(plafond, jw, angsuran):
    """ang_pokok turunan utk recompute (tanpa data MESPro asli).
    Return None bila terdeteksi loan tempo/data janggal -> caller defer ke tunggakan."""
    plaf = float(plafond or 0); ang = float(angsuran or 0)
    if not jw or jw <= 0 or plaf <= 0:
        return None
    ap = plaf / jw
    # Guard loan tempo / data janggal:
    #  - angsuran <=0 atau > plafond (data lump-sum janggal)
    #  - ang_pokok turunan > angsuran (pokok tdk mungkin > total angsuran utk loan amortisasi)
    if ang <= 0 or ang > plaf or ap > ang:
        return None
    return ap


def hitung_tunggakan_jadwal(plafond, sisa_ak, ang_pokok, angsuran, jw, n_due):
    """Estimasi tunggakan berbasis JADWAL saat MESPro belum menggulung angsuran
    bulan berjalan. Return (pokok, margin, total). (0,0,0) bila tak bisa dihitung
    (loan tempo/data janggal/tenor lewat)."""
    try:
        plaf = float(plafond or 0); sisa = float(sisa_ak or 0)
        ap = float(ang_pokok or 0); ang = float(angsuran or 0)
        if ap <= 0 or not jw or jw <= 0 or n_due is None or n_due > jw or ang <= 0:
            return (0.0, 0.0, 0.0)
        paid_inst = round((plaf - sisa) / ap)
        behind = max(0, min(n_due, jw) - paid_inst)
        if behind <= 0:
            return (0.0, 0.0, 0.0)
        margin_per = max(0.0, ang - ap)
        return (behind * ap, behind * margin_per, behind * ang)
    except Exception:
        return (0.0, 0.0, 0.0)


def selaraskan_tunggakan_berjalan(tung_pokok, tung_margin, plafond, sisa_ak,
                                  ang_pokok, angsuran, jw, n_due):
    """Selaraskan tunggakan MESPro dengan JADWAL untuk menutup celah
    'angsuran bulan berjalan belum digulung MESPro'.

    MESPro kadang terlambat memposting angsuran bulan berjalan ke
    tunggak_p/tunggak_b (jeda beberapa hari setelah tanggal jatuh tempo).
    Selama window itu tagihan WA -- yang dibaca apa adanya dari MESPro --
    KURANG satu (atau lebih) angsuran. Fungsi ini membandingkan jumlah
    angsuran tertunggak versi MESPro dengan versi JADWAL; bila jadwal lebih
    banyak, SELISIHNYA di-top up memakai ang_pokok & margin per angsuran.
    MESPro tetap menjadi BASIS nilai (tidak pernah ditimpa/diturunkan), hanya
    ditambah angsuran yang belum tergulung.

    Generalisasi dari hitung_tunggakan_jadwal: bila tunggakan MESPro = 0,
    hasilnya identik dengan estimasi jadwal penuh.

    Return (pokok, margin, total). Bila data jadwal tak valid / tenor sudah
    lewat / tidak perlu penyesuaian, balikkan nilai MESPro apa adanya.
    """
    tp = float(tung_pokok or 0); tm = float(tung_margin or 0)
    ap = float(ang_pokok or 0); ang = float(angsuran or 0)
    plaf = float(plafond or 0); sisa = float(sisa_ak or 0)
    base = tp + tm
    # Guard: HANYA untuk pinjaman amortisasi bulanan yang wajar. Bila tidak,
    # pakai nilai MESPro apa adanya (jangan fabrikasi dari jadwal). Lewati bila:
    #  - ang/ap/plafond tak valid
    #  - ap > ang (pokok per bln > total angsuran -> mustahil utk amortisasi)
    #  - ang >= plafond (angsuran bulanan >= seluruh plafond -> pinjaman bullet/
    #    musiman/janggal; jadwal bulanan tidak berlaku & akan meledak bila dipaksa)
    #  - jadwal tak relevan (loan tempo / tenor lewat / n_due tak terhitung)
    if (ap <= 0 or ang <= 0 or plaf <= 0 or ap > ang or ang >= plaf
            or not jw or jw <= 0 or n_due is None or n_due > jw):
        return (tp, tm, base)
    # Jumlah angsuran tertunggak menurut JADWAL (paid_inst di-clamp >= 0 untuk
    # jaga-jaga data janggal sisa_ak > plafond)
    paid_inst = max(0, round((plaf - sisa) / ap))
    behind_sched = max(0, min(n_due, jw) - paid_inst)
    # Jumlah angsuran tertunggak menurut MESPro saat ini
    behind_mespro = round(base / ang)
    kurang = behind_sched - behind_mespro
    if kurang <= 0:
        return (tp, tm, base)
    margin_per = max(0.0, ang - ap)
    # Pokok tertunggak tak mungkin melebihi sisa pokok (invariant pengaman)
    tp = min(tp + kurang * ap, sisa)
    tm = tm + kurang * margin_per
    return (round(tp), round(tm), round(tp + tm))
