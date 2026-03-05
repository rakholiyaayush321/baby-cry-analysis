// ═══════════════════════════════════════════════════════════════
//  NeuroCry AI  —  Node.js / Express / MongoDB Backend
//  Port: 3001
// ═══════════════════════════════════════════════════════════════

const express    = require('express');
const mongoose   = require('mongoose');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const cors       = require('cors');
const multer     = require('multer');
const path       = require('path');
const fs         = require('fs');

const app  = express();
const PORT = 3001;
const JWT_SECRET  = 'neurocry-ai-jwt-secret-2026-secure';
const MONGO_URI   = process.env.MONGO_URI || 'mongodb://localhost:27017/neurocry';

// ── Middleware ─────────────────────────────────────────────────
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
fs.mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });

const FRONTEND = path.join(__dirname, '../frontend');
app.use('/static', express.static(FRONTEND));
app.use(express.static(FRONTEND));

// ── In-Memory DB for Demo Mode ─────────────────────────────────
let dbConnected = false;
const DB_FILE = path.join(__dirname, 'demo_db.json');
let DEMO_DB = { users: [], patients: [], analyses: [] };
if (fs.existsSync(DB_FILE)) {
  try { DEMO_DB = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch(e) { console.warn('Could not read demo_db.json, starting fresh.'); }
}
function saveDemoDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(DEMO_DB, null, 2), 'utf8');
}

function genId() { return Math.random().toString(36).substring(2, 10); }

// ── Mongoose Models ────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});
const patientSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  name: { type: String, required: true },
  gender: String, ageWeeks: Number, weight: Number, parentName: String,
  contactNumber: String, medicalNotes: String, createdAt: { type: Date, default: Date.now }
});
const analysisSchema = new mongoose.Schema({
  patientId: { type: String, required: true },
  cryType: { type: String, required: true },
  confidence: { type: Number, required: true },
  riskLevel: { type: String, default: 'Low' },
  status: { type: String, default: 'Normal' },
  recommendation: String, mediaType: { type: String, default: 'upload' },
  timestamp: { type: Date, default: Date.now }
});
const User     = mongoose.model('User', userSchema);
const Patient  = mongoose.model('Patient', patientSchema);
const Analysis = mongoose.model('Analysis', analysisSchema);

// ── Auth Middleware ────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Not authenticated.' });
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    req.userName = decoded.name;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

// ── AI Cry Analysis Engine (Simulation) ───────────────────────
const CRY_DATA = {
  'Hungry':            { weight: 28, risk: 'Low',    recommendation: 'Feed the infant within the next few minutes. Monitor feeding amount carefully.' },
  'Sleepy':            { weight: 22, risk: 'Low',    recommendation: 'Create a calm, dark environment. Begin sleep routine immediately.' },
  'Belly Pain':        { weight: 14, risk: 'Medium', recommendation: 'Gently massage belly clockwise. Try feeding positions. Monitor for colic signs.' },
  'Pain Cry':          { weight: 12, risk: 'High',   recommendation: 'Check for physical discomfort. Assess temperature, diaper, and visible issues. Consult doctor if persistent.' },
  'Irritated':         { weight: 10, risk: 'Low',    recommendation: 'Check diaper, room temperature, and feeding schedule. Swaddle and comfort the infant.' },
  'Breathing Problem': { weight: 6,  risk: 'High',   recommendation: 'URGENT: Monitor breathing closely. Ensure airway is clear. Seek immediate medical attention if irregularities continue.' },
  'Burp Need':         { weight: 8,  risk: 'Low',    recommendation: 'Hold infant upright and gently pat back until burp is released.' }
};

function simulateCryAnalysis() {
  const types = Object.keys(CRY_DATA);
  const weights = types.map(t => CRY_DATA[t].weight);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let rand = Math.random() * totalWeight;
  let cryType = types[0];
  for (let i = 0; i < types.length; i++) {
    rand -= weights[i];
    if (rand <= 0) { cryType = types[i]; break; }
  }
  const { risk, recommendation } = CRY_DATA[cryType];
  return { cryType, confidence: Math.round(68 + Math.random() * 30), riskLevel: risk, status: risk === 'High' ? 'Critical' : risk === 'Medium' ? 'Warning' : 'Normal', recommendation };
}

const upload = multer({ dest: path.join(__dirname, 'uploads'), limits: { fileSize: 100 * 1024 * 1024 } });

// ═══════════════════════════════════════════════════════════════
//  ROUTES
// ═══════════════════════════════════════════════════════════════

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name?.trim() || !email?.trim() || !password || password.length < 6) return res.status(400).json({ error: 'Invalid input data' });
    const emailLow = email.toLowerCase();

    let exists = dbConnected ? await User.findOne({ email: emailLow }) : DEMO_DB.users.find(u => u.email === emailLow);
    if (exists) return res.status(400).json({ error: 'Email already registered. Please login.' });

    const hashed = await bcrypt.hash(password, 12);
    if (dbConnected) {
      await User.create({ name: name.trim(), email: emailLow, password: hashed });
    } else {
      DEMO_DB.users.push({ _id: genId(), name: name.trim(), email: emailLow, password: hashed });
      saveDemoDB();
    }
    res.status(201).json({ message: 'Registration successful!' });
  } catch (err) { res.status(500).json({ error: 'Registration failed: ' + err.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const emailLow = email.toLowerCase();

    let user = dbConnected ? await User.findOne({ email: emailLow }) : DEMO_DB.users.find(u => u.email === emailLow);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign({ userId: user._id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ access_token: token, token_type: 'bearer', user: { name: user.name, email: user.email } });
  } catch (err) { res.status(500).json({ error: 'Login failed: ' + err.message }); }
});

app.get('/api/dashboard', authMiddleware, async (req, res) => {
  try {
    let patients = dbConnected ? await Patient.find({ userId: req.userId }) : DEMO_DB.patients.filter(p => p.userId === req.userId);
    let pIds = patients.map(p => p._id.toString());
    let analyses = dbConnected ? await Analysis.find({ patientId: { $in: pIds } }) : DEMO_DB.analyses.filter(a => pIds.includes(a.patientId));

    const cryDist = {};
    analyses.forEach(a => { cryDist[a.cryType] = (cryDist[a.cryType] || 0) + 1; });

    const recentData = [];
    for (const p of patients.slice().reverse().slice(0, 8)) {
      let pAnalyses = analyses.filter(a => a.patientId.toString() === p._id.toString()).sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
      let lastA = pAnalyses[0];
      recentData.push({
        id: p._id, name: p.name, age_weeks: p.ageWeeks, weight: p.weight, parent_name: p.parentName,
        analysis_count: pAnalyses.length,
        last_cry_type: lastA?.cryType || '—', last_risk_level: lastA?.riskLevel || 'Low', last_analysis: lastA?.timestamp || null,
        created_at: p.createdAt
      });
    }

    res.json({
      total_patients: patients.length, total_analyses: analyses.length,
      risk_alerts: analyses.filter(a => a.riskLevel === 'High').length,
      cry_distribution: cryDist, recent_patients: recentData
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/backup', authMiddleware, async (req, res) => {
  try {
    let patients = dbConnected ? await Patient.find({ userId: req.userId }) : DEMO_DB.patients.filter(p => p.userId === req.userId);
    let pIds = patients.map(p => p._id.toString());
    let analyses = dbConnected ? await Analysis.find({ patientId: { $in: pIds } }) : DEMO_DB.analyses.filter(a => pIds.includes(a.patientId));

    const backupData = {
      exportDate: new Date().toISOString(),
      user: req.userName,
      stats: {
        totalPatients: patients.length,
        totalAnalyses: analyses.length
      },
      patients: patients.map(p => {
        let pAns = analyses.filter(a => a.patientId.toString() === p._id.toString());
        return {
          id: p._id,
          name: p.name,
          gender: p.gender,
          ageWeeks: p.ageWeeks,
          weight: p.weight,
          parentName: p.parentName,
          contactNumber: p.contactNumber,
          medicalNotes: p.medicalNotes,
          createdAt: p.createdAt,
          analyses: pAns.map(a => ({
            id: a._id,
            cryType: a.cryType,
            confidence: a.confidence,
            riskLevel: a.riskLevel,
            recommendation: a.recommendation,
            mediaType: a.mediaType,
            timestamp: a.timestamp
          }))
        };
      })
    };

    res.setHeader('Content-disposition', `attachment; filename=neurocry-backup-${Date.now()}.json`);
    res.setHeader('Content-type', 'application/json');
    res.send(JSON.stringify(backupData, null, 2));
  } catch (err) { res.status(500).json({ error: 'Backup failed: ' + err.message }); }
});

app.get('/api/patients', authMiddleware, async (req, res) => {
  try {
    let patients = dbConnected ? await Patient.find({ userId: req.userId }).sort({ createdAt: -1 }) : DEMO_DB.patients.filter(p => p.userId === req.userId).reverse();
    let analyses = dbConnected ? await Analysis.find() : DEMO_DB.analyses;
    
    const result = patients.map(p => {
      let pAnalyses = analyses.filter(a => a.patientId.toString() === p._id.toString()).sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
      let lastA = pAnalyses[0];
      return {
        id: p._id, name: p.name, gender: p.gender, age_weeks: p.ageWeeks, weight: p.weight,
        parent_name: p.parentName, contact_number: p.contactNumber, medical_notes: p.medicalNotes,
        analysis_count: pAnalyses.length,
        last_cry_type: lastA?.cryType || '—', last_risk_level: lastA?.riskLevel || 'Low', last_analysis: lastA?.timestamp || null,
        created_at: p.createdAt
      };
    });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/patients/:id', authMiddleware, async (req, res) => {
  try {
    let p = dbConnected ? await Patient.findOne({ _id: req.params.id, userId: req.userId }) : DEMO_DB.patients.find(x => x._id.toString() === req.params.id && x.userId === req.userId);
    if (!p) return res.status(404).json({ error: 'Patient not found' });
    
    let pAnalyses = dbConnected ? await Analysis.find({ patientId: p._id }).sort({ timestamp: -1 }) : DEMO_DB.analyses.filter(a => a.patientId.toString() === p._id.toString()).sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    res.json({
      id: p._id, name: p.name, gender: p.gender, age_weeks: p.ageWeeks, weight: p.weight,
      parent_name: p.parentName, contact_number: p.contactNumber, medical_notes: p.medicalNotes, created_at: p.createdAt,
      analyses: pAnalyses.map(a => ({
        id: a._id, cry_type: a.cryType, confidence: a.confidence, risk_level: a.riskLevel,
        status: a.status, recommendation: a.recommendation, media_type: a.mediaType, date: a.timestamp
      }))
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/patients', authMiddleware, async (req, res) => {
  try {
    const { name, gender, ageWeeks, weight, parentName, contactNumber, medicalNotes } = req.body;
    if (!name) return res.status(400).json({ error: 'Patient name is required' });
    let id = genId();
    if (dbConnected) {
      const p = await Patient.create({ userId: req.userId, name, gender, ageWeeks: Number(ageWeeks), weight: Number(weight), parentName, contactNumber, medicalNotes });
      id = p._id;
    } else {
      DEMO_DB.patients.push({ _id: id, userId: req.userId, name, gender, ageWeeks: Number(ageWeeks), weight: Number(weight), parentName, contactNumber, medicalNotes, createdAt: new Date() });
      saveDemoDB();
    }
    res.status(201).json({ id, message: 'Patient created successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/patients/:id', authMiddleware, async (req, res) => {
  try {
    if (dbConnected) {
      await Patient.deleteOne({ _id: req.params.id, userId: req.userId });
      await Analysis.deleteMany({ patientId: req.params.id });
    } else {
      DEMO_DB.patients = DEMO_DB.patients.filter(p => !(p._id.toString() === req.params.id && p.userId === req.userId));
      DEMO_DB.analyses = DEMO_DB.analyses.filter(a => a.patientId.toString() !== req.params.id);
      saveDemoDB();
    }
    res.json({ message: 'Patient deleted successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/analyze', authMiddleware, upload.single('file'), async (req, res) => {
  if (req.file) { try { fs.unlinkSync(req.file.path); } catch (_) {} }
  await new Promise(r => setTimeout(r, 800 + Math.random() * 1200));
  res.json(simulateCryAnalysis());
});

app.post('/api/analyses', authMiddleware, async (req, res) => {
  try {
    let id = genId();
    const data = { patientId: req.body.patientId, cryType: req.body.cryType, confidence: req.body.confidence, riskLevel: req.body.riskLevel, status: req.body.status, recommendation: req.body.recommendation, mediaType: req.body.mediaType || 'upload' };
    if (dbConnected) {
      const a = await Analysis.create(data);
      id = a._id;
    } else {
      DEMO_DB.analyses.push({ _id: id, ...data, timestamp: new Date() });
      saveDemoDB();
    }
    res.status(201).json({ id, message: 'Analysis saved' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/analyses/:patientId', authMiddleware, async (req, res) => {
  try {
    let analyses = dbConnected ? await Analysis.find({ patientId: req.params.patientId }).sort({ timestamp: -1 }) : DEMO_DB.analyses.filter(a => a.patientId === req.params.patientId).sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json(analyses.map(a => ({ id: a._id, cry_type: a.cryType, confidence: a.confidence, risk_level: a.riskLevel, status: a.status, recommendation: a.recommendation, media_type: a.mediaType, date: a.timestamp })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/patient/onboarding', authMiddleware, async (req, res) => {
  try {
    const { name, gender, ageWeeks, weight, parentName, contactNumber, medicalNotes, cryType, confidence, riskLevel, status, recommendation, mediaType } = req.body;
    if (!name) return res.status(400).json({ error: 'Patient name is required' });
    
    let pId = genId(), aId = genId();
    if (dbConnected) {
      const p = await Patient.create({ userId: req.userId, name, gender, ageWeeks: Number(ageWeeks), weight: Number(weight), parentName, contactNumber, medicalNotes });
      const a = await Analysis.create({ patientId: p._id.toString(), cryType, confidence, riskLevel, status, recommendation, mediaType });
      pId = p._id; aId = a._id;
    } else {
      DEMO_DB.patients.push({ _id: pId, userId: req.userId, name, gender, ageWeeks: Number(ageWeeks), weight: Number(weight), parentName, contactNumber, medicalNotes, createdAt: new Date() });
      if (cryType) DEMO_DB.analyses.push({ _id: aId, patientId: pId, cryType, confidence, riskLevel, status, recommendation, mediaType, timestamp: new Date() });
      saveDemoDB();
    }
    res.status(201).json({ patientId: pId, analysisId: aId, message: 'Patient onboarding completed successfully!' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/health', (req, res) => res.json({ status: 'online', system: 'NeuroCry AI', mode: dbConnected ? 'MongoDB' : 'Demo Memory DB' }));
app.get(/^\/(?!api).*/, (req, res) => {
  const p = path.basename(req.path) || 'index.html';
  const f = path.join(FRONTEND, p.includes('.html') ? p : 'index.html');
  res.sendFile(fs.existsSync(f) ? f : path.join(FRONTEND, 'index.html'));
});

// ═══════════════════════════════════════════════════════════════
//  Connect MongoDB → Start Server
// ═══════════════════════════════════════════════════════════════
mongoose.set('bufferCommands', false); // Fail fast if DB not connected

mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 2000 })
  .then(() => { dbConnected = true; console.log('✅ MongoDB connected'); startServer(); })
  .catch(err => {
    dbConnected = false;
    console.log('⚠️  MongoDB not available:', err.message);
    console.log('🔄 Starting in DEMO mode (In-Memory DB active)...');
    startServer();
  });

function startServer() {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n║ 🚀 http://localhost:${PORT} | ${dbConnected ? '🟢 MongoDB' : '🟡 Demo Mode'}\n`);
  });
}
