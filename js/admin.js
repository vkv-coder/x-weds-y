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
  if (adminFamilies.length === 0) { listEl.innerHTML = `<div class="empty-state"><p>No families added yet.</p></div>`; return; }
  listEl.innerHTML = adminFamilies.map(f => `
    <div class="member-row">
      <div class="section-header">
        <div class="member-name">${escapeHtml(f.family_name)} <span class="form-hint">(code: ${escapeHtml(f.code)})</span></div>
        <button class="btn-danger btn-sm" onclick="deleteFamily('${f.code}')">Delete</button>
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
      <div class="card-title">Filter by Date</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
        <div class="form-group" style="margin-bottom:0;flex:1;min-width:140px;"><label>From</label><input type="date" id="travel-from" oninput="renderTravelLists()"></div>
        <div class="form-group" style="margin-bottom:0;flex:1;min-width:140px;"><label>To</label><input type="date" id="travel-to" oninput="renderTravelLists()"></div>
        <button class="btn-secondary btn-sm" onclick="clearTravelFilter()">Clear</button>
      </div>
      <div class="form-hint" style="margin-top:8px;">Tip: set From/To to the same date to see just one day - e.g. the day before the wedding.</div>
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
  renderTravelLists();
}

function clearTravelFilter() {
  document.getElementById('travel-from').value = '';
  document.getElementById('travel-to').value = '';
  renderTravelLists();
}

function travelFilterRange() {
  return {
    from: document.getElementById('travel-from').value || null,
    to: document.getElementById('travel-to').value || null
  };
}

function travelHasFilter() {
  const { from, to } = travelFilterRange();
  return !!(from || to);
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
  const suffix = (from || to) ? `-${from || 'start'}_to_${to || 'end'}` : '';
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
      <div class="section-header"><h3>Itinerary</h3><button class="btn-primary btn-sm" onclick="openItineraryModal(null)">+ Add Event</button></div>
      <div id="itinerary-admin-list">Loading...</div>
    </div>
  `;
  await loadItineraryAdmin();
}

let adminItineraryCache = [];

async function loadItineraryAdmin() {
  const { data, error } = await db.from('wy_itinerary').select('*').order('sort_order').order('event_date');
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
    p_sort_order: 0
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
