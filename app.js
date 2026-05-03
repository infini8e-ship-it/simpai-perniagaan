// ================================================================
// SIMP-Ai: PERNIAGAAN v5 — app.js
// Shared: Supabase config, STATE, helper functions, routing
// ================================================================

const SUPABASE_URL = 'https://pnklfeluvwsexhkqolpe.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBua2xmZWx1dndzZXhoa3FvbHBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0OTMyMjEsImV4cCI6MjA5MzA2OTIyMX0.r48GQKNYn-_NYt0eptG-fAwKBFpuerKkY9IKfdlJe_c';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── GLOBAL STATE
var STATE = {
  id: null, nama: null, peranan: null,
  ppd: null, kodSekolah: null, namaSekolah: null, namaPPD: null
};

// ── ROUTING IKUT PERANAN
const ROUTE = {
  JPN:       'jpn.html',
  PPD:       'ppd.html',
  JU_DAERAH: 'ju.html',
  SEKOLAH:   'guru.html'
};

// ── SEMAK SESSION & REDIRECT
async function semakSession(perlukan) {
  const saved = sessionStorage.getItem('simp_session');
  if (!saved) { window.location.href = 'login.html'; return false; }
  try {
    STATE = JSON.parse(saved);
    if (!STATE.id || !STATE.peranan) { window.location.href = 'login.html'; return false; }
    // Semak peranan betul untuk halaman ini
    if (perlukan && STATE.peranan !== perlukan) {
      window.location.href = ROUTE[STATE.peranan] || 'login.html';
      return false;
    }
    return true;
  } catch(e) { window.location.href = 'login.html'; return false; }
}

// ── LOGOUT
async function doLogout() {
  try {
    await db.from('log_aktiviti').insert({
      id_pengguna: STATE.id, tindakan: 'LOGOUT', butiran: 'Log keluar'
    });
  } catch(e) {}
  sessionStorage.removeItem('simp_session');
  window.location.href = 'login.html';
}

// ── AUTO LOGOUT (IDLE 15 MINIT)
(function() {
  const IDLE_MS = 14 * 60 * 1000;   // 14 minit → tunjuk amaran
  const WARN_MS = 60 * 1000;         // 1 minit → logout
  let idleTimer, warnTimer;
  let _warned = false;

  function resetIdle() {
    if (_warned) { tutupAmaran(); _warned = false; }
    clearTimeout(idleTimer);
    clearTimeout(warnTimer);
    idleTimer = setTimeout(tunjukAmaran, IDLE_MS);
  }

  function tunjukAmaran() {
    _warned = true;
    // Cipta overlay jika tiada
    if (!document.getElementById('idle-warn')) {
      const div = document.createElement('div');
      div.id = 'idle-warn';
      div.innerHTML = `
        <div id="idle-warn-box">
          <div style="font-size:2rem">⏱️</div>
          <div style="font-weight:700;margin:8px 0">Sesi hampir tamat</div>
          <div id="idle-countdown" style="font-size:1.5rem;font-weight:700;color:var(--rose)">60</div>
          <div style="font-size:13px;color:var(--muted);margin:4px 0 16px">saat lagi sebelum log keluar automatik</div>
          <button onclick="window._idleKekal()" style="padding:10px 28px;background:var(--indigo);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600">Teruskan Sesi</button>
        </div>`;
      div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99999;display:flex;align-items:center;justify-content:center';
      document.body.appendChild(div);
    }
    document.getElementById('idle-warn').style.display = 'flex';

    // Kira detik
    let sisa = 60;
    document.getElementById('idle-countdown').textContent = sisa;
    warnTimer = setInterval(() => {
      sisa--;
      const el = document.getElementById('idle-countdown');
      if (el) el.textContent = sisa;
      if (sisa <= 0) {
        clearInterval(warnTimer);
        doLogout();
      }
    }, 1000);
  }

  function tutupAmaran() {
    clearInterval(warnTimer);
    const el = document.getElementById('idle-warn');
    if (el) el.style.display = 'none';
  }

  window._idleKekal = function() {
    _warned = false;
    tutupAmaran();
    resetIdle();
  };

  // Mulakan timer selepas halaman load
  window.addEventListener('load', () => {
    ['mousemove','mousedown','keydown','touchstart','scroll','click'].forEach(ev =>
      document.addEventListener(ev, resetIdle, { passive: true })
    );
    resetIdle();
  });
})();

// ── LOG AKTIVITI
async function logAktiviti(tindakan, butiran) {
  try {
    await db.from('log_aktiviti').insert({ id_pengguna: STATE.id, tindakan, butiran });
  } catch(e) {}
}

// ── HELPER KOD JENIS PENTAKSIRAN
function kodJenis(j) {
  const map = {
    'PENTAKSIRAN PERTENGAHAN SESI AKADEMIK': 'PPSA',
    'PENTAKSIRAN AKHIR SESI AKADEMIK': 'PASA',
    'PERCUBAAN SPM': 'PSPM'
  };
  return map[String(j||'').toUpperCase().trim()] || j || '—';
}

// ── HELPER GRED
function kirGred(m) {
  if (m === null || m === undefined || m === '') return '—';
  const n = parseFloat(m);
  if (isNaN(n)) return '—';
  if (n >= 90) return 'A+';
  if (n >= 80) return 'A';
  if (n >= 70) return 'A-';
  if (n >= 65) return 'B+';
  if (n >= 60) return 'B';
  if (n >= 55) return 'C+';
  if (n >= 50) return 'C';
  if (n >= 45) return 'D';
  if (n >= 40) return 'E';
  return 'G';
}

// ── HELPER WARNA GRED
function warnGred(g) {
  const map = {
    'A+':'var(--cyan)','A':'var(--cyan)','A-':'var(--indigo)',
    'B+':'var(--indigo)','B':'var(--emerald)',
    'C+':'var(--emerald)','C':'var(--amber)',
    'D':'var(--amber)','E':'var(--rose)','G':'var(--rose)',
    'TH':'var(--muted)'
  };
  return map[g] || 'var(--muted)';
}

function bgGred(g) {
  const map = {
    'A+':'var(--cyan-l)','A':'var(--cyan-l)','A-':'var(--indigo-l)',
    'B+':'var(--indigo-l)','B':'var(--emerald-l)',
    'C+':'var(--emerald-l)','C':'var(--amber-l)',
    'D':'var(--amber-l)','E':'var(--rose-l)','G':'var(--rose-l)',
    'TH':'#f1f5f9'
  };
  return map[g] || '#f1f5f9';
}

// ── TOAST
function tunjukToast(msg, jenis='default', durasi=3000) {
  const t = document.getElementById('toast');
  if (!t) return;
  const warna = { success:'var(--emerald)', error:'var(--rose)', warn:'var(--amber)', default:'var(--text)' };
  t.style.background = warna[jenis] || warna.default;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), durasi);
}

// ── TAB SWITCHING
function setTab(btn, page) {
  if (!btn) return;
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('show'));
  btn.classList.add('active');
  const el = document.getElementById('page-' + page);
  if (el) el.classList.add('show');
}

// ── MODAL
function bukaModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('show');
}
function tutupModal() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('show'));
}

// ── SALAM IKUT MASA
function salamMasa() {
  const j = new Date().getHours();
  return j < 12 ? 'Selamat Pagi' : j < 15 ? 'Selamat Tengahari' : j < 19 ? 'Selamat Petang' : 'Selamat Malam';
}

// ── INIT NAVBAR (guna dalam semua halaman)
async function initNavbar(badge, badgeClass) {
  const inisial = STATE.nama.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
  const avatarEl = document.getElementById('nav-avatar');
  if (avatarEl) avatarEl.textContent = inisial;

  const badgeEl = document.getElementById('nav-badge');
  if (badgeEl) {
    badgeEl.textContent = badge || STATE.peranan;
    if (badgeClass) badgeEl.className = 'nav-badge ' + badgeClass;
  }

  const namaEl = document.getElementById('nav-nama');
  if (namaEl) namaEl.textContent = STATE.nama;

  // Jalankan fungsi auto-tarik tahun sesi setiap kali page dimuatkan
  muatTahunSesiDinamik();

  // Pasang modal edit profil global
  if (!document.getElementById('modal-profil-global')) {
    const m = document.createElement('div');
    m.id = 'modal-profil-global';
    m.className = 'modal-overlay';
    m.innerHTML = `
      <div class="modal-box">
        <div class="modal-head"><div class="modal-title">👤 Edit Profil</div><button class="modal-close" onclick="document.getElementById('modal-profil-global').classList.remove('show')">✕</button></div>
        <div class="modal-body">
          <div class="form-grid form-grid-2">
            <div class="form-group form-full"><label class="form-label">Nama Penuh</label><input class="form-input" id="gep-nama" placeholder="Nama penuh anda"></div>
            <div class="form-group form-full" id="gep-ppd-wrap" style="display:none">
              <label class="form-label">PPD</label>
              <select class="form-select" id="gep-ppd"><option value="">— Pilih PPD —</option></select>
            </div>
            <div class="form-group form-full"><label class="form-label">Alamat Email</label><input class="form-input" type="email" id="gep-email" placeholder="contoh@gmail.com"></div>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn-ghost" onclick="document.getElementById('modal-profil-global').classList.remove('show')">Batal</button>
          <button class="btn-primary" onclick="simpanProfilGlobal()">💾 Simpan</button>
        </div>
      </div>`;
    m.addEventListener('click', e => { if (e.target === m) m.classList.remove('show'); });
    document.body.appendChild(m);
  }
  if (avatarEl) { avatarEl.style.cursor = 'pointer'; avatarEl.onclick = () => bukaProfilGlobal(); }
}

async function bukaProfilGlobal() {
  const { data } = await db.from('pengguna').select('nama,email,ppd').eq('id', STATE.id).single();
  document.getElementById('gep-nama').value = (data && data.nama) || STATE.nama || '';
  document.getElementById('gep-email').value = (data && data.email) || '';
  const ppdWrap = document.getElementById('gep-ppd-wrap');
  if (STATE.peranan === 'PPD' || STATE.peranan === 'JU_DAERAH') {
    ppdWrap.style.display = 'block';
    const { data: ppdList } = await db.from('ppd').select('kod_ppd,nama_ppd').order('nama_ppd');
    const sel = document.getElementById('gep-ppd');
    sel.innerHTML = '<option value="">— Pilih PPD —</option>' +
      (ppdList || []).map(p => `<option value="${p.nama_ppd}" ${p.nama_ppd === STATE.ppd ? 'selected' : ''}>${p.nama_ppd}</option>`).join('');
  } else {
    ppdWrap.style.display = 'none';
  }
  document.getElementById('modal-profil-global').classList.add('show');
}

async function simpanProfilGlobal() {
  const nama = document.getElementById('gep-nama').value.trim();
  const email = document.getElementById('gep-email').value.trim();
  const ppd = (STATE.peranan === 'PPD' || STATE.peranan === 'JU_DAERAH')
    ? document.getElementById('gep-ppd').value : STATE.ppd;
  if (!nama) { alert('Sila isi nama.'); return; }
  const payload = { nama, email };
  if (ppd) payload.ppd = ppd;
  const { error } = await db.from('pengguna').update(payload).eq('id', STATE.id);
  if (error) { alert('Ralat: ' + error.message); return; }
  STATE.nama = nama; STATE.ppd = ppd || STATE.ppd;
  sessionStorage.setItem('simp_session', JSON.stringify(STATE));
  const inisial = nama.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
  const avatarEl = document.getElementById('nav-avatar');
  if (avatarEl) avatarEl.textContent = inisial;
  document.getElementById('modal-profil-global').classList.remove('show');
  if (typeof tunjukToast === 'function') tunjukToast('✅ Profil dikemaskini.', 'success');
}

// ── FORMAT TARIKH
function fmtTarikh(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('ms-MY', { day:'2-digit', month:'short', year:'numeric' });
}

// ── FORMAT NOMBOR
function fmtN(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('ms-MY');
}

// ── AUTO POPULATE TAHUN SESI DARI DATABASE
async function muatTahunSesiDinamik() {
  try {
    // Tarik data tahun yang aktif dari jadual 'sesi', susun tahun terkini di atas
    const { data } = await db.from('sesi').select('tahun').eq('aktif', true).order('tahun', {ascending: true});
    if (!data || data.length === 0) return;

    // Bina kod HTML untuk <option>
    const opts = data.map(s => `<option value="${s.tahun}">${s.tahun}</option>`).join('');

    // Cari SEMUA dropdown tahun dalam mana-mana page dan masukkan pilihan
    document.querySelectorAll('select[id$="-tahun"]').forEach(el => {
      // Simpan nilai asal jika ada, kalau tak guna tahun paling baru
      const nilaiSemasa = el.value;
      el.innerHTML = opts;
      if (nilaiSemasa && data.find(d => d.tahun === nilaiSemasa)) el.value = nilaiSemasa;
    });
  } catch (e) {
    console.error("Gagal muat tahun sesi:", e);
  }
}
// Fungsi bantuan untuk memformat paparan SP dalam dropdown/menu
function fmtPilihanSP(s) {
  // s adalah objek dari table skpsp (tingkatan, sk_kod, tajuk, sp_kod, huraian)
  const huraianDipendekkan = s.huraian ? s.huraian.substring(0, 40) + '...' : '—';
  return `[T${s.tingkatan}] ${s.sp_kod} - ${huraianDipendekkan}`;
}