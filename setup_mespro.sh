#!/bin/bash
# setup_mespro.sh -- Setup sync MESPro ke BMT Tagihan dalam 1 perintah
# Jalankan: bash setup_mespro.sh
set -e
DIR=/var/www/bmt-tagihan/bmt-tagih
cd $DIR
echo ""
echo "======================================================"
echo "   Setup Sync MESPro => BMT Tagihan"
echo "======================================================"
echo ""

# STEP 1: ODBC Driver
echo "[1/4] Cek/install Microsoft ODBC Driver 18..."
if odbcinst -q -d -n "ODBC Driver 18 for SQL Server" > /dev/null 2>&1; then
    echo "  OK - sudah terinstall, skip."
else
    curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg 2>/dev/null
    curl -fsSL https://packages.microsoft.com/config/ubuntu/24.04/prod.list -o /etc/apt/sources.list.d/mssql-release.list
    apt-get update -q
    ACCEPT_EULA=Y apt-get install -y msodbcsql18 unixodbc-dev -q
    echo "  OK - berhasil diinstall."
fi

# STEP 2: pyodbc
echo ""
echo "[2/4] Cek/install pyodbc..."
if $DIR/venv/bin/python3 -c "import pyodbc" 2>/dev/null; then
    echo "  OK - sudah ada, skip."
else
    $DIR/venv/bin/pip install pyodbc -q
    echo "  OK - berhasil diinstall."
fi

# STEP 3: Konfigurasi
echo ""
echo "[3/4] Konfigurasi koneksi MESPro..."
CONFIG=$DIR/data/mespro_config.json
NEED_CONFIG=0
if [ -f "$CONFIG" ]; then
    PASS=$($DIR/venv/bin/python3 -c "import json; d=json.load(open('$CONFIG')); print(d.get('password',''))" 2>/dev/null || echo "")
    if [ "$PASS" = "GANTI_INI" ] || [ -z "$PASS" ]; then
        NEED_CONFIG=1
    else
        echo "  OK - Konfigurasi sudah ada, skip."
    fi
else
    NEED_CONFIG=1
fi

if [ "$NEED_CONFIG" = "1" ]; then
    echo ""
    printf "  Host/IP SQL Server           : "; read CFG_HOST
    printf "  Port (Enter=1433)            : "; read CFG_PORT
    CFG_PORT=${CFG_PORT:-1433}
    printf "  Instance (Enter=SQLEXPRESS)  : "; read CFG_INST
    CFG_INST=${CFG_INST:-SQLEXPRESS}
    printf "  Database (Enter=bmt_amw)     : "; read CFG_DB
    CFG_DB=${CFG_DB:-bmt_amw}
    printf "  Username                     : "; read CFG_USER
    printf "  Password                     : "; read -s CFG_PASS; echo ""

    printf '%s\n%s\n%s\n%s\n%s\n%s\n' "$CFG_HOST" "$CFG_PORT" "$CFG_INST" "$CFG_DB" "$CFG_USER" "$CFG_PASS" > /tmp/_mespro_args
    $DIR/venv/bin/python3 -c "
args = open('/tmp/_mespro_args').read().strip().split('\n')
import json
cfg = {
    'host': args[0], 'port': int(args[1]), 'instance': args[2],
    'database': args[3], 'username': args[4], 'password': args[5],
    'query': '', 'driver': 'ODBC Driver 18 for SQL Server'
}
with open('$CONFIG', 'w') as f:
    json.dump(cfg, f, indent=2)
print('  OK - Konfigurasi disimpan ke data/mespro_config.json')
"
    rm -f /tmp/_mespro_args
fi

# STEP 4: Test + discover
echo ""
echo "[4/4] Test koneksi dan list tabel/view MESPro..."
$DIR/venv/bin/python3 $DIR/sync_mespro.py --discover

echo ""
echo "======================================================"
echo "  Setup selesai!"
echo "  Jalankan sync: venv/bin/python3 sync_mespro.py"
echo "======================================================"
