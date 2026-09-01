const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Data directory and JSON log file
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'access_log.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, '[]', 'utf8');
}

// Helper: read all logs
function readLogs() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// Helper: write all logs
function writeLogs(logs) {
  fs.writeFileSync(DB_FILE, JSON.stringify(logs, null, 2), 'utf8');
}

// Keep a counter for incremental IDs
let idCounter = readLogs().reduce((max, l) => Math.max(max, l.id || 0), 0);

// ==================== API ENDPOINTS ====================

// POST /api/log - receive device data from frontend
app.post('/api/log', (req, res) => {
  try {
    const data = req.body || {};
    const entry = {
      id: ++idCounter,
      receivedAt: new Date().toISOString(),
      ...data,
      serverIp: req.ip || req.connection?.remoteAddress,
    };
    const logs = readLogs();
    logs.push(entry);
    writeLogs(logs);
    res.json({ ok: true, id: entry.id });
  } catch (e) {
    console.error('POST /api/log error:', e);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// GET /api/logs - return all logs for admin dashboard
app.get('/api/logs', (req, res) => {
  try {
    const logs = readLogs();
    res.json(logs);
  } catch (e) {
    console.error('GET /api/logs error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/export - export all logs as CSV
app.get('/api/export', (req, res) => {
  try {
    const logs = readLogs();
    // Define CSV columns
    const columns = [
      'id', 'receivedAt', 'timestamp',
      'browserName', 'browserVersion', 'browserEngine',
      'osName', 'osVersion',
      'deviceType', 'deviceVendor', 'deviceModel',
      'screenResolution', 'viewportSize', 'cpuCores', 'deviceMemory', 'language',
      'ip', 'isp', 'asn',
      'geoLat', 'geoLng', 'geoAccuracy', 'geoCity', 'geoRegion', 'geoCountry', 'geoSource',
      'connType', 'connEffectiveType', 'connDownlink', 'connRtt',
      'userAgent'
    ];

    const escape = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      // Escape double quotes and wrap if contains comma, quote, or newline
      if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    };

    const rows = logs.map(l => columns.map(col => {
      // Handle nested geo and connection
      if (col.startsWith('geo') && l.geo) {
        return escape(l.geo[col.replace('geo', '').charAt(0).toLowerCase() + col.slice(4)]);
      }
      if (col.startsWith('conn') && l.connection) {
        return escape(l.connection[col.replace('conn', '').charAt(0).toLowerCase() + col.slice(5)]);
      }
      return escape(l[col]);
    }).join(','));

    const csv = [columns.join(',')].concat(rows).join('\r\n');
    // Add UTF-8 BOM for Excel compatibility
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="access_log_${Date.now()}.csv"`);
    res.send('\uFEFF' + csv);
  } catch (e) {
    console.error('GET /api/export error:', e);
    res.status(500).send('Export error');
  }
});

// ==================== STATIC FILES ====================

// Serve ua-parser.min.js under /vendor/
app.use('/vendor', express.static(path.join(__dirname, 'node_modules/ua-parser-js/dist')));

// Serve public folder (index.html, admin.html)
app.use(express.static(path.join(__dirname, 'public')));

// ==================== START SERVER ====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✅  Server running at http://localhost:${PORT}`);
  console.log(`   Frontend (data collector): http://localhost:${PORT}/`);
  console.log(`   Admin dashboard:           http://localhost:${PORT}/admin.html`);
  console.log(`   Export CSV:                http://localhost:${PORT}/api/export`);
  console.log(`   Data stored in:            ${DB_FILE}\n`);
});