# apps/nlp-service/wsgi.py
"""WSGI Entrypoint untuk Gunicorn / production server."""
import os
import sys

service_dir = os.path.dirname(os.path.abspath(__file__))
if service_dir not in sys.path:
    sys.path.insert(0, service_dir)

from app.main import app

if __name__ == "__main__":
    app.run()
