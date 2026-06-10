#!/bin/bash
# Install Microsoft ODBC Driver 18 for SQL Server di Ubuntu 24.04
set -e
echo === Install Microsoft ODBC Driver 18 ===
curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg
curl https://packages.microsoft.com/config/ubuntu/24.04/prod.list | tee /etc/apt/sources.list.d/mssql-release.list
apt-get update -q
ACCEPT_EULA=Y apt-get install -y msodbcsql18 unixodbc-dev
echo === Install pyodbc ===
/var/www/bmt-tagihan/bmt-tagih/venv/bin/pip install pyodbc
echo === Done! Test koneksi: ===
echo  python3 sync_mespro.py --discover
