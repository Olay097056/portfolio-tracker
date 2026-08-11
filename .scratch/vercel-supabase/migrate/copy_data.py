"""Copy SQLite -> Supabase Postgres (id-preserving) — vercel-supabase plan ticket 05.

Throwaway migration script (not production code). Copies every user table found in the
SQLite sources into the Postgres target, preserving primary keys (FKs depend on them),
bumps Postgres sequences, and reports source/target counts per table (measured).
"""
import os
import sys

from sqlalchemy import MetaData, Table, create_engine, func, select, text

BACKEND = os.path.dirname(os.path.abspath(__file__))

# source databases (read-only)
MAIN_SQLITE = os.path.join(BACKEND, "..", "..", "..", "backend", "portfolio.db")  # resolved below
SECOND_SQLITE = os.path.join(BACKEND, "..", "..", "..", "backend", "data", "bondcrisis.db")

# target
def _target_url():
    secrets = {}
    with open(os.path.join(BACKEND, "..", "secrets.env")) as f:
        for ln in f:
            if "=" in ln and not ln.startswith("#"):
                k, v = ln.strip().split("=", 1)
                secrets[k] = v
    return secrets["SUPABASE_DB_URL"]


def _user_tables(conn, schema="main") -> list[str]:
    rows = conn.execute(
        text("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    ).fetchall()
    return [r[0] for r in rows]


def _pg_tables(conn) -> set[str]:
    """Public-schema table names on the Postgres target (SQLAlchemy connection)."""
    rows = conn.execute(
        text("SELECT tablename FROM pg_tables WHERE schemaname='public'")
    ).fetchall()
    return {r[0] for r in rows}


def copy_table(src, dst, name, meta_src, meta_dst) -> tuple[int, int]:
    st = Table(name, meta_src, autoload_with=src)
    dt = Table(name, meta_dst, autoload_with=dst)
    with src.connect() as s:
        n_src = s.execute(select(func.count()).select_from(st)).scalar()
        rows = s.execute(select(st)).mappings().all()
        if rows:
            dst.execute(dt.insert(), [dict(r) for r in rows])
        n_dst = dst.execute(select(func.count()).select_from(dt)).scalar()
        if "id" in st.columns and n_dst:
            seq = dst.execute(
                text("SELECT pg_get_serial_sequence(:t, 'id')"), {"t": name}
            ).scalar()
            if seq:
                dst.execute(
                    text(
                        f"SELECT setval('{seq}'::regclass, "
                        f"(SELECT MAX(id) FROM {name})::bigint)"
                    )
                )
    return int(n_src), int(n_dst)


def main():
    src_main = create_engine(f"sqlite:///{MAIN_SQLITE}")
    src_second = create_engine(f"sqlite:///{SECOND_SQLITE}")
    # Supabase pooler is pgbouncer (transaction mode): psycopg3 server-side prepared
    # statements break across transactions -> disable them (prepare_threshold=None).
    dst = create_engine(_target_url(), connect_args={"prepare_threshold": None})

    meta_src = MetaData()
    meta_src2 = MetaData()
    meta_dst = MetaData()

    print(f"== copy {MAIN_SQLITE} -> Supabase ==")
    with src_main.connect() as s:
        tables = _user_tables(s)
    # Copy only tables present in BOTH sides. Orphan SQLite tables (e.g. the
    # legacy `technical_signals`, no ORM model / no code ref) are intentionally
    # skipped — they are not part of the 26-table app schema.
    target_tables = _pg_tables(dst.connect())
    skipped = [t for t in tables if t not in target_tables]
    tables = [t for t in tables if t in target_tables]
    if skipped:
        print(f"  SKIP (not in target schema): {', '.join(sorted(skipped))}")
    ok = True
    with dst.begin() as d:
        # FK triggers off during copy (insert order is alphabetical, not parent-first).
        d.execute(text("SET session_replication_role = replica"))
        for name in tables:
            n_src, n_dst = copy_table(src_main, d, name, meta_src, meta_dst)
            mark = "OK " if n_src == n_dst else "FAIL"
            if n_src != n_dst:
                ok = False
            print(f"  {mark} {name}: {n_src} -> {n_dst}")
        d.execute(text("SET session_replication_role = origin"))

    print(f"== copy {SECOND_SQLITE} (country tables) -> Supabase ==")
    with dst.begin() as d:
        d.execute(text("SET session_replication_role = replica"))
        for name in ("country_briefs", "country_reports"):
            n_src, n_dst = copy_table(src_second, d, name, meta_src2, meta_dst)
            mark = "OK " if n_src == n_dst else "FAIL"
            if n_src != n_dst:
                ok = False
            print(f"  {mark} {name}: {n_src} -> {n_dst}")
        d.execute(text("SET session_replication_role = origin"))

    print("RESULT:", "ALL MATCHED" if ok else "MISMATCH FOUND")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())