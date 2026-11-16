# Stockroom: inventory control for small offices
# Author: Leroy George <georgeleroy.1997@gmail.com>
# MIT License, see LICENSE
"""
app.py
Flask backend for the generic inventory management system.

Run:  python app.py
Then open http://<this-computer-ip>:5000 from any PC on the same network.
"""
import json
import socket
from datetime import datetime

from flask import Flask, jsonify, request, render_template

import database as db

app = Flask(__name__)
db.init_db()


# ---------- helpers ----------

def row_to_dict(row):
    return dict(row) if row else None


def product_to_json(row):
    d = row_to_dict(row)
    if d is None:
        return None
    d["extra_fields"] = json.loads(d.pop("extra_fields_json") or "{}")
    return d


def category_to_json(row):
    d = row_to_dict(row)
    if d is None:
        return None
    d["fields"] = json.loads(d.pop("fields_json") or "[]")
    return d


# ---------- pages ----------

@app.route("/")
def index():
    return render_template("index.html")


# ---------- categories (product type tabs) ----------

@app.route("/api/categories", methods=["GET"])
def list_categories():
    conn = db.get_conn()
    rows = conn.execute("SELECT * FROM categories ORDER BY id").fetchall()
    conn.close()
    return jsonify([category_to_json(r) for r in rows])


@app.route("/api/categories", methods=["POST"])
def create_category():
    data = request.get_json(force=True)
    name = (data.get("name") or "").strip()
    prefix = (data.get("prefix") or "").strip().upper()
    fields = data.get("fields", [])
    if not name or not prefix:
        return jsonify({"error": "name and prefix are required"}), 400

    conn = db.get_conn()
    try:
        conn.execute(
            "INSERT INTO categories (name, prefix, fields_json, created_at) VALUES (?,?,?,?)",
            (name, prefix, json.dumps(fields), datetime.utcnow().isoformat()),
        )
        conn.commit()
    except Exception as e:
        conn.close()
        return jsonify({"error": str(e)}), 400
    row = conn.execute(
        "SELECT * FROM categories WHERE name=?", (name,)
    ).fetchone()
    conn.close()
    return jsonify(category_to_json(row)), 201


@app.route("/api/categories/<int:cat_id>", methods=["PUT"])
def update_category(cat_id):
    data = request.get_json(force=True)
    conn = db.get_conn()
    conn.execute(
        "UPDATE categories SET name=?, prefix=?, fields_json=? WHERE id=?",
        (
            data.get("name"),
            (data.get("prefix") or "").upper(),
            json.dumps(data.get("fields", [])),
            cat_id,
        ),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM categories WHERE id=?", (cat_id,)).fetchone()
    conn.close()
    return jsonify(category_to_json(row))


@app.route("/api/categories/<int:cat_id>", methods=["DELETE"])
def delete_category(cat_id):
    conn = db.get_conn()
    in_use = conn.execute(
        "SELECT COUNT(*) c FROM products WHERE category_id=?", (cat_id,)
    ).fetchone()["c"]
    if in_use:
        conn.close()
        return jsonify({"error": "Category still has products; delete or move them first."}), 400
    conn.execute("DELETE FROM categories WHERE id=?", (cat_id,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# ---------- products ----------

@app.route("/api/products", methods=["GET"])
def list_products():
    category_id = request.args.get("category_id")
    search = request.args.get("search", "").strip()
    barcode = request.args.get("barcode", "").strip()

    query = "SELECT * FROM products WHERE 1=1"
    params = []
    if category_id:
        query += " AND category_id=?"
        params.append(category_id)
    if search:
        query += " AND (name LIKE ? OR barcode LIKE ?)"
        params.extend([f"%{search}%", f"%{search}%"])
    if barcode:
        query += " AND barcode=?"
        params.append(barcode)
    query += " ORDER BY id DESC"

    conn = db.get_conn()
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return jsonify([product_to_json(r) for r in rows])


@app.route("/api/products/<int:pid>", methods=["GET"])
def get_product(pid):
    conn = db.get_conn()
    row = conn.execute("SELECT * FROM products WHERE id=?", (pid,)).fetchone()
    conn.close()
    if not row:
        return jsonify({"error": "Not found"}), 404
    return jsonify(product_to_json(row))


@app.route("/api/products/barcode/<code>", methods=["GET"])
def get_product_by_barcode(code):
    conn = db.get_conn()
    row = conn.execute("SELECT * FROM products WHERE barcode=?", (code,)).fetchone()
    conn.close()
    if not row:
        return jsonify({"error": "Not found"}), 404
    return jsonify(product_to_json(row))


@app.route("/api/products", methods=["POST"])
def create_product():
    data = request.get_json(force=True)
    category_id = data.get("category_id")
    name = (data.get("name") or "").strip()
    if not category_id or not name:
        return jsonify({"error": "category_id and name are required"}), 400

    barcode = (data.get("barcode") or "").strip()
    conn = db.get_conn()
    if not barcode:
        barcode = db.next_barcode_for_category(category_id)

    try:
        conn.execute(
            """INSERT INTO products
               (category_id, barcode, name, cost_price, sell_price, quantity,
                low_stock_threshold, extra_fields_json, created_at)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (
                category_id,
                barcode,
                name,
                float(data.get("cost_price") or 0),
                float(data.get("sell_price") or 0),
                int(data.get("quantity") or 0),
                int(data.get("low_stock_threshold") or 0),
                json.dumps(data.get("extra_fields", {})),
                datetime.utcnow().isoformat(),
            ),
        )
        conn.commit()
    except Exception as e:
        conn.close()
        return jsonify({"error": str(e)}), 400

    row = conn.execute("SELECT * FROM products WHERE barcode=?", (barcode,)).fetchone()
    conn.close()
    return jsonify(product_to_json(row)), 201


@app.route("/api/products/<int:pid>", methods=["PUT"])
def update_product(pid):
    data = request.get_json(force=True)
    conn = db.get_conn()
    conn.execute(
        """UPDATE products SET name=?, cost_price=?, sell_price=?,
           low_stock_threshold=?, extra_fields_json=? WHERE id=?""",
        (
            data.get("name"),
            float(data.get("cost_price") or 0),
            float(data.get("sell_price") or 0),
            int(data.get("low_stock_threshold") or 0),
            json.dumps(data.get("extra_fields", {})),
            pid,
        ),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM products WHERE id=?", (pid,)).fetchone()
    conn.close()
    return jsonify(product_to_json(row))


@app.route("/api/products/<int:pid>", methods=["DELETE"])
def delete_product(pid):
    conn = db.get_conn()
    conn.execute("DELETE FROM transactions WHERE product_id=?", (pid,))
    conn.execute("DELETE FROM products WHERE id=?", (pid,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# ---------- transactions (purchase / sale / adjustment) ----------

@app.route("/api/transactions", methods=["POST"])
def create_transaction():
    data = request.get_json(force=True)
    product_id = data.get("product_id")
    ttype = data.get("type")
    quantity = int(data.get("quantity") or 0)
    unit_price = float(data.get("unit_price") or 0)
    party = data.get("party", "")
    note = data.get("note", "")

    if ttype not in ("purchase", "sale", "adjustment") or not product_id or quantity <= 0:
        return jsonify({"error": "product_id, valid type, and positive quantity are required"}), 400

    conn = db.get_conn()
    prod = conn.execute("SELECT * FROM products WHERE id=?", (product_id,)).fetchone()
    if not prod:
        conn.close()
        return jsonify({"error": "Product not found"}), 404

    if ttype == "sale" and prod["quantity"] < quantity:
        conn.close()
        return jsonify({"error": f"Not enough stock. Only {prod['quantity']} available."}), 400

    delta = quantity if ttype in ("purchase", "adjustment") else -quantity
    conn.execute("UPDATE products SET quantity = quantity + ? WHERE id=?", (delta, product_id))
    conn.execute(
        """INSERT INTO transactions (product_id, type, quantity, unit_price, party, note, created_at)
           VALUES (?,?,?,?,?,?,?)""",
        (product_id, ttype, quantity, unit_price, party, note, datetime.utcnow().isoformat()),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM products WHERE id=?", (product_id,)).fetchone()
    conn.close()
    return jsonify(product_to_json(row)), 201


@app.route("/api/transactions", methods=["GET"])
def list_transactions():
    product_id = request.args.get("product_id")
    limit = int(request.args.get("limit", 200))
    query = """SELECT t.*, p.name as product_name, p.barcode as product_barcode
               FROM transactions t JOIN products p ON p.id = t.product_id"""
    params = []
    if product_id:
        query += " WHERE t.product_id=?"
        params.append(product_id)
    query += " ORDER BY t.id DESC LIMIT ?"
    params.append(limit)

    conn = db.get_conn()
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return jsonify([row_to_dict(r) for r in rows])


# ---------- dashboard ----------

@app.route("/api/dashboard", methods=["GET"])
def dashboard():
    conn = db.get_conn()
    total_products = conn.execute("SELECT COUNT(*) c FROM products").fetchone()["c"]
    total_units = conn.execute("SELECT COALESCE(SUM(quantity),0) c FROM products").fetchone()["c"]
    stock_value = conn.execute(
        "SELECT COALESCE(SUM(quantity*cost_price),0) v FROM products"
    ).fetchone()["v"]
    low_stock = conn.execute(
        "SELECT * FROM products WHERE quantity <= low_stock_threshold ORDER BY quantity ASC"
    ).fetchall()
    conn.close()
    return jsonify({
        "total_products": total_products,
        "total_units": total_units,
        "stock_value": round(stock_value, 2),
        "low_stock": [product_to_json(r) for r in low_stock],
    })


def local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip


if __name__ == "__main__":
    ip = local_ip()
    print("=" * 60)
    print(" Inventory server starting...")
    print(f" On THIS computer open:      http://localhost:5000")
    print(f" On OTHER office computers:  http://{ip}:5000")
    print("=" * 60)
    app.run(host="0.0.0.0", port=5000, debug=False)
