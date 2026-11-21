// StockWatch backend — REST API + SQLite database
// Run with: npm install, then npm start
// Server runs at http://localhost:3000

const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());          // allows the frontend HTML pages to call this API
app.use(express.json());  // parses JSON request bodies

// ---- Database setup ----
// This creates a file called inventory.db in the same folder (first run only).
const db = new sqlite3.Database(path.join(__dirname, 'inventory.db'), (err) => {
  if (err) return console.error('Database connection error:', err.message);
  console.log('Connected to SQLite database (inventory.db)');
});

db.run(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    batch TEXT NOT NULL,
    qty INTEGER NOT NULL,
    unit TEXT NOT NULL,
    expiryDate TEXT NOT NULL
  )
`);
db.run(`
  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    productId INTEGER NOT NULL,
    quantitySold INTEGER NOT NULL,
    saleDate TEXT NOT NULL
  )
`);

// ---- Routes ----

// GET all products, nearest expiry first
app.get('/api/products', (req, res) => {
  db.all('SELECT * FROM products ORDER BY expiryDate ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// POST a new product
app.post('/api/products', (req, res) => {
  const { name, batch, qty, unit, expiryDate } = req.body;
  if (!name || !batch || !qty || !unit || !expiryDate) {
    return res.status(400).json({ error: 'All fields (name, batch, qty, unit, expiryDate) are required.' });
  }
  db.run(
    `INSERT INTO products (name, batch, qty, unit, expiryDate) VALUES (?, ?, ?, ?, ?)`,
    [name, batch, qty, unit, expiryDate],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID, name, batch, qty, unit, expiryDate });
    }
  );
});

// PUT — update an existing product by id
app.put('/api/products/:id', (req, res) => {
  const { name, batch, qty, unit, expiryDate } = req.body;
  db.run(
    `UPDATE products SET name = ?, batch = ?, qty = ?, unit = ?, expiryDate = ? WHERE id = ?`,
    [name, batch, qty, unit, expiryDate, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Product not found.' });
      res.json({ id: Number(req.params.id), name, batch, qty, unit, expiryDate });
    }
  );
});

// DELETE a product by id
app.delete('/api/products/:id', (req, res) => {
  db.run(`DELETE FROM products WHERE id = ?`, [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Product not found.' });
    res.json({ deleted: true, id: Number(req.params.id) });
  });
  // POST a new sale
app.post('/api/sales', (req, res) => {
  const { productId, quantitySold } = req.body;

  if (!productId || !quantitySold || quantitySold <= 0) {
    return res.status(400).json({
      error: 'Invalid product or quantity'
    });
  }

  db.get(
    'SELECT qty FROM products WHERE id = ?',
    [productId],
    (err, product) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }

      if (product.qty < quantitySold) {
        return res.status(400).json({ error: 'Not enough stock' });
      }

      const saleDate = new Date().toISOString().slice(0, 10);

      db.run(
        'INSERT INTO sales (productId, quantitySold, saleDate) VALUES (?, ?, ?)',
        [productId, quantitySold, saleDate],
        function (err) {
          if (err) {
            return res.status(500).json({ error: err.message });
          }

          db.run(
            'UPDATE products SET qty = qty - ? WHERE id = ?',
            [quantitySold, productId],
            function (err) {
              if (err) {
                return res.status(500).json({ error: err.message });
              }

              res.json({ message: 'Sale recorded successfully!' });
            }
          );
        }
      );
    }
  );
});
});

app.listen(PORT, () => {
  console.log(`StockWatch backend running at http://localhost:${PORT}`);
});
