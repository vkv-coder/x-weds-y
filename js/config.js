// ==========================================
// W weds Y - Supabase configuration
// ==========================================

const SUPABASE_URL = 'https://wrzpgultvahxbrgooibn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_eaTIKWQ1QAI1E07kZaiGTA_dfWDyQTs';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Public VAPID key for Web Push (safe to be public - counterpart to a
// server-only private key, same role as a public cert).
const VAPID_PUBLIC_KEY = 'BGytDHS22N6oMpEi06_kOZpf9NaEF4hN8nLTZbqfLKAPZ9hOeKQirXhBu8bCv02fVbxQJKSpZvmm7v49qbFV3GE';

const GALLERY_BUCKET = 'wy-gallery';

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str == null ? '' : String(str);
  return d.innerHTML;
}

function showToast(msg, type) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = 'toast show ' + (type || '');
  setTimeout(() => { toast.className = 'toast'; }, type === 'error' ? 8000 : 3000);
}

function openModal(html) {
  document.getElementById('modal-box').innerHTML = html;
  document.getElementById('modal-overlay').style.display = 'flex';
}

function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
  document.getElementById('modal-box').innerHTML = '';
}

function formatDate(d) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${m} ${ampm}`;
}
