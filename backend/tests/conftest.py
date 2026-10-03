"""Shared test configuration.

Sets harmless dummy environment variables for MONGO_URL and DB_NAME before
any test module can import server (which reads them at import time).  Motor
does not connect on client creation, so no live MongoDB is needed.
"""
import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "substrate_test")
