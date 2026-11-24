
// Smart Expiry Prediction System
// Backend: Node.js + Express + SQLite

const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
const path = require('path');
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../dashboard.html')));

// DATABASE
const db = new sqlite3.Database(
  path.join(__dirname, 'inventory.db'),
  (err) => {
    if (err) return console.error(err.message);
    console.log('Smart Expiry Prediction System Database Connected');
  }
);

// TABLES
db.run(`CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  batch TEXT NOT NULL,
  qty INTEGER NOT NULL,
  unit TEXT NOT NULL,
  expiryDate TEXT NOT NULL
)`);

db.run(`CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  productId INTEGER NOT NULL,
  quantitySold INTEGER NOT NULL,
  saleDate TEXT NOT NULL
)`);

db.run(`CREATE TABLE IF NOT EXISTS catalog (
  barcode TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT
)`);

// PRODUCTS

app.get('/api/products', (req, res) => {
  db.all('SELECT * FROM products ORDER BY expiryDate ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/products', (req, res) => {
  const { name, batch, qty, unit, expiryDate, barcode } = req.body;

  if (!name || !batch || qty === undefined || !unit || !expiryDate) {
    return res.status(400).json({ error: 'All product fields are required.' });
  }

  db.run(
    `INSERT INTO products (name, batch, qty, unit, expiryDate)
     VALUES (?, ?, ?, ?, ?)`,
    [name, batch, qty, unit, expiryDate],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });

      const code = barcode ? String(barcode).replace(/\D/g, '') : '';

      if (code.length >= 6 && code.length <= 14) {
        db.run(
          `INSERT INTO catalog (barcode, name, unit)
           VALUES (?, ?, ?)
           ON CONFLICT(barcode) DO UPDATE SET
           name = excluded.name, unit = excluded.unit`,
          [code, name, unit]
        );
      }

      res.status(201).json({
        id: this.lastID, name, batch, qty, unit, expiryDate
      });
    }
  );
});

app.put('/api/products/:id', (req, res) => {
  const { name, batch, qty, unit, expiryDate } = req.body;

  db.run(
    `UPDATE products SET name=?, batch=?, qty=?, unit=?, expiryDate=?
     WHERE id=?`,
    [name, batch, qty, unit, expiryDate, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (!this.changes) return res.status(404).json({ error: 'Product not found.' });
      res.json({ message: 'Product updated successfully.' });
    }
  );
});

app.delete('/api/products/:id', (req, res) => {
  db.run('DELETE FROM products WHERE id=?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (!this.changes) return res.status(404).json({ error: 'Product not found.' });
    res.json({ deleted: true });
  });
});

// BARCODE LOOKUP

app.get('/api/lookup/:barcode', (req, res) => {
  const code = String(req.params.barcode).replace(/\D/g, '');

  if (code.length < 6 || code.length > 14) {
    return res.status(400).json({ found: false });
  }

  db.get('SELECT name, unit FROM catalog WHERE barcode=?', [code], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });

    if (row) {
      return res.json({
        found: true,
        source: 'catalog',
        name: row.name,
        unit: row.unit
      });
    }

    res.json({ found: false });
  });
});

// SALES

app.post('/api/sales', (req, res) => {
  const { productId, quantitySold } = req.body;
  const quantity = Number(quantitySold);

  if (!productId || !Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ error: 'Invalid product or quantity.' });
  }

  db.get('SELECT qty FROM products WHERE id=?', [productId], (err, product) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    if (product.qty < quantity) {
      return res.status(400).json({ error: 'Not enough stock.' });
    }

    const saleDate = new Date().toLocaleDateString('en-CA');

    db.run(
      `INSERT INTO sales (productId, quantitySold, saleDate) VALUES (?, ?, ?)`,
      [productId, quantity, saleDate],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });

        const saleId = this.lastID;

        db.run(
          'UPDATE products SET qty = qty - ? WHERE id = ?',
          [quantity, productId],
          (err) => {
            if (err) return res.status(500).json({ error: err.message });

            res.json({
              message: 'Sale recorded successfully!',
              saleId
            });
          }
        );
      }
    );
  });
});

app.get('/api/sales', (req, res) => {
  db.all(
    `SELECT sales.*, products.name AS productName, products.unit
     FROM sales
     LEFT JOIN products ON sales.productId = products.id
     ORDER BY sales.saleDate DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// SALES ANALYTICS - PRODUCT WISE

// DAILY SALES
app.get('/api/analytics/daily', (req, res) => {
  db.all(
    `SELECT products.name AS label,
            SUM(sales.quantitySold) AS totalQuantity
     FROM sales
     LEFT JOIN products ON sales.productId = products.id
     WHERE date(sales.saleDate) = date('now', 'localtime')
     GROUP BY sales.productId
     ORDER BY products.name`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// WEEKLY SALES - LAST 7 DAYS
app.get('/api/analytics/weekly', (req, res) => {
  db.all(
    `SELECT products.name AS label,
            SUM(sales.quantitySold) AS totalQuantity
     FROM sales
     LEFT JOIN products ON sales.productId = products.id
     WHERE date(sales.saleDate) >= date('now', 'localtime', '-6 days')
       AND date(sales.saleDate) <= date('now', 'localtime')
     GROUP BY sales.productId
     ORDER BY products.name`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// MONTHLY SALES - CURRENT MONTH
app.get('/api/analytics/monthly', (req, res) => {
  db.all(
    `SELECT products.name AS label,
            SUM(sales.quantitySold) AS totalQuantity
     FROM sales
     LEFT JOIN products ON sales.productId = products.id
     WHERE strftime('%Y-%m', sales.saleDate) =
           strftime('%Y-%m', 'now', 'localtime')
     GROUP BY sales.productId
     ORDER BY products.name`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// PDF REPORT HELPER

function createPDF(res, title, columns, rows) {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${title.replace(/\s+/g, '-')}.pdf"`
  );

  doc.pipe(res);

  doc.fontSize(18).text('Smart Expiry Prediction System', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(14).text(title, { align: 'center' });
  doc.moveDown();
  doc.fontSize(9).text('Generated on: ' + new Date().toLocaleString('en-IN'));
  doc.moveDown();

  if (!rows.length) {
    doc.fontSize(11).text('No records available.');
  } else {
    rows.forEach((row, index) => {
      if (doc.y > 730) doc.addPage();

      doc.fontSize(10).text(
        `${index + 1}. ${columns.map(col => `${col}: ${row[col] ?? '-'}`).join(' | ')}`
      );
      doc.moveDown(0.5);
    });
  }

  doc.end();
}

// STOCK REPORT
app.get('/api/reports/stock', (req, res) => {
  db.all(
    'SELECT id, name, batch, qty, unit, expiryDate FROM products ORDER BY name',
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      createPDF(res, 'Stock Report', ['id', 'name', 'batch', 'qty', 'unit', 'expiryDate'], rows);
    }
  );
});

// EXPIRED PRODUCTS REPORT
app.get('/api/reports/expired', (req, res) => {
  const today = new Date().toLocaleDateString('en-CA');

  db.all(
    `SELECT id, name, batch, qty, unit, expiryDate
     FROM products
     WHERE date(expiryDate) < date(?)
     ORDER BY expiryDate`,
    [today],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      createPDF(res, 'Expired Products Report', ['id', 'name', 'batch', 'qty', 'unit', 'expiryDate'], rows);
    }
  );
});

// SALES REPORT
app.get('/api/reports/sales', (req, res) => {
  db.all(
    `SELECT sales.id,
            products.name AS productName,
            sales.quantitySold,
            products.unit,
            sales.saleDate
     FROM sales
     LEFT JOIN products ON sales.productId = products.id
     ORDER BY sales.saleDate DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      createPDF(res, 'Sales Report', ['id', 'productName', 'quantitySold', 'unit', 'saleDate'], rows);
    }
  );
});

// SERVER

app.listen(PORT, () => {
  console.log(`Smart Expiry Prediction System running at http://localhost:${PORT}`);
});
