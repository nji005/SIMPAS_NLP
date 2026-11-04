# apps/nlp-service/app.py
"""Entrypoint lokal untuk menjalankan service NLP SIPMAS."""
import os
import sys

# Tambahkan direktori root service ke sys.path
service_dir = os.path.dirname(os.path.abspath(__file__))
if service_dir not in sys.path:
    sys.path.insert(0, service_dir)

from app.main import app

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"[NLP Service] Memulai server Flask di http://0.0.0.0:{port}...")
    app.run(host='0.0.0.0', port=port, debug=False)
