/* ====================== CONFIG ====================== */
const API_URL = 'https://andph1syfd.execute-api.ap-south-1.amazonaws.com';

/* ====================== STATE ====================== */
let map = null;
let incidents = [];
let selectedIncidentId = null;
let markers = {};

/* ====================== MAP INITIALIZATION ====================== */
function initMap() {
  map = L.map('map').setView([20.5937, 78.9629], 5); // Center on India
  
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);
}

/* ====================== API CALLS ====================== */
async function fetchIncidents() {
  console.log('fetchIncidents called');
  try {
    const response = await fetch(`${API_URL}/incidents`);
    if (!response.ok) throw new Error('Failed to fetch incidents');
    const data = await response.json();
    // Backend returns array directly, not wrapped in {incidents: [...]}
    const rawIncidents = Array.isArray(data) ? data : (data.incidents || []);
    console.log('Raw incidents from API:', rawIncidents);
    
    // Map backend field names to frontend expectations
    incidents = rawIncidents.map(inc => ({
      incident_id: inc.incident_id,
      category: inc.category,
      severity: inc.severity,
      priority_score: inc.priority_score,
      location: inc.location,
      description: inc.category + ' incident', // Backend doesn't store description on incidents
      status: inc.status,
      timestamp: inc.created_at || inc.updated_at,
      report_count: inc.corroboration_count || 1
    }));
    
    // If no incidents from API, use mock data
    if (incidents.length === 0) {
      console.log('No incidents from API, using mock data');
      incidents = getMockIncidents();
      updateConnectionStatus(false);
    } else {
      console.log('Fetched incidents from API:', incidents);
      updateConnectionStatus(true);
    }
  } catch (err) {
    console.error('Fetch error:', err);
    incidents = getMockIncidents();
    console.log('Using mock incidents:', incidents);
    updateConnectionStatus(false);
  }
  console.log('Rendering incidents, count:', incidents.length);
  renderIncidents();
}

function getMockIncidents() {
  return [
    {
      incident_id: 'mock-1',
      category: 'fire',
      severity: 'critical',
      priority_score: 95,
      location: { lat: 28.6139, lng: 77.2090 },
      description: 'Building fire reported in Connaught Place',
      status: 'new',
      timestamp: new Date().toISOString(),
      report_count: 3
    },
    {
      incident_id: 'mock-2',
      category: 'flood',
      severity: 'high',
      priority_score: 80,
      location: { lat: 19.0760, lng: 72.8777 },
      description: 'Street flooding after heavy rainfall',
      status: 'assigned',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      report_count: 5
    },
    {
      incident_id: 'mock-3',
      category: 'medical',
      severity: 'medium',
      priority_score: 60,
      location: { lat: 12.9716, lng: 77.5946 },
      description: 'Multiple injuries reported at accident site',
      status: 'in_progress',
      timestamp: new Date(Date.now() - 7200000).toISOString(),
      report_count: 2
    }
  ];
}

function updateConnectionStatus(isConnected) {
  const statusEl = document.getElementById('connStatus');
  statusEl.textContent = isConnected ? '🟢 Connected' : '🟡 Using mock data';
}

/* ====================== RENDERING ====================== */
function renderIncidents() {
  console.log('renderIncidents called, incidents count:', incidents.length);
  clearMarkers();
  renderIncidentList();
  renderMapMarkers();
  populateCategoryFilter();
}

function clearMarkers() {
  Object.values(markers).forEach(marker => map.removeLayer(marker));
  markers = {};
}

function renderMapMarkers() {
  incidents.forEach(incident => {
    if (!incident.location) return;
    
    const color = getSeverityColor(incident.severity);
    const marker = L.circleMarker([incident.location.lat, incident.location.lng], {
      radius: 10 + (incident.priority_score / 10),
      fillColor: color,
      color: '#fff',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.8
    }).addTo(map);
    
    marker.bindPopup(`
      <strong>${incident.category.toUpperCase()}</strong><br>
      Severity: ${incident.severity}<br>
      Priority: ${incident.priority_score}
    `);
    
    marker.on('click', () => selectIncident(incident.incident_id));
    markers[incident.incident_id] = marker;
  });
}

function renderIncidentList() {
  const listEl = document.getElementById('incidentList');
  const filterCategory = document.getElementById('filterCategory').value;
  const sortBy = document.getElementById('sortBy').value;
  
  let filtered = incidents.filter(inc => 
    filterCategory === 'all' || inc.category === filterCategory
  );
  
  if (sortBy === 'priority_score') {
    filtered.sort((a, b) => b.priority_score - a.priority_score);
  } else {
    filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }
  
  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        No incidents to display
      </div>
    `;
    return;
  }
  
  listEl.innerHTML = filtered.map(inc => `
    <div class="incident-card ${selectedIncidentId === inc.incident_id ? 'selected' : ''}" 
         onclick="selectIncident('${inc.incident_id}')">
      <div class="card-header">
        <span class="badge badge-${inc.severity}">${inc.severity}</span>
        <span class="priority-indicator">
          <span class="priority-dot" style="background: ${getSeverityColor(inc.severity)}"></span>
          ${inc.priority_score}
        </span>
      </div>
      <div class="card-title">${inc.category.toUpperCase()}</div>
      <div class="card-meta">
        <div class="card-meta-row">📍 ${inc.location?.lat?.toFixed(4)}, ${inc.location?.lng?.toFixed(4)}</div>
        <div class="card-meta-row">📊 ${inc.report_count || 1} report(s)</div>
        <div class="card-meta-row">🕐 ${formatTime(inc.timestamp)}</div>
      </div>
    </div>
  `).join('');
}

function populateCategoryFilter() {
  const select = document.getElementById('filterCategory');
  const categories = [...new Set(incidents.map(inc => inc.category))];
  
  select.innerHTML = '<option value="all">All categories</option>' +
    categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
}

function selectIncident(incidentId) {
  selectedIncidentId = incidentId;
  const incident = incidents.find(inc => inc.incident_id === incidentId);
  
  renderIncidentList();
  renderDetailPanel(incident);
  
  if (markers[incidentId]) {
    map.setView([incident.location.lat, incident.location.lng], 12);
    markers[incidentId].openPopup();
  }
}

function renderDetailPanel(incident) {
  const panel = document.getElementById('detailPanel');
  
  if (!incident) {
    panel.innerHTML = '<div class="empty-state">Select an incident to view details</div>';
    return;
  }
  
  panel.innerHTML = `
    <h3>📋 Incident Details</h3>
    <div class="detail-row"><strong>ID:</strong> ${incident.incident_id}</div>
    <div class="detail-row"><strong>Category:</strong> ${incident.category}</div>
    <div class="detail-row"><strong>Severity:</strong> ${incident.severity}</div>
    <div class="detail-row"><strong>Priority Score:</strong> ${incident.priority_score}</div>
    <div class="detail-row"><strong>Status:</strong> ${incident.status}</div>
    <div class="detail-row"><strong>Reports:</strong> ${incident.report_count || 1}</div>
    <div class="detail-row"><strong>Location:</strong> ${incident.location?.lat?.toFixed(6)}, ${incident.location?.lng?.toFixed(6)}</div>
    <div class="detail-row"><strong>Time:</strong> ${formatTime(incident.timestamp)}</div>
    <div class="detail-row"><strong>Description:</strong></div>
    <div style="margin: 8px 0; color: #333;">${incident.description || 'No description'}</div>
    
    <select id="statusSelect" class="status-select">
      <option value="new" ${incident.status === 'new' ? 'selected' : ''}>New</option>
      <option value="assigned" ${incident.status === 'assigned' ? 'selected' : ''}>Assigned</option>
      <option value="in_progress" ${incident.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
      <option value="resolved" ${incident.status === 'resolved' ? 'selected' : ''}>Resolved</option>
    </select>
    
    <button id="updateStatusBtn" class="action-btn btn-primary">
      Update Status
    </button>
  `;
  
  // Add event listener programmatically
  const updateBtn = document.getElementById('updateStatusBtn');
  if (updateBtn) {
    updateBtn.addEventListener('click', () => updateIncidentStatus(incident.incident_id));
  }
}

/* ====================== ACTIONS ====================== */
async function updateIncidentStatus(incidentId) {
  const newStatus = document.getElementById('statusSelect').value;
  const responderName = document.getElementById('responderName').value || 'Anonymous';
  
  console.log('Updating incident status:', incidentId, 'to:', newStatus);
  
  // Always update locally first for immediate feedback
  const incident = incidents.find(inc => inc.incident_id === incidentId);
  if (incident) {
    incident.status = newStatus;
    renderDetailPanel(incident);
    renderIncidentList();
  }
  
  try {
    const response = await fetch(`${API_URL}/incidents/${incidentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: newStatus,
        changed_by: responderName,
        action: 'status_change',
        reason: 'Manual status update'
      })
    });
    
    console.log('Update response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Update failed:', errorText);
      throw new Error('Failed to update status');
    }
    
    alert('Status updated successfully!');
  } catch (err) {
    console.error('Update error:', err);
    alert('Status updated locally, but syncing to the server failed. Please try again.');
  }
}

/* ====================== AUDIT LOG ====================== */
const AUDIT_LOG_KEY = 'manual_override_audit_log';

function getAuditLog() {
  return JSON.parse(localStorage.getItem(AUDIT_LOG_KEY) || '[]');
}

function saveAuditLog(log) {
  localStorage.setItem(AUDIT_LOG_KEY, JSON.stringify(log));
}

function addAuditEntry(incidentId, change, reason, responder) {
  const log = getAuditLog();
  log.unshift({
    time: new Date().toISOString(),
    incident_id: incidentId,
    changed_by: responder,
    change: change,
    reason: reason
  });
  saveAuditLog(log);
}

document.getElementById('auditLogBtn').addEventListener('click', () => {
  const modal = document.getElementById('auditModal');
  const tbody = document.getElementById('auditLogBody');
  const emptyMsg = document.getElementById('auditLogEmpty');
  
  const log = getAuditLog();
  
  if (log.length === 0) {
    tbody.innerHTML = '';
    emptyMsg.style.display = 'block';
  } else {
    emptyMsg.style.display = 'none';
    tbody.innerHTML = log.map(entry => `
      <tr>
        <td>${formatTime(entry.time)}</td>
        <td>${entry.incident_id}</td>
        <td>${entry.changed_by}</td>
        <td>${entry.change}</td>
        <td>${entry.reason}</td>
      </tr>
    `).join('');
  }
  
  modal.style.display = 'flex';
});

function closeAuditLog() {
  document.getElementById('auditModal').style.display = 'none';
}

/* ====================== UTILITIES ====================== */
function getSeverityColor(severity) {
  const colors = {
    critical: '#dc3545',
    high: '#fd7e14',
    medium: '#ffc107',
    low: '#28a745'
  };
  return colors[severity] || '#6c757d';
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

/* ====================== EVENT LISTENERS ====================== */

/* ====================== INIT ====================== */
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing dashboard...');
  try {
    initMap();
    console.log('Map initialized');
    fetchIncidents();
    console.log('Fetching incidents...');
    
    document.getElementById('filterCategory').addEventListener('change', renderIncidentList);
    document.getElementById('sortBy').addEventListener('change', renderIncidentList);
    
    setInterval(fetchIncidents, 30000); // Refresh every 30 seconds
  } catch (err) {
    console.error('Initialization error:', err);
  }
});
