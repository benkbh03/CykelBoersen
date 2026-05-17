/* ============================================================
   ADMIN BULK IMPORT — onboard store forhandlere via CSV
   ============================================================
   - Admin vælger en forhandler der har givet onboarding-samtykke
   - Drag-and-drop CSV (eller paste) → preview-tabel med validering
   - Sequential import via eksisterende admin-create-bike edge function
   - Image-URLs (https://...) accepteres direkte; admin-create-bike
     gemmer dem i bike_images. Senere kan vi re-hoste til Storage.
   ============================================================ */

import { esc } from './utils.js';

export function createAdminBulkImport({ supabase, showToast }) {

  // ── State ─────────────────────────────────────────────────
  let _selectedDealerId = null;
  let _parsedRows = [];
  let _eligibleDealers = [];

  // ── Required & optional fields (skal matche admin-create-bike) ──
  const REQUIRED_FIELDS = ['brand', 'model', 'price', 'city', 'type', 'condition'];
  const OPTIONAL_FIELDS = [
    'year', 'size', 'size_cm', 'wheel_size', 'color', 'colors',
    'frame_material', 'brake_type', 'groupset', 'electronic_shifting',
    'weight_kg', 'warranty', 'external_url', 'description', 'original_price',
  ];
  const VALID_TYPES = ['Racercykel', 'Mountainbike', 'Citybike', 'El-cykel', 'Ladcykel', 'Børnecykel', 'Gravel'];
  const VALID_CONDITIONS = ['Ny', 'Som ny', 'God stand', 'Brugt'];

  // ── CSV-parser (lille, ingen lib) ────────────────────────
  function parseCSV(text) {
    const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return { headers: [], rows: [] };
    const headers = parseLine(lines[0]).map(h => h.trim().toLowerCase());
    const rows = lines.slice(1).map(line => {
      const values = parseLine(line);
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (values[i] || '').trim(); });
      return obj;
    });
    return { headers, rows };
  }

  function parseLine(line) {
    const result = [];
    let current = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (c === ',' && !inQuotes) {
        result.push(current); current = '';
      } else current += c;
    }
    result.push(current);
    return result;
  }

  // ── Row-validering ───────────────────────────────────────
  function validateRow(row) {
    const errors = [];
    const warnings = [];

    for (const f of REQUIRED_FIELDS) {
      if (!row[f]) errors.push(f);
    }

    if (row.price) {
      const p = parseInt(row.price, 10);
      if (!Number.isFinite(p) || p <= 0) errors.push('price-ugyldig');
    }
    if (row.year) {
      const y = parseInt(row.year, 10);
      if (!Number.isFinite(y) || y < 1950 || y > new Date().getFullYear() + 1) {
        warnings.push(`year=${row.year} ser mistænkelig ud`);
      }
    }
    if (row.type && !VALID_TYPES.includes(row.type)) {
      warnings.push(`type='${row.type}' er ikke standard (forventet: ${VALID_TYPES.join('/')})`);
    }
    if (row.condition && !VALID_CONDITIONS.includes(row.condition)) {
      warnings.push(`condition='${row.condition}' er ikke standard`);
    }

    // Saml image-URLs (image_1, image_2, ... eller image1, image2, ...)
    const images = [];
    for (let i = 1; i <= 10; i++) {
      const url = row[`image_${i}`] || row[`image${i}`] || '';
      if (url && /^https:\/\//.test(url)) images.push(url);
      else if (url) warnings.push(`image_${i} skal være https://...`);
    }
    if (images.length === 0) warnings.push('Ingen billeder');

    return { valid: errors.length === 0, errors, warnings, images };
  }

  // ── Konverter row til bike-payload til admin-create-bike ──
  function rowToBike(row) {
    const bike = {};
    for (const f of [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS]) {
      if (row[f] !== undefined && row[f] !== '') bike[f] = row[f];
    }
    // Type-konvertering
    if (bike.price) bike.price = parseInt(bike.price, 10);
    if (bike.original_price) bike.original_price = parseInt(bike.original_price, 10);
    if (bike.year) bike.year = parseInt(bike.year, 10);
    if (bike.size_cm) bike.size_cm = parseInt(bike.size_cm, 10);
    if (bike.weight_kg) bike.weight_kg = parseFloat(bike.weight_kg);
    if (bike.electronic_shifting === 'true' || bike.electronic_shifting === '1') bike.electronic_shifting = true;
    else if (bike.electronic_shifting === 'false' || bike.electronic_shifting === '0') bike.electronic_shifting = false;
    else delete bike.electronic_shifting;
    if (bike.colors && typeof bike.colors === 'string') {
      bike.colors = bike.colors.split(/[,;]/).map(s => s.trim()).filter(Boolean);
    }
    bike.title = (bike.brand + ' ' + (bike.model || '')).trim();
    return bike;
  }

  // ── Hent kandidat-forhandlere ────────────────────────────
  async function loadEligibleDealers() {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, shop_name, name, city, admin_can_create_listings, verified')
      .eq('seller_type', 'dealer')
      .eq('admin_can_create_listings', true)
      .order('shop_name', { ascending: true });
    if (error) return [];
    _eligibleDealers = data || [];
    return _eligibleDealers;
  }

  // ── Render hovedviewet ──────────────────────────────────
  async function renderBulkImportTab() {
    const container = document.getElementById('admin-bulk-import');
    if (!container) return;
    container.innerHTML = `<p style="color:var(--muted)">Henter forhandlere…</p>`;
    await loadEligibleDealers();

    if (_eligibleDealers.length === 0) {
      container.innerHTML = `
        <div style="padding:24px;background:var(--sand);border-radius:10px;text-align:center;">
          <p style="margin:0 0 8px;font-weight:600;">Ingen forhandlere har aktiveret onboarding-service endnu</p>
          <p style="margin:0;color:var(--muted);font-size:0.9rem;">Forhandleren skal aktivere "Tillad Cykelbørsen at oprette annoncer på mine vegne" under deres profil-indstillinger før du kan importere på deres vegne.</p>
        </div>`;
      return;
    }

    container.innerHTML = `
      <div class="bulk-import-step">
        <h3 style="margin:0 0 6px;font-family:'Fraunces',serif;">1. Vælg forhandler</h3>
        <p style="margin:0 0 10px;color:var(--muted);font-size:0.85rem;">Kun forhandlere med aktiv onboarding-tilladelse vises.</p>
        <select id="bulk-dealer-select" style="width:100%;max-width:480px;padding:10px;border:1px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:0.9rem;">
          <option value="">— Vælg forhandler —</option>
          ${_eligibleDealers.map(d => `
            <option value="${esc(d.id)}">${esc(d.shop_name || d.name || 'Unavngivet')} ${d.city ? '(' + esc(d.city) + ')' : ''}${d.verified ? ' ✓' : ''}</option>
          `).join('')}
        </select>
      </div>

      <div class="bulk-import-step" style="margin-top:24px;">
        <h3 style="margin:0 0 6px;font-family:'Fraunces',serif;">2. Upload CSV</h3>
        <p style="margin:0 0 10px;color:var(--muted);font-size:0.85rem;">
          Excel: Gem som "CSV UTF-8 (Comma delimited)".
          <button id="bulk-download-template" type="button" style="background:none;border:none;color:var(--rust);text-decoration:underline;cursor:pointer;padding:0;font-family:inherit;font-size:inherit;">Download eksempel-CSV →</button>
        </p>
        <div id="bulk-drop-zone" style="border:2px dashed var(--border);border-radius:10px;padding:32px;text-align:center;cursor:pointer;background:var(--sand);transition:all 0.15s;">
          <input type="file" id="bulk-file-input" accept=".csv,text/csv" style="display:none;">
          <p style="margin:0 0 8px;font-size:1.5rem;">📄</p>
          <p style="margin:0 0 4px;font-weight:600;">Slip CSV her eller klik for at vælge</p>
          <p style="margin:0;color:var(--muted);font-size:0.82rem;">.csv-format, max 5 MB</p>
        </div>
      </div>

      <div id="bulk-preview-section" style="display:none;margin-top:24px;"></div>
      <div id="bulk-progress-section" style="display:none;margin-top:24px;"></div>
    `;

    // Wire up listeners
    document.getElementById('bulk-dealer-select').onchange = (e) => {
      _selectedDealerId = e.target.value || null;
    };
    document.getElementById('bulk-download-template').onclick = downloadTemplate;
    setupDropZone();
  }

  // ── Setup file drop ──────────────────────────────────────
  function setupDropZone() {
    const dz = document.getElementById('bulk-drop-zone');
    const input = document.getElementById('bulk-file-input');
    if (!dz || !input) return;

    dz.onclick = () => input.click();
    dz.ondragover = (e) => { e.preventDefault(); dz.style.background = '#fff'; };
    dz.ondragleave = () => { dz.style.background = 'var(--sand)'; };
    dz.ondrop = (e) => {
      e.preventDefault();
      dz.style.background = 'var(--sand)';
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    };
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    };
  }

  async function handleFile(file) {
    if (!/\.csv$/i.test(file.name)) {
      showToast('⚠️ Kun .csv-filer accepteres. Gem din Excel som CSV.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('⚠️ Filen er for stor (max 5 MB)');
      return;
    }
    const text = await file.text();
    const { headers, rows } = parseCSV(text);
    if (rows.length === 0) {
      showToast('⚠️ CSV indeholder ingen rækker');
      return;
    }
    _parsedRows = rows;
    renderPreview(headers, rows);
  }

  // ── Preview-tabel ────────────────────────────────────────
  function renderPreview(headers, rows) {
    const section = document.getElementById('bulk-preview-section');
    const validated = rows.map(r => ({ row: r, ...validateRow(r) }));
    const validCount = validated.filter(v => v.valid).length;
    const errCount = validated.length - validCount;

    section.style.display = 'block';
    section.innerHTML = `
      <h3 style="margin:0 0 6px;font-family:'Fraunces',serif;">3. Gennemgå rækker</h3>
      <p style="margin:0 0 12px;color:var(--muted);font-size:0.85rem;">
        <strong style="color:var(--charcoal);">${validated.length}</strong> rækker fundet —
        <span style="color:#2e7d32;font-weight:600;">${validCount} klar</span>
        ${errCount > 0 ? `· <span style="color:#c8302a;font-weight:600;">${errCount} med fejl</span>` : ''}
      </p>
      <div style="max-height:400px;overflow:auto;border:1px solid var(--border);border-radius:8px;">
        <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
          <thead style="background:var(--sand);position:sticky;top:0;">
            <tr>
              <th style="padding:8px 10px;text-align:left;border-bottom:1px solid var(--border);">#</th>
              <th style="padding:8px 10px;text-align:left;border-bottom:1px solid var(--border);">Status</th>
              <th style="padding:8px 10px;text-align:left;border-bottom:1px solid var(--border);">Cykel</th>
              <th style="padding:8px 10px;text-align:left;border-bottom:1px solid var(--border);">Pris</th>
              <th style="padding:8px 10px;text-align:left;border-bottom:1px solid var(--border);">By</th>
              <th style="padding:8px 10px;text-align:left;border-bottom:1px solid var(--border);">Billeder</th>
              <th style="padding:8px 10px;text-align:left;border-bottom:1px solid var(--border);">Detaljer</th>
            </tr>
          </thead>
          <tbody>
            ${validated.map((v, i) => `
              <tr style="border-bottom:1px solid var(--border);${v.valid ? '' : 'background:#fff3e0;'}">
                <td style="padding:6px 10px;color:var(--muted);">${i + 1}</td>
                <td style="padding:6px 10px;">${v.valid ? '✅' : '❌'}</td>
                <td style="padding:6px 10px;">${esc(v.row.brand || '?')} ${esc(v.row.model || '')}</td>
                <td style="padding:6px 10px;">${v.row.price ? Number(v.row.price).toLocaleString('da-DK') + ' kr' : '—'}</td>
                <td style="padding:6px 10px;">${esc(v.row.city || '—')}</td>
                <td style="padding:6px 10px;">${v.images.length}</td>
                <td style="padding:6px 10px;font-size:0.78rem;">
                  ${v.errors.length ? `<span style="color:#c8302a;">Mangler: ${v.errors.join(', ')}</span>` : ''}
                  ${v.warnings.length ? `<span style="color:#a8761a;display:block;margin-top:2px;">⚠ ${v.warnings.join(' · ')}</span>` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div style="margin-top:16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        <button id="bulk-import-btn" ${validCount === 0 ? 'disabled' : ''} style="background:var(--rust);color:#fff;border:none;padding:12px 24px;border-radius:10px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:0.95rem;${validCount === 0 ? 'opacity:0.5;cursor:not-allowed;' : ''}">
          🚀 Importér ${validCount} cykler
        </button>
        <button id="bulk-reset-btn" style="background:none;border:1px solid var(--border);padding:12px 18px;border-radius:10px;cursor:pointer;font-family:'DM Sans',sans-serif;">Nulstil</button>
        <span style="color:var(--muted);font-size:0.82rem;">Kører sekventielt, ~1 sek pr. cykel</span>
      </div>
    `;

    document.getElementById('bulk-import-btn').onclick = () => executeImport(validated);
    document.getElementById('bulk-reset-btn').onclick = () => {
      _parsedRows = [];
      section.style.display = 'none';
      document.getElementById('bulk-file-input').value = '';
      const prog = document.getElementById('bulk-progress-section');
      if (prog) prog.style.display = 'none';
    };
  }

  // ── Eksekvér import ──────────────────────────────────────
  async function executeImport(validated) {
    if (!_selectedDealerId) {
      showToast('⚠️ Vælg en forhandler først');
      return;
    }

    const validRows = validated.filter(v => v.valid);
    const progress = document.getElementById('bulk-progress-section');
    progress.style.display = 'block';
    progress.innerHTML = `
      <h3 style="margin:0 0 6px;font-family:'Fraunces',serif;">4. Import-status</h3>
      <div style="background:var(--sand);border-radius:10px;padding:16px;">
        <div style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:0.85rem;">
            <span>Fremgang</span>
            <span id="bulk-progress-text"><strong>0</strong> / ${validRows.length}</span>
          </div>
          <div style="background:var(--border);height:8px;border-radius:4px;overflow:hidden;">
            <div id="bulk-progress-bar" style="background:var(--forest);height:100%;width:0%;transition:width 0.2s;"></div>
          </div>
        </div>
        <div id="bulk-result-log" style="max-height:300px;overflow:auto;font-size:0.82rem;font-family:'DM Sans',sans-serif;"></div>
      </div>
    `;

    document.getElementById('bulk-import-btn').disabled = true;

    const log = document.getElementById('bulk-result-log');
    const bar = document.getElementById('bulk-progress-bar');
    const text = document.getElementById('bulk-progress-text');
    let success = 0, failed = 0;

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    const SUPABASE_URL = supabase.supabaseUrl;

    for (let i = 0; i < validRows.length; i++) {
      const v = validRows[i];
      const bike = rowToBike(v.row);
      const images = v.images.map((url, idx) => ({ url, is_primary: idx === 0 }));

      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-create-bike`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ target_user_id: _selectedDealerId, bike, images }),
        });
        const json = await res.json();
        if (res.ok && json.ok) {
          success++;
          log.insertAdjacentHTML('beforeend',
            `<div style="padding:4px 0;color:#2e7d32;">✓ Række ${i + 1}: ${esc(bike.brand)} ${esc(bike.model || '')} oprettet (${json.bike_id.slice(0, 8)}…)</div>`
          );
        } else {
          failed++;
          log.insertAdjacentHTML('beforeend',
            `<div style="padding:4px 0;color:#c8302a;">✗ Række ${i + 1}: ${esc(bike.brand)} ${esc(bike.model || '')} — ${esc(json.error || 'Ukendt fejl')}</div>`
          );
        }
      } catch (err) {
        failed++;
        log.insertAdjacentHTML('beforeend',
          `<div style="padding:4px 0;color:#c8302a;">✗ Række ${i + 1}: netværksfejl — ${esc(String(err))}</div>`
        );
      }

      const done = i + 1;
      bar.style.width = `${(done / validRows.length) * 100}%`;
      text.innerHTML = `<strong>${done}</strong> / ${validRows.length}`;
      log.scrollTop = log.scrollHeight;
    }

    log.insertAdjacentHTML('beforeend', `
      <div style="margin-top:12px;padding:12px;background:#fff;border-radius:8px;border:1px solid var(--border);">
        <strong>Færdig:</strong> ${success} oprettet · ${failed} fejlet
      </div>
    `);
    document.getElementById('bulk-import-btn').disabled = false;
    showToast(`✓ ${success} cykler importeret${failed > 0 ? ` · ${failed} fejlede` : ''}`);
  }

  // ── Download eksempel-CSV ────────────────────────────────
  function downloadTemplate() {
    const headers = [
      'brand', 'model', 'type', 'price', 'year', 'condition', 'size', 'size_cm', 'wheel_size',
      'color', 'frame_material', 'brake_type', 'groupset', 'electronic_shifting', 'weight_kg',
      'warranty', 'city', 'description', 'external_url',
      'image_1', 'image_2', 'image_3', 'image_4', 'image_5',
    ];
    // Bemærk: wheel_size som '28' (ikke '28"'). Excel/copy-paste roder ofte med
    // tomme-symbolet og bryder CSV-parsing. Skriv kun tallet — UI'et viser '28 tommer'.
    const sample = [
      'Trek', 'Madone SL 6', 'Racercykel', '32000', '2023', 'Som ny', 'M', '54', '28',
      'Sort', 'Carbon', 'Skivebremser hydraulisk', 'Shimano 105 Di2', 'true', '8.2',
      '12 mdr forhandlergaranti', 'København', 'Veligholdt racercykel kørt ca. 2000 km.', '',
      'https://eksempel.dk/billede1.jpg', 'https://eksempel.dk/billede2.jpg', '', '', '',
    ];
    // CSV-escape: hvis værdi indeholder komma, quote eller newline, wrap i quotes og dobl interne quotes
    const csvEscape = (v) => {
      const s = String(v);
      if (/[,"\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    const csv = headers.map(csvEscape).join(',') + '\n' +
      sample.map(csvEscape).join(',') + '\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cykelboersen-bulk-import-template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return {
    renderBulkImportTab,
    loadBulkImportTab: renderBulkImportTab,
  };
}
