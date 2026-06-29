import sqlite3, sys
from datetime import date
sys.path.insert(0, '/var/www/bmt-tagihan/bmt-tagih')
from status_logic import (hitung_n_due, tentukan_status, angpokok_turunan,
                          bulan_diff, parse_date, selaraskan_tunggakan_berjalan)

DB='/var/www/bmt-tagihan/bmt-tagih/data/koperasi.db'
bulan = sys.argv[1] if len(sys.argv)>1 else date.today().strftime('%Y-%m')
bulan_num = bulan.replace('-','')
today = date.today()
conn=sqlite3.connect(DB); conn.row_factory=sqlite3.Row
rows=conn.execute("""SELECT t.id,t.plafond_pokok,t.saldo_pinjaman,t.angsuran_per_bulan,
   t.total_tagihan,t.tunggakan_pokok,t.tunggakan_margin,t.tgl_bayar,t.status,
   n.tgl_realisasi,n.tanggal_jt
   FROM tagihan t JOIN nasabah n ON t.no_rekening=n.no_rekening WHERE t.bulan=?""",[bulan]).fetchall()

from collections import Counter
before=Counter(); after=Counter(); ch_status=0; ch_tung=0
for r in rows:
    before[r['status']]+=1
    real=r['tgl_realisasi']; jt=r['tanggal_jt']
    jw = bulan_diff(parse_date(real),parse_date(jt)) if (parse_date(real) and parse_date(jt)) else 0
    ang_pokok = angpokok_turunan(r['plafond_pokok'], jw, r['angsuran_per_bulan'])
    n_due = hitung_n_due(real, jw, today)
    paid_this_month = bool(r['tgl_bayar'] and str(r['tgl_bayar']).replace('-','')[:6]==bulan_num)
    st = tentukan_status(r['saldo_pinjaman'], r['plafond_pokok'], ang_pokok, n_due, jw,
                         r['total_tagihan'], paid_this_month)
    after[st]+=1
    if st != r['status']:
        conn.execute("UPDATE tagihan SET status=? WHERE id=?", (st, r['id'])); ch_status+=1
    # Tunggakan jadwal: top-up angsuran bln berjalan yg belum digulung MESPro.
    if st == 'BELUM':
        np_,nm_,ntot = selaraskan_tunggakan_berjalan(
            r['tunggakan_pokok'],r['tunggakan_margin'],r['plafond_pokok'],
            r['saldo_pinjaman'],ang_pokok,r['angsuran_per_bulan'],jw,n_due)
        # MESPro tetap basis; hanya update bila hasil penyesuaian lebih besar.
        if ntot > (r['total_tagihan'] or 0):
            conn.execute("UPDATE tagihan SET tunggakan_pokok=?,tunggakan_margin=?,total_tagihan=? WHERE id=?",
                         (np_,nm_,ntot,r['id'])); ch_tung+=1
conn.commit()
badge=conn.execute("SELECT COUNT(*) c FROM tagihan WHERE bulan=? AND status='SUDAH_BAYAR' AND total_tagihan>=1",[bulan]).fetchone()['c']
conn.close()
print("Bulan:",bulan,"today:",today,"records:",len(rows),"| status diubah:",ch_status,"| tunggakan diisi:",ch_tung)
print("SESUDAH:",dict(after))
print("=> SUDAH=%d BELUM=%d | badge(sudah+nunggak)=%d"%(after['LUNAS']+after['SUDAH_BAYAR'],after['BELUM'],badge))
