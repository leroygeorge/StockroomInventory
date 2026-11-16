# Stockroom: inventory control for small offices
# Author: Leroy George <georgeleroy.1997@gmail.com>
# MIT License, see LICENSE
"""
database.py
SQLite data layer for the inventory management app.
All schema creation and raw data access lives here.
"""
import sqlite3
import json
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "inventory.db")


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            prefix TEXT NOT NULL,
            fields_json TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id INTEGER NOT NULL,
            barcode TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            cost_price REAL NOT NULL DEFAULT 0,
            sell_price REAL NOT NULL DEFAULT 0,
            quantity INTEGER NOT NULL DEFAULT 0,
            low_stock_threshold INTEGER NOT NULL DEFAULT 0,
            extra_fields_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL,
            FOREIGN KEY (category_id) REFERENCES categories(id)
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('purchase','sale','adjustment')),
            quantity INTEGER NOT NULL,
            unit_price REAL NOT NULL DEFAULT 0,
            party TEXT,
            note TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (product_id) REFERENCES products(id)
        )
    """)

    conn.commit()

    # Seed a couple of example categories on first run so the UI isn't empty
    cur.execute("SELECT COUNT(*) c FROM categories")
    if cur.fetchone()["c"] == 0:
        default_categories = [
            ("General", "GEN", [
                {"name": "Description", "type": "text"},
            ]),
            ("Electronics", "ELEC", [
                {"name": "Brand", "type": "text"},
                {"name": "Warranty (months)", "type": "number"},
            ]),
        ]
        now = datetime.utcnow().isoformat()
        for name, prefix, fields in default_categories:
            cur.execute(
                "INSERT INTO categories (name, prefix, fields_json, created_at) VALUES (?,?,?,?)",
                (name, prefix, json.dumps(fields), now),
            )
        conn.commit()

    conn.close()


def next_barcode_for_category(category_id):
    """Generate the next sequential barcode for a category, e.g. ELEC-000004."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT prefix FROM categories WHERE id=?", (category_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise ValueError("Category not found")
    prefix = row["prefix"]
    cur.execute(
        "SELECT COUNT(*) c FROM products WHERE category_id=?", (category_id,)
    )
    count = cur.fetchone()["c"]
    conn.close()
    return f"{prefix}-{count + 1:06d}"
