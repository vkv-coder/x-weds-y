// ==========================================
// x-weds-y - guest app
// ==========================================

let currentFamily = null;
let currentTab = null;
const CODE_KEY = 'wy_family_code';
const NAME_KEY = 'wy_guest_name';

async function guestLogin() {
  const codeInput = document.getElementById('login-code');
  const code = (codeInput.value || '').trim();
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  if (!code) { errEl.textContent = 'Please enter your family code.'; return; }

  const { data, error } = await db.rpc('wy_guest_login', { p_code: code });
  if (error) { errEl.textContent = 'Code not recognised. Please check with the host.'; return; }

  currentFamily = data;
  localStorage.setItem(CODE_KEY, code.toLowerCase());
  enterApp();
}

function guestLogout() {
  localStorage.removeItem(CODE_KEY);
  currentFamily = null;
  document.getElementById('main-screen').style.display = 'none';
  document.getElementById('entry-screen').style.display = 'flex';
  if (typeof showEntryMode === 'function') showEntryMode('guest');
  document.getElementById('login-code').value = '';
}

function enterApp() {
  document.getElementById('entry-screen').style.display = 'none';
  const adminMain = document.getElementById('admin-main-screen');
  if (adminMain) adminMain.style.display = 'none';
  document.getElementById('main-screen').style.display = 'block';
  document.getElementById('family-name-badge').textContent = currentFamily.family_name;
  registerServiceWorker();
  goTab('dashboard');
  promptPushOnce();
}

// Browsers require an explicit user tap on the permission dialog - this
// cannot be skipped or auto-granted. This just asks once automatically on
// first login instead of making the guest find the button themselves.
function promptPushOnce() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
  if (localStorage.getItem('wy_push_prompted')) return;
  localStorage.setItem('wy_push_prompted', '1');
  if (Notification.permission === 'default') {
    setTimeout(enableAnnouncementPush, 800);
  }
}

async function tryAutoLogin() {
  const code = localStorage.getItem(CODE_KEY);
  if (!code) return;
  const { data, error } = await db.rpc('wy_guest_login', { p_code: code });
  if (error) { localStorage.removeItem(CODE_KEY); return; }
  currentFamily = data;
  enterApp();
}

const GUEST_TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
  { id: 'stay', label: 'My Stay', icon: '🏨' },
  { id: 'home', label: 'Itinerary', icon: '📅' },
  { id: 'announcements', label: 'Announcement', icon: '🔔' },
  { id: 'family', label: 'My Family', icon: '👪' },
  { id: 'gallery', label: 'Gallery', icon: '📸' }
];

function renderNavTabs() {
  const nav = document.getElementById('nav-tabs');
  nav.innerHTML = GUEST_TABS.map(t =>
    `<div class="nav-tab${t.id === currentTab ? ' active' : ''}" onclick="goTab('${t.id}')">${t.label}</div>`
  ).join('');
}

function renderDashboardPage(container) {
  container.innerHTML = `
    <div class="card" id="contact-card"></div>
    <div class="card">
      <div class="card-title">Dashboard</div>
      <div class="dash-grid">
        ${GUEST_TABS.filter(t => t.id !== 'dashboard').map((t, i) => `
          <div class="dash-tile dash-tile-${(i % 6) + 1}" onclick="goTab('${t.id}')">
            <span class="dash-icon">${t.icon}</span>${t.label}
          </div>
        `).join('')}
      </div>
    </div>
  `;
  renderContactCard();
}

function goTab(tabId) {
  currentTab = tabId;
  renderNavTabs();
  const content = document.getElementById('page-content');
  if (tabId === 'dashboard') renderDashboardPage(content);
  else if (tabId === 'stay') renderStayPage(content);
  else if (tabId === 'home') renderHomePage(content);
  else if (tabId === 'announcements') renderAnnouncementsPage(content);
  else if (tabId === 'family') renderFamilyPage(content);
  else if (tabId === 'gallery') renderGalleryPage(content);
}

// ---------- Itinerary ----------
async function renderHomePage(container) {
  container.innerHTML = `
    <div class="card" id="contact-card"></div>
    <div class="itinerary-grid">
      <div class="card"><div class="card-title">📅 Events</div><div id="itinerary-list">Loading...</div></div>
      <div class="card"><div class="card-title">🍽️ Meals</div><div id="meals-list">Loading...</div></div>
    </div>
  `;
  renderContactCard();

  const { data, error } = await db.from('wy_itinerary').select('*').order('event_date').order('start_time');
  const listEl = document.getElementById('itinerary-list');
  if (error || !data || data.length === 0) {
    listEl.innerHTML = `<div class="empty-state"><p>No functions added yet. Check back soon.</p></div>`;
  } else {
    listEl.innerHTML = data.map(ev => `
      <div class="itinerary-item">
        <div class="ev-name">${escapeHtml(ev.event_name)}</div>
        <div class="ev-meta">
          ${ev.event_date ? '📅 ' + formatDate(ev.event_date) : ''}
          ${ev.start_time ? ' · 🕐 ' + formatTime(ev.start_time) + (ev.end_time ? ' - ' + formatTime(ev.end_time) : '') : ''}
        </div>
        ${ev.venue ? `<div class="ev-meta">📍 ${escapeHtml(ev.venue)}</div>` : ''}
        ${ev.dress_code ? `<div class="ev-meta">👗 Dress code: ${escapeHtml(ev.dress_code)}</div>` : ''}
        ${ev.map_link || ev.coordinator_phone ? `
        <div class="ev-links">
          ${ev.map_link ? `<a class="ev-link-btn" href="${escapeHtml(ev.map_link)}" target="_blank" rel="noopener">🗺️ View on Map</a>` : ''}
          ${ev.coordinator_phone ? `<a class="ev-link-btn" href="tel:${escapeHtml(ev.coordinator_phone)}">📞 ${escapeHtml(ev.coordinator_name || 'Coordinator')}</a>` : ''}
        </div>` : ''}
      </div>
    `).join('');
  }

  const { data: meals, error: mealsError } = await db.from('wy_meals').select('*').order('meal_date').order('meal_time');
  const mealsEl = document.getElementById('meals-list');
  if (mealsError || !meals || meals.length === 0) {
    mealsEl.innerHTML = `<div class="empty-state"><p>No meals added yet.</p></div>`;
  } else {
    mealsEl.innerHTML = meals.map(m => `
      <div class="itinerary-item">
        <div class="ev-name">${escapeHtml(m.meal_name)}</div>
        <div class="ev-meta">
          ${m.meal_date ? '📅 ' + formatDate(m.meal_date) : ''}
          ${m.meal_time ? ' · 🕐 ' + formatTime(m.meal_time) : ''}
        </div>
        ${m.venue ? `<div class="ev-meta">📍 ${escapeHtml(m.venue)}</div>` : ''}
        ${m.details ? `<div class="ev-meta">${escapeHtml(m.details)}</div>` : ''}
      </div>
    `).join('');
  }
}

// ---------- My Stay (accommodation: place, map, rooms, coordinator) ----------
async function renderStayPage(container) {
  const name = currentFamily.stay_place_name;
  const link = currentFamily.stay_map_link;
  const coordName = currentFamily.stay_coordinator_name;
  const coordPhone = currentFamily.stay_coordinator_phone;
  const members = currentFamily.members || [];

  container.innerHTML = `
    <div class="card" id="how-to-reach-card"></div>
    <div class="card">
      <div class="card-title">🏨 Your Stay</div>
      ${name || link ? `
        ${name ? `<div class="ev-meta">${escapeHtml(name)}</div>` : ''}
        ${coordName || coordPhone ? `<div class="ev-meta">📞 ${escapeHtml(coordName || 'Coordinator')}${coordPhone ? ' - ' + escapeHtml(coordPhone) : ''}</div>` : ''}
        <div class="ev-links">
          ${link ? `<a class="ev-link-btn" href="${escapeHtml(link)}" target="_blank" rel="noopener">🗺️ View on Map</a>` : ''}
          ${coordPhone ? `<a class="ev-link-btn" href="tel:${escapeHtml(coordPhone)}">📞 Call Coordinator</a>` : ''}
        </div>
      ` : `<div class="empty-state"><p>Stay details not added yet. Check back soon.</p></div>`}
    </div>
    <div class="card">
      <div class="card-title">Room Assignments</div>
      <div id="stay-rooms-list"></div>
    </div>
  `;

  document.getElementById('stay-rooms-list').innerHTML = members.map(m => `
    <div class="member-row">
      <div class="member-name">${escapeHtml(m.name)} <span class="form-hint">(${escapeHtml(m.member_code)})</span></div>
      ${m.room_no ? `<div class="room-badge">🛏️ Room ${escapeHtml(m.room_no)}</div>` : `<div class="form-hint">Room not assigned yet</div>`}
    </div>
  `).join('');

  renderHowToReachCard();
}

async function renderHowToReachCard() {
  const el = document.getElementById('how-to-reach-card');
  if (!el) return;
  const [{ data: note }, { data: routes }] = await Promise.all([
    db.from('wy_travel_note').select('*').eq('id', 1).maybeSingle(),
    db.from('wy_travel_routes').select('*').order('sort_order')
  ]);
  const hasNote = note && (note.airport_name || note.road_time || note.railway_station_name ||
    note.airport_to_venue_link || note.airport_to_stay_link || note.railway_to_venue_link || note.railway_to_stay_link);
  if (!hasNote && (!routes || routes.length === 0)) {
    el.style.display = 'none';
    return;
  }
  el.innerHTML = `
    <div class="card-title">🚆 How to Reach</div>
    ${note && note.airport_name ? `<div class="ev-meta">✈️ Nearest Airport: ${escapeHtml(note.airport_name)}${note.road_time ? ' · ' + escapeHtml(note.road_time) : ''}</div>` : ''}
    ${note && (note.airport_to_venue_link || note.airport_to_stay_link) ? `
      <div class="ev-links">
        ${note.airport_to_venue_link ? `<a class="ev-link-btn" href="${escapeHtml(note.airport_to_venue_link)}" target="_blank" rel="noopener">🗺️ Airport → Venue</a>` : ''}
        ${note.airport_to_stay_link ? `<a class="ev-link-btn" href="${escapeHtml(note.airport_to_stay_link)}" target="_blank" rel="noopener">🗺️ Airport → Stay</a>` : ''}
      </div>` : ''}
    ${note && note.railway_station_name ? `<div class="ev-meta" style="margin-top:8px;">🚉 Nearest Railway Station: ${escapeHtml(note.railway_station_name)}</div>` : ''}
    ${note && (note.railway_to_venue_link || note.railway_to_stay_link) ? `
      <div class="ev-links">
        ${note.railway_to_venue_link ? `<a class="ev-link-btn" href="${escapeHtml(note.railway_to_venue_link)}" target="_blank" rel="noopener">🗺️ Station → Venue</a>` : ''}
        ${note.railway_to_stay_link ? `<a class="ev-link-btn" href="${escapeHtml(note.railway_to_stay_link)}" target="_blank" rel="noopener">🗺️ Station → Stay</a>` : ''}
      </div>` : ''}
    ${routes && routes.length > 0 ? `
      <div class="form-hint" style="margin-top:8px;margin-bottom:4px;">Train numbers by station:</div>
      ${routes.map(r => `<div class="ev-meta">🚉 ${escapeHtml(r.from_place)}: ${escapeHtml(r.train_no || '-')}</div>`).join('')}
    ` : ''}
  `;
}

async function renderContactCard() {
  const el = document.getElementById('contact-card');
  if (!el) return;
  const { data } = await db.from('wy_contact_info').select('*').eq('id', 1).maybeSingle();
  if (!data || (!data.contact1_phone && !data.contact2_phone)) { el.style.display = 'none'; return; }
  el.innerHTML = `
    <div class="card-title">Need Help?</div>
    ${data.contact1_phone ? `<div class="ev-meta">📞 ${escapeHtml(data.contact1_label || 'Contact')}: <a href="tel:${escapeHtml(data.contact1_phone)}">${escapeHtml(data.contact1_phone)}</a></div>` : ''}
    ${data.contact2_phone ? `<div class="ev-meta">📞 ${escapeHtml(data.contact2_label || 'Contact')}: <a href="tel:${escapeHtml(data.contact2_phone)}">${escapeHtml(data.contact2_phone)}</a></div>` : ''}
  `;
}

// ---------- Announcements ----------
async function renderAnnouncementsPage(container) {
  container.innerHTML = `
    <div class="card" id="push-card"></div>
    <div class="card"><div class="card-title">Announcement</div><div id="announcements-list">Loading...</div></div>
  `;
  renderPushCard();
  const { data, error } = await db.from('wy_announcements').select('*').order('created_at', { ascending: false });
  const listEl = document.getElementById('announcements-list');
  if (error || !data || data.length === 0) {
    listEl.innerHTML = `<div class="empty-state"><p>No announcements yet.</p></div>`;
    return;
  }
  listEl.innerHTML = data.map(a => `
    <div class="announcement-item">
      <div class="an-title">🔔 ${escapeHtml(a.title)}</div>
      <div>${escapeHtml(a.message)}</div>
      <div class="an-time">${new Date(a.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
    </div>
  `).join('');
}

function renderPushCard() {
  const el = document.getElementById('push-card');
  if (!el) return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    el.innerHTML = `<p class="form-hint">Announcement alerts aren't supported on this browser.</p>`;
    return;
  }
  if (Notification.permission === 'granted' && localStorage.getItem('wy_push_subscribed')) {
    el.innerHTML = `<p style="color:var(--success);font-weight:600;">🔔 Announcement alerts are on for this device</p>`;
    return;
  }
  el.innerHTML = `
    <button class="btn-secondary" style="width:100%;" onclick="enableAnnouncementPush()">🔔 Get a buzz when the host posts news</button>
    <div class="error-msg" id="push-error"></div>
  `;
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function enableAnnouncementPush() {
  const errEl = document.getElementById('push-error');
  if (errEl) errEl.textContent = '';
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      if (errEl) errEl.textContent = 'Notification permission was denied.';
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
    const json = subscription.toJSON();
    const { error } = await db.rpc('wy_subscribe_push', {
      p_code: currentFamily.code, p_endpoint: json.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth
    });
    if (error) { if (errEl) errEl.textContent = error.message; return; }
    localStorage.setItem('wy_push_subscribed', '1');
    showToast('🔔 Alerts enabled!', 'success');
    renderPushCard();
  } catch (e) {
    if (errEl) errEl.textContent = 'Could not enable alerts: ' + e.message;
  }
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => reg.update().catch(() => {}))
      .catch(() => {});
  }
}

// ---------- My Family (members, rooms, travel details) ----------
function renderFamilyPage(container) {
  const members = currentFamily.members || [];
  container.innerHTML = `
    <div class="card">
      <div class="card-title">${escapeHtml(currentFamily.family_name)} - Rooms &amp; Travel</div>
      <div id="members-list"></div>
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);">
        <label class="form-hint" style="display:block;margin-bottom:4px;">Add a family member travelling with you</label>
        <div style="display:flex;gap:8px;">
          <input type="text" id="new-member-name" placeholder="Full name" style="flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:6px;">
          <button class="btn-primary btn-sm" onclick="addGuestMember()">+ Add Member</button>
        </div>
        <div class="error-msg" id="new-member-error"></div>
      </div>
    </div>
  `;
  document.getElementById('members-list').innerHTML = members.map(m => `
    <div class="member-row">
      <div class="member-name">${escapeHtml(m.name)} <span class="form-hint">(${escapeHtml(m.member_code)})</span></div>
      ${m.room_no ? `<div class="room-badge">🛏️ Room ${escapeHtml(m.room_no)}</div>` : `<div class="form-hint">Room not assigned yet</div>`}
      <div style="margin-top:10px;">
        <button class="btn-secondary btn-sm" onclick="openTravelForm('${m.id}')">✈️ ${m.travel ? 'Edit' : 'Add'} Travel Details</button>
      </div>
      ${m.travel ? renderTravelSummary(m.travel) : ''}
      <div style="margin-top:10px;">
        <label class="form-hint" style="display:block;margin-bottom:4px;">Special requirement (optional) - e.g. wheelchair, creche</label>
        <div style="display:flex;gap:8px;">
          <input type="text" id="remarks-${m.id}" value="${escapeHtml(m.remarks || '')}" placeholder="e.g. Needs wheelchair access" style="flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:6px;">
          <button class="btn-secondary btn-sm" onclick="saveRemarks('${m.id}')">Save</button>
        </div>
      </div>
    </div>
  `).join('');
}

async function addGuestMember() {
  const input = document.getElementById('new-member-name');
  const errEl = document.getElementById('new-member-error');
  const name = (input.value || '').trim();
  if (errEl) errEl.textContent = '';
  if (!name) { if (errEl) errEl.textContent = 'Please enter a name.'; return; }
  const { data, error } = await db.rpc('wy_guest_add_member', { p_code: currentFamily.code, p_name: name });
  if (error) { if (errEl) errEl.textContent = error.message; return; }
  currentFamily.members = currentFamily.members || [];
  currentFamily.members.push(data);
  showToast('✅ Member added');
  renderFamilyPage(document.getElementById('page-content'));
}

function renderTravelSummary(t) {
  const parts = [];
  if (t.arrival_date) {
    parts.push(`Arrives ${formatDate(t.arrival_date)}${t.arrival_time ? ' ' + formatTime(t.arrival_time) : ''}${t.arrival_mode ? ' by ' + escapeHtml(t.arrival_mode) : ''}${t.arrival_number ? ' (' + escapeHtml(t.arrival_number) + ')' : ''}`);
    if (t.arrival_vehicle_no || t.arrival_driver_contact) {
      parts.push(`🚗 Pickup: ${[t.arrival_vehicle_no ? escapeHtml(t.arrival_vehicle_no) : '', t.arrival_driver_contact ? 'Driver ' + escapeHtml(t.arrival_driver_contact) : ''].filter(Boolean).join(' · ')}`);
    }
  }
  if (t.departure_date) {
    parts.push(`Departs ${formatDate(t.departure_date)}${t.departure_time ? ' ' + formatTime(t.departure_time) : ''}${t.departure_mode ? ' by ' + escapeHtml(t.departure_mode) : ''}${t.departure_number ? ' (' + escapeHtml(t.departure_number) + ')' : ''}`);
    if (t.departure_vehicle_no || t.departure_driver_contact) {
      parts.push(`🚗 Drop-off: ${[t.departure_vehicle_no ? escapeHtml(t.departure_vehicle_no) : '', t.departure_driver_contact ? 'Driver ' + escapeHtml(t.departure_driver_contact) : ''].filter(Boolean).join(' · ')}`);
    }
  }
  if (parts.length === 0) return '';
  return `<div class="form-hint" style="margin-top:8px;">${parts.join('<br>')}</div>`;
}

async function saveRemarks(memberId) {
  const val = document.getElementById(`remarks-${memberId}`).value;
  const { error } = await db.rpc('wy_save_remarks', { p_code: currentFamily.code, p_member_id: memberId, p_remarks: val });
  if (error) { showToast(error.message, 'error'); return; }
  const member = (currentFamily.members || []).find(x => x.id === memberId);
  if (member) member.remarks = val.trim() || null;
  showToast('✅ Saved');
}

function openTravelForm(memberId) {
  const members = currentFamily.members || [];
  const member = members.find(m => m.id === memberId);
  const others = members.filter(m => m.id !== memberId && m.travel);
  const t = member.travel || {};

  const sameAsOptions = others.length
    ? `<div class="form-group">
        <label>Same travel details as</label>
        <select id="travel-same-as" onchange="applySameAs(this.value)">
          <option value="">-- fill in below --</option>
          ${others.map(o => `<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('')}
        </select>
      </div>`
    : '';

  openModal(`
    <div class="modal-title">Travel Details - ${escapeHtml(member.name)}</div>
    ${sameAsOptions}
    <div class="form-group"><label>Arrival Date</label><input type="date" id="t-arr-date" value="${t.arrival_date || ''}"></div>
    <div class="form-group"><label>Arrival Time</label><input type="time" id="t-arr-time" value="${t.arrival_time || ''}"></div>
    <div class="form-group"><label>Mode of Transport (Arrival)</label><input type="text" id="t-arr-mode" placeholder="Train / Flight / Car / Bus" value="${escapeHtml(t.arrival_mode || '')}"></div>
    <div class="form-group"><label>Train/Flight No. (Arrival)</label><input type="text" id="t-arr-num" value="${escapeHtml(t.arrival_number || '')}"></div>
    <hr style="border:none;border-top:1px solid var(--border);margin:14px 0;">
    <div class="form-group"><label>Departure Date</label><input type="date" id="t-dep-date" value="${t.departure_date || ''}"></div>
    <div class="form-group"><label>Departure Time</label><input type="time" id="t-dep-time" value="${t.departure_time || ''}"></div>
    <div class="form-group"><label>Mode of Transport (Departure)</label><input type="text" id="t-dep-mode" value="${escapeHtml(t.departure_mode || '')}"></div>
    <div class="form-group"><label>Train/Flight No. (Departure)</label><input type="text" id="t-dep-num" value="${escapeHtml(t.departure_number || '')}"></div>
    <div class="form-group"><label>Notes</label><textarea id="t-notes" rows="2">${escapeHtml(t.notes || '')}</textarea></div>
    <div class="error-msg" id="travel-error"></div>
    <div class="modal-actions">
      <button class="btn-primary" onclick="saveTravelForm('${memberId}')">Save</button>
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  `);
  window._travelOthers = others;
}

function applySameAs(memberId) {
  if (!memberId) return;
  const other = (window._travelOthers || []).find(o => o.id === memberId);
  if (!other || !other.travel) return;
  const t = other.travel;
  document.getElementById('t-arr-date').value = t.arrival_date || '';
  document.getElementById('t-arr-time').value = t.arrival_time || '';
  document.getElementById('t-arr-mode').value = t.arrival_mode || '';
  document.getElementById('t-arr-num').value = t.arrival_number || '';
  document.getElementById('t-dep-date').value = t.departure_date || '';
  document.getElementById('t-dep-time').value = t.departure_time || '';
  document.getElementById('t-dep-mode').value = t.departure_mode || '';
  document.getElementById('t-dep-num').value = t.departure_number || '';
}

async function saveTravelForm(memberId) {
  const errEl = document.getElementById('travel-error');
  errEl.textContent = '';
  const payload = {
    p_code: currentFamily.code,
    p_member_id: memberId,
    p_arrival_date: document.getElementById('t-arr-date').value || null,
    p_arrival_time: document.getElementById('t-arr-time').value || null,
    p_arrival_mode: document.getElementById('t-arr-mode').value || null,
    p_arrival_number: document.getElementById('t-arr-num').value || null,
    p_departure_date: document.getElementById('t-dep-date').value || null,
    p_departure_time: document.getElementById('t-dep-time').value || null,
    p_departure_mode: document.getElementById('t-dep-mode').value || null,
    p_departure_number: document.getElementById('t-dep-num').value || null,
    p_notes: document.getElementById('t-notes').value || null
  };
  const { error } = await db.rpc('wy_save_travel_details', payload);
  if (error) { errEl.textContent = error.message; return; }

  const { data } = await db.rpc('wy_guest_login', { p_code: currentFamily.code });
  if (data) currentFamily = data;
  closeModal();
  showToast('✅ Travel details saved');
  renderFamilyPage(document.getElementById('page-content'));
}

// ---------- Gallery ----------
async function renderGalleryPage(container) {
  container.innerHTML = `
    <div class="card">
      <div class="section-header"><h3>📸 Gallery</h3>
        <div style="display:flex;gap:8px;">
          <button class="btn-primary btn-sm" onclick="openCameraModal()">📷 Take Photo</button>
          <label class="btn-secondary btn-sm" style="cursor:pointer;">
            Choose from Gallery
            <input type="file" accept="image/*" style="display:none;" onchange="uploadPhoto(event)">
          </label>
        </div>
      </div>
      <div id="gallery-grid" class="gallery-grid">Loading...</div>
    </div>
  `;
  await loadGallery();
}

async function loadGallery() {
  const { data, error } = await db.rpc('wy_get_gallery', { p_code: currentFamily.code });
  const grid = document.getElementById('gallery-grid');
  if (error || !data || data.length === 0) {
    grid.innerHTML = `<div class="empty-state"><p>No photos yet. Be the first to add one!</p></div>`;
    return;
  }
  grid.innerHTML = data.map(p => {
    const { data: urlData } = db.storage.from(GALLERY_BUCKET).getPublicUrl(p.storage_path);
    return `<img src="${urlData.publicUrl}" loading="lazy" onclick="window.open('${urlData.publicUrl}','_blank')">`;
  }).join('');
}

const IMG_MAX_DIM = 1600;
const IMG_QUALITY = 0.82;

// Resizes to at most IMG_MAX_DIM on the longest side and re-encodes as
// JPEG, so gallery uploads don't eat storage/bandwidth at full camera
// resolution. Falls back to the original file untouched if the browser
// can't decode it (e.g. an unusual format) rather than blocking the upload.
async function compressImageBlob(fileOrBlob) {
  try {
    const bitmap = await createImageBitmap(fileOrBlob);
    let { width, height } = bitmap;
    if (width > IMG_MAX_DIM || height > IMG_MAX_DIM) {
      if (width >= height) { height = Math.round(height * IMG_MAX_DIM / width); width = IMG_MAX_DIM; }
      else { width = Math.round(width * IMG_MAX_DIM / height); height = IMG_MAX_DIM; }
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    if (bitmap.close) bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', IMG_QUALITY));
    if (blob) return { blob, ext: 'jpg', contentType: 'image/jpeg' };
  } catch (e) { /* fall through to uploading the original */ }
  const ext = (fileOrBlob.name ? (fileOrBlob.name.split('.').pop() || 'jpg') : 'jpg').toLowerCase();
  return { blob: fileOrBlob, ext, contentType: fileOrBlob.type || 'image/jpeg' };
}

async function uploadPhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  const { blob, ext, contentType } = await compressImageBlob(file);
  await uploadPhotoBlob(blob, ext, contentType);
  event.target.value = '';
}

async function uploadPhotoBlob(blob, ext, contentType) {
  showToast('Uploading...');
  const path = `${currentFamily.code}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error: upErr } = await db.storage.from(GALLERY_BUCKET).upload(path, blob, { contentType: contentType || 'image/jpeg' });
  if (upErr) { showToast('Upload failed: ' + upErr.message, 'error'); return; }

  let uploaderName = localStorage.getItem(NAME_KEY);
  if (!uploaderName) {
    uploaderName = prompt('Your name (shown next to photos you add):') || '';
    localStorage.setItem(NAME_KEY, uploaderName);
  }
  const { error } = await db.rpc('wy_add_gallery_photo', { p_code: currentFamily.code, p_uploader_name: uploaderName, p_storage_path: path });
  if (error) { showToast('Could not save photo: ' + error.message, 'error'); return; }
  showToast('📸 Photo added!');
  loadGallery();
}

// ---------- In-app camera ----------
let _cameraStream = null;

async function openCameraModal() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast('Camera not supported on this browser - use "Choose from Gallery" instead.', 'error');
    return;
  }
  openModal(`
    <div class="modal-title">Take Photo</div>
    <video id="camera-video" autoplay playsinline muted style="width:100%;border-radius:8px;background:#000;"></video>
    <div class="error-msg" id="camera-error"></div>
    <div class="modal-actions">
      <button class="btn-primary" onclick="captureCameraPhoto()">📸 Capture</button>
      <button class="btn-secondary" onclick="closeCameraModal()">Cancel</button>
    </div>
  `);
  try {
    _cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    const video = document.getElementById('camera-video');
    if (video) video.srcObject = _cameraStream;
  } catch (e) {
    const errEl = document.getElementById('camera-error');
    if (errEl) errEl.textContent = 'Could not access camera: ' + e.message;
  }
}

function stopCameraStream() {
  if (_cameraStream) {
    _cameraStream.getTracks().forEach(t => t.stop());
    _cameraStream = null;
  }
}

function closeCameraModal() {
  stopCameraStream();
  closeModal();
}

function captureCameraPhoto() {
  const video = document.getElementById('camera-video');
  if (!video || !video.videoWidth) return;
  let width = video.videoWidth;
  let height = video.videoHeight;
  if (width > IMG_MAX_DIM || height > IMG_MAX_DIM) {
    if (width >= height) { height = Math.round(height * IMG_MAX_DIM / width); width = IMG_MAX_DIM; }
    else { width = Math.round(width * IMG_MAX_DIM / height); height = IMG_MAX_DIM; }
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(video, 0, 0, width, height);
  canvas.toBlob((blob) => {
    stopCameraStream();
    closeModal();
    if (blob) uploadPhotoBlob(blob, 'jpg', 'image/jpeg');
  }, 'image/jpeg', IMG_QUALITY);
}

tryAutoLogin();
