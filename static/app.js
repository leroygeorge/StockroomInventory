// Stockroom: inventory control for small offices
// Author: Leroy George <georgeleroy.1997@gmail.com>
// MIT License, see LICENSE

// ===================== state =====================
const state = {
  categories: [],
  currentView: "dashboard",
  currentCategoryId: null,
  editingProductId: null,
  txnProductId: null,
  txnType: "purchase",
  labelProduct: null,
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const viewRoot = $("#view-root");

// ===================== api helper =====================
async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

// ===================== boot =====================
async function boot() {
  state.categories = await api("/api/categories");
  renderCategoryNav();
  setView("dashboard");
  wireStaticEvents();
}

function renderCategoryNav() {
  const nav = $("#category-nav");
  nav.innerHTML = "";
  state.categories.forEach((cat) => {
    const btn = document.createElement("button");
    btn.className = "nav-item";
    btn.dataset.view = "category-" + cat.id;
    btn.innerHTML = `<span class="nav-ico">▢</span> ${escapeHtml(cat.name)}`;
    btn.addEventListener("click", () => setView("category-" + cat.id));
    nav.appendChild(btn);
  });
}

function setActiveNav(view) {
  $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
}

// ===================== router =====================
async function setView(view) {
  state.currentView = view;
  setActiveNav(view);

  if (view === "dashboard") return renderDashboard();
  if (view === "scan") return renderScan();
  if (view === "transactions") return renderTransactions();
  if (view === "settings") return renderSettings();
  if (view.startsWith("category-")) {
    state.currentCategoryId = parseInt(view.split("-")[1], 10);
    return renderCategoryView();
  }
}

function setTitle(t) {
  $("#topbar-title").textContent = t;
}

// ===================== dashboard =====================
async function renderDashboard() {
  setTitle("Dashboard");
  viewRoot.innerHTML = "";
  viewRoot.appendChild($("#tpl-dashboard").content.cloneNode(true));

  const d = await api("/api/dashboard");
  $("#stat-products").textContent = d.total_products;
  $("#stat-units").textContent = d.total_units;
  $("#stat-value").textContent = formatMoney(d.stock_value);
  $("#stat-low").textContent = d.low_stock.length;

  const body = $("#low-stock-table tbody");
  body.innerHTML = "";
  if (d.low_stock.length === 0) {
    body.innerHTML = `<tr><td colspan="5" class="empty-state">Nothing low on stock. All good.</td></tr>`;
  }
  d.low_stock.forEach((p) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono">${escapeHtml(p.barcode)}</td>
      <td>${escapeHtml(p.name)}</td>
      <td class="qty-low">${p.quantity}</td>
      <td>${p.low_stock_threshold}</td>
      <td class="row-actions"><button class="icon-btn" data-restock="${p.id}">Restock</button></td>`;
    body.appendChild(tr);
  });
  $$("[data-restock]", body).forEach((b) =>
    b.addEventListener("click", () => openTxnModal(parseInt(b.dataset.restock, 10), "purchase"))
  );
}

// ===================== scan & lookup =====================
function renderScan() {
  setTitle("Scan & Lookup");
  viewRoot.innerHTML = "";
  viewRoot.appendChild($("#tpl-scan").content.cloneNode(true));
  const input = $("#scan-input");
  input.value = "";
  input.focus();

  input.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    const code = input.value.trim();
    input.value = "";
    if (!code) return;
    await lookupBarcode(code);
  });
}

async function lookupBarcode(code) {
  const resultEl = $("#scan-result");
  resultEl.innerHTML = `<div class="scan-not-found">Looking up ${escapeHtml(code)}…</div>`;
  try {
    const p = await api("/api/products/barcode/" + encodeURIComponent(code));
    const cat = state.categories.find((c) => c.id === p.category_id);
    resultEl.innerHTML = `
      <div class="scan-card">
        <div class="scan-card-name">${escapeHtml(p.name)}</div>
        <div class="scan-card-meta">Barcode ${escapeHtml(p.barcode)} · ${cat ? escapeHtml(cat.name) : ""}</div>
        <div class="scan-card-meta">In stock: <strong class="${p.quantity <= p.low_stock_threshold ? "qty-low" : "qty-ok"}">${p.quantity}</strong> · Sell price ${formatMoney(p.sell_price)}</div>
        <div class="scan-card-actions">
          <button class="btn primary" id="scan-sale">Sell 1</button>
          <button class="btn ghost" id="scan-purchase">Restock…</button>
          <button class="btn ghost" id="scan-label">Print label</button>
        </div>
      </div>`;
    $("#scan-sale").addEventListener("click", async () => {
      await api("/api/transactions", {
        method: "POST",
        body: JSON.stringify({ product_id: p.id, type: "sale", quantity: 1, unit_price: p.sell_price }),
      });
      lookupBarcode(code);
    });
    $("#scan-purchase").addEventListener("click", () => openTxnModal(p.id, "purchase"));
    $("#scan-label").addEventListener("click", () => openLabelModal(p));
  } catch (e) {
    resultEl.innerHTML = `<div class="scan-not-found">No product found for "${escapeHtml(code)}".</div>`;
  }
  $("#scan-input").focus();
}

// ===================== transactions log =====================
async function renderTransactions() {
  setTitle("Transaction Log");
  viewRoot.innerHTML = "";
  viewRoot.appendChild($("#tpl-transactions").content.cloneNode(true));
  const rows = await api("/api/transactions");
  const body = $("#transactions-body");
  body.innerHTML = "";
  if (rows.length === 0) body.innerHTML = `<tr><td colspan="8" class="empty-state">No transactions yet.</td></tr>`;
  rows.forEach((t) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${new Date(t.created_at).toLocaleString()}</td>
      <td>${typeBadge(t.type)}</td>
      <td>${escapeHtml(t.product_name)}</td>
      <td class="mono">${escapeHtml(t.product_barcode)}</td>
      <td>${t.quantity}</td>
      <td>${formatMoney(t.unit_price)}</td>
      <td>${escapeHtml(t.party || "")}</td>
      <td>${escapeHtml(t.note || "")}</td>`;
    body.appendChild(tr);
  });
}
function typeBadge(t) {
  const color = t === "purchase" ? "var(--green)" : t === "sale" ? "var(--red)" : "var(--text-dim)";
  return `<span style="color:${color};font-weight:600;text-transform:capitalize">${t}</span>`;
}

// ===================== category (products) view =====================
async function renderCategoryView(search = "") {
  const cat = state.categories.find((c) => c.id === state.currentCategoryId);
  if (!cat) return;
  setTitle(cat.name);
  viewRoot.innerHTML = "";
  viewRoot.appendChild($("#tpl-category").content.cloneNode(true));
  $("#cat-view-title").textContent = cat.name + " — products";
  $("#cat-search").value = search;
  $("#cat-search").addEventListener("input", debounce((e) => renderCategoryProducts(cat, e.target.value), 250));
  $("#btn-add-product").addEventListener("click", () => openProductModal(cat));
  await renderCategoryProducts(cat, search);
}

async function renderCategoryProducts(cat, search) {
  const qs = new URLSearchParams({ category_id: cat.id });
  if (search) qs.set("search", search);
  const products = await api("/api/products?" + qs.toString());
  const body = $("#cat-products-body");
  body.innerHTML = "";
  if (products.length === 0) {
    body.innerHTML = `<tr><td colspan="6" class="empty-state">No products yet in "${escapeHtml(cat.name)}". Add your first one.</td></tr>`;
    return;
  }
  products.forEach((p) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono">${escapeHtml(p.barcode)}</td>
      <td>${escapeHtml(p.name)}</td>
      <td class="${p.quantity <= p.low_stock_threshold ? "qty-low" : "qty-ok"}">${p.quantity}</td>
      <td>${formatMoney(p.cost_price)}</td>
      <td>${formatMoney(p.sell_price)}</td>
      <td class="row-actions">
        <button class="icon-btn" data-buy="${p.id}">+ Purchase</button>
        <button class="icon-btn" data-sell="${p.id}">− Sale</button>
        <button class="icon-btn" data-label="${p.id}">Label</button>
        <button class="icon-btn" data-edit="${p.id}">Edit</button>
        <button class="icon-btn danger" data-del="${p.id}">Delete</button>
      </td>`;
    body.appendChild(tr);
  });
  $$("[data-buy]", body).forEach((b) => b.addEventListener("click", () => openTxnModal(parseInt(b.dataset.buy), "purchase")));
  $$("[data-sell]", body).forEach((b) => b.addEventListener("click", () => openTxnModal(parseInt(b.dataset.sell), "sale")));
  $$("[data-label]", body).forEach((b) =>
    b.addEventListener("click", async () => openLabelModal(products.find((p) => p.id === parseInt(b.dataset.label))))
  );
  $$("[data-edit]", body).forEach((b) =>
    b.addEventListener("click", () => openProductModal(cat, products.find((p) => p.id === parseInt(b.dataset.edit))))
  );
  $$("[data-del]", body).forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Delete this product? This also removes its transaction history.")) return;
      await api("/api/products/" + b.dataset.del, { method: "DELETE" });
      renderCategoryProducts(cat, $("#cat-search").value);
    })
  );
}

// ===================== settings (manage product types) =====================
async function renderSettings() {
  setTitle("Manage Product Types");
  viewRoot.innerHTML = "";
  viewRoot.appendChild($("#tpl-settings").content.cloneNode(true));
  $("#btn-new-category").addEventListener("click", () => openCategoryModal());
  renderSettingsTable();
}

function renderSettingsTable() {
  const body = $("#settings-cat-body");
  body.innerHTML = "";
  state.categories.forEach((cat) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(cat.name)}</td>
      <td class="mono">${escapeHtml(cat.prefix)}</td>
      <td>${cat.fields.map((f) => escapeHtml(f.name)).join(", ") || "—"}</td>
      <td class="row-actions">
        <button class="icon-btn" data-edit-cat="${cat.id}">Edit</button>
        <button class="icon-btn danger" data-del-cat="${cat.id}">Delete</button>
      </td>`;
    body.appendChild(tr);
  });
  $$("[data-edit-cat]", body).forEach((b) =>
    b.addEventListener("click", () => openCategoryModal(state.categories.find((c) => c.id === parseInt(b.dataset.editCat))))
  );
  $$("[data-del-cat]", body).forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Delete this product type?")) return;
      try {
        await api("/api/categories/" + b.dataset.delCat, { method: "DELETE" });
        state.categories = await api("/api/categories");
        renderCategoryNav();
        renderSettingsTable();
      } catch (e) {
        alert(e.message);
      }
    })
  );
}

// ===================== category modal =====================
let fieldRowCount = 0;
function openCategoryModal(cat = null) {
  $("#cat-modal-title").textContent = cat ? "Edit product type" : "New product type";
  $("#cat-name").value = cat ? cat.name : "";
  $("#cat-prefix").value = cat ? cat.prefix : "";
  $("#cat-fields-list").innerHTML = "";
  fieldRowCount = 0;
  (cat ? cat.fields : []).forEach((f) => addFieldRow(f.name, f.type));
  showModal("modal-category");

  $("#cat-save").onclick = async () => {
    const name = $("#cat-name").value.trim();
    const prefix = $("#cat-prefix").value.trim().toUpperCase();
    if (!name || !prefix) return alert("Name and prefix are required.");
    const fields = $$("#cat-fields-list .field-row").map((row) => ({
      name: $(".field-name", row).value.trim(),
      type: $(".field-type", row).value,
    })).filter((f) => f.name);

    try {
      if (cat) {
        await api("/api/categories/" + cat.id, { method: "PUT", body: JSON.stringify({ name, prefix, fields }) });
      } else {
        await api("/api/categories", { method: "POST", body: JSON.stringify({ name, prefix, fields }) });
      }
      state.categories = await api("/api/categories");
      renderCategoryNav();
      hideModal("modal-category");
      if (state.currentView === "settings") renderSettingsTable();
    } catch (e) {
      alert(e.message);
    }
  };
}

function addFieldRow(name = "", type = "text") {
  const list = $("#cat-fields-list");
  const row = document.createElement("div");
  row.className = "field-row";
  row.innerHTML = `
    <input type="text" class="field-name" placeholder="Field name" value="${escapeHtml(name)}">
    <select class="field-type">
      <option value="text" ${type === "text" ? "selected" : ""}>Text</option>
      <option value="number" ${type === "number" ? "selected" : ""}>Number</option>
      <option value="date" ${type === "date" ? "selected" : ""}>Date</option>
    </select>
    <button type="button" class="field-remove">✕</button>`;
  $(".field-remove", row).addEventListener("click", () => row.remove());
  list.appendChild(row);
}

// ===================== product modal =====================
function openProductModal(cat, product = null) {
  state.editingProductId = product ? product.id : null;
  $("#prod-modal-title").textContent = product ? "Edit product" : "Add product to " + cat.name;
  $("#prod-name").value = product ? product.name : "";
  $("#prod-barcode").value = product ? product.barcode : "";
  $("#prod-barcode").disabled = !!product;
  $("#prod-cost").value = product ? product.cost_price : "";
  $("#prod-sell").value = product ? product.sell_price : "";
  $("#prod-qty").value = product ? product.quantity : 0;
  $("#prod-qty").disabled = !!product;
  $("#prod-threshold").value = product ? product.low_stock_threshold : 0;

  const extraWrap = $("#prod-extra-fields");
  extraWrap.innerHTML = "";
  cat.fields.forEach((f) => {
    const val = product && product.extra_fields ? product.extra_fields[f.name] || "" : "";
    const label = document.createElement("label");
    label.innerHTML = `${escapeHtml(f.name)}<input type="${f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}" class="extra-field" data-field="${escapeHtml(f.name)}" value="${escapeHtml(val)}">`;
    extraWrap.appendChild(label);
  });

  showModal("modal-product");

  $("#prod-save").onclick = async () => {
    const name = $("#prod-name").value.trim();
    if (!name) return alert("Name is required.");
    const extra_fields = {};
    $$(".extra-field", extraWrap).forEach((inp) => (extra_fields[inp.dataset.field] = inp.value));

    const payload = {
      category_id: cat.id,
      name,
      barcode: $("#prod-barcode").value.trim(),
      cost_price: parseFloat($("#prod-cost").value || 0),
      sell_price: parseFloat($("#prod-sell").value || 0),
      quantity: parseInt($("#prod-qty").value || 0, 10),
      low_stock_threshold: parseInt($("#prod-threshold").value || 0, 10),
      extra_fields,
    };
    try {
      if (product) {
        await api("/api/products/" + product.id, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await api("/api/products", { method: "POST", body: JSON.stringify(payload) });
      }
      hideModal("modal-product");
      renderCategoryProducts(cat, $("#cat-search") ? $("#cat-search").value : "");
    } catch (e) {
      alert(e.message);
    }
  };
}

// ===================== transaction modal =====================
async function openTxnModal(productId, type) {
  state.txnProductId = productId;
  state.txnType = type;
  const p = await api("/api/products/" + productId);
  $("#txn-product-name").textContent = p.name + " — currently " + p.quantity + " in stock";
  $("#txn-qty").value = 1;
  $("#txn-price").value = type === "sale" ? p.sell_price : p.cost_price;
  $("#txn-party").value = "";
  $("#txn-note").value = "";
  setTxnType(type);
  showModal("modal-txn");

  $("#txn-save").onclick = async () => {
    try {
      await api("/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          product_id: productId,
          type: state.txnType,
          quantity: parseInt($("#txn-qty").value || 0, 10),
          unit_price: parseFloat($("#txn-price").value || 0),
          party: $("#txn-party").value.trim(),
          note: $("#txn-note").value.trim(),
        }),
      });
      hideModal("modal-txn");
      if (state.currentView === "dashboard") renderDashboard();
      else if (state.currentView.startsWith("category-")) renderCategoryProducts(state.categories.find((c) => c.id === state.currentCategoryId), "");
      else if (state.currentView === "scan") { /* refreshed by caller */ }
    } catch (e) {
      alert(e.message);
    }
  };
}
function setTxnType(type) {
  state.txnType = type;
  $$(".toggle-btn").forEach((b) => b.classList.toggle("active", b.dataset.type === type));
  $("#txn-modal-title").textContent = type === "purchase" ? "Purchase (stock in)" : "Sale (stock out)";
}

// ===================== label printing =====================
const LABEL_SIZES = {
  "89x28": { w: 89, h: 28 },
  "57x32": { w: 57, h: 32 },
  "102x59": { w: 102, h: 59 },
  "25x25": { w: 25, h: 25 },
};

function openLabelModal(product) {
  state.labelProduct = product;
  showModal("modal-label");
  renderLabelPreview();
  $("#label-size").onchange = renderLabelPreview;
}

function renderLabelPreview() {
  const p = state.labelProduct;
  const size = LABEL_SIZES[$("#label-size").value];
  const mmToPx = 3.78; // approx screen px per mm for preview only
  const preview = $("#label-preview");
  preview.style.width = size.w * mmToPx + "px";
  preview.style.height = size.h * mmToPx + "px";
  preview.innerHTML = `
    <div style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:12px;text-align:center;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(p.name)}</div>
    <svg id="label-barcode-svg"></svg>
    <div style="font-family:'IBM Plex Mono',monospace;font-size:10px;">${escapeHtml(p.barcode)}</div>`;
  try {
    JsBarcode("#label-barcode-svg", p.barcode, { format: "CODE128", displayValue: false, height: 30, margin: 0 });
  } catch (e) { /* ignore invalid barcode chars */ }
}

function printLabel() {
  const p = state.labelProduct;
  const size = LABEL_SIZES[$("#label-size").value];
  const w = window.open("", "PRINT", "width=400,height=400");
  w.document.write(`
    <html><head><title>Label</title>
    <style>
      @page { size: ${size.w}mm ${size.h}mm; margin: 0; }
      body { margin:0; padding:2mm; font-family: Arial, sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; height:${size.h - 4}mm; }
      .name { font-weight:700; font-size:11pt; text-align:center; width:100%; overflow:hidden; }
      .code { font-family: monospace; font-size:9pt; margin-top:2mm; }
      svg { width:90%; }
    </style></head>
    <body>
      <div class="name">${escapeHtml(p.name)}</div>
      <svg id="bc"></svg>
      <div class="code">${escapeHtml(p.barcode)}</div>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/JsBarcode/3.11.5/JsBarcode.all.min.js"><\/script>
      <script>
        JsBarcode("#bc", ${JSON.stringify(p.barcode).replace(/</g, "\\u003c")}, {format:"CODE128", displayValue:false, height:40, margin:0});
        setTimeout(() => { window.print(); window.close(); }, 300);
      <\/script>
    </body></html>`);
  w.document.close();
}

// ===================== modal plumbing =====================
function showModal(id) {
  $("#modal-backdrop").style.display = "block";
  $("#" + id).style.display = "block";
}
function hideAllModals() {
  $("#modal-backdrop").style.display = "none";
  $$(".modal").forEach((m) => (m.style.display = "none"));
}
function hideModal(id) {
  $("#" + id).style.display = "none";
  $("#modal-backdrop").style.display = "none";
}

// ===================== static wiring =====================
function wireStaticEvents() {
  $$(".nav-item[data-view]").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
  $("#btn-add-category-nav").addEventListener("click", () => openCategoryModal());
  $("#modal-backdrop").addEventListener("click", hideAllModals);

  $("#cat-cancel").addEventListener("click", hideAllModals);
  $("#btn-add-field").addEventListener("click", () => addFieldRow());

  $("#prod-cancel").addEventListener("click", hideAllModals);

  $("#txn-cancel").addEventListener("click", hideAllModals);
  $$(".toggle-btn").forEach((b) => b.addEventListener("click", () => setTxnType(b.dataset.type)));

  $("#label-cancel").addEventListener("click", hideAllModals);
  $("#label-print").addEventListener("click", printLabel);
}

// ===================== utils =====================
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}
function formatMoney(n) {
  return "$" + Number(n || 0).toFixed(2);
}
function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

boot();
