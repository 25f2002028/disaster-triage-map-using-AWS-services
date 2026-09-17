/* ====================== CONFIG ====================== */
const API_URL = 'https://andph1syfd.execute-api.ap-south-1.amazonaws.com';

/* ====================== OFFLINE QUEUE ====================== */
const OFFLINE_QUEUE_KEY = 'offline_report_queue';

function getQueue() {
  return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
}
function saveQueue(queue) {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  renderQueueUI();
}
function queueReport(payload) {
  const queue = getQueue();
  queue.push(payload);
  saveQueue(queue);
}

function renderQueueUI() {
  const queue = getQueue();
  const statusEl = document.getElementById('syncStatus');
  const listEl = document.getElementById('offlineQueueList');
  const syncSection = document.getElementById('syncSection');
  if (!statusEl || !listEl || !syncSection) return;

  if (queue.length === 0) {
    syncSection.classList.remove('show');
    return;
  }

  syncSection.classList.add('show');
  statusEl.textContent = `⏳ ${queue.length} report(s) waiting to sync` + (navigator.onLine ? ' — syncing…' : ' — offline');

  listEl.innerHTML = queue.map(p => `
    <div>
      🕓 ${p.category} · ${p.severity} · captured ${new Date(p.client_timestamp).toLocaleString()}
      <span style="color:#999;">(ID: ${p.client_report_id.slice(0,8)}…)</span>
    </div>
  `).join('');
}

async function trySyncQueue() {
  if (!navigator.onLine) return;
  const queue = getQueue();
  if (queue.length === 0) return;

  const stillPending = [];
  for (const payload of queue) {
    try {
      const res = await fetch(API_URL + '/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Server error ' + res.status);
      // Success — backend overwrites idempotently if already synced once, so
      // it's safe to simply drop this from the local queue now
    } catch (err) {
      stillPending.push(payload); // keep it queued, retry next cycle
    }
  }
  saveQueue(stillPending);
}

window.addEventListener('online', () => { renderQueueUI(); trySyncQueue(); });
window.addEventListener('offline', renderQueueUI);
setInterval(trySyncQueue, 15000); // fallback poll — 'online' event isn't always reliable

/* ====================== LOCATION ====================== */
document.getElementById('getLocationBtn').addEventListener('click', () => {
  navigator.geolocation.getCurrentPosition((pos) => {
    const lat = pos.coords.latitude.toFixed(6);
    const lng = pos.coords.longitude.toFixed(6);
    document.getElementById('location').value = `${lat}, ${lng}`;
  }, (err) => {
    alert("Couldn't get location: " + err.message);
  });
});

// Geocoding function to convert address to coordinates using Nominatim API
async function convertAddressToCoordinates(address) {
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`);
    const data = await response.json();
    
    if (data && data.length > 0) {
      const lat = parseFloat(data[0].lat).toFixed(6);
      const lng = parseFloat(data[0].lon).toFixed(6);
      return { lat, lng, success: true };
    } else {
      return { success: false, error: 'Address not found' };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Wire up the convert address button
document.getElementById('convertAddressBtn').addEventListener('click', async () => {
  const addressInput = document.getElementById('manualAddress');
  const address = addressInput.value.trim();
  
  if (!address) {
    alert('Please enter an address first');
    return;
  }
  
  const statusEl = document.getElementById('status');
  statusEl.textContent = 'Converting address to coordinates...';
  statusEl.className = 'show info';
  
  const result = await convertAddressToCoordinates(address);
  
  if (result.success) {
    document.getElementById('location').value = `${result.lat}, ${result.lng}`;
    statusEl.textContent = `✅ Address converted: ${result.lat}, ${result.lng}`;
    statusEl.className = 'show success';
  } else {
    statusEl.textContent = `❌ Error: ${result.error}`;
    statusEl.className = 'show error';
  }
});

/* ====================== SUBMIT ====================== */
document.getElementById('reportForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const statusEl = document.getElementById('status');

  const locationStr = document.getElementById('location').value;
  const [lat, lng] = locationStr.split(',').map(s => parseFloat(s.trim()));

  const payload = {
    client_report_id: crypto.randomUUID(),         // idempotency key for offline retries
    client_timestamp: new Date().toISOString(),    // when the reporter actually captured it
    source_type: document.getElementById('source_type').value,
    category: document.getElementById('category').value,
    severity: document.getElementById('severity').value,
    description: document.getElementById('description').value,
    media_type: document.getElementById('media_type').value,
    location: { lat: lat || 0, lng: lng || 0 }
  };

  if (!navigator.onLine) {
    queueReport(payload);
    statusEl.textContent = `🕓 No connection — saved offline. Will sync automatically when back online.`;
    statusEl.className = 'show info';
    e.target.reset();
    return;
  }

  statusEl.textContent = "Submitting...";
  statusEl.className = 'show info';
  try {
    const response = await fetch(API_URL + '/intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error('Server error ' + response.status);
    const data = await response.json();
    statusEl.textContent = `✅ Report submitted! ID: ${data.report_id}`;
    statusEl.className = 'show success';
    e.target.reset();
  } catch (err) {
    // Browser thought it was online but the request still failed — queue it anyway
    queueReport(payload);
    statusEl.textContent = `🕓 Connection failed — saved offline. Will retry automatically.`;
    statusEl.className = 'show info';
  }
});

/* ====================== INIT ====================== */
renderQueueUI();
trySyncQueue();