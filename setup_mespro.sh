#!/bin/bash
# setup_mespro.sh -- Setup sync MESPro (MySQL) ke BMT Tagihan
# Jalankan: bash setup_mespro.sh
set -e
DIR=/var/www/bmt-tagihan/bmt-tagih
cd $DIR

echo ""
echo "======================================================"
echo "   Setup Sync MESPro (MySQL) => BMT Tagihan"
echo "======================================================"
echo ""

# STEP 1: Install pymysql
echo "[1/3] Cek/install pymysql..."
if $DIR/venv/bin/python3 -c "import pymysql" 2>/dev/null; then
    echo "  OK - pymysql sudah ada, skip."
else
    $DIR/venv/bin/pip install pymysql -q
    echo "  OK - pymysql berhasil diinstall."
fi

# STEP 2: Tulis konfigurasi
echo ""
echo "[2/3] Menyimpan konfigurasi koneksi MySQL..."
CONFIG=$DIR/data/mespro_config.json
mkdir -p $DIR/data

cat > $CONFIG << 'JSONEOF'
{
  "host":     "192.168.1.200",
  "port":     3306,
  "database": "bmt_amw",
  "username": "reportamw",
  "password": "bMt4m2u22606!",
  "query":    "",
  "table":    ""
}
JSONEOF
echo "  OK - Config disimpan ke data/mespro_config.json"
echo "  CATATAN: host 192.168.1.200 adalah IP lokal."
echo "  Developer perlu forward port 3306 ke internet atau setup VPN/tunnel."

# STEP 3: Test koneksi
echo ""
echo "[3/3] Test koneksi ke MySQL MESPro..."
$DIR/venv/bin/python3 $DIR/sync_mespro.py --discover

echo ""
echo "======================================================"
echo "  Setup selesai!"
echo "  Jika koneksi berhasil, jalankan sync:"
echo "  venv/bin/python3 sync_mespro.py"
echo "======================================================"
echo ""
