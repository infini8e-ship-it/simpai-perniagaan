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
    if (perlukan && STATE.peranan !== perlukan && STATE.peranan !== 'JPN') {
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
  // Jika dari dropdown, aktifkan parent nav-drop-btn
  const dropParent = btn.closest ? btn.closest('.nav-dropdown') : null;
  if (dropParent) {
    const dropBtn = dropParent.querySelector('.nav-drop-btn');
    if (dropBtn) dropBtn.classList.add('active');
  } else {
    btn.classList.add('active');
  }
  const el = document.getElementById('page-' + page);
  if (el) el.classList.add('show');
  if (page === 'prestasi-spm-jpn') setTimeout(() => muatPrestasiJPN(), 50);
  if (page === 'analisis') setTimeout(() => { if (typeof setJPNSubTab === 'function') setJPNSubTab('item'); }, 50);
  setTimeout(() => _kemaskiniDrawerActive(page), 50);
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
  return j < 12 ? 'Selamat Pagi' : j < 15 ? 'Selamat Tengahari' : 'Selamat Petang';
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

// ── MOBILE DRAWER
function _initDrawer() {
  // Jangan init dua kali
  if (document.getElementById('nav-drawer')) return;

  // Bina struktur drawer dari nav-tabs sedia ada
  const navTabs = document.querySelector('.nav-tabs');
  const navRight = document.querySelector('.nav-right');
  if (!navTabs) return;

  // Badge & nama pengguna
  const badge = navRight ? (navRight.querySelector('.nav-badge') || {}).textContent || '' : '';
  const avatar = navRight ? (navRight.querySelector('.nav-avatar') || {}).textContent || '—' : '—';

  // Bina item drawer dari nav-tabs
  let itemsHTML = '';
  navTabs.querySelectorAll(':scope > .nav-tab, :scope > .nav-dropdown').forEach(el => {
    if (el.classList.contains('nav-dropdown')) {
      // Dropdown group
      const label = el.querySelector('.nav-drop-btn').textContent.replace('▾','').trim();
      itemsHTML += `<div class="nav-drawer-group-label">${label}</div>`;
      el.querySelectorAll('.nav-drop-menu button').forEach(btn => {
        const onclick = (btn.getAttribute('onclick') || '').replace(/setTab\(this,/g, "setTabMobile(");
        itemsHTML += `<button class="nav-drawer-sub" onclick="${onclick};tutupDrawer()">${btn.textContent}</button>`;
      });
      itemsHTML += '<div class="nav-drawer-divider"></div>';
    } else {
      // Tab biasa
      const onclick = (el.getAttribute('onclick') || '').replace(/setTab\(this,/g, "setTabMobile(");
      const aktif = el.classList.contains('active') ? 'active' : '';
      itemsHTML += `<button class="nav-drawer-item ${aktif}" onclick="${onclick};tutupDrawer()">${el.textContent}</button>`;
    }
  });

  // Cipta drawer
  const drawer = document.createElement('div');
  drawer.id = 'nav-drawer';
  drawer.className = 'nav-drawer';
  drawer.innerHTML = `
    <div class="nav-drawer-overlay" onclick="tutupDrawer()"></div>
    <div class="nav-drawer-panel">
      <div class="nav-drawer-head">
        <div class="nav-drawer-head-info">
          <div class="nav-drawer-head-nama">${avatar}</div>
          <div class="nav-drawer-head-badge">${badge}</div>
        </div>
        <button class="nav-drawer-close" onclick="tutupDrawer()">✕</button>
      </div>
      <div class="nav-drawer-body">${itemsHTML}</div>
      <div class="nav-drawer-foot">
        <button class="btn-logout" onclick="doLogout()">↩ Keluar</button>
      </div>
    </div>`;
  document.body.appendChild(drawer);
  drawer.style.display = 'none';

  // Tambah butang hamburger dalam nav jika belum ada
  if (!document.querySelector('.nav-hamburger')) {
    const nav = document.querySelector('nav');
    if (nav) {
      const hbtn = document.createElement('button');
      hbtn.className = 'nav-hamburger';
      hbtn.setAttribute('aria-label', 'Menu');
      hbtn.innerHTML = '<span></span><span></span><span></span>';
      hbtn.onclick = bukaDrawer;
      nav.appendChild(hbtn);
    }
  }
}

function setTabMobile(page) {
  // Cari nav-tab atau nav-drop-menu button yang sepadan
  let btn = document.querySelector('.nav-tab[onclick*="\''+page+'\'"]');
  if (!btn) btn = document.querySelector('.nav-drop-menu button[onclick*="\''+page+'\'"]');
  if (!btn) btn = document.querySelector('.nav-tabs .nav-drop-btn');
  setTab(btn || document.querySelector('.nav-tab'), page);
}

function bukaDrawer() {
  const d = document.getElementById('nav-drawer');
  if (d) { d.style.display = 'block'; d.classList.add('open'); }
  document.body.style.overflow = 'hidden';
}

function tutupDrawer() {
  const d = document.getElementById('nav-drawer');
  if (d) { d.style.display = 'none'; d.classList.remove('open'); }
  document.body.style.overflow = '';
}

// Kemaskini active state dalam drawer selepas setTab
function _kemaskiniDrawerActive(page) {
  const drawer = document.getElementById('nav-drawer');
  if (!drawer) return;
  drawer.querySelectorAll('.nav-drawer-item, .nav-drawer-sub').forEach(b => b.classList.remove('active'));
  drawer.querySelectorAll('.nav-drawer-item, .nav-drawer-sub').forEach(b => {
    if ((b.getAttribute('onclick') || '').includes("'"+page+"'")) b.classList.add('active');
  });
}

// Init drawer selepas DOM ready
window.addEventListener('load', function() {
  setTimeout(function() {
    _initDrawer();
    tutupDrawer();
  }, 300);
});

// ── CHART.JS MOBILE PATCH
window.addEventListener('load', function() {
  if (typeof Chart === 'undefined') return;
  const _origChart = Chart;
  // Patch defaults
  Chart.defaults.responsive = true;
  Chart.defaults.maintainAspectRatio = false;
  Chart.defaults.plugins = Chart.defaults.plugins || {};
  Chart.defaults.plugins.legend = Chart.defaults.plugins.legend || {};
  Chart.defaults.plugins.legend.position = 'top';
  // Tinggi default untuk mobile
  if (window.innerWidth <= 768) {
    Chart.defaults.aspectRatio = 1.5;
  }
});

// Auto logout — guna fungsi sedia ada dalam sistem

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

// ── PETA PPD (singkatan Sheets → nama penuh Supabase)
const PETA_PPD_SINGKATAN = {
  'BLG':'PPD BALING','KBB':'PPD KULIM BANDAR BAHARU',
  'KM':'PPD KUALA MUDA','KP':'PPD KUBANG PASU',
  'KS':'PPD KOTA SETAR','LKW':'PPD LANGKAWI',
  'PDG':'PPD PENDANG','PT':'PPD PADANG TERAP',
  'SIK':'PPD SIK','YAN':'PPD YAN'
};

// ── PETA JENIS PENTAKSIRAN (kod Sheets → nama sistem)
const PETA_PENTAKSIRAN_SPM = {
  'PAT':'PASA', 'PPC':'PSPM', 'PPT':'PPSA'
};

// ── URL CSV Google Sheets SPM
const SPM_CSV_BASE = 'https://docs.google.com/spreadsheets/d/1KI4hq7-JJ7MEVjisURmIJSiOsq_uUmlUfzYWt1tHVEw/export?format=csv&gid=66040387';
const SPM_CSV_URL = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
  ? 'https://corsproxy.io/?' + encodeURIComponent(SPM_CSV_BASE)
  : SPM_CSV_BASE;
const SPM_CACHE_KEY = 'simp_spm_cache';
const SPM_CACHE_TTL = 24 * 60 * 60 * 1000;

// ── MUAT DATA SPM (cache 24 jam)
async function muatDataSPM() {
  // Semak cache
  try {
    const cache = JSON.parse(localStorage.getItem(SPM_CACHE_KEY));
    if (cache && (Date.now() - cache.masa) < SPM_CACHE_TTL) {
      window._dataSPM = cache.data;
      return cache.data;
    }
  } catch(e) {}

  try {
    const res = await fetch(SPM_CSV_URL);
    const teks = await res.text();
    const baris = teks.trim().split('\n');
    const header = baris[0].split(',').map(h => h.trim().replace(/^"|"$/g,'').toLowerCase());

    const data = [];
    for (let i = 1; i < baris.length; i++) {
      // Handle CSV dengan koma dalam nilai (quoted)
      const kol = baris[i].match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g) || [];
      const clean = kol.map(k => k.trim().replace(/^"|"$/g,''));
      if (clean.length < 5) continue;

      const obj = {};
      header.forEach((h, idx) => obj[h] = clean[idx] || '');

      // Normalize PPD
      const singkatan = (obj['ppd'] || '').toUpperCase().trim();
      obj['ppd'] = PETA_PPD_SINGKATAN[singkatan] || obj['ppd'];

      // Normalize jenis pentaksiran: "PPC T5 2025" → "PSPM T5 2025"
      const jp = obj['jenis pentaksiran'] || '';
      const prefiks = jp.split(' ')[0].toUpperCase();
      if (PETA_PENTAKSIRAN_SPM[prefiks]) {
        obj['jenis pentaksiran'] = jp.replace(prefiks, PETA_PENTAKSIRAN_SPM[prefiks]);
      }

      // Tukar ke nombor
      ['bil duduki','bil a+','bil a','bil a-','jum_a','bil b+','bil b',
       'bil c+','bil c','bil kredit','bil d','bil e','bil lulus','bil g'].forEach(k => {
        obj[k] = parseInt(obj[k]) || 0;
      });
      ['%a','% kredit','%lulus','% gagal','gpmp'].forEach(k => {
        obj[k] = parseFloat(obj[k]) || 0;
      });

      data.push(obj);
    }

    localStorage.setItem(SPM_CACHE_KEY, JSON.stringify({ masa: Date.now(), data }));
    window._dataSPM = data;
    return data;
  } catch(e) {
    console.error('Gagal muat data SPM:', e);
    window._dataSPM = [];
    return [];
  }
}

// ── RENDER TABLE SEJARAH PRESTASI
function renderJadualSPM(data, elId, sortKol, sortAsc) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!data || data.length === 0) {
    el.innerHTML = '<div class="empty-state">Tiada data ditemui.</div>'; return;
  }
  // Sort
  const kolMap = {'duduki':'bil duduki','%a':'%a','kredit':'% kredit','lulus':'%lulus','gpmp':'gpmp','aPlusGred':'bil a+','aGred':'bil a','aMinGred':'bil a-','bPlusGred':'bil b+','bGred':'bil b','cPlusGred':'bil c+','cGred':'bil c','dGred':'bil d','eGred':'bil e','gGred':'bil g'};
  let sorted = [...data];
  if (sortKol && kolMap[sortKol]) {
    sorted.sort((a,b) => {
      const av = parseFloat(a[kolMap[sortKol]]) || 0;
      const bv = parseFloat(b[kolMap[sortKol]]) || 0;
      return sortAsc ? av - bv : bv - av;
    });
  }
  const thSort = (label, kol) => {
    const aktif = sortKol === kol;
    const ikon = aktif ? (sortAsc ? ' ▲' : ' ▼') : ' ⇅';
    return `<th style="text-align:center;cursor:pointer;user-select:none" onclick="_sortJadualSPM('${elId}','${kol}',${aktif?!sortAsc:false})">${label}${ikon}</th>`;
  };
  const html = `
    <table class="data-table">
      <thead><tr>
        <th style="text-align:center;width:40px">#</th>
        <th>Sekolah</th><th>PPD</th><th>Pentaksiran</th>
        ${thSort('Duduki','duduki')}
        ${thSort('A+','aPlusGred')}
        ${thSort('A','aGred')}
        ${thSort('A-','aMinGred')}
        ${thSort('B+','bPlusGred')}
        ${thSort('B','bGred')}
        ${thSort('C+','cPlusGred')}
        ${thSort('C','cGred')}
        ${thSort('D','dGred')}
        ${thSort('E','eGred')}
        ${thSort('G','gGred')}
        ${thSort('GPMP','gpmp')}
      </tr></thead>
      <tbody>
        ${sorted.map((r,i) => `<tr>
          <td style="text-align:center;color:var(--muted);font-size:12px">${i+1}</td>
          <td>${r['nama sekolah'] || '—'}</td>
          <td><span class="chip">${r['ppd'] || '—'}</span></td>
          <td style="font-size:12px">${r['jenis pentaksiran'] || '—'}</td>
          <td style="text-align:center">${r['bil duduki']}</td>
          <td style="text-align:center;font-weight:700;color:var(--cyan)">${r['bil a+']||0}</td>
          <td style="text-align:center">${r['bil a']||0}</td>
          <td style="text-align:center">${r['bil a-']||0}</td>
          <td style="text-align:center">${r['bil b+']||0}</td>
          <td style="text-align:center">${r['bil b']||0}</td>
          <td style="text-align:center">${r['bil c+']||0}</td>
          <td style="text-align:center">${r['bil c']||0}</td>
          <td style="text-align:center;color:var(--amber)">${r['bil d']||0}</td>
          <td style="text-align:center;color:var(--rose)">${r['bil e']||0}</td>
          <td style="text-align:center;font-weight:700;color:var(--rose)">${r['bil g']||0}</td>
          <td style="text-align:center;font-weight:700;color:${r['gpmp']<=4?'var(--emerald)':r['gpmp']<=6?'var(--amber)':'var(--rose)'}">${r['gpmp'].toFixed(2)}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  el.innerHTML = html;
}

function pasangPadamTetapanK1Fallback() {
  const body = document.getElementById('tetapan-k1-body');
  if (!body) return;
  const headLast = body.querySelector('thead th:last-child');
  if (headLast && !headLast.textContent.trim()) {
    headLast.textContent = 'Tindakan';
    headLast.style.textAlign = 'right';
  }
  body.querySelectorAll('tbody tr').forEach(row => {
    if (row.textContent.includes('Padam')) return;
    const editBtn = row.querySelector('button[onclick^="editK1"]');
    if (!editBtn) return;
    const match = (editBtn.getAttribute('onclick') || '').match(/editK1\((\d+)\)/);
    if (!match) return;
    const cells = row.querySelectorAll('td');
    const tingkatan = (cells[0]?.textContent || '').replace(/^T/i, '').trim();
    const jenis = (cells[1]?.textContent || '').trim();
    const tahun = (cells[2]?.textContent || '').trim();
    const td = editBtn.closest('td');
    if (!td) return;
    td.innerHTML = '<div style="display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap">' +
      editBtn.outerHTML +
      '<button class="btn-danger btn-padam-k1" style="font-size:11px;padding:4px 10px" data-id="' + match[1] + '" data-tingkatan="' + tingkatan + '" data-jenis="' + jenis + '" data-tahun="' + tahun + '">🗑️ Padam</button>' +
      '</div>';
  });
}

async function padamTetapanK1Fallback(id, tingkatan, jenis, tahun) {
  const jenisLabel = typeof kodJenis === 'function' ? kodJenis(jenis) : jenis;
  const mesej = 'Padam tetapan K1 untuk T' + tingkatan + ' ' + jenisLabel + ' ' + tahun + '?';
  const run = async () => {
    const { error } = await db.from('tetapan_k1').delete().eq('id', id);
    if (error) { tunjukToast('❌ ' + error.message, 'error'); return; }
    tunjukToast('✅ Tetapan K1 dipadam.', 'success');
    if (typeof muatTetapanK1 === 'function') muatTetapanK1();
  };
  if (typeof bukaKonfirm === 'function') {
    bukaKonfirm('Padam Tetapan K1', mesej, 'Tindakan ini tidak boleh dibatalkan.', 'Ya, Padam', 'danger', run);
    return;
  }
  if (confirm(mesej)) await run();
}

document.addEventListener('click', e => {
  const btn = e.target.closest && e.target.closest('.btn-padam-k1');
  if (!btn) return;
  padamTetapanK1Fallback(btn.dataset.id, btn.dataset.tingkatan, btn.dataset.jenis, btn.dataset.tahun);
});

const _timerPadamTetapanK1 = setInterval(() => {
  if (typeof window.muatTetapanK1 !== 'function' || window.muatTetapanK1._padamFallback) return;
  const asal = window.muatTetapanK1;
  window.muatTetapanK1 = async function(...args) {
    const hasil = await asal.apply(this, args);
    pasangPadamTetapanK1Fallback();
    return hasil;
  };
  window.muatTetapanK1._padamFallback = true;
  clearInterval(_timerPadamTetapanK1);
}, 100);

window.addEventListener('load', () => setTimeout(pasangPadamTetapanK1Fallback, 500));
function _sortJadualSPM(elId, kol, asc) {
  const src = elId === 'spm-table-jpn' ? window._filteredSpmJPN
    : (elId === 'spm-table-guru' || elId === 'guru-spm-result-table') ? window._filteredSpmGuru
    : elId === 'spm-table-ppd' ? window._filteredSpmPPD
    : null;
  if (src) renderJadualSPM(src, elId, kol, asc);
}
