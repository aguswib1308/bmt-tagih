from flask import Flask, request, jsonify, session, render_template, redirect, url_for
import sqlite3
import hashlib
import requests
import os
import re
from datetime import datetime, timedelta
from functools import wraps

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "koperasi_bmt_secret_2026_ganti_ini")

# â”€â”€ Auto-create folder data/ saat pertama jalan â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
os.makedirs("data", exist_ok=True)

DB_PATH = os.environ.get("DB_PATH", "data/koperasi.db")

# â”€â”€ Fonnte Config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
FONNTE_TOKEN = os.environ.get("FONNTE_TOKEN", "")

# â”€â”€ Helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def hash_pw(pw):
    return hashlib.sha256(pw.encode()).hexdigest()

def format_rp(n):
    return f"Rp {int(n):,}".replace(",", ".")

def format_tgl_jt(tgl_str):
    if not tgl_str: return "-"
    tgl_str = str(tgl_str).strip()
    if re.match(r'^\d{8}$', tgl_str):
        return tgl_str[-2:]
    if re.match(r'^\d{4}-\d{2}-\d{2}', tgl_str):
        return tgl_str.split('-')[2][:2]
    if re.match(r'^\d{1,2}[/-]\d{1,2}', tgl_str):
        return re.split(r'[/-]', tgl_str)[0]
    m = re.search(r'^(\d{1,2})\b', tgl_str)
    if m: return m.group(1)
    m = re.search(r'\b(\d{1,2})$', tgl_str)
    if m: return m.group(1)
    return tgl_str

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

# â”€â”€ Kirim WA via Fonnte â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

def get_template_isi(template_id):
    try:
        conn = get_db()
        row = conn.execute("SELECT isi FROM template_pesan WHERE id=?", (template_id,)).fetchone()
        conn.close()
        return row["isi"] if row else None
    except:
        return None

def pesan_tagihan(nasabah_nama, total, jatuh_tempo, marketing_nama):
    template = get_template_isi("tagihan")
    if template:
        return template.format(
            nasabah_nama=nasabah_nama,
            total=format_rp(total),
            jatuh_tempo=jatuh_tempo,
            marketing_nama=marketing_nama
        )
    return f"""Assalamu'alaikum, {nasabah_nama} 🙏\n\nTagihan: {format_rp(total)}\nJatuh Tempo: {jatuh_tempo}\nMarketing: {marketing_nama}"""

def pesan_lunas(nasabah_nama, jumlah, marketing_nama):
    template = get_template_isi("lunas")
    if template:
        return template.format(
            nasabah_nama=nasabah_nama,
            jumlah=format_rp(jumlah),
            tgl_sekarang=datetime.now().strftime('%d/%m/%Y %H:%M'),
            marketing_nama=marketing_nama
        )
    return f"""Assalamu'alaikum, {nasabah_nama} 🙏\n\nPembayaran {format_rp(jumlah)} berhasil dicatat.\nMarketing: {marketing_nama}"""

# â”€â”€ Health Check (Railway butuh ini) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@app.route("/health")
def health():
    return jsonify({"status": "ok", "time": datetime.now().isoformat()})

# â”€â”€ AUTH â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

# â”€â”€ USER MANAGEMENT (ADMIN) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@app.route("/api/users", methods=["GET"])
@admin_required
def get_users():
    conn = get_db()
    rows = conn.execute("SELECT id, username, nama, role, marketing_id, aktif FROM users ORDER BY role, nama").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route("/api/users", methods=["POST"])
@admin_required
def create_user():
    data = request.json
    username = data.get("username", "").strip()
    nama = data.get("nama", "").strip()
    marketing_id = data.get("marketing_id", "").strip()
    role = data.get("role", "marketing")

    if not username or not nama:
        return jsonify({"error": "Username dan nama wajib diisi"}), 400

    conn = get_db()
    exist = conn.execute("SELECT id FROM users WHERE username=?", (username,)).fetchone()
    if exist:
        conn.close()
        return jsonify({"error": "Username sudah dipakai"}), 400

    conn.execute(
        "INSERT INTO users (username, password, nama, role, marketing_id, aktif) VALUES (?, ?, ?, ?, ?, 1)",
        (username, hash_pw("bmt2026"), nama, role, marketing_id)
    )
    conn.commit()
    conn.close()
    return jsonify({"success": True})

@app.route("/api/users/<int:user_id>", methods=["PUT"])
@admin_required
def update_user(user_id):
    data = request.json
    username = data.get("username", "").strip()
    nama = data.get("nama", "").strip()
    marketing_id = data.get("marketing_id", "").strip()
    aktif = int(data.get("aktif", 1))

    if not username or not nama:
        return jsonify({"error": "Username dan nama wajib diisi"}), 400

    conn = get_db()
    exist = conn.execute("SELECT id FROM users WHERE username=? AND id!=?", (username, user_id)).fetchone()
    if exist:
        conn.close()
        return jsonify({"error": "Username sudah dipakai user lain"}), 400

    conn.execute(
        "UPDATE users SET username=?, nama=?, marketing_id=?, aktif=? WHERE id=?",
        (username, nama, marketing_id, aktif, user_id)
    )
    conn.commit()
    conn.close()
    return jsonify({"success": True})

@app.route("/api/users/<int:user_id>/reset", methods=["PUT"])
@admin_required
def reset_user_password(user_id):
    conn = get_db()
    conn.execute("UPDATE users SET password=? WHERE id=?", (hash_pw("bmt2026"), user_id))
    conn.commit()
    conn.close()
    return jsonify({"success": True})

# â”€â”€ DASHBOARD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

# â”€â”€ TAGIHAN LIST â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    kolek = request.args.get("kolek", "")
    if kolek:
        where.append("t.kolektibilitas=?")
        params.append(int(kolek))
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
        ORDER BY t.kolektibilitas DESC, n.tanggal_jt ASC, t.total_tagihan DESC
    """
    # Pagination
    limit  = int(request.args.get("limit", 50))
    offset = int(request.args.get("offset", 0))

    sql_count = f"SELECT COUNT(*) FROM tagihan t JOIN nasabah n ON t.no_rekening = n.no_rekening WHERE {' AND '.join(where)}"
    total = conn.execute(sql_count, params).fetchone()[0]

    params.append(limit)
    params.append(offset)
    sql += " LIMIT ? OFFSET ?"
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return jsonify({
        "data": [dict(r) for r in rows],
        "total": total,
        "limit": limit,
        "offset": offset
    })

# â”€â”€ CATAT PEMBAYARAN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

# â”€â”€ REMINDER WA INDIVIDUAL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@app.route("/api/reminder/<int:tagihan_id>", methods=["POST"])
@login_required
def kirim_reminder(tagihan_id):
    data = request.json or {}
    nominal_baru = data.get("nominal")

    conn = get_db()
    if nominal_baru is not None:
        try:
            nominal_baru = float(nominal_baru)
            conn.execute("UPDATE tagihan SET total_tagihan=? WHERE id=?", (nominal_baru, tagihan_id))
            conn.commit()
        except:
            pass

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

    tgl = format_tgl_jt(row["tanggal_jt"])
    pesan  = pesan_tagihan(row["nama"], row["total_tagihan"], tgl, row["marketing_nama"])
    result = kirim_wa(row["no_hp"], pesan)
    return jsonify({"success": True, "wa_result": result})

# â”€â”€ BLAST REMINDER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@app.route("/api/reminder/preview_blast", methods=["POST"])
@admin_required
def preview_blast():
    data = request.json
    bulan = data.get("bulan", datetime.now().strftime("%Y-%m"))
    hanya_hari_ini = data.get("hanya_hari_ini", False)

    conn = get_db()
    where = "WHERE t.bulan=? AND t.status='BELUM' AND n.no_hp IS NOT NULL AND n.no_hp != ''"
    params = [bulan]

    rows = conn.execute(f"""
        SELECT t.id, t.total_tagihan, t.kolektibilitas, n.nama, n.no_rekening, n.no_hp, n.marketing_nama, n.tanggal_jt
        FROM tagihan t JOIN nasabah n ON t.no_rekening = n.no_rekening
        {where}
        ORDER BY t.kolektibilitas DESC, n.tanggal_jt ASC
    """, params).fetchall()
    conn.close()

    lancar = []
    bermasalah = []
    hari_ini_str = datetime.now().strftime("%d")
    hari_ini_str_alt = hari_ini_str[1:] if hari_ini_str.startswith("0") else hari_ini_str

    for r in rows:
        d = dict(r)
        tgl = format_tgl_jt(d["tanggal_jt"])
        if hanya_hari_ini and tgl not in (hari_ini_str, hari_ini_str_alt):
            continue
            
        if d["kolektibilitas"] == 1:
            lancar.append(d)
        else:
            bermasalah.append(d)

    return jsonify({"success": True, "lancar": lancar, "bermasalah": bermasalah})

@app.route("/api/reminder/execute_blast", methods=["POST"])
@admin_required
def execute_blast():
    import time
    data = request.json
    bulan = data.get("bulan", datetime.now().strftime("%Y-%m"))
    hanya_hari_ini = data.get("hanya_hari_ini", False)
    updates = data.get("updates", [])

    conn = get_db()
    for up in updates:
        tag_id = up.get("id")
        nom = up.get("nominal")
        if tag_id and nom is not None:
            conn.execute("UPDATE tagihan SET total_tagihan=? WHERE id=?", (float(nom), tag_id))
    conn.commit()

    where = "WHERE t.bulan=? AND t.status='BELUM' AND n.no_hp IS NOT NULL AND n.no_hp != ''"
    params = [bulan]

    rows = conn.execute(f"""
        SELECT t.id, t.total_tagihan, n.nama, n.no_hp, n.marketing_nama, n.tanggal_jt
        FROM tagihan t JOIN nasabah n ON t.no_rekening = n.no_rekening
        {where}
    """, params).fetchall()
    conn.close()

    terkirim = gagal = 0
    hari_ini_str = datetime.now().strftime("%d")
    hari_ini_str_alt = hari_ini_str[1:] if hari_ini_str.startswith("0") else hari_ini_str

    for row in rows:
        tgl = format_tgl_jt(row["tanggal_jt"])
        if hanya_hari_ini and tgl not in (hari_ini_str, hari_ini_str_alt):
            continue

        pesan = pesan_tagihan(row["nama"], row["total_tagihan"], tgl, row["marketing_nama"])
        result = kirim_wa(row["no_hp"], pesan)
        if result.get("status") == True:
            terkirim += 1
        else:
            gagal += 1
        time.sleep(5)

    return jsonify({"success": True, "terkirim": terkirim, "gagal": gagal})

# â”€â”€ UPDATE NO HP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

# â”€â”€ HISTORI PEMBAYARAN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

# â”€â”€ IMPORT EXCEL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

# â”€â”€ HISTORI IMPORT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    # ── TEMPLATE PESAN ─────────────────────────────────────────────
@app.route("/api/template", methods=["GET"])
@admin_required
def get_template():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS template_pesan (
            id TEXT PRIMARY KEY,
            judul TEXT,
            isi TEXT
        )
    """)
    # Default template kalau belum ada
    defaults = [
        ("tagihan", "Reminder Tagihan", """Assalamu'alaikum, {nasabah_nama} 🙏

Kami dari *KSPPS BMT Amal Muslim Wonogiri* ingin mengingatkan tagihan Anda:

💰 *Total Tagihan:* {total}
📅 *Jatuh Tempo:* tanggal {jatuh_tempo}
👤 *Marketing:* {marketing_nama}

Mohon segera melakukan pembayaran. Terima kasih 🙏

_Pesan otomatis - Jangan dibalas_"""),
        ("lunas", "Konfirmasi Lunas", """Assalamu'alaikum, {nasabah_nama} 🙏

✅ Pembayaran Anda telah *berhasil dicatat*!

💰 *Jumlah Bayar:* {jumlah}
📅 *Tanggal:* {tgl_sekarang}
👤 *Marketing:* {marketing_nama}

Terima kasih atas kepercayaan Anda 🙏
*KSPPS BMT Amal Muslim Wonogiri*"""),
    ]
    for id, judul, isi in defaults:
        conn.execute("INSERT OR IGNORE INTO template_pesan VALUES (?,?,?)", (id, judul, isi))
    conn.commit()
    rows = conn.execute("SELECT * FROM template_pesan").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route("/api/template/<id>", methods=["PUT"])
@admin_required
def update_template(id):
    data = request.json
    isi = data.get("isi", "").strip()
    if not isi:
        return jsonify({"error": "Isi pesan tidak boleh kosong"}), 400
    conn = get_db()
    conn.execute("UPDATE template_pesan SET isi=? WHERE id=?", (isi, id))
    conn.commit()
    conn.close()
    return jsonify({"success": True})

# â”€â”€ SERVE FRONTEND â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@app.route("/")
@app.route("/<path:path>")
def index(path=""):
    return render_template("index.html")

# â”€â”€ STARTUP: init DB kalau belum ada â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
def startup():
    if not os.path.exists(DB_PATH):
        print("ðŸ”§ Database belum ada, menjalankan init_db...")
        from init_db import init_db
        init_db()
    else:
        print("âœ… Database ditemukan, skip init.")

startup()

if __name__ == "__main__":
    app.run(debug=False, host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))


