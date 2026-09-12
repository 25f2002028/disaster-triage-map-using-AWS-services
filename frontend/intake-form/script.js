// Replace this with your actual API Gateway URL once Teammate 1/backend team sets it up
const API_URL = "https://YOUR-API-GATEWAY-URL/intake";

document.getElementById('getLocationBtn').addEventListener('click', () => {
  navigator.geolocation.getCurrentPosition((pos) => {
    const lat = pos.coords.latitude.toFixed(6);
    const lng = pos.coords.longitude.toFixed(6);
    document.getElementById('location').value = `${lat}, ${lng}`;
  }, (err) => {
    alert("Couldn't get location: " + err.message);
  });
});

document.getElementById('reportForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const statusEl = document.getElementById('status');
  statusEl.textContent = "Submitting...";

  const locationStr = document.getElementById('location').value;
  const [lat, lng] = locationStr.split(',').map(s => parseFloat(s.trim()));

  const payload = {
    source_type: document.getElementById('source_type').value,
    category: document.getElementById('category').value,
    severity: document.getElementById('severity').value,
    description: document.getElementById('description').value,
    media_type: document.getElementById('media_type').value,
    location: { lat: lat || 0, lng: lng || 0 }
  };

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    statusEl.textContent = `✅ Report submitted! ID: ${data.report_id || 'N/A'}`;
  } catch (err) {
    statusEl.textContent = `❌ Error: ${err.message}`;
  }
});