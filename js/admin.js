// ==========================================
// x-weds-y - admin panel
// ==========================================

const ADMIN_TOKEN_KEY = 'wy_admin_token';
let adminFamilies = [];
let adminMembers = [];
let adminTab = null;

async function adminLogin() {
  const pin = document.getElementById('admin-pin').value;
  const errEl = document.getElementById('admin-login-error');
  errEl.textContent = '';
  if (!pin) { errEl.textContent = 'Enter the admin PIN.'; return; }
  const { data, error } = await db.rpc('wy_admin_login', { p_pin: pin });
  if (error) { errEl.textContent = 'Incorrect PIN.'; return; }
  sessionStorage.setItem(ADMIN_TOKEN_KEY, data);
  enterAdminApp();
}

function adminLogout() {
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  document.getElementById('admin-main-screen').style.display = 'none';
  document.getElementById('entry-screen').style.display = 'flex';
  if (typeof showEntryMode === 'function') showEntryMode('admin');
  document.getElementById('admin-pin').value = '';
}

function goToGuestEntry() {
  document.getElementById('admin-main-screen').style.display = 'none';
  document.getElementById('entry-screen').style.display = 'flex';
  if (typeof showEntryMode === 'function') showEntryMode('guest');
}

function adminToken() {
  return sessionStorage.getItem(ADMIN_TOKEN_KEY);
}

function enterAdminApp() {
  document.getElementById('entry-screen').style.display = 'none';
  const guestMain = document.getElementById('main-screen');
  if (guestMain) guestMain.style.display = 'none';
  document.getElementById('admin-main-screen').style.display = 'block';
  goAdminTab('dashboard');
}

async function tryAdminAutoLogin() {
  const token = adminToken();
  if (!token) return;
  const { error } = await db.rpc('wy_admin_list_families', { p_token: token });
  if (error) { sessionStorage.removeItem(ADMIN_TOKEN_KEY); return; }
  enterAdminApp();
}

const ADMIN_TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
  { id: 'families', label: 'Families', icon: '👪' },
  { id: 'rooms', label: 'Rooms', icon: '🛏️' },
  { id: 'travel', label: 'Travel', icon: '✈️' },
  { id: 'itinerary', label: 'Itinerary', icon: '📅' },
  { id: 'announcements', label: 'Announcements', icon: '🔔' },
  { id: 'gallery', label: 'Gallery', icon: '📸' }
];

function renderAdminNavTabs() {
  const nav = document.getElementById('admin-nav-tabs');
  nav.innerHTML = ADMIN_TABS.map(t =>
    `<div class="nav-tab${t.id === adminTab ? ' active' : ''}" onclick="goAdminTab('${t.id}')">${t.label}</div>`
  ).join('');
}

async function renderDashboardTab(container) {
  container.innerHTML = `
    <div class="card" id="admin-contact-card"></div>
    <div class="card">
      <div class="card-title">Dashboard</div>
      <div class="dash-grid">
        ${ADMIN_TABS.filter(t => t.id !== 'dashboard').map((t, i) => `
          <div class="dash-tile dash-tile-${(i % 6) + 1}" onclick="goAdminTab('${t.id}')">
            <span class="dash-icon">${t.icon}</span>${t.label}
          </div>
        `).join('')}
      </div>
    </div>
  `;
  const { data } = await db.from('wy_contact_info').select('*').eq('id', 1).maybeSingle();
  const el = document.getElementById('admin-contact-card');
  if (!el) return;
  if (!data || (!data.contact1_phone && !data.contact2_phone)) {
    el.innerHTML = `<div class="card-title">Help Contact Numbers</div><div class="form-hint">Not set yet - add them under Announcements.</div>`;
  } else {
    el.innerHTML = `
      <div class="card-title">Help Contact Numbers (shown to guests)</div>
      ${data.contact1_phone ? `<div class="ev-meta">📞 ${escapeHtml(data.contact1_label || 'Contact')}: ${escapeHtml(data.contact1_phone)}</div>` : ''}
      ${data.contact2_phone ? `<div class="ev-meta">📞 ${escapeHtml(data.contact2_label || 'Contact')}: ${escapeHtml(data.contact2_phone)}</div>` : ''}
    `;
  }
}

function goAdminTab(tabId) {
  adminTab = tabId;
  renderAdminNavTabs();
  const content = document.getElementById('admin-page-content');
  if (tabId === 'dashboard') renderDashboardTab(content);
  else if (tabId === 'families') renderFamiliesTab(content);
  else if (tabId === 'rooms') renderRoomsTab(content);
  else if (tabId === 'travel') renderTravelTab(content);
  else if (tabId === 'itinerary') renderItineraryTab(content);
  else if (tabId === 'announcements') renderAnnouncementsTab(content);
  else if (tabId === 'gallery') renderGalleryTab(content);
}

// ---------- Families ----------
async function renderFamiliesTab(container) {
  container.innerHTML = `
    <div class="card">
      <div class="section-header"><h3>Families</h3><button class="btn-primary btn-sm" onclick="openAddFamilyModal()">+ Add Family</button></div>
      <div class="form-group"><input type="text" id="family-search" placeholder="Search by family name, code (e.g. v001), or room no..." oninput="renderFamiliesList()"></div>
      <div id="families-list">Loading...</div>
    </div>
  `;
  await loadFamilies();
}

async function loadFamilies() {
  const { data, error } = await db.rpc('wy_admin_list_families', { p_token: adminToken() });
  const listEl = document.getElementById('families-list');
  if (error) { listEl.innerHTML = `<div class="error-msg">${error.message}</div>`; return; }
  adminFamilies = data || [];
  renderFamiliesList();
}

function renderFamiliesList() {
  const listEl = document.getElementById('families-list');
  if (!listEl) return;
  const query = (document.getElementById('family-search').value || '').trim().toLowerCase();
  let families = adminFamilies;
  if (query) {
    families = families.filter(f =>
      f.family_name.toLowerCase().includes(query) ||
      f.code.toLowerCase().includes(query) ||
      (f.members || []).some(m => m.name.toLowerCase().includes(query) || (m.room_no && m.room_no.toLowerCase().includes(query)))
    );
  }
  if (families.length === 0) { listEl.innerHTML = `<div class="empty-state"><p>${adminFamilies.length === 0 ? 'No families added yet.' : 'No matching families.'}</p></div>`; return; }
  listEl.innerHTML = families.map(f => `
    <div class="member-row">
      <div class="section-header">
        <div class="member-name">${escapeHtml(f.family_name)} <span class="form-hint">(code: ${escapeHtml(f.code)})</span></div>
        <button class="btn-danger btn-sm" onclick="deleteFamily('${f.code}')">Delete</button>
      </div>
      <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);">
        <div class="form-hint" style="margin-bottom:4px;">🏨 Stay (hotel/accommodation)</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <input type="text" placeholder="Stay place name" value="${escapeHtml(f.stay_place_name || '')}" style="flex:1;min-width:140px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;" id="stay-name-${f.code}">
          <input type="url" placeholder="Google Maps link" value="${escapeHtml(f.stay_map_link || '')}" style="flex:1;min-width:160px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;" id="stay-link-${f.code}">
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:6px;">
          <input type="text" placeholder="Coordinator name" value="${escapeHtml(f.stay_coordinator_name || '')}" style="flex:1;min-width:140px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;" id="stay-coord-name-${f.code}">
          <input type="tel" placeholder="Coordinator phone" value="${escapeHtml(f.stay_coordinator_phone || '')}" style="flex:1;min-width:140px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;" id="stay-coord-phone-${f.code}">
          <button class="btn-secondary btn-sm" onclick="saveFamilyStay('${f.code}')">Save Stay</button>
        </div>
      </div>
      ${(f.members || []).map(m => `
        <div style="margin-top:8px;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span style="min-width:150px;">${escapeHtml(m.name)} <span class="form-hint">(${escapeHtml(m.member_code)})</span></span>
            <input type="text" placeholder="Room no." value="${escapeHtml(m.room_no || '')}" style="width:110px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;" id="room-${m.id}">
            <button class="btn-secondary btn-sm" onclick="saveRoom('${m.id}')">Save Room</button>
            <button class="btn-danger btn-sm" onclick="deleteMember('${m.id}','${f.code}')">Remove</button>
          </div>
          ${m.remarks ? `<div class="form-hint" style="margin-top:2px;">📝 ${escapeHtml(m.remarks)}</div>` : ''}
        </div>
      `).join('')}
      <div style="margin-top:10px;">
        <button class="btn-secondary btn-sm" onclick="addMemberPrompt('${f.code}')">+ Add Member</button>
      </div>
    </div>
  `).join('');
}

function openAddFamilyModal() {
  openModal(`
    <div class="modal-title">Add Family</div>
    <div class="form-group"><label>Family Code (e.g. v001)</label><input type="text" id="new-family-code"></div>
    <div class="form-group"><label>Family Name</label><input type="text" id="new-family-name" placeholder="e.g. Vijay Family"></div>
    <div class="form-group"><label>Member Names (one per line)</label><textarea id="new-family-members" rows="4" placeholder="Vijay&#10;Mrs. Vijay&#10;Raj"></textarea></div>
    <div class="error-msg" id="new-family-error"></div>
    <div class="modal-actions">
      <button class="btn-primary" onclick="createFamily()">Create</button>
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

async function createFamily() {
  const errEl = document.getElementById('new-family-error');
  const code = document.getElementById('new-family-code').value.trim();
  const name = document.getElementById('new-family-name').value.trim();
  const members = document.getElementById('new-family-members').value.split('\n').map(s => s.trim()).filter(Boolean);
  if (!code || !name) { errEl.textContent = 'Code and family name are required.'; return; }
  const { error } = await db.rpc('wy_admin_create_family', {
    p_token: adminToken(), p_code: code, p_family_name: name, p_member_names: members
  });
  if (error) { errEl.textContent = error.message; return; }
  closeModal();
  showToast('✅ Family added');
  loadFamilies();
}

async function deleteFamily(code) {
  if (!confirm(`Delete family "${code}"? This removes all their members, rooms and travel details.`)) return;
  const { error } = await db.rpc('wy_admin_delete_family', { p_token: adminToken(), p_code: code });
  if (error) { showToast(error.message, 'error'); return; }
  showToast('Family deleted');
  loadFamilies();
}

async function addMemberPrompt(code) {
  const name = prompt('New member name:');
  if (!name || !name.trim()) return;
  const { error } = await db.rpc('wy_admin_add_member', { p_token: adminToken(), p_code: code, p_name: name.trim() });
  if (error) { showToast(error.message, 'error'); return; }
  loadFamilies();
}

async function deleteMember(memberId, code) {
  if (!confirm('Remove this member?')) return;
  const { error } = await db.rpc('wy_admin_delete_member', { p_token: adminToken(), p_member_id: memberId });
  if (error) { showToast(error.message, 'error'); return; }
  loadFamilies();
}

async function saveFamilyStay(code) {
  const name = document.getElementById(`stay-name-${code}`).value.trim() || null;
  const link = document.getElementById(`stay-link-${code}`).value.trim() || null;
  const coordName = document.getElementById(`stay-coord-name-${code}`).value.trim() || null;
  const coordPhone = document.getElementById(`stay-coord-phone-${code}`).value.trim() || null;
  const { error } = await db.rpc('wy_admin_set_family_stay', {
    p_token: adminToken(), p_code: code, p_stay_place_name: name, p_stay_map_link: link,
    p_stay_coordinator_name: coordName, p_stay_coordinator_phone: coordPhone
  });
  if (error) { showToast(error.message, 'error'); return; }
  showToast('✅ Stay saved');
}

async function saveRoom(memberId) {
  const val = document.getElementById(`room-${memberId}`).value.trim();
  const { error } = await db.rpc('wy_admin_set_room', { p_token: adminToken(), p_member_id: memberId, p_room_no: val });
  if (error) { showToast(error.message, 'error'); return; }
  showToast('✅ Room saved');
}

// ---------- Rooms (room-wise list + guest-wise search) ----------
async function renderRoomsTab(container) {
  container.innerHTML = `
    <div class="card">
      <div class="card-title">Rooms</div>
      <div class="form-group"><input type="text" id="room-search" placeholder="Search by guest name, code (e.g. v001/2), or room no..." oninput="renderRoomGroups()"></div>
      <div id="rooms-list">Loading...</div>
    </div>
  `;
  const { data, error } = await db.rpc('wy_admin_list_members', { p_token: adminToken() });
  if (error) { document.getElementById('rooms-list').innerHTML = `<div class="error-msg">${error.message}</div>`; return; }
  adminMembers = data || [];
  renderRoomGroups();
}

function renderRoomGroups() {
  const listEl = document.getElementById('rooms-list');
  if (!listEl) return;
  const query = (document.getElementById('room-search').value || '').trim().toLowerCase();
  let members = adminMembers;
  if (query) {
    members = members.filter(m =>
      m.name.toLowerCase().includes(query) ||
      m.member_code.toLowerCase().includes(query) ||
      m.family_name.toLowerCase().includes(query) ||
      (m.room_no && m.room_no.toLowerCase().includes(query))
    );
  }
  if (members.length === 0) {
    listEl.innerHTML = `<div class="empty-state"><p>No matching guests.</p></div>`;
    return;
  }
  const groups = {};
  for (const m of members) {
    const key = m.room_no ? m.room_no : '__unassigned__';
    (groups[key] = groups[key] || []).push(m);
  }
  const roomKeys = Object.keys(groups).filter(k => k !== '__unassigned__')
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const sections = roomKeys.map(k => renderRoomGroup('🛏️ Room ' + k, groups[k]));
  if (groups['__unassigned__']) sections.push(renderRoomGroup('❓ Room Not Assigned Yet', groups['__unassigned__']));
  listEl.innerHTML = sections.join('');
}

function renderRoomGroup(title, members) {
  return `
    <div class="member-row">
      <div class="member-name">${escapeHtml(title)}</div>
      ${members.map(m => `
        <div style="margin-top:6px;">
          <div class="form-hint">${escapeHtml(m.name)} (${escapeHtml(m.member_code)}) - ${escapeHtml(m.family_name)}${m.remarks ? ' · 📝 ' + escapeHtml(m.remarks) : ''}</div>
          ${m.travel ? `<div class="form-hint" style="color:var(--text-light);">${compactTravelLine(m.travel)}</div>` : ''}
        </div>
      `).join('')}
    </div>
  `;
}

// One compact line combining arrival + departure + pickup/drop-off, used
// by the Rooms tab so checking one guest doesn't require visiting the
// separate Travel tab too.
function compactTravelLine(t) {
  if (!t) return '';
  const parts = [];
  if (t.arrival_date) {
    let s = `✈️ Arr ${formatDate(t.arrival_date)}${t.arrival_time ? ' ' + formatTime(t.arrival_time) : ''}${t.arrival_mode ? ' ' + escapeHtml(t.arrival_mode) : ''}${t.arrival_number ? ' ' + escapeHtml(t.arrival_number) : ''}`;
    if (t.arrival_vehicle_no || t.arrival_driver_contact) {
      s += ` (🚗 ${[t.arrival_vehicle_no, t.arrival_driver_contact].filter(Boolean).map(escapeHtml).join(' / ')})`;
    }
    parts.push(s);
  }
  if (t.departure_date) {
    let s = `Dep ${formatDate(t.departure_date)}${t.departure_time ? ' ' + formatTime(t.departure_time) : ''}${t.departure_mode ? ' ' + escapeHtml(t.departure_mode) : ''}${t.departure_number ? ' ' + escapeHtml(t.departure_number) : ''}`;
    if (t.departure_vehicle_no || t.departure_driver_contact) {
      s += ` (🚗 ${[t.departure_vehicle_no, t.departure_driver_contact].filter(Boolean).map(escapeHtml).join(' / ')})`;
    }
    parts.push(s);
  }
  return parts.join(' · ');
}

// ---------- Travel (arrival/departure, chronological, date-filterable, exportable) ----------
let _currentArrivals = [];
let _currentDepartures = [];

async function renderTravelTab(container) {
  container.innerHTML = `
    <div class="card">
      <div class="card-title">How to Reach (shown to guests)</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <div class="form-group" style="flex:1;min-width:140px;"><label>Nearest Airport</label><input type="text" id="note-airport" placeholder="e.g. Indore"></div>
        <div class="form-group" style="flex:1;min-width:200px;"><label>Road Journey Note</label><input type="text" id="note-road-time" placeholder="e.g. 5 hrs 30 min road journey from Indore to Mandsaur"></div>
      </div>
      <div class="form-group"><label>Airport → Venue (Google Maps link)</label><input type="url" id="note-airport-venue" placeholder="https://maps.app.goo.gl/..."></div>
      <div class="form-group"><label>Airport → Stay (only if different from venue)</label><input type="url" id="note-airport-stay" placeholder="https://maps.app.goo.gl/..."></div>
      <div class="form-group"><label>Nearest Railway Station</label><input type="text" id="note-railway" placeholder="e.g. Mandsaur Railway Station"></div>
      <div class="form-group"><label>Railway Station → Venue (Google Maps link)</label><input type="url" id="note-railway-venue" placeholder="https://maps.app.goo.gl/..."></div>
      <div class="form-group"><label>Railway Station → Stay (only if different from venue)</label><input type="url" id="note-railway-stay" placeholder="https://maps.app.goo.gl/..."></div>
      <button class="btn-primary btn-sm" onclick="saveTravelNote()">Save Note</button>
      <div class="error-msg" id="note-error"></div>
      <div class="section-header" style="margin-top:14px;"><h3>Train Routes</h3><button class="btn-secondary btn-sm" onclick="openTravelRouteModal(null)">+ Add Route</button></div>
      <div id="travel-routes-list">Loading...</div>
    </div>
    <div class="card">
      <div class="card-title">Filter by Date</div>
      <div id="travel-date-chips" style="display:flex;gap:8px;flex-wrap:wrap;"></div>
      <div class="form-hint" style="margin-top:8px;">Pick a day to see who's arriving/departing then - covers one day before to one day after the function dates. Choose "All" to see or export everyone.</div>
    </div>
    <div class="card">
      <div class="section-header"><h3>Arrivals</h3><button class="btn-primary btn-sm" onclick="exportTravelCSV('arrival')">⬇️ Export to Excel</button></div>
      <div id="arrivals-list">Loading...</div>
    </div>
    <div class="card">
      <div class="section-header"><h3>Departures</h3><button class="btn-primary btn-sm" onclick="exportTravelCSV('departure')">⬇️ Export to Excel</button></div>
      <div id="departures-list">Loading...</div>
    </div>
  `;
  const { data, error } = await db.rpc('wy_admin_list_members', { p_token: adminToken() });
  if (error) { document.getElementById('arrivals-list').innerHTML = `<div class="error-msg">${error.message}</div>`; return; }
  adminMembers = data || [];
  await loadTravelDateChips();
  renderTravelLists();
  loadTravelNote();
  loadTravelRoutes();
}

let _travelDateOptions = [];
let _travelSelectedDate = null; // null = All

// Pure UTC arithmetic - never round-trip through local-timezone Date
// parsing here. Mixing local-midnight parsing with toISOString() (always
// UTC) is a fixed point for positive UTC offsets (e.g. IST, UTC+5:30):
// advancing one local day and reading back the UTC date string yields the
// SAME string every time, so the chip-range loop below never terminated
// for anyone in India - froze the Travel tab on every load.
function addDaysIso(isoDate, n) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function travelChipLabel(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

async function loadTravelDateChips() {
  const { data } = await db.from('wy_itinerary').select('event_date');
  const dates = (data || []).map(e => e.event_date).filter(Boolean).sort();
  _travelDateOptions = [];
  if (dates.length > 0) {
    const start = addDaysIso(dates[0], -1);
    const end = addDaysIso(dates[dates.length - 1], 1);
    let cur = start;
    let guard = 0;
    while (cur <= end && guard < 90) {
      _travelDateOptions.push(cur);
      cur = addDaysIso(cur, 1);
      guard++;
    }
  }
  _travelSelectedDate = null;
  renderTravelDateChips();
}

function renderTravelDateChips() {
  const el = document.getElementById('travel-date-chips');
  if (!el) return;
  const chip = (val, label) =>
    `<button class="btn-sm ${_travelSelectedDate === val ? 'btn-primary' : 'btn-secondary'}" onclick="selectTravelDate(${val === null ? 'null' : `'${val}'`})">${label}</button>`;
  el.innerHTML = chip(null, 'All') + _travelDateOptions.map(d => chip(d, travelChipLabel(d))).join('');
}

function selectTravelDate(d) {
  _travelSelectedDate = d;
  renderTravelDateChips();
  renderTravelLists();
}

async function loadTravelNote() {
  const { data } = await db.from('wy_travel_note').select('*').eq('id', 1).maybeSingle();
  if (!data) return;
  document.getElementById('note-airport').value = data.airport_name || '';
  document.getElementById('note-road-time').value = data.road_time || '';
  document.getElementById('note-airport-venue').value = data.airport_to_venue_link || '';
  document.getElementById('note-airport-stay').value = data.airport_to_stay_link || '';
  document.getElementById('note-railway').value = data.railway_station_name || '';
  document.getElementById('note-railway-venue').value = data.railway_to_venue_link || '';
  document.getElementById('note-railway-stay').value = data.railway_to_stay_link || '';
}

async function saveTravelNote() {
  const errEl = document.getElementById('note-error');
  errEl.textContent = '';
  const { error } = await db.rpc('wy_admin_set_travel_note', {
    p_token: adminToken(),
    p_airport_name: document.getElementById('note-airport').value.trim() || null,
    p_road_time: document.getElementById('note-road-time').value.trim() || null,
    p_railway_station_name: document.getElementById('note-railway').value.trim() || null,
    p_airport_to_venue_link: document.getElementById('note-airport-venue').value.trim() || null,
    p_airport_to_stay_link: document.getElementById('note-airport-stay').value.trim() || null,
    p_railway_to_venue_link: document.getElementById('note-railway-venue').value.trim() || null,
    p_railway_to_stay_link: document.getElementById('note-railway-stay').value.trim() || null
  });
  if (error) { errEl.textContent = error.message; return; }
  showToast('✅ Saved');
}

let adminTravelRoutes = [];

async function loadTravelRoutes() {
  const { data, error } = await db.from('wy_travel_routes').select('*').order('sort_order');
  const listEl = document.getElementById('travel-routes-list');
  adminTravelRoutes = data || [];
  if (error || !data || data.length === 0) { listEl.innerHTML = `<div class="empty-state"><p>No routes added yet.</p></div>`; return; }
  listEl.innerHTML = data.map(r => `
    <div class="itinerary-item">
      <div class="section-header">
        <div class="ev-name">🚉 ${escapeHtml(r.from_place)}</div>
        <div>
          <button class="btn-secondary btn-sm" onclick="openTravelRouteModalById('${r.id}')">Edit</button>
          <button class="btn-danger btn-sm" onclick="deleteTravelRoute('${r.id}')">Delete</button>
        </div>
      </div>
      <div class="ev-meta">${escapeHtml(r.train_no || '')}</div>
    </div>
  `).join('');
}

function openTravelRouteModalById(id) {
  openTravelRouteModal(adminTravelRoutes.find(r => r.id === id));
}

function openTravelRouteModal(r) {
  r = r || {};
  openModal(`
    <div class="modal-title">${r.id ? 'Edit' : 'Add'} Train Route</div>
    <div class="form-group"><label>From (station/city)</label><input type="text" id="route-from" value="${escapeHtml(r.from_place || '')}"></div>
    <div class="form-group"><label>Train Number(s)</label><input type="text" id="route-train-no" placeholder="e.g. 19316 or 22901 / 20667" value="${escapeHtml(r.train_no || '')}"></div>
    <div class="error-msg" id="route-error"></div>
    <div class="modal-actions">
      <button class="btn-primary" onclick="saveTravelRoute('${r.id || ''}')">Save</button>
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

async function saveTravelRoute(id) {
  const errEl = document.getElementById('route-error');
  const fromPlace = document.getElementById('route-from').value.trim();
  if (!fromPlace) { errEl.textContent = 'From is required.'; return; }
  const { error } = await db.rpc('wy_admin_upsert_travel_route', {
    p_token: adminToken(), p_id: id || null,
    p_from_place: fromPlace,
    p_train_no: document.getElementById('route-train-no').value.trim() || null,
    p_sort_order: 0
  });
  if (error) { errEl.textContent = error.message; return; }
  closeModal();
  showToast('✅ Saved');
  loadTravelRoutes();
}

async function deleteTravelRoute(id) {
  if (!confirm('Delete this train route?')) return;
  const { error } = await db.rpc('wy_admin_delete_travel_route', { p_token: adminToken(), p_id: id });
  if (error) { showToast(error.message, 'error'); return; }
  loadTravelRoutes();
}

function travelFilterRange() {
  return { from: _travelSelectedDate, to: _travelSelectedDate };
}

function travelHasFilter() {
  return !!_travelSelectedDate;
}

function filterByDate(members, dateField) {
  const { from, to } = travelFilterRange();
  return members.filter(m => {
    const d = m.travel[dateField];
    if (!d) return false;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}

function renderTravelLists() {
  const withArrival = adminMembers.filter(m => m.travel && m.travel.arrival_date);
  const withDeparture = adminMembers.filter(m => m.travel && m.travel.departure_date);

  _currentArrivals = filterByDate(withArrival, 'arrival_date')
    .sort((a, b) => (a.travel.arrival_date + (a.travel.arrival_time || '')).localeCompare(b.travel.arrival_date + (b.travel.arrival_time || '')));
  _currentDepartures = filterByDate(withDeparture, 'departure_date')
    .sort((a, b) => (a.travel.departure_date + (a.travel.departure_time || '')).localeCompare(b.travel.departure_date + (b.travel.departure_time || '')));

  const filtered = travelHasFilter();
  document.getElementById('arrivals-list').innerHTML = _currentArrivals.length
    ? _currentArrivals.map(m => renderTravelRow(m, 'arrival')).join('')
    : `<div class="empty-state"><p>No arrivals ${filtered ? 'in this date range' : 'submitted yet'}.</p></div>`;
  document.getElementById('departures-list').innerHTML = _currentDepartures.length
    ? _currentDepartures.map(m => renderTravelRow(m, 'departure')).join('')
    : `<div class="empty-state"><p>No departures ${filtered ? 'in this date range' : 'submitted yet'}.</p></div>`;
}

function renderTravelRow(m, kind) {
  const t = m.travel;
  const date = kind === 'arrival' ? t.arrival_date : t.departure_date;
  const time = kind === 'arrival' ? t.arrival_time : t.departure_time;
  const mode = kind === 'arrival' ? t.arrival_mode : t.departure_mode;
  const number = kind === 'arrival' ? t.arrival_number : t.departure_number;
  const vehicleNo = kind === 'arrival' ? t.arrival_vehicle_no : t.departure_vehicle_no;
  const driverContact = kind === 'arrival' ? t.arrival_driver_contact : t.departure_driver_contact;
  const fieldId = `${kind}-${m.id}`;
  return `
    <div class="itinerary-item">
      <div class="ev-name">${formatDate(date)}${time ? ' · ' + formatTime(time) : ''} - ${escapeHtml(m.name)} <span class="form-hint">(${escapeHtml(m.member_code)})</span></div>
      <div class="ev-meta">${escapeHtml(m.family_name)}${mode ? ' · ' + escapeHtml(mode) : ''}${number ? ' · ' + escapeHtml(number) : ''}</div>
      ${m.remarks ? `<div class="ev-meta">📝 ${escapeHtml(m.remarks)}</div>` : ''}
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
        <input type="text" id="vehicle-${fieldId}" placeholder="Vehicle no." value="${escapeHtml(vehicleNo || '')}" style="width:130px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;">
        <input type="text" id="driver-${fieldId}" placeholder="Driver contact" value="${escapeHtml(driverContact || '')}" style="width:150px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;">
        <button class="btn-secondary btn-sm" onclick="savePickup('${m.id}','${kind}')">Save Pickup</button>
      </div>
    </div>
  `;
}

async function savePickup(memberId, kind) {
  const fieldId = `${kind}-${memberId}`;
  const vehicleNo = document.getElementById(`vehicle-${fieldId}`).value.trim();
  const driverContact = document.getElementById(`driver-${fieldId}`).value.trim();
  const { error } = await db.rpc('wy_admin_set_pickup', {
    p_token: adminToken(), p_member_id: memberId, p_leg: kind, p_vehicle_no: vehicleNo, p_driver_contact: driverContact
  });
  if (error) { showToast(error.message, 'error'); return; }
  showToast('✅ Pickup saved');
}

function csvEscape(val) {
  const s = String(val == null ? '' : val);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function exportTravelCSV(kind) {
  const rows = kind === 'arrival' ? _currentArrivals : _currentDepartures;
  if (!rows || rows.length === 0) { showToast('Nothing to export.', 'error'); return; }
  const headers = ['Date', 'Time', 'Name', 'Member Code', 'Family', 'Mode', kind === 'arrival' ? 'Train/Flight No' : 'Train/Flight No'];
  const lines = [headers.map(csvEscape).join(',')];
  for (const m of rows) {
    const t = m.travel;
    const date = kind === 'arrival' ? t.arrival_date : t.departure_date;
    const time = kind === 'arrival' ? t.arrival_time : t.departure_time;
    const mode = kind === 'arrival' ? t.arrival_mode : t.departure_mode;
    const number = kind === 'arrival' ? t.arrival_number : t.departure_number;
    lines.push([formatDate(date), time ? formatTime(time) : '', m.name, m.member_code, m.family_name, mode || '', number || ''].map(csvEscape).join(','));
  }
  const csvContent = '﻿' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const { from, to } = travelFilterRange();
  const suffix = from && from === to ? `-${from}` : (from || to) ? `-${from || 'start'}_to_${to || 'end'}` : '';
  a.download = `x-weds-y-${kind}s${suffix}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------- Itinerary ----------
async function renderItineraryTab(container) {
  container.innerHTML = `
    <div class="card">
      <div class="section-header"><h3>Events</h3><button class="btn-primary btn-sm" onclick="openItineraryModal(null)">+ Add Event</button></div>
      <div id="itinerary-admin-list">Loading...</div>
    </div>
    <div class="card">
      <div class="section-header"><h3>Meals</h3><button class="btn-primary btn-sm" onclick="openMealModal(null)">+ Add Meal</button></div>
      <div id="meals-admin-list">Loading...</div>
    </div>
  `;
  await loadItineraryAdmin();
  await loadMealsAdmin();
}

let adminMealsCache = [];

async function loadMealsAdmin() {
  const { data, error } = await db.from('wy_meals').select('*').order('meal_date').order('meal_time');
  const listEl = document.getElementById('meals-admin-list');
  adminMealsCache = data || [];
  if (error || !data || data.length === 0) { listEl.innerHTML = `<div class="empty-state"><p>No meals added yet.</p></div>`; return; }
  listEl.innerHTML = data.map(m => `
    <div class="itinerary-item">
      <div class="section-header">
        <div class="ev-name">🍽️ ${escapeHtml(m.meal_name)}</div>
        <div>
          <button class="btn-secondary btn-sm" onclick="openMealModalById('${m.id}')">Edit</button>
          <button class="btn-danger btn-sm" onclick="deleteMeal('${m.id}')">Delete</button>
        </div>
      </div>
      <div class="ev-meta">${m.meal_date ? formatDate(m.meal_date) : ''} ${m.meal_time ? formatTime(m.meal_time) : ''}</div>
      <div class="ev-meta">${escapeHtml(m.venue || '')}</div>
      ${m.details ? `<div class="ev-meta">${escapeHtml(m.details)}</div>` : ''}
    </div>
  `).join('');
}

function openMealModalById(id) {
  openMealModal(adminMealsCache.find(m => m.id === id));
}

function openMealModal(m) {
  m = m || {};
  openModal(`
    <div class="modal-title">${m.id ? 'Edit' : 'Add'} Meal</div>
    <div class="form-group"><label>Meal Name</label><input type="text" id="meal-name" placeholder="e.g. Breakfast, Lunch, High Tea, Dinner" value="${escapeHtml(m.meal_name || '')}"></div>
    <div class="form-group"><label>Date</label><input type="date" id="meal-date" value="${m.meal_date || ''}"></div>
    <div class="form-group"><label>Time</label><input type="time" id="meal-time" value="${m.meal_time || ''}"></div>
    <div class="form-group"><label>Venue</label><input type="text" id="meal-venue" value="${escapeHtml(m.venue || '')}"></div>
    <div class="form-group"><label>Details</label><textarea id="meal-details" rows="2" placeholder="e.g. Gujarati thali buffet">${escapeHtml(m.details || '')}</textarea></div>
    <div class="error-msg" id="meal-error"></div>
    <div class="modal-actions">
      <button class="btn-primary" onclick="saveMeal('${m.id || ''}')">Save</button>
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

async function saveMeal(id) {
  const errEl = document.getElementById('meal-error');
  const { error } = await db.rpc('wy_admin_upsert_meal', {
    p_token: adminToken(), p_id: id || null,
    p_meal_name: document.getElementById('meal-name').value.trim(),
    p_meal_date: document.getElementById('meal-date').value || null,
    p_meal_time: document.getElementById('meal-time').value || null,
    p_venue: document.getElementById('meal-venue').value.trim() || null,
    p_details: document.getElementById('meal-details').value.trim() || null,
    p_sort_order: 0
  });
  if (error) { errEl.textContent = error.message; return; }
  closeModal();
  showToast('✅ Saved');
  loadMealsAdmin();
}

async function deleteMeal(id) {
  if (!confirm('Delete this meal?')) return;
  const { error } = await db.rpc('wy_admin_delete_meal', { p_token: adminToken(), p_id: id });
  if (error) { showToast(error.message, 'error'); return; }
  loadMealsAdmin();
}

let adminItineraryCache = [];

async function loadItineraryAdmin() {
  const { data, error } = await db.from('wy_itinerary').select('*').order('event_date').order('start_time');
  const listEl = document.getElementById('itinerary-admin-list');
  adminItineraryCache = data || [];
  if (error || !data || data.length === 0) { listEl.innerHTML = `<div class="empty-state"><p>No events yet.</p></div>`; return; }
  listEl.innerHTML = data.map(ev => `
    <div class="itinerary-item">
      <div class="section-header">
        <div class="ev-name">${escapeHtml(ev.event_name)}</div>
        <div>
          <button class="btn-secondary btn-sm" onclick="openItineraryModalById('${ev.id}')">Edit</button>
          <button class="btn-danger btn-sm" onclick="deleteItinerary('${ev.id}')">Delete</button>
        </div>
      </div>
      <div class="ev-meta">${ev.event_date ? formatDate(ev.event_date) : ''} ${ev.start_time ? formatTime(ev.start_time) : ''}</div>
      <div class="ev-meta">${escapeHtml(ev.venue || '')}</div>
      ${ev.map_link ? `<div class="ev-meta">🗺️ <a href="${escapeHtml(ev.map_link)}" target="_blank" rel="noopener">Map link set</a></div>` : ''}
      ${ev.coordinator_name || ev.coordinator_phone ? `<div class="ev-meta">📞 ${escapeHtml(ev.coordinator_name || 'Coordinator')}${ev.coordinator_phone ? ' - ' + escapeHtml(ev.coordinator_phone) : ''}</div>` : ''}
    </div>
  `).join('');
}

function openItineraryModalById(id) {
  openItineraryModal(adminItineraryCache.find(e => e.id === id));
}

function openItineraryModal(ev) {
  ev = ev || {};
  openModal(`
    <div class="modal-title">${ev.id ? 'Edit' : 'Add'} Event</div>
    <div class="form-group"><label>Event Name</label><input type="text" id="ev-name" value="${escapeHtml(ev.event_name || '')}"></div>
    <div class="form-group"><label>Date</label><input type="date" id="ev-date" value="${ev.event_date || ''}"></div>
    <div class="form-group"><label>Start Time</label><input type="time" id="ev-start" value="${ev.start_time || ''}"></div>
    <div class="form-group"><label>End Time</label><input type="time" id="ev-end" value="${ev.end_time || ''}"></div>
    <div class="form-group"><label>Venue</label><input type="text" id="ev-venue" value="${escapeHtml(ev.venue || '')}"></div>
    <div class="form-group"><label>Google Maps Link</label><input type="url" id="ev-map-link" placeholder="https://maps.app.goo.gl/..." value="${escapeHtml(ev.map_link || '')}"></div>
    <div class="form-group"><label>Coordinator Name</label><input type="text" id="ev-coord-name" value="${escapeHtml(ev.coordinator_name || '')}"></div>
    <div class="form-group"><label>Coordinator Phone</label><input type="tel" id="ev-coord-phone" value="${escapeHtml(ev.coordinator_phone || '')}"></div>
    <div class="form-group"><label>Menu</label><textarea id="ev-menu" rows="2">${escapeHtml(ev.menu || '')}</textarea></div>
    <div class="form-group"><label>Dress Code</label><input type="text" id="ev-dress" value="${escapeHtml(ev.dress_code || '')}"></div>
    <div class="error-msg" id="ev-error"></div>
    <div class="modal-actions">
      <button class="btn-primary" onclick="saveItinerary('${ev.id || ''}')">Save</button>
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

async function saveItinerary(id) {
  const errEl = document.getElementById('ev-error');
  const { error } = await db.rpc('wy_admin_upsert_itinerary', {
    p_token: adminToken(), p_id: id || null,
    p_event_name: document.getElementById('ev-name').value.trim(),
    p_event_date: document.getElementById('ev-date').value || null,
    p_start_time: document.getElementById('ev-start').value || null,
    p_end_time: document.getElementById('ev-end').value || null,
    p_venue: document.getElementById('ev-venue').value.trim() || null,
    p_menu: document.getElementById('ev-menu').value.trim() || null,
    p_dress_code: document.getElementById('ev-dress').value.trim() || null,
    p_sort_order: 0,
    p_map_link: document.getElementById('ev-map-link').value.trim() || null,
    p_coordinator_name: document.getElementById('ev-coord-name').value.trim() || null,
    p_coordinator_phone: document.getElementById('ev-coord-phone').value.trim() || null
  });
  if (error) { errEl.textContent = error.message; return; }
  closeModal();
  showToast('✅ Saved');
  loadItineraryAdmin();
}

async function deleteItinerary(id) {
  if (!confirm('Delete this event?')) return;
  const { error } = await db.rpc('wy_admin_delete_itinerary', { p_token: adminToken(), p_id: id });
  if (error) { showToast(error.message, 'error'); return; }
  loadItineraryAdmin();
}

// ---------- Announcements ----------
async function renderAnnouncementsTab(container) {
  container.innerHTML = `
    <div class="card">
      <div class="card-title">Help Contact Numbers (shown to every guest)</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <div class="form-group" style="flex:1;min-width:140px;"><label>Contact 1 Name</label><input type="text" id="c1-label" placeholder="e.g. Host - Vijay"></div>
        <div class="form-group" style="flex:1;min-width:140px;"><label>Contact 1 Phone</label><input type="text" id="c1-phone" placeholder="e.g. 98765xxxxx"></div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <div class="form-group" style="flex:1;min-width:140px;"><label>Contact 2 Name</label><input type="text" id="c2-label" placeholder="e.g. Coordinator - Rahul"></div>
        <div class="form-group" style="flex:1;min-width:140px;"><label>Contact 2 Phone</label><input type="text" id="c2-phone" placeholder="e.g. 98765xxxxx"></div>
      </div>
      <button class="btn-primary btn-sm" onclick="saveContacts()">Save Contacts</button>
      <div class="error-msg" id="contacts-error"></div>
    </div>
    <div class="card">
      <div class="card-title">Post an Announcement</div>
      <div class="form-group"><label>Title</label><input type="text" id="an-title"></div>
      <div class="form-group"><label>Message</label><textarea id="an-message" rows="3"></textarea></div>
      <button class="btn-primary" onclick="postAnnouncement()">🔔 Post &amp; Buzz Everyone</button>
      <div class="error-msg" id="an-error"></div>
    </div>
    <div class="card"><div class="card-title">Recent Announcements</div><div id="announcements-admin-list">Loading...</div></div>
  `;
  await loadContacts();
  await loadAnnouncementsAdmin();
}

async function loadContacts() {
  const { data } = await db.from('wy_contact_info').select('*').eq('id', 1).maybeSingle();
  if (!data) return;
  document.getElementById('c1-label').value = data.contact1_label || '';
  document.getElementById('c1-phone').value = data.contact1_phone || '';
  document.getElementById('c2-label').value = data.contact2_label || '';
  document.getElementById('c2-phone').value = data.contact2_phone || '';
}

async function saveContacts() {
  const errEl = document.getElementById('contacts-error');
  errEl.textContent = '';
  const { error } = await db.rpc('wy_admin_set_contacts', {
    p_token: adminToken(),
    p_c1_label: document.getElementById('c1-label').value.trim() || null,
    p_c1_phone: document.getElementById('c1-phone').value.trim() || null,
    p_c2_label: document.getElementById('c2-label').value.trim() || null,
    p_c2_phone: document.getElementById('c2-phone').value.trim() || null
  });
  if (error) { errEl.textContent = error.message; return; }
  showToast('✅ Contact numbers saved');
}

async function loadAnnouncementsAdmin() {
  const { data, error } = await db.from('wy_announcements').select('*').order('created_at', { ascending: false });
  const listEl = document.getElementById('announcements-admin-list');
  if (error || !data || data.length === 0) { listEl.innerHTML = `<div class="empty-state"><p>No announcements yet.</p></div>`; return; }
  listEl.innerHTML = data.map(a => `
    <div class="announcement-item">
      <div class="an-title">${escapeHtml(a.title)}</div>
      <div>${escapeHtml(a.message)}</div>
      <div class="an-time">${new Date(a.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
    </div>
  `).join('');
}

async function postAnnouncement() {
  const errEl = document.getElementById('an-error');
  errEl.textContent = '';
  const title = document.getElementById('an-title').value.trim();
  const message = document.getElementById('an-message').value.trim();
  if (!title || !message) { errEl.textContent = 'Title and message are required.'; return; }

  const { error } = await db.rpc('wy_admin_post_announcement', { p_token: adminToken(), p_title: title, p_message: message });
  if (error) { errEl.textContent = error.message; return; }

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/wy-send-push`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token: adminToken(), title, message })
    });
    const result = await res.json();
    showToast(`✅ Posted - buzzed ${result.sent || 0} device(s)`);
  } catch (e) {
    showToast('Posted, but the buzz notification failed to send.', 'error');
  }

  document.getElementById('an-title').value = '';
  document.getElementById('an-message').value = '';
  loadAnnouncementsAdmin();
}

// ---------- Gallery ----------
async function renderGalleryTab(container) {
  container.innerHTML = `<div class="card"><div class="card-title">Gallery Moderation</div><div id="gallery-admin-grid">Loading...</div></div>`;
  await loadGalleryAdmin();
}

async function loadGalleryAdmin() {
  const { data, error } = await db.rpc('wy_admin_list_gallery', { p_token: adminToken() });
  const grid = document.getElementById('gallery-admin-grid');
  if (error) { grid.innerHTML = `<div class="error-msg">${error.message}</div>`; return; }
  if (!data || data.length === 0) { grid.innerHTML = `<div class="empty-state"><p>No photos yet.</p></div>`; return; }
  grid.innerHTML = `<div class="gallery-grid">` + data.map(p => {
    const { data: urlData } = db.storage.from(GALLERY_BUCKET).getPublicUrl(p.storage_path);
    return `<div style="position:relative;">
      <img src="${urlData.publicUrl}" loading="lazy">
      <button class="btn-danger btn-sm" style="position:absolute;top:4px;right:4px;padding:2px 8px;" onclick="deletePhoto('${p.id}')">✕</button>
    </div>`;
  }).join('') + `</div>`;
}

async function deletePhoto(id) {
  if (!confirm('Delete this photo for everyone?')) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/wy-admin-delete-photo`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token: adminToken(), p_id: id })
    });
    if (!res.ok) throw new Error(await res.text());
    showToast('Photo deleted');
    loadGalleryAdmin();
  } catch (e) {
    showToast('Could not delete photo', 'error');
  }
}

tryAdminAutoLogin();
