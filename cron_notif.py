import sys, os, sqlite3, requests, time
from datetime import datetime
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(BASE_DIR)
DB_PATH = os.path.join(BASE_DIR, "data/koperasi.db")
FONNTE_TOKEN = os.environ.get("FONNTE_TOKEN", "")
ADMIN_HP = os.environ.get("ADMIN_HP", "")
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn
def format_rp(n):
    try: return "Rp " + "{:,.0f}".format(int(n)).replace(",",".")
    except: return "Rp 0"
def kirim_wa(no_hp, pesan):
    if not FONNTE_TOKEN: return {"status": False}
    try:
        no_hp = str(no_hp).replace("-","").replace(" ","")
        if no_hp.startswith("0"): no_hp = "62" + no_hp[1:]
        r = requests.post("https://api.fonnte.com/send", headers={"Authorization": FONNTE_TOKEN}, data={"target": no_hp, "message": pesan}, timeout=10)
        return r.json()
    except: return {"status": False}
if __name__ == "__main__":
    if len(sys.argv) < 2: sys.exit(1)
    tipe = sys.argv[1]
    print(f"[{datetime.now()}] Jalankan: {tipe}")
    if tipe == "laporan_harian":
        conn = get_db()
        bulan = datetime.now().strftime("%Y-%m")
        today = datetime.now().strftime("%d/%m/%Y")
        stats = conn.execute("SELECT COUNT(*) as total_nasabah, SUM(CASE WHEN status='LUNAS' THEN 1 ELSE 0 END) as sudah_bayar, SUM(CASE WHEN status='BELUM' THEN 1 ELSE 0 END) as belum_bayar, SUM(CASE WHEN status='LUNAS' THEN total_tagihan ELSE 0 END) as terkumpul, SUM(CASE WHEN status='BELUM' THEN total_tagihan ELSE 0 END) as tunggakan FROM tagihan WHERE bulan=?", [bulan]).fetchone()
        conn.close()
        pct = round(stats["sudah_bayar"]/stats["total_nasabah"]*100,1) if stats["total_nasabah"] else 0
        pesan = "Laporan Harian BMT " + today + " - Sudah: " + str(stats["sudah_bayar"]) + " (" + str(pct) + "%) Belum: " + str(stats["belum_bayar"]) + " Terkumpul: " + format_rp(stats["terkumpul"] or 0)
        if ADMIN_HP: kirim_wa(ADMIN_HP, pesan)
        print("laporan_harian selesai")
    elif tipe == "reminder_h3":
        print("reminder_h3 selesai")
    elif tipe == "rekap_mingguan":
        print("rekap_mingguan selesai")
