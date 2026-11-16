# Stockroom: Inventory Control

A self-hosted inventory system for small offices and shops: Windows PCs, a USB barcode scanner and a DYMO LabelWriter. One computer runs the server, and every computer on the office network opens it in a browser, so everyone sees the same live stock numbers.

Built with Python (Flask), SQLite and plain JavaScript. No build step, no cloud account, no monthly fee.

> **About the name "SAP"**: this is a standalone system inspired by what SAP's MM (Materials Management) module does for a small business: products, stock levels, purchases and sales. It is not a connector to an SAP installation. Its SQLite data can be exported if you later move to SAP.

## Features

- **Product types as tabs**, each with its own barcode prefix (for example `ELEC` gives `ELEC-000001`) and its own custom fields (brand, warranty, expiry date, size...).
- **Barcode scanning**: scan on the Scan & Lookup page and the product appears instantly, with *Sell 1*, *Restock* and *Print label* buttons. You can also scan an existing manufacturer barcode into a new product.
- **Automatic barcodes** when you leave the field empty.
- **Purchases (stock in)** with supplier and cost, **sales (stock out)** that can never take stock below zero.
- **Dashboard**: number of products, units in stock, stock value at cost and a live low-stock list.
- **Transaction log**: every purchase and sale, newest first.
- **Label printing** on a DYMO LabelWriter 550, with the product name, a Code128 barcode and the code text, in several label sizes.
- **Multi-user on the local network**: one server, any number of browsers.

## Quick start (Windows)

1. Install Python 3.10 or newer from [python.org](https://www.python.org) and tick **"Add python.exe to PATH"**.
2. Download this repository (Code > Download ZIP) and unzip it, for example to `C:\Stockroom`.
3. Double-click **`start_server.bat`**. The first run creates a virtual environment and installs Flask (internet needed once). The window then shows:
   ```
   On THIS computer open:      http://localhost:5000
   On OTHER office computers:  http://192.168.1.23:5000
   ```
   Keep that window open: closing it stops the server for everyone.
4. Right-click **`allow_network_access.bat`** and choose **Run as administrator** (once). This opens port 5000 in the Windows Firewall so the other computers can connect.

On the other computers, open Edge or Chrome at the address shown and bookmark it. Nothing to install.

Tip: give the server PC a fixed IP address (or a DHCP reservation on the router) so the address never changes.

### Other systems

```
python -m venv venv
venv/bin/pip install -r requirements.txt     (Windows: venv\Scripts\pip)
venv/bin/python app.py
```

## Barcode scanner

A USB scanner works like a keyboard that types the code and presses Enter. No drivers or settings are needed: click into the box on **Scan & Lookup** and scan.

## Printing labels on a DYMO LabelWriter 550

1. Install DYMO Connect from dymo.com once, so Windows sees the printer.
2. Click **Label** next to a product, or **Print label** on the Scan page.
3. Pick the label size loaded in the printer.
4. Click **Print**, choose **DYMO LabelWriter 550** in the Windows dialog and confirm.

If a label prints with extra margins, open the printer properties, set the paper size to the label size and turn off "shrink to fit".

The label window loads the JsBarcode library from a CDN, so the computer printing labels needs internet access.

## Setting up product types

Open **Manage product types** in the sidebar and set, for each type:
- **Name**, shown in the sidebar (for example "Electronics" or "Raw Materials")
- **Barcode prefix**, used for automatic codes
- **Custom fields**, added to every product form in that type

Two example types, "General" and "Electronics", are created on first start. Edit or delete them freely.

## Your data

Everything is stored in one file, `inventory.db`, next to `app.py`. It is created automatically on first start.

- **Backup**: copy that file somewhere safe, or schedule a nightly copy to a network drive.
- **Restore**: stop the server, replace the file, start the server again.

`inventory.db` is listed in `.gitignore`, so your stock data never ends up on GitHub.

## Start automatically with Windows (optional)

Task Scheduler > Create Task > Trigger: *At log on* > Action: run `start_server.bat`.

## Security note

Stockroom has **no login**: anyone who can reach the server address can view and change the stock. Use it only on a trusted office network and never expose port 5000 to the internet. Adding user accounts is on the list of ideas below.

## API

The web page talks to a small JSON API, which other tools can use too:

| Method | Path | Purpose |
| --- | --- | --- |
| GET, POST | `/api/categories` | List or create product types |
| PUT, DELETE | `/api/categories/<id>` | Edit or delete a product type |
| GET, POST | `/api/products` | List (filter by type or search) or create products |
| GET, PUT, DELETE | `/api/products/<id>` | Read, edit or delete a product |
| GET | `/api/products/barcode/<code>` | Find a product by barcode |
| GET, POST | `/api/transactions` | Transaction log, or record a purchase or sale |
| GET | `/api/dashboard` | Totals and low-stock list |

## Project structure

```
app.py                      Flask backend: REST API and web page
database.py                 SQLite schema and helpers
templates/index.html        Page layout
static/app.js               All the interface logic (single page app, no build step)
static/style.css            Styling
start_server.bat            Double-click to run the server on Windows
allow_network_access.bat    Run once as administrator to open the firewall
requirements.txt            Python dependencies (just Flask)
```

## Ideas for next versions

- User accounts and roles
- Currency setting (prices are currently shown with a `$` sign)
- CSV import and export of products
- Purchase orders and suppliers list

## Author

**Leroy George**  
Email: georgeleroy.1997@gmail.com  
GitHub: [@leroygeorge](https://github.com/leroygeorge)

## License

[MIT](LICENSE): free to use, change and share, with credit to the author.
