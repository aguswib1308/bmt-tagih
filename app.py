from flask import Flask, request, jsonify, session, render_template, redirect, url_for
import sqlite3
import hashlib
import requests
import os
from datetime import datetime, timedelta
from functools import wraps

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "koperasi_bmt_secret_2026_ganti_ini")

# ── Auto-create folder data/ saat pertama jalan ───────────────
os.makedirs("data", exist_ok=True)

DB_PATH = "data/koperasi.db"

# ── Fonnte Config ─────────────────────────────────────────────
FONNTE_TOKEN = os.environ.get("FONNTE_TOKEN", "")

# ── Helper ────────────────────────────────────────────────────
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def hash_pw(pw):
    return hashlib.sha256(pw.encode()).hexdigest()

def format_rp(n):
    return f"Rp {int(n):,}".replace(",", ".")

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"error": "Unauthorized"}), 401
        return f(*args, **kwargs)
    return decorated

def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"error": "Unauthorized"}), 401
        if session.get("role") != "admin":
            return jsonify({"error": "Admin only"}), 403
        return f(*args, **kwargs)
    return decorated

# ── Kirim WA via Fonnte ───────────────────────────────────────
def kirim_wa(no_hp, pesan):
    if not FONNTE_TOKEN:
        return {"status": "skip", "reason": "FONNTE_TOKEN belum diset"}
    try:
        no_hp = no_hp.replace("-", "").replace(" ", "")
        if no_hp.startswith("0"):
            no_hp = "62" + no_hp[1:]
        r = requests.post(
            "https://api.fonnte.com/send",
            headers={"Authorization": FONNTE_TOKEN},
            data={"target": no_hp, "message": pesan},
            timeout=10
        )
        return r.json()
    except Exception as e:
        return {"error": str(e)}

def pesan_tagihan(nasabah_nama, total, jatuh_tempo, marketing_nama):
    return f"""Assalamu'alaikum, {nasabah_nama} 🙏

Kami dari *KSPPS BMT Amal Muslim Wonogiri* ingin mengingatkan tagihan Anda:

💰 *Total Tagihan:* {format_rp(total)}
📅 *Jatuh Tempo:* tanggal {jatuh_tempo}
👤 *Marketing:* {marketing_nama}

Mohon segera melakukan pembayaran. Terima kasih 🙏

_Pesan otomatis - Jangan dibalas_"""

def pesan_lunas(nasabah_nama, jumlah, marketing_nama):
    return f"""Assalamu'alaikum, {nasabah_nama} 🙏

✅ Pembayaran Anda telah *berhasil dicatat*!

💰 *Jumlah Bayar:* {format_rp(jumlah)}
📅 *Tanggal:* {datetime.now().strftime('%d/%m/%Y %H:%M')}
👤 *Marketing:* {marketing_nama}

Terima kasih atas kepercayaan Anda 🙏
*KSPPS BMT Amal Muslim Wonogiri*"""

# ── Health Check (Railway butuh ini) ─────────────────────────
@app.route("/health")
def health():
    return jsonify({"status": "ok", "time": datetime.now().isoformat()})

# ── AUTH ──────────────────────────────────────────────────────
@app.route("/api/login", methods=["POST"])
def login():
    data = request.json
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()

    conn = get_db()
    user = conn.execute(
        "SELECT * FROM users WHERE username=? AND password=? AND aktif=1",
        (username, hash_pw(password))
    ).fetchone()
    conn.close()

    if not user:
        return jsonify({"error": "Username atau password salah"}), 401

    session["user_id"]     = user["id"]
    session["username"]    = user["username"]
    session["nama"]        = user["nama"]
    session["role"]        = user["role"]
    session["marketing_id"]= user["marketing_id"]

    return jsonify({
        "success": True,
        "nama": user["nama"],
        "role": user["role"],
        "marketing_id": user["marketing_id"]
    })

@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"success": True})

@app.route("/api/me")
def me():
    if "user_id" not in session:
        return jsonify({"login": False})
    return jsonify({
        "login": True,
        "nama": session.get("nama"),
        "role": session.get("role"),
        "marketing_id": session.get("marketing_id")
    })

# ── DASHBOARD ─────────────────────────────────────────────────
@app.route("/api/dashboard")
@login_required
def dashboard():
    conn = get_db()
    bulan = request.args.get("bulan", datetime.now().strftime("%Y-%m"))
    marketing_id = session.get("marketing_id")
    role = session.get("role")

    where = "WHERE t.bulan=?"
    params = [bulan]
    if role != "admin" and marketing_id:
        where += " AND n.marketing_id=?"
        params.append(marketing_id)

    stats = conn.execute(f"""
        SELECT
            COUNT(*) as total_nasabah,
            SUM(t.total_tagihan)  as total_tagihan,
            SUM(CASE WHEN t.status='LUNAS' THEN t.total_tagihan ELSE 0 END) as total_terkumpul,
            SUM(CASE WHEN t.status='BELUM' THEN t.total_tagihan ELSE 0 END) as total_tunggakan,
            SUM(CASE WHEN t.status='LUNAS' THEN 1 ELSE 0 END) as sudah_bayar,
            SUM(CASE WHEN t.status='BELUM' THEN 1 ELSE 0 END) as belum_bayar
        FROM tagihan t
        JOIN nasabah n ON t.no_rekening = n.no_rekening
        {where}
    """, params).fetchone()

    rekap_marketing = []
    if role == "admin":
        rows = conn.execute(f"""
            SELECT n.marketing_nama,
                COUNT(*) as total,
                SUM(CASE WHEN t.status='LUNAS' THEN 1 ELSE 0 END) as lunas,
                SUM(CASE WHEN t.status='BELUM' THEN 1 ELSE 0 END) as belum,
                SUM(CASE WHEN t.status='LUNAS' THEN t.total_tagihan ELSE 0 END) as nominal_lunas
            FROM tagihan t
            JOIN nasabah n ON t.no_rekening = n.no_rekening
            WHERE t.bulan=?
            GROUP BY n.marketing_nama
            ORDER BY lunas DESC
        """, [bulan]).fetchall()
        rekap_marketing = [dict(r) for r in rows]

    conn.close()
    return jsonify({
        "stats": dict(stats),
        "rekap_marketing": rekap_marketing,
        "bulan": bulan
    })

# ── TAGIHAN LIST ──────────────────────────────────────────────
@app.route("/api/tagihan")
@login_required
def list_tagihan():
    conn = get_db()
    bulan        = request.args.get("bulan", datetime.now().strftime("%Y-%m"))
    status       = request.args.get("status", "")
    search       = request.args.get("q", "")
    marketing_id = session.get("marketing_id")
    role         = session.get("role")

    where  = ["t.bulan=?"]
    params = [bulan]

    if role != "admin" and marketing_id:
        where.append("n.marketing_id=?")
        params.append(marketing_id)
    if status:
        where.append("t.status=?")
        params.append(status)
    if search:
        where.append("(n.nama LIKE ? OR n.no_rekening LIKE ?)")
        params += [f"%{search}%", f"%{search}%"]

    sql = f"""
        SELECT t.id, t.no_rekening, n.nama, n.no_hp, n.marketing_nama,
               t.saldo_pinjaman, t.tunggakan_pokok, t.tunggakan_margin,
               t.total_tagihan, t.kolektibilitas, t.status, t.keterangan,
               t.cara_bayar, t.tgl_angsuran, n.tanggal_jt
        FROM tagihan t
        JOIN nasabah n ON t.no_rekening = n.no_rekening
        WHERE {' AND '.join(where)}
        ORDER BY t.kolektibilitas DESC, t.total_tagihan DESC
    """
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

# ── CATAT PEMBAYARAN ──────────────────────────────────────────
@app.route("/api/bayar", methods=["POST"])
@login_required
def bayar():
    data       = request.json
    tagihan_id = data.get("tagihan_id")
    jumlah     = data.get("jumlah")
    cara_bayar = data.get("cara_bayar", "TUNAI")
    catatan    = data.get("catatan", "")

    if not tagihan_id or not jumlah:
        return jsonify({"error": "Data tidak lengkap"}), 400

    conn = get_db()
    row = conn.execute("""
        SELECT t.*, n.nama, n.no_hp, n.marketing_nama, n.marketing_id
        FROM tagihan t JOIN nasabah n ON t.no_rekening = n.no_rekening
        WHERE t.id=?
    """, (tagihan_id,)).fetchone()

    if not row:
        conn.close()
        return jsonify({"error": "Tagihan tidak ditemukan"}), 404

    if row["status"] == "LUNAS":
        conn.close()
        return jsonify({"error": "Tagihan sudah lunas"}), 400

    conn.execute(
        "UPDATE tagihan SET status='LUNAS', cara_bayar=? WHERE id=?",
        (cara_bayar, tagihan_id)
    )
    conn.execute("""
        INSERT INTO pembayaran
          (no_rekening, tagihan_id, jumlah, cara_bayar, marketing_id, catatan, dicatat_oleh)
        VALUES (?,?,?,?,?,?,?)
    """, (
        row["no_rekening"], tagihan_id, jumlah, cara_bayar,
        session.get("marketing_id"), catatan, session.get("nama")
    ))
    conn.commit()
    conn.close()

    # Kirim WA notif lunas
    if row["no_hp"]:
        pesan = pesan_lunas(row["nama"], jumlah, row["marketing_nama"])
        kirim_wa(row["no_hp"], pesan)

    return jsonify({
        "success": True,
        "message": f"Pembayaran {row['nama']} berhasil dicatat"
    })

# ── REMINDER WA INDIVIDUAL ────────────────────────────────────
@app.route("/api/reminder/<int:tagihan_id>", methods=["POST"])
@login_required
def kirim_reminder(tagihan_id):
    conn = get_db()
    row = conn.execute("""
        SELECT t.*, n.nama, n.no_hp, n.marketing_nama, n.tanggal_jt
        FROM tagihan t JOIN nasabah n ON t.no_rekening = n.no_rekening
        WHERE t.id=?
    """, (tagihan_id,)).fetchone()
    conn.close()

    if not row:
        return jsonify({"error": "Tagihan tidak ditemukan"}), 404
    if not row["no_hp"]:
        return jsonify({"error": "No HP nasabah belum diisi"}), 400

    pesan  = pesan_tagihan(row["nama"], row["total_tagihan"], row["tanggal_jt"], row["marketing_nama"])
    result = kirim_wa(row["no_hp"], pesan)
    return jsonify({"success": True, "wa_result": result})

# ── BLAST REMINDER ────────────────────────────────────────────
@app.route("/api/reminder/blast", methods=["POST"])
@admin_required
def blast_reminder():
    data         = request.json
    bulan        = data.get("bulan", datetime.now().strftime("%Y-%m"))
    marketing_id = data.get("marketing_id", "")

    conn  = get_db()
    where = "WHERE t.bulan=? AND t.status='BELUM' AND n.no_hp IS NOT NULL AND n.no_hp != ''"
    params = [bulan]
    if marketing_id:
        where += " AND n.marketing_id=?"
        params.append(marketing_id)

    rows = conn.execute(f"""
        SELECT t.id, t.total_tagihan, n.nama, n.no_hp, n.marketing_nama, n.tanggal_jt
        FROM tagihan t JOIN nasabah n ON t.no_rekening = n.no_rekening
        {where}
    """, params).fetchall()
    conn.close()

    terkirim = gagal = 0
    for row in rows:
        pesan  = pesan_tagihan(row["nama"], row["total_tagihan"], row["tanggal_jt"], row["marketing_nama"])
        result = kirim_wa(row["no_hp"], pesan)
        if "error" not in result:
            terkirim += 1
        else:
            gagal += 1

    return jsonify({"success": True, "terkirim": terkirim, "gagal": gagal})

# ── UPDATE NO HP ──────────────────────────────────────────────
@app.route("/api/nasabah/<no_rek>/hp", methods=["PUT"])
@login_required
def update_hp(no_rek):
    data  = request.json
    no_hp = data.get("no_hp", "").strip()
    conn  = get_db()
    conn.execute("UPDATE nasabah SET no_hp=? WHERE no_rekening=?", (no_hp, no_rek))
    conn.commit()
    conn.close()
    return jsonify({"success": True})

# ── HISTORI PEMBAYARAN ────────────────────────────────────────
@app.route("/api/histori")
@login_required
def histori():
    conn         = get_db()
    marketing_id = session.get("marketing_id")
    role         = session.get("role")

    where  = ""
    params = []
    if role != "admin" and marketing_id:
        where = "WHERE p.marketing_id=?"
        params.append(marketing_id)

    rows = conn.execute(f"""
        SELECT p.*, n.nama
        FROM pembayaran p JOIN nasabah n ON p.no_rekening = n.no_rekening
        {where}
        ORDER BY p.tanggal DESC
        LIMIT 100
    """, params).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

# ── IMPORT EXCEL ──────────────────────────────────────────────
@app.route("/api/import", methods=["POST"])
@admin_required
def import_excel_route():
    if "file" not in request.files:
        return jsonify({"error": "File tidak ditemukan"}), 400

    f        = request.files["file"]
    filepath = f"data/upload_{f.filename}"
    f.save(filepath)

    from init_db import import_excel
    result = import_excel(filepath, diimport_oleh=session.get("nama", "admin"))
    try:
        os.remove(filepath)
    except:
        pass
    return jsonify(result)

# ── HISTORI IMPORT ────────────────────────────────────────────
@app.route("/api/import/log")
@admin_required
def import_log():
    conn = get_db()
    rows = conn.execute("""
        SELECT bulan, filepath, nasabah_baru, nasabah_update, nasabah_nonaktif,
               tagihan_baru, tagihan_update, diimport_oleh, waktu
        FROM import_log ORDER BY waktu DESC LIMIT 20
    """).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

# ── SERVE FRONTEND ────────────────────────────────────────────
@app.route("/")
@app.route("/<path:path>")
def index(path=""):
    return render_template("index.html")

# ── STARTUP: init DB kalau belum ada ─────────────────────────
def startup():
    if not os.path.exists(DB_PATH):
        print("🔧 Database belum ada, menjalankan init_db...")
        from init_db import init_db
        init_db()
    else:
        print("✅ Database ditemukan, skip init.")

startup()

if __name__ == "__main__":
    app.run(debug=False, host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
