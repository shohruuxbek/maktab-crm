'use strict';
// Maktab CRM backend: Node.js (tashqi kutubxonalarsiz), ma'lumotlar data/db.json faylida saqlanadi.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');

const PORT = +process.env.PORT || 3000;
const ADMIN_LOGIN = process.env.ADMIN_LOGIN || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'admin123';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PUB = path.join(__dirname, 'public');

/* ---------- ma'lumotlar ---------- */
const emptyDb = () => ({ secret: crypto.randomBytes(32).toString('hex'), teachers: [], students: [], books: [], groups: [], att: {}, hw: [], fin: [] });
let db;
try { db = Object.assign(emptyDb(), JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))); } catch (e) { db = emptyDb(); }
function persist() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
}
persist();

/* ---------- yordamchilar ---------- */
const ID = /^[A-Za-z0-9_-]{1,40}$/, DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (x, n = 200) => (typeof x === 'string' ? x.slice(0, n) : '');
const arr = x => (Array.isArray(x) ? x.slice(0, 20000) : []);
const sha = s => crypto.createHash('sha256').update(String(s)).digest();
const safeEq = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
function cleanList(a, fn) {
  const out = [], ids = new Set();
  for (const x of arr(a)) {
    if (!x || typeof x !== 'object') continue;
    const r = fn(x);
    if (!r || !ID.test(r.id) || ids.has(r.id)) continue;
    ids.add(r.id); out.push(r);
  }
  return out;
}
const mark = v => (v === 'p' || v === 'l' || v === 'a' ? v : null);

/* ---------- token (HMAC bilan imzolangan) ---------- */
const hmac = body => crypto.createHmac('sha256', db.secret).update(body).digest('base64url');
const sign = p => { const b = Buffer.from(JSON.stringify(p)).toString('base64url'); return b + '.' + hmac(b); };
function verify(tok) {
  if (typeof tok !== 'string') return null;
  const [b, s] = tok.split('.');
  if (!b || !s || !safeEq(s, hmac(b))) return null;
  try { const p = JSON.parse(Buffer.from(b, 'base64url').toString()); return p.exp > Date.now() ? p : null; } catch (e) { return null; }
}
function authUser(req) {
  const h = req.headers.authorization || '';
  const p = verify(h.startsWith('Bearer ') ? h.slice(7) : '');
  if (!p) return null;
  if (p.role === 'admin') return { role: 'admin', name: 'Super admin' };
  const x = (p.role === 'teacher' ? db.teachers : db.students).find(a => a.id === p.id);
  return x ? { role: p.role, id: x.id, name: x.name } : null;
}
const fails = new Map();
const limited = ip => { const f = fails.get(ip); return !!f && f.n >= 10 && Date.now() - f.t < 60000; };
const failed = ip => { const f = fails.get(ip) || { n: 0, t: 0 }; if (Date.now() - f.t > 60000) f.n = 0; f.n++; f.t = Date.now(); fails.set(ip, f); };

/* ---------- rolga qarab ma'lumot berish ---------- */
function view(u) {
  if (u.role === 'admin') return { teachers: db.teachers, students: db.students, books: db.books, groups: db.groups, att: db.att, hw: db.hw, fin: db.fin };
  if (u.role === 'teacher') {
    const me = u.id;
    const students = db.students.filter(s => s.teacherId === me).map(s => ({ id: s.id, name: s.name, phone: s.phone, teacherId: me }));
    const groups = db.groups.filter(g => g.teacherId === me), gid = new Set(groups.map(g => g.id));
    const att = {};
    for (const k of Object.keys(db.att)) if (gid.has(k.split('|')[0])) att[k] = db.att[k];
    return { teachers: [{ id: me, name: u.name }], students, books: db.books, groups, att, hw: db.hw.filter(h => gid.has(h.groupId)), fin: [] };
  }
  const me = u.id, self = db.students.find(s => s.id === me);
  const groups = db.groups.filter(g => g.studentIds.includes(me)).map(g => ({ id: g.id, name: g.name, teacherId: g.teacherId, studentIds: [me] }));
  const gid = new Set(groups.map(g => g.id)), att = {};
  for (const k of Object.keys(db.att)) {
    if (!gid.has(k.split('|')[0])) continue;
    const r = db.att[k][me];
    if (r) att[k] = { [me]: r };
  }
  const hw = db.hw.filter(h => gid.has(h.groupId)).map(h => ({ ...h, done: h.done[me] ? { [me]: h.done[me] } : {} }));
  const teachers = db.teachers.filter(t => groups.some(g => g.teacherId === t.id)).map(t => ({ id: t.id, name: t.name }));
  return { teachers, students: [{ id: me, name: self ? self.name : '' }], books: db.books, groups, att, hw, fin: [] };
}

/* ---------- saqlash: super admin ---------- */
function applyAdmin(b) {
  const teachers = cleanList(b.teachers, x => ({ id: str(x.id, 40), name: str(x.name), login: str(x.login, 60), pass: str(x.pass, 100) }));
  const tids = new Set(teachers.map(t => t.id));
  const students = cleanList(b.students, x => ({ id: str(x.id, 40), name: str(x.name), phone: str(x.phone, 40), login: str(x.login, 60), pass: str(x.pass, 100), teacherId: tids.has(x.teacherId) ? x.teacherId : '' }));
  const seen = new Set([ADMIN_LOGIN]);
  for (const x of [...teachers, ...students]) {
    if (!x.login) continue;
    if (seen.has(x.login)) return 'duplicate login';
    seen.add(x.login);
  }
  const sids = new Set(students.map(s => s.id));
  const groups = cleanList(b.groups, x => ({ id: str(x.id, 40), name: str(x.name), teacherId: tids.has(x.teacherId) ? x.teacherId : '', studentIds: arr(x.studentIds).filter(i => sids.has(i)) }));
  const books = cleanList(b.books, x => ({ id: str(x.id, 40), title: str(x.title), author: str(x.author) }));
  const fin = cleanList(b.fin, x => {
    const amount = Math.round(+x.amount);
    if (!sids.has(x.studentId) || !(amount > 0) || amount > 1e12) return null;
    return { id: str(x.id, 40), studentId: x.studentId, type: x.type === 'pay' ? 'pay' : 'debt', amount, date: DATE.test(x.date) ? x.date : '', note: str(x.note, 300), method: str(x.method, 20) };
  });
  db.teachers = teachers; db.students = students; db.groups = groups; db.books = books; db.fin = fin;
  // davomat va uyga vazifa ustozlarniki: faqat o'chirilgan guruhlar bilan bog'liqlarini tozalaymiz
  const gset = new Set(groups.map(g => g.id));
  for (const k of Object.keys(db.att)) if (!gset.has(k.split('|')[0])) delete db.att[k];
  db.hw = db.hw.filter(h => gset.has(h.groupId));
  return null;
}

/* ---------- saqlash: ustoz (faqat o'z guruhi, davomati, uyga vazifasi) ---------- */
function applyTeacher(me, b) {
  const mine = new Set(db.students.filter(s => s.teacherId === me).map(s => s.id));
  const taken = new Set(db.groups.filter(g => g.teacherId !== me).map(g => g.id));
  const groups = cleanList(b.groups, x => ({ id: str(x.id, 40), name: str(x.name), teacherId: me, studentIds: arr(x.studentIds).filter(i => mine.has(i)) })).filter(g => !taken.has(g.id));
  db.groups = db.groups.filter(g => g.teacherId !== me).concat(groups);
  const gmap = new Map(groups.map(g => [g.id, g])), all = new Set(db.groups.map(g => g.id));
  for (const k of Object.keys(db.att)) {
    const gid = k.split('|')[0];
    if (!all.has(gid) || gmap.has(gid)) delete db.att[k];
  }
  const att = b.att && typeof b.att === 'object' ? b.att : {};
  for (const k of Object.keys(att)) {
    const [gid, date] = k.split('|'), g = gmap.get(gid);
    if (!g || !DATE.test(date || '') || !att[k] || typeof att[k] !== 'object') continue;
    const rec = {};
    for (const sid of Object.keys(att[k])) { const m = mark(att[k][sid]); if (m && g.studentIds.includes(sid)) rec[sid] = m; }
    if (Object.keys(rec).length) db.att[gid + '|' + date] = rec;
  }
  const rest = db.hw.filter(h => h.teacherId !== me && all.has(h.groupId)), used = new Set(rest.map(h => h.id));
  const mineHw = cleanList(b.hw, x => {
    const g = gmap.get(x.groupId);
    if (!g) return null;
    const done = {};
    if (x.done && typeof x.done === 'object') for (const sid of Object.keys(x.done)) { const m = mark(x.done[sid]); if (m && m !== 'l' && g.studentIds.includes(sid)) done[sid] = m; }
    return { id: str(x.id, 40), groupId: g.id, teacherId: me, title: str(x.title), text: str(x.text, 5000), due: DATE.test(x.due) ? x.due : '', created: str(x.created, 40), done };
  }).filter(h => !used.has(h.id));
  db.hw = rest.concat(mineHw);
  return null;
}

/* ---------- HTTP ---------- */
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(obj)); };
function readBody(req) {
  return new Promise((resolve, reject) => {
    let n = 0; const c = [];
    req.on('data', d => { n += d.length; if (n > 5e6) { reject(new Error('big')); req.destroy(); } else c.push(d); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(c).toString() || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json' };

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost'), p = url.pathname;
    if (p.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store');
      if (req.method === 'POST' && p === '/api/login') {
        const ip = req.socket.remoteAddress || '';
        if (limited(ip)) return send(res, 429, { error: 'too many attempts' });
        const b = await readBody(req), login = str(b.login, 100), pw = str(b.password, 200);
        let tok = null, user = null;
        if (safeEq(login, ADMIN_LOGIN) && safeEq(pw, ADMIN_PASS)) { user = { role: 'admin', name: 'Super admin' }; tok = { role: 'admin' }; }
        else {
          const t = db.teachers.find(a => a.login && a.login === login && safeEq(a.pass, pw));
          const s = !t && db.students.find(a => a.login && a.login === login && safeEq(a.pass, pw));
          if (t) { user = { role: 'teacher', id: t.id, name: t.name }; tok = { role: 'teacher', id: t.id }; }
          else if (s) { user = { role: 'student', id: s.id, name: s.name }; tok = { role: 'student', id: s.id }; }
        }
        if (!user) { failed(ip); return send(res, 401, { error: 'bad credentials' }); }
        return send(res, 200, { token: sign({ ...tok, exp: Date.now() + 7 * 864e5 }), user });
      }
      const u = authUser(req);
      if (!u) return send(res, 401, { error: 'auth' });
      if (req.method === 'GET' && p === '/api/me') return send(res, 200, { user: u });
      if (req.method === 'GET' && p === '/api/state') return send(res, 200, view(u));
      if (req.method === 'PUT' && p === '/api/state') {
        if (u.role === 'student') return send(res, 403, { error: 'forbidden' });
        const b = await readBody(req);
        const err = u.role === 'admin' ? applyAdmin(b) : applyTeacher(u.id, b);
        if (err) return send(res, 400, { error: err });
        persist();
        return send(res, 200, { ok: true });
      }
      return send(res, 404, { error: 'not found' });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'method' });
    let rel = decodeURIComponent(p);
    if (rel === '/') rel = '/index.html';
    const f = path.normalize(path.join(PUB, rel));
    if (!f.startsWith(PUB + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
    fs.readFile(f, (e, d) => {
      if (e) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : d);
    });
  } catch (e) {
    send(res, 500, { error: 'server error' });
  }
});
server.listen(PORT, () => console.log('Maktab CRM ishga tushdi: http://localhost:' + PORT));
