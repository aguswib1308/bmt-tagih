#!/usr/bin/env python3
"""Backup SQLite DB ke Google Drive - jalankan via cron harian"""
import os, sys, json, shutil
from datetime import datetime

BASE = '/var/www/bmt-tagihan/bmt-tagih'
DB_PATH = os.path.join(BASE, 'data', 'koperasi.db')
TOKEN_PATH = os.path.join(BASE, 'data', 'gdrive_token.json')
SECRET_PATH = os.path.join(BASE, 'data', 'gdrive_client_secret.json')
BACKUP_FOLDER_ID = '1ftwqyYVBIu2YZnjLip36vylMeB3dPvLV'  # same as foto folder
LOG = os.path.join(BASE, 'data', 'backup_log.txt')

def log(msg):
    ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG, 'a') as f: f.write(line + '\n')

def get_creds():
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    with open(TOKEN_PATH) as f: td = json.load(f)
    creds = Credentials(
        token=td.get('token'),
        refresh_token=td.get('refresh_token'),
        token_uri=td.get('token_uri', 'https://oauth2.googleapis.com/token'),
        client_id=td.get('client_id'),
        client_secret=td.get('client_secret'),
        scopes=td.get('scopes', ['https://www.googleapis.com/auth/drive'])
    )
    if not creds.valid:
        creds.refresh(Request())
        td['token'] = creds.token
        with open(TOKEN_PATH, 'w') as f: json.dump(td, f)
    return creds

def run():
    if not os.path.exists(DB_PATH):
        log("ERROR: DB tidak ditemukan"); sys.exit(1)
    if not os.path.exists(TOKEN_PATH):
        log("ERROR: gdrive_token.json tidak ada"); sys.exit(1)

    # Buat nama file backup dengan timestamp
    ts = datetime.now().strftime('%Y%m%d_%H%M')
    backup_name = f"bmt_backup_{ts}.db"

    # Copy DB (agar tidak corrupt saat sedang dipakai)
    tmp = f'/tmp/{backup_name}'
    shutil.copy2(DB_PATH, tmp)
    log(f"DB dicopy ke {tmp} ({os.path.getsize(tmp):,} bytes)")

    try:
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaFileUpload

        creds = get_creds()
        svc = build('drive', 'v3', credentials=creds)

        meta = {'name': backup_name, 'parents': [BACKUP_FOLDER_ID]}
        media = MediaFileUpload(tmp, mimetype='application/octet-stream', resumable=False)
        result = svc.files().create(body=meta, media_body=media, fields='id,name').execute()
        log(f"Upload OK: {result['name']} (id={result['id']})")

        # Hapus backup lama lebih dari 30 hari (file bernama bmt_backup_*.db)
        cutoff = "2000-01-01"  # placeholder, Drive API pakai modifiedTime filter
        res = svc.files().list(
            q=f"name contains 'bmt_backup_' and '{BACKUP_FOLDER_ID}' in parents",
            fields='files(id,name,modifiedTime)',
            orderBy='modifiedTime asc'
        ).execute()
        backups = res.get('files', [])
        # Hapus jika total backup > 30
        if len(backups) > 30:
            to_delete = backups[:len(backups)-30]
            for b in to_delete:
                svc.files().delete(fileId=b['id']).execute()
                log(f"Hapus backup lama: {b['name']}")
    except Exception as e:
        log(f"ERROR upload Drive: {e}")
        sys.exit(1)
    finally:
        os.remove(tmp)

    log("Backup selesai OK")

if __name__ == '__main__':
    run()
