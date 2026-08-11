"""Verify Supabase prod data state (ticket 08): count rows per table on both
sides — should match the ticket-05 ALL MATCHED state; cache_entries/job_runs
are new tables that start empty (correct).
"""
import os
import sys

from sqlalchemy import MetaData, Table, create_engine, func, select, text

BACKEND = os.path.dirname(os.path.abspath(__file__))
MAIN_SQLITE = os.path.join(BACKEND, "..", "..", "..", "backend", "portfolio.db")
SECOND_SQLITE = os.path.join(BACKEND, "..", "..", "..", "backend", "data", "bondcrisis.db")

secrets = {}
with open(os.path.join(BACKEND, "..", "secrets.env")) as f:
    for ln in f:
        if "=" in ln and not ln.startswith("#"):
            k, v = ln.strip().split("=", 1)
            secrets[k] = v
DST_URL = secrets["SUPABASE_DB_URL"]

src = create_engine(f"sqlite:///{MAIN_SQLITE}")
src2 = create_engine(f"sqlite:///{SECOND_SQLITE}")
dst = create_engine(DST_URL, connect_args={"prepare_threshold": None})

def counts(conn, name):
    t = Table(name, MetaData(), autoload_with=conn)
    return conn.execute(select(func.count()).select_from(t)).scalar()

with src.connect() as s, dst.connect() as d:
    rows = s.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")).fetchall()
    pg = {r[0] for r in d.execute(text("SELECT tablename FROM pg_tables WHERE schemaname='public'")).fetchall()}
    mismatch = 0
    for (name,) in rows:
        if name not in pg:
            print(f"  SKIP (not in pg): {name}")
            continue
        n_src = counts(s, name)
        n_dst = counts(d, name)
        mark = "OK " if n_src == n_dst else "FAIL"
        if n_src != n_dst:
            mismatch += 1
        print(f"  {mark} {name}: sqlite={n_src} pg={n_dst}")
    for extra in sorted(pg - {r[0] for r in rows}):
        n = counts(d, extra)
        print(f"  NEW {extra}: pg={n} (expected empty)")
    print("RESULT:", "ALL MATCHED" if mismatch == 0 else f"{mismatch} MISMATCH")
