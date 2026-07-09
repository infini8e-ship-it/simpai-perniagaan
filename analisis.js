// ================================================================
// SIMP-Ai v5 — analisis.js
// Modul analisis penuh — query Supabase, kira dalam browser
// Port dari v4 GAS: getAnalisisSekolah + getAnalisisPerSoalan + getAnalisisPerSoalanK2
// ================================================================

// ── NILAI GRED (GPMP)
var _NILAI_GRED = { 'A+':0,'A':1,'A-':2,'B+':3,'B':4,'C+':5,'C':6,'D':7,'E':8,'G':9 };
var _LABEL_GRED = ['A+','A','A-','B+','B','C+','C','D','E','G'];

// ── DATA SPIDER GLOBAL
var _spiderData = { murid:[], soalan:[], topikAgregat:[] };

// ── SKPSP PETA GLOBAL (kod → {huraian, bab})
window._skpspPeta = {};

// ── TOOLTIP GLOBAL (position:fixed, tidak terlindung frame)
function _ensureTooltipGlobal() {
  if (document.getElementById('sp-tooltip-global')) return;
  var d = document.createElement('div');
  d.id = 'sp-tooltip-global';
  d.style.cssText = 'position:fixed;z-index:99999;background:#1a202c;color:#fff;font-size:11px;padding:8px 10px;border-radius:8px;max-width:280px;white-space:normal;display:none;pointer-events:none;box-shadow:0 4px 16px rgba(0,0,0,0.35);line-height:1.5';
  document.body.appendChild(d);
}
function _showSpTooltip(el, kodTopik) {
  _ensureTooltipGlobal();
  var info = (window._skpspPeta && window._skpspPeta[kodTopik]) || {};
  if (!info.huraian && !info.bab) return;
  var tt = document.getElementById('sp-tooltip-global');
  tt.innerHTML =
    (info.sk ? '<div style="color:#a0aec0;font-size:10px;margin-bottom:2px">SK ' + info.sk + '</div>' : '') +
    (info.bab ? '<div style="color:#a0aec0;font-size:10px;margin-bottom:3px">' + info.bab + '</div>' : '') +
    '<div><strong>' + kodTopik + ':</strong> ' + (info.huraian || '') + '</div>';
  var r = el.getBoundingClientRect();
  var top = r.top - tt.offsetHeight - 8;
  if (top < 8) top = r.bottom + 8;
  var left = r.left;
  if (left + 290 > window.innerWidth) left = window.innerWidth - 295;
  tt.style.top = top + 'px';
  tt.style.left = left + 'px';
  tt.style.display = 'block';
  // Recalculate selepas display supaya offsetHeight tepat
  requestAnimationFrame(function(){
    var top2 = r.top - tt.offsetHeight - 8;
    if (top2 < 8) top2 = r.bottom + 8;
    tt.style.top = top2 + 'px';
  });
}
function _hideSpTooltip() {
  var tt = document.getElementById('sp-tooltip-global');
  if (tt) tt.style.display = 'none';
}

// ================================================================
// FUNGSI UTAMA — muatAnalisis(params, peranan, elId)
// params: { tingkatan, jenisPentaksiran, tahun, ppd, sekolah, kelas }
// peranan: 'JPN' | 'PPD' | 'JU_DAERAH' | 'SEKOLAH'
// elId: id elemen HTML untuk render hasil
// ================================================================
async function muatAnalisisSupa(params, peranan, elId) {
  var el = document.getElementById(elId);
  if (!el) return;

  // Loading state
  el.innerHTML =
    '<div style="text-align:center;padding:40px 20px">' +
      '<div class="spinner spinner-dark" style="margin:0 auto 16px"></div>' +
      '<div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:12px">Sedang dijana, sila tunggu...</div>' +
      '<div style="background:var(--bg2);border-radius:8px;height:8px;width:80%;max-width:400px;margin:0 auto;overflow:hidden">' +
        '<div id="ana-prog" style="background:var(--indigo);height:100%;width:5%;border-radius:8px;transition:width 0.8s ease"></div>' +
      '</div>' +
      '<div id="ana-prog-txt" style="font-size:12px;color:var(--sub);margin-top:8px">Memuat data...</div>' +
    '</div>';

  var _steps = [{p:20,t:'Membaca data markah...'},{p:45,t:'Mengira analisis per soalan...'},{p:70,t:'Memproses data murid...'},{p:90,t:'Menjana laporan...'}];
  var _si = 0;
  var _st = setInterval(function(){
    var b=document.getElementById('ana-prog'), t=document.getElementById('ana-prog-txt');
    if(b && _si<_steps.length){ b.style.width=_steps[_si].p+'%'; if(t)t.textContent=_steps[_si].t; _si++; }
  }, 900);

  try {
    // 1. Bina query Supabase
    var q = db.from('skor_master').select('*');
    if (params.tingkatan)        q = q.eq('tingkatan', params.tingkatan);
    if (params.jenisPentaksiran) q = q.eq('jenis_pentaksiran', params.jenisPentaksiran);
    if (params.tahun)            q = q.eq('tahun', params.tahun);
    if (params.kelas)            q = q.eq('kelas', params.kelas);

    // RBAC
    if (peranan === 'SEKOLAH')                         q = q.eq('kod_sekolah', STATE.kodSekolah);
    else if (peranan === 'PPD' || peranan === 'JU_DAERAH') { q = q.eq('ppd', STATE.ppd); if (params.sekolah) q = q.eq('kod_sekolah', params.sekolah); }
    else if (params.sekolah)                           q = q.eq('kod_sekolah', params.sekolah);
    else if (params.ppd)                               q = q.eq('ppd', params.ppd);

    const { data: rawData, error } = await q;
    clearInterval(_st);

    if (error) throw new Error(error.message);
    if (!rawData || rawData.length === 0) {
      el.innerHTML = '<div class="alert alert-warn">⚠️ Tiada data untuk parameter ini. Pastikan guru telah sync data.</div>';
      return;
    }

    // 2. Muat SKPSP
    var skpspQ = db.from('skpsp').select('sp_kod,huraian,sk_kod,tajuk');
    if (params.tingkatan) skpspQ = skpspQ.eq('tingkatan', params.tingkatan);
    const { data: skpspData } = await skpspQ;
    window._skpspPeta = {};
    (skpspData||[]).forEach(function(s){ window._skpspPeta[s.sp_kod] = { kod:s.sp_kod, huraian:s.huraian, bab:s.tajuk, sk:s.sk_kod }; });

    // 3. Muat tetapan K1 & K2
    var tetQ = db.from('tetapan_k1').select('sp_json,skema_json').eq('tahun', params.tahun||'2026');
    if (params.tingkatan)        tetQ = tetQ.eq('tingkatan', params.tingkatan);
    if (params.jenisPentaksiran) tetQ = tetQ.eq('jenis_pentaksiran', params.jenisPentaksiran);
    tetQ = tetQ.limit(1);
    const { data: tetK1 } = await tetQ;

    var tetK2Q = db.from('tetapan_k2').select('*').eq('tahun', params.tahun||'2026');
    if (params.tingkatan)        tetK2Q = tetK2Q.eq('tingkatan', params.tingkatan);
    if (params.jenisPentaksiran) tetK2Q = tetK2Q.eq('jenis_pentaksiran', params.jenisPentaksiran);
    tetK2Q = tetK2Q.order('bahagian').order('soalan_no');
    const { data: tetK2Data } = await tetK2Q;

    var spArr    = [];
    var skemaArr = [];
    try {
      if (tetK1 && tetK1[0] && tetK1[0].sp_json)    spArr    = JSON.parse(tetK1[0].sp_json);
      if (tetK1 && tetK1[0] && tetK1[0].skema_json)  skemaArr = JSON.parse(tetK1[0].skema_json);
    } catch(e){}

    // 4. Proses data
    var hasil = _prosesData(rawData, spArr, skemaArr, tetK2Data||[]);

    // 5. Render
    el.innerHTML = _renderAnalisis(hasil, params, peranan);

    // Simpan spider data
    _simpanSpiderData(hasil.senaraiMurid, hasil.soalanK1, hasil.topik);
    window._anaCache = { topik: hasil.topik, soalanK2: hasil.soalanK2, peranan: peranan, params: params };
    // Aktifkan tab pertama
    _aktivasiTab('an-topik');

  } catch(e) {
    clearInterval(_st);
    el.innerHTML = '<div class="alert alert-err">❌ ' + e.message + '</div>';
  }
}

// ================================================================
// PROSES DATA — kira semua analisis dari raw skor_master
// ================================================================
function _prosesData(rows, spArr, skemaArr, tetK2Rows) {
  var hasil = {
    ringkasan: {}, topik: [], senaraiMurid: [],
    analisisKelas: [], ranking: [], muridBerisiko: [],
    soalanK1: [], soalanK2: [], bahagianK2: [],
    taburanGred: {}, jumlahDudukiSebenar: 0
  };

  // Init taburan gred
  ['A+','A','A-','B+','B','C+','C','D','E','G','TH'].forEach(function(g){ hasil.taburanGred[g]=0; });

  var jumlahK1Total=0, jumlahK2Total=0, jumlahWajaranTotal=0;
  var dudukiCount=0, nilaiGPMP=0;

  // Kira analisis per soalan K1
  var betulPerSoalan = new Array(40).fill(0);
  var jumlahPerSoalan= new Array(40).fill(0);

  // Kira per SP (topik)
  var spBetul={}, spJumlah={};

  // Per kelas & sekolah
  var kelasMap={}, sekolahMap={};

  rows.forEach(function(row) {
    var hadir = (row.kehadiran||'').toUpperCase() !== 'TIDAK HADIR';
    var gred  = hadir ? (row.gred || kirGred(row.markah_wajaran)) : 'TH';

    hasil.taburanGred[gred] = (hasil.taburanGred[gred]||0) + 1;
    if (hadir && _NILAI_GRED[gred] !== undefined) {
      dudukiCount++;
      nilaiGPMP += _NILAI_GRED[gred];
    }

    var k1 = hadir ? (parseFloat(row.jumlah_k1)||0) : 0;
    var k2 = hadir ? (parseFloat(row.jumlah_k2)||0) : 0;
    var wj = hadir ? (parseFloat(row.markah_wajaran)||0) : 0;
    jumlahK1Total   += k1;
    jumlahK2Total   += k2;
    jumlahWajaranTotal += wj;

    // Analisis per soalan K1
    if (hadir && row.jawapan_k1_json) {
      try {
        var jawapan = JSON.parse(row.jawapan_k1_json);
        jawapan.forEach(function(betul, i) {
          if (i < 40) {
            jumlahPerSoalan[i]++;
            if (betul) betulPerSoalan[i]++;
          }
        });
      } catch(e){}
    }

    // Analisis per SP (dari topik_betul_json)
    if (hadir && row.topik_betul_json) {
      try {
        var topikObj = JSON.parse(row.topik_betul_json);
        Object.keys(topikObj).forEach(function(sp) {
          if (!spBetul[sp])  spBetul[sp]  = 0;
          if (!spJumlah[sp]) spJumlah[sp] = 0;
          spBetul[sp]  += (topikObj[sp].betul  || 0);
          spJumlah[sp] += (topikObj[sp].jumlah || 0);
        });
      } catch(e){}
    }

    // Senarai murid
    var murid = {
      nama:          row.nama_murid || '—',
      kelas:         row.kelas     || '—',
      kodSekolah:    row.kod_sekolah,
      sekolah:       row.nama_sekolah,
      ppd:           row.ppd,
      jumlahK1:      k1,
      jumlahK2:      k2,
      wajaranK1:     parseFloat(row.wajaran_k1)||0,
      wajaranK2:     parseFloat(row.wajaran_k2)||0,
      markahWajaran: wj,
      gred:          gred,
      kehadiran:     row.kehadiran||'HADIR',
      masalah3m:     row.masalah_3m||'TIDAK',
      spData:        []
    };

    // SpData untuk spider — dari topik_betul_json
    if (row.topik_betul_json) {
      try {
        var td = JSON.parse(row.topik_betul_json);
        murid.spData = Object.keys(td).sort().map(function(sp){
          var d=td[sp]; return {sp:sp,betul:d.betul||0,jumlah:d.jumlah||0,pct:d.jumlah>0?Math.round(d.betul/d.jumlah*100):0};
        });
      } catch(e){}
    }

    hasil.senaraiMurid.push(murid);

    // Murid berisiko
    var _gred = (row.gred||'').trim().toUpperCase();
    var _3m = (row.masalah_3m||'').toUpperCase()==='YA';
    if (!hadir || _gred==='E' || _gred==='G' || _3m) {
      hasil.muridBerisiko.push(murid);
    }

    // Per kelas
    var kelasKey = (row.kod_sekolah||'') + '|' + (row.kelas||'');
    if (!kelasMap[kelasKey]) kelasMap[kelasKey] = {kelas:row.kelas,kodSekolah:row.kod_sekolah,sekolah:row.nama_sekolah,murid:[],jumlah:0,wajaranTotal:0};
    kelasMap[kelasKey].murid.push(murid);
    kelasMap[kelasKey].jumlah++;
    kelasMap[kelasKey].wajaranTotal += wj;

    // Per sekolah (untuk ranking)
    var sklKey = row.kod_sekolah||'';
    if (!sekolahMap[sklKey]) sekolahMap[sklKey]={kod:row.kod_sekolah,nama:row.nama_sekolah,ppd:row.ppd,murid:0,k1Total:0,k2Total:0,wajaranTotal:0,duduki:0,nilaiGP:0};
    sekolahMap[sklKey].murid++;
    sekolahMap[sklKey].k1Total    += k1;
    sekolahMap[sklKey].k2Total    += k2;
    sekolahMap[sklKey].wajaranTotal += wj;
    if (hadir && _NILAI_GRED[gred]!==undefined) {
      sekolahMap[sklKey].duduki++;
      sekolahMap[sklKey].nilaiGP += _NILAI_GRED[gred];
    }
  });

  var n = rows.length;
  hasil.jumlahDudukiSebenar = dudukiCount;

  // Ringkasan
  hasil.ringkasan = {
    jumlahMurid:   n,
    purataK1:      n>0?(jumlahK1Total/n).toFixed(1):0,
    purataK2:      n>0?(jumlahK2Total/n).toFixed(1):0,
    purata:        n>0?(jumlahWajaranTotal/n).toFixed(1):0,
    gpmp:          dudukiCount>0?(nilaiGPMP/dudukiCount).toFixed(2):'---',
    peratusLulus:  dudukiCount>0?((['A+','A','A-','B+','B','C+','C','D','E'].reduce(function(s,g){return s+(hasil.taburanGred[g]||0);},0)/dudukiCount)*100).toFixed(1):0
  };

  // Topik (SP) — dari spBetul/spJumlah
  Object.keys(spBetul).sort(function(a,b){
    var pA=spJumlah[a]>0?Math.round(spBetul[a]/spJumlah[a]*100):0;
    var pB=spJumlah[b]>0?Math.round(spBetul[b]/spJumlah[b]*100):0;
    return pA!==pB ? pA-pB : a.localeCompare(b);
  }).forEach(function(sp) {
    var pct = spJumlah[sp]>0 ? Math.round(spBetul[sp]/spJumlah[sp]*100) : 0;
    hasil.topik.push({
      topik:   sp,
      betul:   spBetul[sp],
      jumlah:  spJumlah[sp],
      peratus: pct,
      status:  pct>=80?'BAIK':pct>=60?'SEDERHANA':'LEMAH'
    });
  });

  // Soalan K1
  for (var i=0; i<40; i++) {
    if (jumlahPerSoalan[i]===0) continue;
    var pct = Math.round(betulPerSoalan[i]/jumlahPerSoalan[i]*100);
    var sp  = (spArr[i]||'—');
    var skm = (skemaArr[i]||'—');
    var spInfo = window._skpspPeta[sp] || null;
    hasil.soalanK1.push({
      soalan:  i+1,
      topik:   sp,
      skema:   skm,
      betul:   betulPerSoalan[i],
      jumlah:  jumlahPerSoalan[i],
      peratus: pct,
      status:  pct>=80?'BAIK':pct>=60?'SEDERHANA':'LEMAH',
      spInfo:  spInfo ? {kod:sp, bab:spInfo.bab||'', huraian:spInfo.huraian||''} : null
    });
  }

  // Soalan K2 — dari tetapan_k2 + markah_k2_json
  if (tetK2Rows && tetK2Rows.length>0) {
    var k2SoalanAg={};
    rows.forEach(function(row){
      if ((row.kehadiran||'').toUpperCase()==='TIDAK HADIR') return;
      if (!row.markah_k2_json) return;
      try {
        var mk2=JSON.parse(row.markah_k2_json);
        mk2.forEach(function(m,i){
          if (!k2SoalanAg[i]) k2SoalanAg[i]={jumlah:0,markahTotal:0,maks:0};
          k2SoalanAg[i].jumlah++;
          k2SoalanAg[i].markahTotal+=parseFloat(m)||0;
        });
      } catch(e){}
    });
    tetK2Rows.forEach(function(t){
      var i=t.soalan_no-1;
      var ag=k2SoalanAg[i]||{jumlah:0,markahTotal:0};
      var purata=ag.jumlah>0?(ag.markahTotal/ag.jumlah).toFixed(1):0;
      var pct=t.markah_penuh>0?Math.round(purata/t.markah_penuh*100):0;
      var spK2=[]; if(t.sp_kod){ try{spK2=JSON.parse(t.sp_kod);}catch(e){spK2=t.sp_kod.split(',').map(function(s){return s.trim();}).filter(Boolean);} }
      hasil.soalanK2.push({
        soalan:t.soalan_no,label:'S'+t.soalan_no,
        bahagian:t.bahagian||'A',
        maks:t.markah_penuh||0,
        purata:purata,peratus:pct,
        bilanganMurid:ag.jumlah,
        status:pct>=80?'BAIK':pct>=60?'SEDERHANA':'LEMAH',
        sp:spK2.map(function(s){return {kod:s,bab:(window._skpspPeta[s]||{}).bab||'',huraian:(window._skpspPeta[s]||{}).huraian||''};})
      });
    });
  }

  // Analisis kelas
  Object.keys(kelasMap).sort().forEach(function(k){
    var km=kelasMap[k];
    hasil.analisisKelas.push({
      kelas:km.kelas,kodSekolah:km.kodSekolah,sekolah:km.sekolah,
      jumlahMurid:km.jumlah,
      purata:km.jumlah>0?(km.wajaranTotal/km.jumlah).toFixed(1):0
    });
  });

  // Ranking sekolah — hanya jika lebih dari 1 sekolah
  var sklList=Object.values(sekolahMap);
  if (sklList.length>1) {
    sklList.sort(function(a,b){
      var gA=a.duduki>0?a.nilaiGP/a.duduki:99;
      var gB=b.duduki>0?b.nilaiGP/b.duduki:99;
      return gA-gB;
    });
    hasil.ranking=sklList.map(function(s){
      return {
        kod:s.kod,nama:s.nama,ppd:s.ppd,
        jumlahMurid:s.murid,
        purataK1:   s.murid>0?(s.k1Total/s.murid).toFixed(1):0,
        purataK2:   s.murid>0?(s.k2Total/s.murid).toFixed(1):0,
        purata:     s.murid>0?(s.wajaranTotal/s.murid).toFixed(1):0,
        gpmp:       s.duduki>0?(s.nilaiGP/s.duduki).toFixed(2):'---'
      };
    });
  }

  return hasil;
}

// ================================================================
// RENDER ANALISIS — hasilkan HTML tabs (sama dengan v4)
// ================================================================
function _renderAnalisis(d, params, peranan) {
  var r = d.ringkasan;

  // Stat ringkasan
  var statGrid =
    '<div class="stats-grid" style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:16px">' +
      '<div class="stat-card sc-in"><div class="stat-top"><div class="stat-ico">👩‍🎓</div></div><div class="stat-val">'+(r.jumlahMurid||0)+'</div><div class="stat-lbl">Jumlah Murid</div></div>' +
      '<div class="stat-card sc-cy"><div class="stat-top"><div class="stat-ico">📝</div></div><div class="stat-val">'+(r.purataK1||0)+'</div><div class="stat-lbl">Purata K1 /40</div></div>' +
      '<div class="stat-card sc-em"><div class="stat-top"><div class="stat-ico">📝</div></div><div class="stat-val">'+(r.purataK2||0)+'</div><div class="stat-lbl">Purata K2 /60</div></div>' +
      '<div class="stat-card sc-in"><div class="stat-top"><div class="stat-ico">📈</div></div><div class="stat-val" style="font-size:20px">'+(r.purata||0)+'%</div><div class="stat-lbl">% Purata Keseluruhan</div></div>' +
      '<div class="stat-card sc-em"><div class="stat-top"><div class="stat-ico">✅</div></div><div class="stat-val">'+(r.peratusLulus||0)+'%</div><div class="stat-lbl">Peratus Lulus</div></div>' +
    '</div>';

  // Tab buttons
  var tabBtns =
    '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px">' +
    '<button class="btn-ghost ana-tab active" onclick="anaTab(this,\'an-topik\')">📌 Topik DSKP</button>' +
    '<button class="btn-ghost ana-tab" onclick="anaTab(this,\'an-soalan\')">🔢 Per Soalan K1 & K2</button>' +
    '<button class="btn-ghost ana-tab" onclick="anaTab(this,\'an-murid\')">👤 Senarai Murid</button>' +
    '<button class="btn-ghost ana-tab" onclick="anaTab(this,\'an-spider\')">🕸️ Analisis Spider</button>' +
    (d.analisisKelas.length>1 ? '<button class="btn-ghost ana-tab" onclick="anaTab(this,\'an-kelas\')">🏫 Analisis Kelas</button>' : '') +
    (d.ranking.length>0 ? '<button class="btn-ghost ana-tab" onclick="anaTab(this,\'an-ranking\')">🏆 Ranking Sekolah</button>' : '') +
    '<button class="btn-ghost ana-tab" onclick="anaTab(this,\'an-gp\')">📈 GP & Gred SPM</button>' +
    
    '</div>' +
    '<div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:12px">' +
    '<button class="btn-primary" onclick="mintaIntervensiAI()">🤖 Cadang Intervensi AI</button>' +
    '<button class="btn-ghost" onclick="cetakAnalisis(\'Analisis SIMP-Ai\')">🖨️ Cetak</button>' +
    '</div>';

  // Tab Topik DSKP
  var tabTopik =
    '<div class="ana-content" id="ac-an-topik">' +
      '<div class="card"><div class="card-head"><div class="card-title">📌 Penguasaan Per Topik DSKP</div></div><div class="card-body">' +
        (d.topik.length===0
          ? '<div class="alert alert-info">ℹ️ Tiada data topik. Pastikan tetapan SKPSP telah dikonfigurasi oleh JPN.</div>'
          : d.topik.map(function(t){ return _renderHeatRow(t); }).join('')) +
      '</div></div>' +
    '</div>';

  // Tab Per Soalan K1 & K2
  var tabSoalan =
    '<div class="ana-content" id="ac-an-soalan" style="display:none">' +
      '<div class="card" style="margin-bottom:12px"><div class="card-head"><div class="card-title">📋 Kertas 1 — Analisis Per Soalan (MCQ)</div></div><div class="card-body" style="padding:0">' +
        (d.soalanK1.length===0
          ? '<div class="alert alert-info" style="margin:16px">ℹ️ Tiada data per soalan.</div>'
          : '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">' +
            '<tr style="background:#1a3c5e;color:white"><th style="padding:8px 12px;text-align:left">Soalan</th><th style="padding:8px 12px;text-align:left">Standard Pembelajaran</th><th style="padding:8px 12px;text-align:center">Skema</th><th style="padding:8px 12px;text-align:center">Betul</th><th style="padding:8px 12px;text-align:center">Jumlah</th><th style="padding:8px 12px;text-align:center">% Betul</th><th style="padding:8px 12px;text-align:center">Status</th></tr>' +
            d.soalanK1.map(function(s){
              var clr=s.peratus>=80?'var(--emerald)':s.peratus>=60?'var(--amber)':'var(--rose)';
              var _sp = s.spInfo || (s.topik && s.topik!=='—' ? {kod:s.topik, bab:(window._skpspPeta[s.topik]||{}).bab||'', huraian:(window._skpspPeta[s.topik]||{}).huraian||''} : null);
              var spHtml = _sp ? _renderSpBadge(_sp) : '—';
              return '<tr class="hr" style="border-top:1px solid var(--border)"><td style="padding:8px 12px;font-weight:700">'+s.soalan+'</td>' +
                '<td style="padding:8px 12px">'+spHtml+'</td>' +
                '<td style="padding:8px 12px;font-weight:700;text-align:center;color:var(--cyan)">'+s.skema+'</td>' +
                '<td style="padding:8px 12px;text-align:center">'+s.betul+'</td>' +
                '<td style="padding:8px 12px;text-align:center">'+s.jumlah+'</td>' +
                '<td style="padding:8px 12px;color:'+clr+';font-weight:700">'+s.peratus+'%</td>' +
                '<td style="padding:8px 12px"><span class="sp '+(s.peratus>=80?'sp-ok':s.peratus>=60?'sp-warn':'sp-err')+'">'+s.status+'</span></td>' +
              '</tr>';
            }).join('') + '</table></div>'
        ) +
      '</div></div>' +
      '<div class="card"><div class="card-head"><div class="card-title">📋 Kertas 2 — Analisis Per Soalan (Subjektif)</div></div><div class="card-body" style="padding:0">' +
        (d.soalanK2.length===0
          ? '<div class="alert alert-info" style="margin:16px">ℹ️ Tiada data K2.</div>'
          : (function(){
              var bhgClr={A:'#1a5276',B:'#1e8449',C:'#7d6608'};
              var bhgLbl={A:'Bahagian A',B:'Bahagian B',C:'Bahagian C'};
              var tbl='<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">'; var cB='';
              d.soalanK2.forEach(function(s){
                if(s.bahagian!==cB){
                  cB=s.bahagian;
                  tbl+='<tr><td colspan="8" style="background:'+bhgClr[s.bahagian]+';color:white;font-weight:700;padding:8px 12px">'+bhgLbl[s.bahagian]+'</td></tr>';
                  tbl+='<tr style="background:#f0f4f8;font-size:12px"><th style="padding:7px 12px">Soalan</th><th>Standard Pembelajaran</th><th>Markah Penuh</th><th>Purata</th><th>% Betul</th><th>Bil. Murid</th><th>Status</th><th></th></tr>';
                }
                var pct=parseFloat(s.peratus)||0;
                var clr=pct>=80?'var(--emerald)':pct>=60?'var(--amber)':'var(--rose)';
                var spHtml=s.sp&&s.sp.length>0?s.sp.map(function(sp){return _renderSpBadge(sp);}).join('<span style="display:inline-block;width:6px"></span>'):'—';
                tbl+='<tr class="hr" style="border-top:1px solid var(--border)">' +
                  '<td style="padding:8px 12px;font-weight:700">'+s.label+'</td>' +
                  '<td style="padding:8px 12px;min-width:120px">'+spHtml+'</td>' +
                  '<td style="padding:8px 12px;text-align:center">'+s.maks+'</td>' +
                  '<td style="padding:8px 12px;font-weight:700;text-align:center">'+s.purata+'</td>' +
                  '<td style="padding:8px 12px;color:'+clr+';font-weight:700;text-align:center">'+pct+'%</td>' +
                  '<td style="padding:8px 12px;text-align:center">'+s.bilanganMurid+'</td>' +
                  '<td style="padding:8px 12px"><span class="sp '+(pct>=80?'sp-ok':pct>=60?'sp-warn':'sp-err')+'">'+s.status+'</span></td>' +
                  '<td style="padding:8px 12px"><div style="width:80px;height:7px;background:var(--bg2);border-radius:4px;overflow:hidden"><div style="height:100%;width:'+Math.min(pct,100)+'%;background:'+(pct>=80?'var(--emerald)':pct>=60?'var(--amber)':'var(--rose)')+';border-radius:4px"></div></div></td>' +
                '</tr>';
              });
              tbl+='</table></div>'; return tbl;
            })()
        ) +
      '</div></div>' +
    '</div>';

  // Tab Senarai Murid
  var tabMurid =
    '<div class="ana-content" id="ac-an-murid" style="display:none">' +
      '<div class="card"><div class="card-head"><div class="card-title">👤 Senarai Murid — K1 + K2 (Markah Wajaran)</div></div><div class="card-body" style="padding:0">' +
        (d.senaraiMurid.length===0
          ? '<div class="alert alert-info" style="margin:16px">ℹ️ Tiada data murid.</div>'
          : '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">' +
            '<tr style=\"background:#1a3c5e;color:white\">' +
            '<th style=\"padding:8px 12px;text-align:center;width:36px\">#</th>' +
            '<th style=\"padding:8px 12px;text-align:left\">Nama Murid</th><th>Kelas</th>' +
            (d.ranking.length>0?'<th>Sekolah</th>':'') +
            '<th>Wajaran K1 /40</th><th>Wajaran K2 /60</th>' +
            '<th style="background:#0e2d4a">% Markah Wajaran /100</th><th>Gred</th></tr>' +
            d.senaraiMurid.map(function(m,_i){
              var clrG=m.gred&&m.gred.startsWith('A')?'var(--emerald)':m.gred&&m.gred.startsWith('B')?'var(--cyan)':m.gred&&m.gred.startsWith('C')?'var(--amber)':'var(--rose)';
              return '<tr class="hr" style="border-top:1px solid var(--border)">' +
                '<td style="padding:8px 12px;text-align:center;color:var(--muted);font-size:12px;font-family:var(--ffm)">'+(_i+1)+'</td>' +
                '<td style="padding:8px 12px;font-weight:700">'+m.nama+'</td>' +
                '<td style="padding:8px 12px;font-size:12px">'+m.kelas+'</td>' +
                (d.ranking.length>0?'<td style="padding:8px 12px;font-size:11px">'+m.sekolah+'</td>':'') +
                '<td style="padding:8px 12px">'+m.wajaranK1+'/40</td>' +
                '<td style="padding:8px 12px">'+m.wajaranK2+'/60</td>' +
                '<td style="padding:8px 12px;font-weight:700;font-size:15px">'+m.markahWajaran+'</td>' +
                '<td style="padding:8px 12px"><span class="sp sp-ok" style="background:'+clrG+';color:white;border:none">'+(m.gred||'—')+'</span></td>' +
              '</tr>';
            }).join('') + '</table></div>'
        ) +
      '</div></div>' +
    '</div>';

  // Tab Spider
  var tabSpider =
    '<div class="ana-content" id="ac-an-spider" style="display:none">' +
      _htmlSpiderTabSupa(d.senaraiMurid, d.analisisKelas, d.soalanK1) +
    '</div>';

  // Tab Analisis Kelas
  var tabKelas = d.analisisKelas.length>1
    ? '<div class="ana-content" id="ac-an-kelas" style="display:none">' +
        '<div class="card"><div class="card-head"><div class="card-title">🏫 Perbandingan Antara Kelas</div></div><div class="card-body" style="padding:0">' +
          '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">' +
          '<tr style="background:#1a3c5e;color:white"><th style="padding:8px 12px">#</th><th>Kelas</th><th>Sekolah</th><th>Jumlah Murid</th><th>Purata Wajaran</th><th>Prestasi</th></tr>' +
          d.analisisKelas.map(function(k,i){
            var pct=Math.min(parseFloat(k.purata),100);
            return '<tr class="hr" style="border-top:1px solid var(--border)">' +
              '<td style="padding:8px 12px;font-weight:700">'+(i+1)+'</td>' +
              '<td style="padding:8px 12px">'+k.kelas+'</td>' +
              '<td style="padding:8px 12px;font-size:12px">'+(k.sekolah||'—')+'</td>' +
              '<td style="padding:8px 12px">'+k.jumlahMurid+'</td>' +
              '<td style="padding:8px 12px;font-weight:700">'+k.purata+'/100</td>' +
              '<td style="padding:8px 12px"><div style="width:100px;height:7px;background:var(--bg2);border-radius:4px;overflow:hidden"><div style="height:100%;width:'+pct+'%;background:'+(pct>=60?'var(--emerald)':pct>=40?'var(--amber)':'var(--rose)')+';border-radius:4px"></div></div></td>' +
            '</tr>';
          }).join('') + '</table></div></div></div></div>'
    : '';

  // Tab Ranking
  var tabRanking = d.ranking.length>0
    ? '<div class="ana-content" id="ac-an-ranking" style="display:none">' +
        '<div class="card"><div class="card-head"><div class="card-title">🏆 Ranking Sekolah</div></div><div class="card-body" style="padding:0">' +
          '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">' +
          '<tr style="background:#1a3c5e;color:white"><th style="padding:8px 12px">#</th><th>Kod</th><th>Sekolah</th><th>PPD</th><th>Murid</th><th>Purata K1 /40</th><th>Purata K2 /60</th><th style="background:#0e2d4a">% Purata Wajaran</th><th>GPMP</th></tr>' +
          d.ranking.map(function(s,i){
            var pct=Math.min(parseFloat(s.purata),100);
            var gpNum=parseFloat(s.gpmp)||99;
            return '<tr class="hr" style="border-top:1px solid var(--border)">' +
              '<td style="padding:8px 12px;font-weight:700">'+(i+1)+'</td>' +
              '<td style="padding:8px 12px;font-size:11px;font-weight:700">'+s.kod+'</td>' +
              '<td style="padding:8px 12px">'+s.nama+'</td>' +
              '<td style="padding:8px 12px;font-size:12px">'+(s.ppd||'—')+'</td>' +
              '<td style="padding:8px 12px">'+s.jumlahMurid+'</td>' +
              '<td style="padding:8px 12px">'+s.purataK1+'/40</td>' +
              '<td style="padding:8px 12px">'+s.purataK2+'/60</td>' +
              '<td style="padding:8px 12px;font-weight:700;font-size:15px">'+s.purata+'</td>' +
              '<td style="padding:8px 12px"><span class="sp '+(gpNum<=3?'sp-ok':gpNum<=5?'sp-warn':'sp-err')+'">'+s.gpmp+'</span></td>' +
            '</tr>';
          }).join('') + '</table></div></div></div></div>'
    : '';

  // Tab Murid Berisiko
  var tabBerisiko = d.muridBerisiko.length>0
    ? '<div class="ana-content" id="ac-an-berisiko" style="display:none">' + _htmlMuridBerisikoSupa(d.muridBerisiko) + '</div>'
    : '';

  // Tab GP & Gred SPM
  var tabGP = _renderTabGP(d);

  return statGrid + tabBtns + tabTopik + tabSoalan + tabMurid + tabSpider + tabKelas + tabRanking + tabBerisiko + tabGP;
}

// ================================================================
// RENDER HELPERS
// ================================================================
function _renderHeatRow(t) {
  var pct=parseFloat(t.peratus)||0;
  var clr=pct>=80?'var(--emerald)':pct>=60?'var(--amber)':'var(--rose)';
  var progCls=pct>=80?'sp-ok':pct>=60?'sp-warn':'sp-err';
  var esc=t.topik.replace(/'/g,"\\'");
  return '<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border);transition:background 0.15s;cursor:default" class="hr">' +
    _renderTopikLabel(t.topik, window._skpspPeta||{}) +
    '<div style="flex:1;height:16px;background:var(--bg2);border-radius:4px;cursor:pointer;display:flex;align-items:center" onmouseenter="_showSpTooltip(this,\''+esc+'\')" onmouseleave="_hideSpTooltip()">' +
      '<div style="height:8px;width:'+pct+'%;background:'+clr+';border-radius:4px;pointer-events:none"></div>' +
    '</div>' +
    '<div style="width:48px;color:'+clr+';font-weight:700;font-family:var(--ffm);font-size:13px">'+pct+'%</div>' +
    '<span class="sp '+progCls+'">'+t.status+'</span>' +
  '</div>';
}

function _renderTopikLabel(kodTopik, skpspPeta) {
  if (!kodTopik || kodTopik==='—') return '<div style="width:80px;flex-shrink:0"><span style="font-size:11px;padding:3px 7px;background:var(--indigo-l);color:var(--indigo);border-radius:20px;font-weight:700;font-family:var(--ffm)">'+(kodTopik||'—')+'</span></div>';
  var esc=kodTopik.replace(/'/g,"\\'");
  return '<div style="width:80px;flex-shrink:0">' +
    '<span style="font-size:11px;padding:3px 7px;background:var(--indigo-l);color:var(--indigo);border-radius:20px;font-weight:700;font-family:var(--ffm);cursor:default" onmouseenter="_showSpTooltip(this,\''+esc+'\')" onmouseleave="_hideSpTooltip()">'+kodTopik+'</span>' +
  '</div>';
}

function _renderSpBadge(spInfo) {
  if (!spInfo||!spInfo.kod) return '—';
  var kod = spInfo.kod;
  // Simpan data ke _skpspPeta jika belum ada (supaya _showSpTooltip boleh baca)
  if (!window._skpspPeta[kod]) {
    window._skpspPeta[kod] = { kod:kod, huraian:spInfo.huraian||'', bab:spInfo.bab||'', sk:spInfo.sk||'' };
  }
  return '<span style="font-size:11px;padding:2px 7px;background:var(--indigo-l);color:var(--indigo);border-radius:20px;font-weight:700;font-family:var(--ffm);cursor:default;display:inline-block" ' +
    'onmouseenter="_showSpTooltip(this,\''+kod.replace(/'/g,"\\'")+'\')" onmouseleave="_hideSpTooltip()">'+kod+'</span>';
}

function _renderTopikSp(topik) {
  if (!topik||topik==='—') return '—';
  return '<span style="font-size:11px;color:var(--muted)">'+topik+'</span>';
}

function _htmlMuridBerisikoSupa(murid) {
  if (murid.length===0) return '<div class="alert alert-success">✅ Tiada murid berisiko.</div>';
  return '<div class="card"><div class="card-head" style="background:var(--rose);"><div class="card-title" style="color:#fff">⚠️ Murid Memerlukan Intervensi</div></div>' +
    '<div class="card-body" style="padding:0"><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">' +
    '<tr style="background:#1a3c5e;color:white"><th style="padding:8px 12px">Nama Murid</th><th>Kelas</th><th>Wajaran K1 /40</th><th>Wajaran K2 /60</th><th>Markah Akhir</th><th>Gred</th><th>Kehadiran</th><th>3M</th><th>Cadangan</th></tr>' +
    murid.map(function(m){
      var cadangan=m.jumlahK1<10?'🔴 Pemulihan Intensif':m.jumlahK1<15?'🟡 Kelas Tambahan':'🟢 Pemantauan';
      if((m.masalah3m||'').toUpperCase()==='YA') cadangan+=' + Rujuk Pemulihan';
      if((m.kehadiran||'').toUpperCase()==='TIDAK HADIR') cadangan+=' + Maklum Ibu Bapa';
      return '<tr class="hr" style="border-top:1px solid var(--border)">' +
        '<td style="padding:8px 12px">'+m.nama+'</td>' +
        '<td style="padding:8px 12px;font-size:12px">'+m.kelas+'</td>' +
        '<td style="padding:8px 12px;color:'+(m.jumlahK1<15?'var(--rose)':'var(--amber)')+';font-weight:700">'+m.jumlahK1+'</td>' +
        '<td style="padding:8px 12px;font-weight:700">'+m.jumlahK2+'</td>' +
        '<td style="padding:8px 12px;font-weight:700">'+m.markahWajaran+'</td>' +
        '<td style="padding:8px 12px">'+(m.gred||'—')+'</td>' +
        '<td style="padding:8px 12px">'+((m.kehadiran||'').toUpperCase()==='TIDAK HADIR'?'<span class="sp sp-err">TIDAK HADIR</span>':m.kehadiran||'—')+'</td>' +
        '<td style="padding:8px 12px">'+((m.masalah3m||'').toUpperCase()==='YA'?'<span class="sp sp-warn">YA</span>':'—')+'</td>' +
        '<td style="padding:8px 12px;font-size:12px">'+cadangan+'</td>' +
      '</tr>';
    }).join('') + '</table></div></div></div>';
}

function _renderTabGP(d) {
  var r=d.ringkasan;
  var tGred=d.taburanGred;
  var duduki=d.jumlahDudukiSebenar;
  var nilaiGPMP=Object.keys(_NILAI_GRED).reduce(function(s,g){return s+(_NILAI_GRED[g]*(tGred[g]||0));},0);
  var gpmp=duduki>0?(nilaiGPMP/duduki).toFixed(2):'---';
  var gpNum=parseFloat(gpmp)||null;

  function pct(bil,jml){return jml>0?((bil/jml)*100).toFixed(1):'0.0';}
  var jmlA=(tGred['A+']||0)+(tGred['A']||0)+(tGred['A-']||0);
  var jmlKredit=jmlA+(tGred['B+']||0)+(tGred['B']||0)+(tGred['C+']||0)+(tGred['C']||0);
  var jmlLulus=jmlKredit+(tGred['D']||0)+(tGred['E']||0);
  var gpKualiti=gpNum===null?{t:'---',c:'sp-mute'}:gpNum<=1.5?{t:'Cemerlang',c:'sp-ok'}:gpNum<=3.0?{t:'Baik',c:'sp-ok'}:gpNum<=5.0?{t:'Sederhana',c:'sp-warn'}:{t:'Perlu Intervensi',c:'sp-err'};

  return '<div class="ana-content" id="ac-an-gp" style="display:none">' +
    '<div class="alert alert-warn" style="margin-bottom:16px">⚠️ <strong>Peringatan:</strong> Nilai GPMP dikira berdasarkan data yang diisi oleh guru. Ketepatan bergantung kepada kesempurnaan data yang dimuat naik.</div>' +
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px">' +
      '<div class="stat-card sc-in"><div class="stat-top"><div class="stat-ico">👩‍🎓</div></div><div class="stat-val">'+duduki+'</div><div class="stat-lbl">Calon Duduki (Tanpa TH)</div></div>' +
      '<div class="stat-card '+(gpNum&&gpNum<=3?'sc-em':gpNum&&gpNum<=5?'sc-am':'sc-ro')+'"><div class="stat-top"><div class="stat-ico">📈</div></div><div class="stat-val">'+gpmp+'</div><div class="stat-lbl">GPMP &nbsp;<span class="sp '+gpKualiti.c+'">'+gpKualiti.t+'</span></div></div>' +
      '<div class="stat-card sc-em"><div class="stat-top"><div class="stat-ico">🏆</div></div><div class="stat-val">'+jmlA+'</div><div class="stat-lbl">Jum. A &nbsp;<small style="color:var(--muted)">('+pct(jmlA,duduki)+'%)</small></div></div>' +
      '<div class="stat-card sc-cy"><div class="stat-top"><div class="stat-ico">✅</div></div><div class="stat-val">'+jmlLulus+'</div><div class="stat-lbl">Lulus A-E &nbsp;<small style="color:var(--muted)">('+pct(jmlLulus,duduki)+'%)</small></div></div>' +
    '</div>' +
    '<div class="card"><div class="card-head"><div class="card-title">📊 Taburan Gred SPM — Perniagaan</div></div><div class="card-body" style="padding:0">' +
      (duduki===0
        ? '<div class="alert alert-info" style="margin:16px">ℹ️ Tiada data gred.</div>'
        : '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">' +
          '<tr style="background:#1a3c5e;color:white"><th style="padding:8px 12px;text-align:center;width:80px">Gred</th><th style="text-align:center;width:80px">Nilai GP</th><th style="text-align:center;width:100px">Bilangan</th><th>Peratusan</th></tr>' +
          _LABEL_GRED.map(function(g){
            var bil=tGred[g]||0;
            var p=parseFloat(pct(bil,duduki));
            var barW=Math.min(p,100);
            var barClr=g.startsWith('A')?'var(--emerald)':g.startsWith('B')||g.startsWith('C')?'var(--amber)':'var(--rose)';
            return '<tr class="hr" style="border-top:1px solid var(--border)">' +
              '<td style="padding:8px 12px;font-weight:700;font-size:15px;text-align:center">'+g+'</td>' +
              '<td style="padding:8px 12px;text-align:center;color:var(--muted)">'+_NILAI_GRED[g]+'</td>' +
              '<td style="padding:8px 12px;text-align:center;font-weight:700">'+bil+'</td>' +
              '<td style="padding:8px 12px"><div style="display:flex;align-items:center;gap:8px">' +
                '<div style="width:120px;height:7px;background:var(--bg2);border-radius:4px;overflow:hidden;flex-shrink:0"><div style="height:100%;width:'+barW+'%;background:'+barClr+';border-radius:4px"></div></div>' +
                '<span style="font-size:12px;color:var(--muted)">'+p+'%</span>' +
              '</div></td></tr>';
          }).join('') +
          '<tr class="hr" style="border-top:1px solid var(--border)">' +
            '<td style="padding:8px 12px;font-weight:700;text-align:center">TH</td>' +
            '<td style="padding:8px 12px;text-align:center;color:var(--muted)">—</td>' +
            '<td style="padding:8px 12px;text-align:center;font-weight:700">'+(tGred['TH']||0)+'</td>' +
            '<td style="padding:8px 12px;font-size:12px;color:var(--muted)">Tidak dikira dalam GP</td></tr>' +
          '<tr style="background:var(--bg);font-weight:700;border-top:2px solid var(--border)">' +
            '<td colspan="2" style="padding:8px 12px;text-align:right;font-size:12px">JUMLAH DUDUKI</td>' +
            '<td style="padding:8px 12px;text-align:center">'+duduki+'</td>' +
            '<td style="padding:8px 12px;color:var(--muted);font-size:12px">TH: '+(tGred['TH']||0)+' calon (tidak dikira)</td></tr>' +
          '</table></div>'
      ) +
    '</div></div>' +
    '<div style="margin-top:12px;padding:12px 16px;background:var(--indigo-l);border-radius:10px;border-left:3px solid var(--indigo)">' +
      '<div style="font-size:12px;font-weight:700;color:var(--indigo);margin-bottom:6px">📘 Formula Pengiraan GPMP</div>' +
      '<div style="font-size:12px;color:var(--sub);font-family:var(--ffm);line-height:1.8">' +
        'GPMP = [ (Bil A+ x 0) + (Bil A x 1) + ... + (Bil G x 9) ] / Jumlah Calon Duduki<br>' +
        '<em>TH tidak dikira. Semakin rendah GPMP = semakin baik prestasi.</em>' +
      '</div>' +
    '</div>' +
  '</div>';
}

// ================================================================
// SPIDER TAB
// ================================================================
function _htmlSpiderTabSupa(senaraiMurid, analisisKelas, soalanK1) {
  var adaSpData=senaraiMurid.some(function(m){return m.spData&&m.spData.length>0;});
  var muridOpts='<option value="">— Pilih Murid —</option>'+
    senaraiMurid.map(function(m,i){return '<option value="'+i+'">'+m.nama+' ('+m.kelas+') — '+(m.gred||'—')+'</option>';}).join('');
  var kelasOpts='<option value="">— Pilih Kelas —</option>'+
    '<option value="kelas|semua">📊 Semua Kelas (Gabungan)</option>'+
    analisisKelas.map(function(k){return '<option value="kelas|'+k.kelas+'">'+k.kelas+'</option>';}).join('');
  return '<div class="card"><div class="card-head"><div class="card-title">🕸️ Analisis Spider — Standard Pembelajaran</div></div><div class="card-body">' +
    (!adaSpData?'<div class="alert alert-warn" style="margin-bottom:12px">⚠️ Data SP per murid hanya tersedia untuk analisis dari tapak guru. Analisis Spider Kelas masih tersedia.</div>':'') +
    '<div class="alert alert-info" style="margin-bottom:14px">ℹ️ Spider chart menunjukkan pencapaian per Standard Pembelajaran. Pilih murid atau kelas.</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px">' +
      '<div class="form-group"><label class="form-label">📌 Pilih Murid</label>' +
        '<select class="form-select" id="spider-murid-sel" onchange="renderSpiderMurid()">'+muridOpts+'</select></div>' +
      '<div class="form-group"><label class="form-label">🏫 Pilih Kelas</label>' +
        '<select class="form-select" id="spider-kelas-sel" onchange="renderSpiderKelas()">'+kelasOpts+'</select></div>' +
    '</div>' +
    '<div style="display:flex;gap:20px;flex-wrap:wrap">' +
      '<div id="spider-murid-wrap" style="flex:1;min-width:280px"></div>' +
      '<div id="spider-kelas-wrap" style="flex:1;min-width:280px"></div>' +
    '</div>' +
  '</div></div>';
}

// Spider render — sama dengan v4
function _simpanSpiderData(murid, soalan, topikAgregat) {
  _spiderData.murid        = murid||[];
  _spiderData.soalan       = soalan||[];
  _spiderData.topikAgregat = topikAgregat||[];
}

function _buatSpiderSVG(labels, values, title, warna) {
  var n=labels.length;
  if(n<3) return '<div class="alert alert-warn">⚠️ Perlu sekurang-kurangnya 3 SP.</div>';
  var W=320,H=320,cx=160,cy=160,R=110;
  var step=(2*Math.PI)/n;
  var svg='<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;max-width:320px;display:block;margin:0 auto">';
  [20,40,60,80,100].forEach(function(lv){
    var r=R*lv/100; var pts=[];
    for(var i=0;i<n;i++){var a=step*i-Math.PI/2;pts.push((cx+r*Math.cos(a)).toFixed(1)+','+(cy+r*Math.sin(a)).toFixed(1));}
    svg+='<polygon points="'+pts.join(' ')+'" fill="none" stroke="#e2e8f0" stroke-width="1"/>';
  });
  for(var i=0;i<n;i++){
    var a=step*i-Math.PI/2;
    svg+='<line x1="'+cx+'" y1="'+cy+'" x2="'+(cx+R*Math.cos(a)).toFixed(1)+'" y2="'+(cy+R*Math.sin(a)).toFixed(1)+'" stroke="#cbd5e0" stroke-width="1"/>';
    var lx=(cx+(R+18)*Math.cos(a)).toFixed(1),ly=(cy+(R+18)*Math.sin(a)).toFixed(1);
    var anchor=Math.cos(a)>0.1?'start':Math.cos(a)<-0.1?'end':'middle';
    svg+='<text x="'+lx+'" y="'+ly+'" text-anchor="'+anchor+'" font-size="9" font-weight="700" fill="#2d3748">'+labels[i]+'</text>';
  }
  var dataPts=[];
  for(var i=0;i<n;i++){var a=step*i-Math.PI/2;var r=R*Math.min(values[i],100)/100;dataPts.push((cx+r*Math.cos(a)).toFixed(1)+','+(cy+r*Math.sin(a)).toFixed(1));}
  svg+='<polygon points="'+dataPts.join(' ')+'" fill="'+warna+'" fill-opacity="0.25" stroke="'+warna+'" stroke-width="2"/>';
  for(var i=0;i<n;i++){var a=step*i-Math.PI/2;var r=R*Math.min(values[i],100)/100;svg+='<circle cx="'+(cx+r*Math.cos(a)).toFixed(1)+'" cy="'+(cy+r*Math.sin(a)).toFixed(1)+'" r="4" fill="'+warna+'"/>';}
  svg+='<text x="'+cx+'" y="20" text-anchor="middle" font-size="11" font-weight="700" fill="#1a3c5e">'+title+'</text>';
  svg+='</svg>'; return svg;
}

function _htmlSPRingkasan(labels, values) {
  var pairs=labels.map(function(l,i){return{sp:l,pct:values[i]};});
  pairs.sort(function(a,b){return a.pct-b.pct;});
  var lemah=pairs.slice(0,Math.min(5,pairs.length));
  var kuat=pairs.slice(-Math.min(3,pairs.length)).reverse();
  function row(p){
    var info=(window._skpspPeta||{})[p.sp]||{};
    var clr=p.pct>=80?'var(--emerald)':p.pct>=60?'var(--amber)':'var(--rose)';
    return '<tr><td>'+_renderSpBadge({kod:p.sp,bab:info.bab||'',huraian:info.huraian||''})+'</td>'+
      '<td style="color:'+clr+';font-weight:700">'+p.pct+'%</td>'+
      '<td><div style="width:60px;height:6px;background:var(--bg2);border-radius:3px;overflow:hidden"><div style="height:100%;width:'+Math.min(p.pct,100)+'%;background:'+clr+';border-radius:3px"></div></div></td></tr>';
  }
  return '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:12px">'+
    '<div style="flex:1;min-width:200px"><div style="font-weight:700;color:var(--rose);margin-bottom:6px;font-size:12px">🔴 SP Perlu Perhatian</div>'+
    '<table style="font-size:12px;width:100%"><tr><th>SP</th><th>%</th><th></th></tr>'+lemah.map(row).join('')+'</table></div>'+
    '<div style="flex:1;min-width:200px"><div style="font-weight:700;color:var(--emerald);margin-bottom:6px;font-size:12px">🟢 SP Cemerlang</div>'+
    '<table style="font-size:12px;width:100%"><tr><th>SP</th><th>%</th><th></th></tr>'+kuat.map(row).join('')+'</table></div>'+
  '</div>';
}

window.renderSpiderMurid = function() {
  var sel=document.getElementById('spider-murid-sel');
  var wrap=document.getElementById('spider-murid-wrap');
  if(!sel||!wrap) return;
  var idx=parseInt(sel.value); if(isNaN(idx)){wrap.innerHTML='';return;}
  var m=_spiderData.murid[idx]; if(!m){wrap.innerHTML='';return;}
  if(!m.spData||m.spData.length===0){wrap.innerHTML='<div class="alert alert-warn">⚠️ Data SP tidak tersedia untuk murid ini.</div>';return;}
  if(m.spData.length<3){wrap.innerHTML='<div class="alert alert-info">ℹ️ Perlu sekurang-kurangnya 3 SP.</div>';return;}
  var labels=m.spData.map(function(s){return s.sp;});
  var values=m.spData.map(function(s){return s.pct;});
  var svg=_buatSpiderSVG(labels,values,m.nama,'#e53e3e');
  wrap.innerHTML='<div class="card"><div class="card-head" style="background:#e53e3e"><div class="card-title" style="color:#fff">🕸️ '+m.nama+' — '+m.kelas+' | Gred: '+(m.gred||'—')+'</div></div><div class="card-body">'+svg+_htmlSPRingkasan(labels,values)+'</div></div>';
};

window.renderSpiderKelas = function() {
  var sel=document.getElementById('spider-kelas-sel');
  var wrap=document.getElementById('spider-kelas-wrap');
  if(!sel||!wrap||!sel.value){if(wrap)wrap.innerHTML='';return;}
  var kelas=sel.value.split('|')[1];
  var spAg={};
  _spiderData.murid.forEach(function(m){
    if(kelas!=='semua'&&m.kelas!==kelas) return;
    (m.spData||[]).forEach(function(s){
      if(!spAg[s.sp])spAg[s.sp]={betul:0,jumlah:0};
      spAg[s.sp].betul+=s.betul; spAg[s.sp].jumlah+=s.jumlah;
    });
  });
  var spList=Object.keys(spAg).sort().map(function(sp){var d=spAg[sp];return{sp:sp,pct:d.jumlah>0?Math.round(d.betul/d.jumlah*100):0};});
  if(spList.length===0&&_spiderData.topikAgregat&&_spiderData.topikAgregat.length>0){
    spList=_spiderData.topikAgregat.map(function(t){return{sp:t.topik,pct:parseFloat(t.peratus)||0};}).sort(function(a,b){return a.sp.localeCompare(b.sp);});
  }
  if(spList.length<3){wrap.innerHTML='<div class="alert alert-warn">⚠️ Tiada data SP mencukupi.</div>';return;}
  var labels=spList.map(function(s){return s.sp;});
  var values=spList.map(function(s){return s.pct;});
  var tajuk=kelas==='semua'?'Semua Kelas':kelas;
  var svg=_buatSpiderSVG(labels,values,tajuk,'#2b6cb0');
  wrap.innerHTML='<div class="card"><div class="card-head" style="background:#2b6cb0"><div class="card-title" style="color:#fff">🕸️ '+tajuk+' — Analisis SP Kelas</div></div><div class="card-body">'+svg+_htmlSPRingkasan(labels,values)+'</div></div>';
};

// ================================================================
// TAB SWITCHING
// ================================================================
window.anaTab = function(btn, tabId) {
  document.querySelectorAll('.ana-tab').forEach(function(b){b.classList.remove('active');b.style.borderColor='';b.style.color='';});
  document.querySelectorAll('.ana-content').forEach(function(c){c.style.display='none';});
  btn.classList.add('active');
  var el=document.getElementById('ac-'+tabId);
  if(el) el.style.display='block';
};

function _aktivasiTab(tabId) {
  var btn=document.querySelector('.ana-tab[onclick*="'+tabId+'"]');
  if(btn) window.anaTab(btn, tabId);
}

// ================================================================
// CETAK ANALISIS
// ================================================================
function cetakAnalisis(tajuk) {
  var orgInfo='';
  if(STATE.peranan==='SEKOLAH') orgInfo='<strong>'+(STATE.kodSekolah||'')+'</strong> — <strong>'+(STATE.namaSekolah||'').toUpperCase()+'</strong>'+(STATE.ppd?' | '+STATE.ppd:'');
  else if(STATE.peranan==='PPD'||STATE.peranan==='JU_DAERAH') orgInfo='<strong>'+(STATE.ppd||'').toUpperCase()+'</strong>';
  else orgInfo='<strong>JABATAN PENDIDIKAN NEGERI KEDAH</strong>';

  // Bina baris maklumat tapisan
  var p=window._cetakParams||{};
  var tapisanBaris=[];
  tapisanBaris.push('Tingkatan: '+(p.tingkatan?'Tingkatan '+p.tingkatan:'Semua'));
  tapisanBaris.push('Pentaksiran: '+(p.jenisPentaksiran&&p.jenisPentaksiran!=='Semua'?p.jenisPentaksiran:'Semua'));
  tapisanBaris.push('Tahun: '+(p.tahun||'Semua'));
  if(STATE.peranan==='JPN'){
    if(p.ppd) tapisanBaris.push('PPD: '+p.ppd);
    else tapisanBaris.push('PPD: Semua PPD');
    if(p.sekolah) tapisanBaris.push('Sekolah: '+p.sekolah);
  }
  if(STATE.peranan==='PPD'||STATE.peranan==='JU_DAERAH'){
    tapisanBaris.push('Sekolah: '+(p.sekolah||'Semua Sekolah'));
  }
  if(p.kelas) tapisanBaris.push('Kelas: '+p.kelas);
  var tapisanHtml='<div style="font-size:10.5px;color:#444;margin-top:4px">'+tapisanBaris.join(' &nbsp;|&nbsp; ')+'</div>';

  // Ambil tab aktif sahaja
  var tabAktif = document.querySelector('.ana-content[style*="block"]') || document.querySelector('.ana-content:not([style*="none"])');
  var namaTab = '';
  var btnAktif = document.querySelector('.ana-tab.active');
  if (btnAktif) namaTab = btnAktif.textContent.trim();

  

  var headerHtml='<div style="padding:10px 0 14px;border-bottom:3px solid #1a3c5e;margin-bottom:14px">'+
    '<table style="width:100%;border:none"><tr>'+
      '<td style="border:none"><div style="font-size:15px;font-weight:700;color:#1a3c5e;text-transform:uppercase">Sistem Analisis Item Perniagaan — JPN Kedah</div>'+
        '<div style="font-size:12px;color:#333;margin-top:3px">Tab: <strong>'+namaTab+'</strong></div>'+
        '<div style="font-size:11px;color:#555;margin-top:2px">'+orgInfo+'</div>'+
        tapisanHtml+'</td>'+
      '<td style="border:none;text-align:right;vertical-align:top;white-space:nowrap">'+
        '<div style="font-size:10px;color:#888">Dicetak: '+new Date().toLocaleString('ms-MY')+'</div>'+
        '<div style="font-size:10px;color:#888">Pengguna: '+STATE.nama+'</div></td>'+
    '</tr></table></div>';

  if (!tabAktif) return;

  // Clone tab aktif dan tukar CSS var kepada warna hex untuk print
  var clone = tabAktif.cloneNode(true);
  var html = clone.innerHTML;
  html = html.replace(/var\(--emerald\)/g,'#059669');
  html = html.replace(/var\(--amber\)/g,'#d97706');
  html = html.replace(/var\(--rose\)/g,'#e11d48');
  html = html.replace(/var\(--indigo\)/g,'#4f46e5');
  html = html.replace(/var\(--cyan\)/g,'#0891b2');
  html = html.replace(/var\(--bg2?\)/g,'#e8edf8');
  html = html.replace(/var\(--border\)/g,'#e2e8f4');
  html = html.replace(/var\(--text\)/g,'#1a2035');
  html = html.replace(/var\(--sub\)/g,'#64748b');
  html = html.replace(/var\(--muted\)/g,'#94a3b8');
  html = html.replace(/var\(--white\)/g,'#ffffff');
  html = html.replace(/var\(--indigo-l\)/g,'#eef2ff');
  html = html.replace(/var\(--emerald-l\)/g,'#ecfdf5');
  html = html.replace(/var\(--amber-l\)/g,'#fffbeb');
  html = html.replace(/var\(--rose-l\)/g,'#fff1f2');

  var printWin=window.open('','_blank');
  if(!printWin) return;
  printWin.document.write('<html><head><title>'+namaTab+'</title><style>'+
    'body{font-family:Arial,sans-serif;font-size:12px;margin:20px;-webkit-print-color-adjust:exact;print-color-adjust:exact}'+
    'table{width:100%;border-collapse:collapse}'+
    'th,td{padding:6px 8px;border:1px solid #e2e8f4;font-size:11px}'+
    'th{background:#1a3c5e;color:#fff}'+
    '.sp{padding:2px 6px;border-radius:10px;font-size:10px;font-weight:700}'+
    '.sp-ok{background:#ecfdf5;color:#059669}'+
    '.sp-warn{background:#fffbeb;color:#d97706}'+
    '.sp-err{background:#fff1f2;color:#e11d48}'+
    '.sp-info{background:#eef2ff;color:#4f46e5}'+
    '.stat-card{border:1px solid #e2e8f4;padding:12px;border-radius:6px;display:inline-block;margin:4px}'+
    '.stat-val{font-size:22px;font-weight:800;font-family:monospace}'+
    '.stat-lbl{font-size:10px;color:#64748b}'+
    '.card{border:1px solid #e2e8f4;border-radius:8px;margin-bottom:12px;overflow:hidden}'+
    '.card-head{padding:10px 14px;background:#f8faff;border-bottom:1px solid #e2e8f4;font-weight:700;font-size:13px}'+
    '.card-body{padding:14px}'+
    '.chip{font-size:10px;padding:2px 8px;border-radius:20px;background:#eef2ff;color:#4f46e5;font-weight:700}'+
    '.ana-tab{display:none}'+
    '.hr:hover{background:none}'+
    '@media print{body{margin:10px}.ana-tab{display:none}}'+
  '</style></head><body>');
  printWin.document.write(headerHtml + '<div>' + html + '</div>');
  printWin.document.write('</body></html>');
  printWin.document.close();
  setTimeout(function(){ printWin.print(); }, 600);
}
async function mintaIntervensiAI(){
  if(!window._anaCache || !window._anaCache.topik || !window._anaCache.topik.length){
    tunjukToast('⚠️ Sila jana analisis dahulu.','warn');return;
  }
  var topikLemah = window._anaCache.topik.slice(0,5);
  var spLemah = topikLemah.map(function(t){return t.topik;}).filter(function(s){return s && s!=='—';});
  if(!spLemah.length){tunjukToast('⚠️ Tiada data SP untuk dianalisis.','warn');return;}

  var k2Data = window._anaCache.soalanK2 || [];
  var k2Relevan = k2Data.filter(function(s){
    return s.sp && s.sp.some(function(x){ return spLemah.indexOf(x.kod)>-1; });
  });
  if(!k2Relevan.length && k2Data.length){
    k2Relevan = k2Data.slice().sort(function(a,b){return a.peratus-b.peratus;}).slice(0,3);
  }
  var k2Teks = k2Relevan.length ? k2Relevan.map(function(s){
    return 'Soalan '+s.soalan+' (Bahagian '+s.bahagian+', SP:'+(s.sp.map(function(x){return x.kod;}).join(',')||'-')+'): '+s.peratus+'% pencapaian, purata '+s.purata+'/'+s.maks;
  }).join('; ') : 'Tiada data Kertas 2 untuk SP ini.';

  var peranan = window._anaCache.peranan;
  var params = window._anaCache.params||{};
  var labelPeringkat = 'SIMP-Ai';
  if(peranan==='SEKOLAH') labelPeringkat=(STATE.namaSekolah||'Sekolah')+(params.kelas?' - '+params.kelas:'');
  else if(peranan==='PPD'||peranan==='JU_DAERAH') labelPeringkat='PPD '+(STATE.ppd||'');
  else labelPeringkat = params.sekolah || params.ppd || 'Negeri Kedah';

  var skopBahagian = [];
  if(params.tingkatan) skopBahagian.push('Tingkatan '+params.tingkatan);
  if(params.jenisPentaksiran) skopBahagian.push(params.jenisPentaksiran);
  if(params.tahun) skopBahagian.push('Tahun '+params.tahun);
  var skopLokasi;
  if(peranan==='SEKOLAH') skopLokasi=(STATE.namaSekolah||'Sekolah')+(params.kelas?' Kelas '+params.kelas:'');
  else if(params.sekolah) skopLokasi='Sekolah '+params.sekolah;
  else if(params.ppd) skopLokasi='PPD '+params.ppd;
  else if(peranan==='PPD'||peranan==='JU_DAERAH') skopLokasi='PPD '+(STATE.ppd||'');
  else skopLokasi='Seluruh Negeri Kedah (semua sekolah & PPD, tiada penapis)';
  var ayatSkop = (skopBahagian.length?skopBahagian.join(', ')+', ':'')+skopLokasi;

  var k2Lengkap = '';
  if(k2Data.length){
    var byBahagian = {};
    k2Data.forEach(function(s){
      var b = s.bahagian||'-';
      if(!byBahagian[b]) byBahagian[b]=[];
      byBahagian[b].push('S'+s.soalan+' (SP:'+(s.sp.map(function(x){return x.kod;}).join(',')||'-')+'): '+s.peratus+'%, '+s.bilanganMurid+' murid');
    });
    k2Lengkap = Object.keys(byBahagian).sort().map(function(b){
      return 'Bahagian '+b+' — '+byBahagian[b].join('; ');
    }).join(' || ');
  }

  var infoAnalisis = 'Skop Analisis: '+ayatSkop+'. 5 SP Terlemah (Kertas 1): '+topikLemah.map(function(t){return t.topik+' ('+t.peratus+'%)';}).join(', ')+'. DATA PENUH Kertas 2 ikut Bahagian: '+(k2Lengkap||'Tiada data K2.');

  document.getElementById('ia-judul').textContent='🤖 Menjana Pelan Intervensi — '+labelPeringkat;
  document.getElementById('ia-body').innerHTML='<div style="text-align:center;padding:30px"><div class="spinner spinner-dark"></div><p style="margin-top:12px;color:var(--sub)">Gemini sedang merangka strategi...</p></div>';
  document.getElementById('ia-btn-cetak').style.display='none';
  bukaModal('modal-intervensi-ai');

  try{
    var spK2Semua = [];
  k2Data.forEach(function(s){ (s.sp||[]).forEach(function(x){ if(x.kod && spK2Semua.indexOf(x.kod)===-1) spK2Semua.push(x.kod); }); });
  var spGabung = spLemah.concat(spK2Semua.filter(function(s){ return spLemah.indexOf(s)===-1; }));

  var qs=new URLSearchParams({
    action:'jana_intervensi_ai', idPengguna:STATE.id,
    labelPeringkat:labelPeringkat, spLemah:spGabung.join(','), infoAnalisis:infoAnalisis
  });
    var res=await fetch(GAS_URL+'?'+qs.toString());
    var hasil=await res.json();
    if(hasil.ok){
      document.getElementById('ia-judul').textContent='💡 Pelan Intervensi AI — '+labelPeringkat;
      document.getElementById('ia-body').innerHTML=
        '<style>#ia-content h3{margin-top:18px;margin-bottom:8px;color:var(--indigo)}'+
        '#ia-content h3:first-child{margin-top:0}'+
        '#ia-content h4{margin-top:14px;margin-bottom:6px}'+
        '#ia-content p{margin-bottom:12px;line-height:1.7}'+
        '#ia-content ul,#ia-content ol{margin-left:20px;margin-bottom:14px}'+
        '#ia-content li{margin-bottom:6px;line-height:1.6}</style>'+
        '<div class="ai-content" id="ia-content">'+hasil.html+'</div>';
      document.getElementById('ia-btn-cetak').style.display='inline-block';
      window._iaLabel = labelPeringkat;
    } else {
      document.getElementById('ia-body').innerHTML='<div class="alert alert-err">❌ '+hasil.mesej+'</div>';
    }
  }catch(e){
    document.getElementById('ia-body').innerHTML='<div class="alert alert-err">❌ Ralat: '+e.message+'</div>';
  }
}

function cetakIntervensiAI(){
  var content=document.getElementById('ia-content');
  if(!content){tunjukToast('⚠️ Tiada kandungan.','warn');return;}
  var w=window.open('','_blank');
  var tarikh=new Date().toLocaleDateString('ms-MY',{day:'2-digit',month:'long',year:'numeric'});
  w.document.write('<html><head><title>Pelan Intervensi AI</title><style>'+
    'body{font-family:Arial,sans-serif;color:#0d2137;padding:40px;line-height:1.6}'+
    '.hd{border-bottom:3px solid #1a3c5e;margin-bottom:20px;padding-bottom:12px;text-align:center}'+
    '.hd h2{margin:0;color:#1a3c5e}.hd h1{margin:6px 0 0;font-size:16px;color:#2d7dd2;text-transform:uppercase}'+
    'h3{color:#2d7dd2}h4{color:#0d2137}p{text-align:justify}'+
    '@media print{button{display:none}}'+
    '</style></head><body>'+
    '<div class="hd"><h2>JABATAN PENDIDIKAN NEGERI KEDAH</h2><h1>Laporan Pelan Intervensi — '+(window._iaLabel||'')+'</h1>'+
    '<p style="font-size:12px;color:#666">Disediakan oleh: '+(STATE.nama||'')+' | Tarikh: '+tarikh+'</p></div>'+
    content.innerHTML+
    '<div style="margin-top:30px;font-size:10px;color:#999;text-align:center;border-top:1px solid #eee;padding-top:8px">Dijana oleh Sistem SIMP-Ai & Gemini AI.</div>'+
    '<script>setTimeout(function(){window.print();},500);</'+'script>'+
    '</body></html>');
  w.document.close();
}
async function simpanApiKeyJPN(){
  const key=document.getElementById('rai-mykey').value.trim();
  if(!key){tunjukToast('⚠️ Sila isi API Key.','warn');return;}
  const params=new URLSearchParams({action:'simpan_api_key',idPengguna:STATE.id,apiKey:key});
  const res=await fetch(GAS_URL+'?'+params.toString());
  const hasil=await res.json();
  if(hasil.ok){
    tunjukToast('✅ '+hasil.mesej,'success');
    document.getElementById('rai-mykey').value='';
    document.getElementById('rai-key-status').innerHTML='✅ API Key berjaya disimpan!';
    semakApiKeyJPN();
  }
  else tunjukToast('❌ '+hasil.mesej,'error');
}
async function semakApiKeyJPN(){
  const params=new URLSearchParams({action:'semak_api_key',idPengguna:STATE.id});
  const res=await fetch(GAS_URL+'?'+params.toString());
  const hasil=await res.json();
  const el=document.getElementById('rai-key-status');
  if(el) el.innerHTML = hasil.ada ? '✅ API Key tersimpan: <code>'+hasil.masked+'</code>' : '⚠️ Belum ada API Key disimpan.';
}
