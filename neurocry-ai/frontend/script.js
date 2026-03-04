// script.js

const API_BASE_URL = "http://127.0.0.1:8001";

// Wait for DOM to load
document.addEventListener("DOMContentLoaded", () => {
  initMobileMenu();
  setupAuthUI();

  // Check which page we are on
  const path = window.location.pathname;

  if (path.includes("monitor.html")) {
    initMonitoringPage();
  } else if (path.includes("dashboard.html")) {
    initDashboardPage();
  } else if (path.includes("index.html") || path === "/" || path.endsWith("/")) {
    // No auth needed
  } else if (path.includes("about.html") || path.includes("features.html") || path.includes("contact.html")) {
    // No auth needed
  }
});

// ==========================================
// AUTHENTICATION LOGIC
// ==========================================
function getAuthToken() {
    return localStorage.getItem("nc_token");
}

function requireAuth(callback) {
    if(callback) callback();
}

function logout() {
    localStorage.removeItem("nc_token");
    window.location.reload();
}

function setupAuthUI() {
    const token = getAuthToken();
    const navLinksContainer = document.querySelector(".nav-links");
    
    if (true && navLinksContainer) { // Mocked auth
        // Create logout button if doesn't exist
        if (!document.getElementById("logoutBtn")) {
            const logoutBtn = document.createElement("a");
            logoutBtn.id = "logoutBtn";
            logoutBtn.href = "#";
            logoutBtn.className = "btn btn-outline";
            logoutBtn.style.marginLeft = "1rem";
            logoutBtn.innerHTML = '<i class="fa-solid fa-sign-out-alt"></i> Reset Session';
            logoutBtn.addEventListener("click", (e) => {
                e.preventDefault();
                logout();
            });
            navLinksContainer.appendChild(logoutBtn);
        }
    }
}



function initMobileMenu() {
  const menuBtn = document.querySelector(".mobile-menu-btn");
  const navLinks = document.querySelector(".nav-links");

  if (menuBtn && navLinks) {
    menuBtn.addEventListener("click", () => {
      navLinks.classList.toggle("show");
      navLinks.style.display = navLinks.classList.contains("show")
        ? "flex"
        : "none";
    });
  }
}

// ==========================================
// MONITORING PAGE LOGIC
// ==========================================
let mediaRecorder;
let recordedChunks = [];
let localStream;

function initMonitoringPage() {
  const startWebcamBtn = document.getElementById("startWebcamBtn");
  const recordBtn = document.getElementById("recordBtn");
  const stopBtn = document.getElementById("stopBtn");
  const videoElement = document.getElementById("webcamVideo");
  const recordingTimer = document.getElementById("recordingTimer");
  const uploadForm = document.getElementById("uploadForm");

  const childProfileForm = document.getElementById("childProfileForm");
  const analysisSection = document.getElementById("analysisSection");
  const activePatientBanner = document.getElementById("activePatientBanner");
  const activePatientName = document.getElementById("activePatientName");
  const childRosterSelect = document.getElementById("childRosterSelect");

  // Load roster
  async function loadRoster() {
      try {
          const response = await fetch(`${API_BASE_URL}/api/children`, {
              headers: { "Authorization": `Bearer ${getAuthToken()}` }
          });
          if (!response.ok) {
              if (response.status === 401) logout();
              return;
          }
          
          let children = await response.json();
          window.childRosterData = children; // Store globally for swift access
          
          if (childRosterSelect) {
              childRosterSelect.innerHTML = '<option value="">-- Add New Patient Below --</option>';
              children.forEach(child => {
                  const opt = document.createElement("option");
                  opt.value = child.id;
                  opt.textContent = `${child.name} (${child.age}w, ${child.weight}kg)`;
                  childRosterSelect.appendChild(opt);
              });
              
              const activeId = localStorage.getItem("activeChildId");
              if (activeId) {
                  childRosterSelect.value = activeId;
                  const activeChild = children.find(c => c.id == activeId);
                  if (activeChild) {
                      activateAnalysisMode(activeChild);
                  }
              }
          }
      } catch (err) {
          console.error("Failed to load children roster", err);
      }
  }

  function activateAnalysisMode(child) {
      if (activePatientBanner && activePatientName && analysisSection) {
          activePatientName.textContent = child.name;
          activePatientBanner.style.display = "block";
          analysisSection.style.opacity = "1";
          analysisSection.style.pointerEvents = "auto";
      }
  }

  loadRoster();

  if (childRosterSelect) {
      childRosterSelect.addEventListener("change", (e) => {
          const selectedId = e.target.value;
          if (selectedId) {
              localStorage.setItem("activeChildId", selectedId);
              const children = window.childRosterData || [];
              const activeChild = children.find(c => c.id == selectedId);
              if (activeChild) activateAnalysisMode(activeChild);
          } else {
              localStorage.removeItem("activeChildId");
              if (activePatientBanner && analysisSection) {
                  activePatientBanner.style.display = "none";
                  analysisSection.style.opacity = "0.5";
                  analysisSection.style.pointerEvents = "none";
              }
          }
      });
  }

  if (childProfileForm) {
    childProfileForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("childName").value;
      const age = parseInt(document.getElementById("childAge").value);
      const weight = parseFloat(document.getElementById("childWeight").value);

      const payload = { name, age, weight };
      
      try {
          const response = await fetch(`${API_BASE_URL}/api/children`, {
              method: "POST",
              headers: { 
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${getAuthToken()}`
              },
              body: JSON.stringify(payload)
          });
          
          if (!response.ok) throw new Error("Failed to add child");
          
          const newChild = await response.json();
          localStorage.setItem("activeChildId", newChild.id);

          childProfileForm.reset();
          await loadRoster();
          activateAnalysisMode(newChild);
          alert("Patient added successfully!");
      } catch (err) {
          console.error(err);
          alert("Error adding patient. See console.");
      }
    });
  }

  let timerInterval;
  let seconds = 0;

  if (startWebcamBtn) {
    startWebcamBtn.addEventListener("click", async () => {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        videoElement.srcObject = localStream;
        startWebcamBtn.style.display = "none";
        document.getElementById("recordingControls").style.display = "block";
      } catch (err) {
        console.error("Error accessing webcam: ", err);
        alert("Could not access webcam and microphone.");
      }
    });
  }

  if (recordBtn) {
    recordBtn.addEventListener("click", () => {
      if (!localStream) return;

      recordedChunks = [];
      mediaRecorder = new MediaRecorder(localStream);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = uploadRecording;

      mediaRecorder.start();
      recordBtn.disabled = true;
      stopBtn.disabled = false;

      // Start Timer
      timerInterval = setInterval(() => {
        seconds++;
        const mins = String(Math.floor(seconds / 60)).padStart(2, "0");
        const secs = String(seconds % 60).padStart(2, "0");
        recordingTimer.textContent = `${mins}:${secs}`;
      }, 1000);

      document.getElementById("recordingStatus").textContent = "Recording...";
      document.getElementById("recordingStatus").style.color = "var(--danger)";
    });
  }

  if (stopBtn) {
    stopBtn.addEventListener("click", () => {
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
        clearInterval(timerInterval);
        recordBtn.disabled = false;
        stopBtn.disabled = true;
        document.getElementById("recordingStatus").textContent =
          "Processing...";
        document.getElementById("recordingStatus").style.color =
          "var(--warning)";

        // Stop webcam
        localStream.getTracks().forEach((track) => track.stop());
        videoElement.srcObject = null;
      }
    });
  }

  if (uploadForm) {
    uploadForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fileInput = document.getElementById("mediaFile");
      if (fileInput.files.length === 0) return;

      const file = fileInput.files[0];
      const isVideo = file.type.includes("video");
      const endpoint = isVideo ? "/analyze-video" : "/analyze-audio";

      await submitFile(file, endpoint);
    });
  }
}

async function uploadRecording() {
  document.getElementById("recordingStatus").textContent =
    "Uploading analysis...";
  const blob = new Blob(recordedChunks, { type: "video/webm" });
  const file = new File([blob], "recording.webm", { type: "video/webm" });

  await submitFile(file, "/analyze-video");
}

async function submitFile(file, endpoint) {
  const formData = new FormData();
  formData.append("file", file);

  const resultsContainer = document.getElementById("analysisResult");
  if (resultsContainer) {
    resultsContainer.innerHTML =
      '<div class="loader"></div><p class="text-center mt-3">Analyzing Neuro-Signals...</p>';
    resultsContainer.style.display = "block";
  }

    const url = new URL(`${API_BASE_URL}${endpoint}`);
    const activeId = localStorage.getItem("activeChildId");
    if (activeId) {
        url.searchParams.append('child_id', activeId);
    }

    try {
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${getAuthToken()}`
        },
        body: formData,
      });

      if (!response.ok) {
          if (response.status === 401) logout();
          throw new Error("Network response was not ok");
      }

      const data = await response.json();

      if (resultsContainer) {
        let badgeClass = "badge-warning";
        const danger = ["Pain Cry", "Colic Cry", "Infection Cry", "Neurological Cry", "Respiratory Distress Cry"];
        const success = ["Hungry Cry", "Sleepy Cry"];
        if (danger.includes(data.analysis.cry_type)) badgeClass = "badge-danger";
        else if (success.includes(data.analysis.cry_type)) badgeClass = "badge-success";

        resultsContainer.innerHTML = `
                  <div class="card" style="border-left: 4px solid var(--success);">
                      <h4>Analysis Complete</h4>
                      <p><strong>Detected Cry Type:</strong> <span class="badge ${badgeClass}">${data.analysis.cry_type}</span></p>
                      <p><strong>Confidence:</strong> ${data.analysis.confidence_score}%</p>
                      <div class="mt-4">
                          <a href="dashboard.html" class="btn btn-primary">View Full Dashboard</a>
                      </div>
                  </div>
              `;
      }
    } catch (error) {
      console.error("Upload error:", error);
      if (resultsContainer) {
        resultsContainer.innerHTML = `<div class="card" style="border-left: 4px solid var(--danger);">
                  <p class="text-danger">Error processing analysis. Make sure the backend server is running and you are logged in.</p>
              </div>`;
      }
    }
}

// ==========================================
// DASHBOARD PAGE LOGIC
// ==========================================
let currentChart = null;

function initDashboardPage() {
  const dashboardChildSelect = document.getElementById("dashboardChildSelect");
  
  // Load children into dropdown from DB
  async function loadDashboardRoster() {
      try {
          const response = await fetch(`${API_BASE_URL}/api/children`, {
              headers: { "Authorization": `Bearer ${getAuthToken()}` }
          });
          if (!response.ok) return;
          
          let children = await response.json();
          window.childRosterData = children; // Store globally
          
          if (dashboardChildSelect) {
              dashboardChildSelect.innerHTML = '<option value="">-- Select Patient --</option>';
              children.forEach(child => {
                  const opt = document.createElement("option");
                  opt.value = child.id;
                  opt.textContent = `${child.name} (${child.age}w, ${child.weight}kg)`;
                  dashboardChildSelect.appendChild(opt);
              });

              // Auto-select active child
              const activeId = localStorage.getItem("activeChildId");
              if (activeId) {
                  dashboardChildSelect.value = activeId;
                  loadDashboardData(activeId);
              }
          }
      } catch (e) { console.error(e); }
  }

  loadDashboardRoster();

  if(dashboardChildSelect) {
      dashboardChildSelect.addEventListener("change", (e) => {
          const id = e.target.value;
          if (id) {
              localStorage.setItem("activeChildId", id);
              loadDashboardData(id);
          } else {
              clearDashboard();
          }
      });
  }
}

function clearDashboard() {
    document.getElementById("childNameVal").textContent = "--";
    document.getElementById("childAgeVal").textContent = "--";
    document.getElementById("childWeightVal").textContent = "--";
    document.getElementById("cryTypeVal").textContent = "Awaiting Data";
    document.getElementById("cryTypeVal").className = "badge badge-info";
    document.getElementById("confidenceVal").textContent = "--%";
    document.getElementById("breathingVal").textContent = "--";
    document.getElementById("dateVal").textContent = "--/--/----";
    
    document.getElementById("recommendationBox").innerHTML = "<strong>Medical Advisory:</strong> Please select a patient or complete a session.";
    document.getElementById("recommendationBox").className = "card border-left: 4px solid var(--primary-blue);";
    
    document.getElementById("historyTableBody").innerHTML = "";

    if (currentChart) {
        currentChart.destroy();
        currentChart = null;
    }
}

async function loadDashboardData(childId) {
  const children = window.childRosterData || [];
  const childData = children.find(c => c.id == childId);
  if (!childData) return;

  // Populate Child Profile
  document.getElementById("childNameVal").textContent = childData.name;
  document.getElementById("childAgeVal").textContent = childData.age;
  document.getElementById("childWeightVal").textContent = childData.weight;

  // Fetch Analyses for this child from backend
  try {
      const response = await fetch(`${API_BASE_URL}/api/analyses/${childId}`, {
          headers: { "Authorization": `Bearer ${getAuthToken()}` }
      });
      if (!response.ok) throw new Error("Could not fetch history");
      
      let analyses = await response.json();
      
      if (analyses.length === 0) {
          document.getElementById("cryTypeVal").textContent = "No Data";
          document.getElementById("confidenceVal").textContent = "--%";
          document.getElementById("breathingVal").textContent = "--";
          document.getElementById("dateVal").textContent = "--/--/----";
          document.getElementById("recommendationBox").innerHTML = "<strong>Medical Advisory:</strong> No sessions recorded for this patient yet.";
          document.getElementById("recommendationBox").className = "card mt-4";
          document.getElementById("historyTableBody").innerHTML = '<tr><td colspan="4" class="text-center text-muted">No history found</td></tr>';
          if(currentChart) currentChart.destroy();
          return;
      }

      // Backend returns ordered DESC (newest first). Index 0 is the latest.
      const data = analyses[0];

      // Update AI Panel
      document.getElementById("cryTypeVal").textContent = data.cry_type;
      
      let aiBadgeClass = "badge-warning";
      const danger = ["Pain Cry", "Colic Cry", "Infection Cry", "Neurological Cry", "Respiratory Distress Cry"];
      const success = ["Hungry Cry", "Sleepy Cry"];
      if (danger.includes(data.cry_type)) aiBadgeClass = "badge-danger";
      else if (success.includes(data.cry_type)) aiBadgeClass = "badge-success";
      document.getElementById("cryTypeVal").className = `badge ${aiBadgeClass}`;

      document.getElementById("confidenceVal").textContent = `${data.confidence_score}%`;
      document.getElementById("breathingVal").textContent = data.breathing_status;
      document.getElementById("dateVal").textContent = data.date;

      // Recommendations
      const recDiv = document.getElementById("recommendationBox");
      let badgeClass = "badge-warning";
      if (danger.includes(data.cry_type)) badgeClass = "badge-danger";
      else if (success.includes(data.cry_type)) badgeClass = "badge-success";

      recDiv.innerHTML = `<strong>Medical Advisory:</strong> ${data.recommendation}`;
      recDiv.className = `card ${badgeClass} mt-4`;

      // Init Charts
      initCharts(data.metrics);

      // Add to history table
      const tbody = document.getElementById("historyTableBody");
      tbody.innerHTML = ""; // Clear existing rows
      
      analyses.forEach(record => {
          const tr = document.createElement("tr");

          let tableBadgeClass = "badge-warning";
          if (danger.includes(record.cry_type)) tableBadgeClass = "badge-danger";
          else if (success.includes(record.cry_type)) tableBadgeClass = "badge-success";

          tr.innerHTML = `
                <td>${record.date}</td>
                <td><span class="badge ${tableBadgeClass}">${record.cry_type}</span></td>
                <td>${record.metrics.distress_score}%</td>
                <td><span class="badge badge-info">Completed</span></td>
            `;
          tbody.appendChild(tr);
      });
  } catch (err) {
      console.error(err);
  }
}

function initCharts(metrics) {
  const ctx = document.getElementById("healthChart");
  if (!ctx) return;
  
  if (currentChart) {
      currentChart.destroy();
  }

  // Assuming Chart.js is loaded in HTML
  currentChart = new Chart(ctx, {
    type: "radar",
    data: {
      labels: ["Distress Score", "Infection Risk", "Respiratory Risk"],
      datasets: [
        {
          label: "Current Session Metrics",
          data: [
            metrics.distress_score,
            metrics.infection_risk,
            metrics.respiratory_risk,
          ],
          fill: true,
          backgroundColor: "rgba(37, 99, 235, 0.2)",
          borderColor: "rgb(37, 99, 235)",
          pointBackgroundColor: "rgb(37, 99, 235)",
          pointBorderColor: "#fff",
          pointHoverBackgroundColor: "#fff",
          pointHoverBorderColor: "rgb(37, 99, 235)",
        },
      ],
    },
    options: {
      scales: {
        r: {
          angleLines: { display: false },
          suggestedMin: 0,
          suggestedMax: 100,
        },
      },
      elements: {
        line: { borderWidth: 3 },
      },
    },
  });
}
