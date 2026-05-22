/* ==========================================================================
   CRM DevHub - Application Logic & State Management
   Author: Antigravity (Google DeepMind Advanced Agentic Coding Team)
   ========================================================================== */

// --- Global Application State ---
let clients = [];
let todos = [];
let githubToken = "";
let alertedMeetings = new Set(); // Tracks meetings that already fired desktop notifications

// Helper: Get element by ID
const $ = (id) => document.getElementById(id);

// ==========================================================================
// 1. Initializer & Auth
// ==========================================================================
window.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  // Load data from LocalStorage
  clients = JSON.parse(localStorage.getItem('crm_clients')) || getMockData();
  todos = JSON.parse(localStorage.getItem('crm_todos')) || getMockTodos();
  githubToken = localStorage.getItem('crm_github_token') || "";
  
  // Set values in config tab if elements exist
  if ($('githubTokenInput')) {
    $('githubTokenInput').value = githubToken;
  }
  
  // Load Notes Scratchpad
  if ($('notesScratchpad')) {
    const savedNotes = localStorage.getItem('crm_scratchpad') || "";
    $('notesScratchpad').value = savedNotes;
    if (savedNotes) {
      $('scratchpadSaveTime').innerText = `Última alteração: ${localStorage.getItem('crm_scratchpad_time') || 'carregado'}`;
    }
  }

  // Initialize Supabase Sync Engine
  SupabaseSyncEngine.init();
  if (SupabaseSyncEngine.active) {
    SupabaseSyncEngine.pullAll();
  }

  // Check auth
  checkAuth();
  
  // Start clock & greeting engine
  updateClockAndGreeting();
  setInterval(updateClockAndGreeting, 1000);
  
  // Start countdown & meeting scanning engines
  setInterval(updateLiveCountdowns, 10000); // Update countdown tags every 10s
  setInterval(scanUpcomingMeetingsForAlerts, 30000); // Scan for alerts every 30s
  
  // Request Notification Permissions on load
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function checkAuth() {
  const loggedIn = localStorage.getItem('crm_devhub_logged_in') === 'true';
  if (loggedIn) {
    $('loginOverlay').style.display = 'none';
    $('appContainer').style.display = 'flex';
    
    // Initial Render
    renderDashboard();
    renderClientsList();
    renderTimeline();
    renderTodoList();
  } else {
    $('loginOverlay').style.display = 'flex';
    $('appContainer').style.display = 'none';
  }
}

function handleLogin() {
  const user = $('username').value.trim();
  const pass = $('password').value;
  const loginCard = $('loginCard');
  const errorMsg = $('loginError');

  if (user.toLowerCase() === 'caio' && pass === '1414') {
    localStorage.setItem('crm_devhub_logged_in', 'true');
    showToast('Acesso concedido. Bem-vindo, Caio! 🚀', 'success');
    
    // Smooth transition
    $('loginOverlay').style.opacity = 0;
    setTimeout(() => {
      checkAuth();
      $('loginOverlay').style.opacity = 1; // reset for logout later
    }, 400);
  } else {
    // Shake animation
    loginCard.classList.add('shake');
    errorMsg.classList.add('visible');
    
    setTimeout(() => {
      loginCard.classList.remove('shake');
    }, 500);
  }
}

function handleLogout() {
  localStorage.removeItem('crm_devhub_logged_in');
  showToast('Sessão encerrada com sucesso.', 'info');
  checkAuth();
}

// ==========================================================================
// 2. View Routing
// ==========================================================================
function switchActiveTab(viewId, element) {
  // Hide all views
  const views = document.querySelectorAll('.app-view');
  views.forEach(v => v.classList.remove('active'));
  
  // Show target view
  const targetView = $(viewId);
  if (targetView) targetView.classList.add('active');
  
  // Update Tab bar selection
  const tabItems = document.querySelectorAll('.tab-item');
  tabItems.forEach(t => t.classList.remove('active'));
  element.classList.add('active');
  
  // Trigger tab-specific renders
  if (viewId === 'viewDashboard') {
    renderDashboard();
  } else if (viewId === 'viewClientes') {
    renderClientsList();
  } else if (viewId === 'viewAgenda') {
    renderTimeline();
  } else if (viewId === 'viewLembretes') {
    renderTodoList();
  }
}

// ==========================================================================
// 3. Helper Engines (Time, Notifications, Toasts)
// ==========================================================================
function updateClockAndGreeting() {
  const now = new Date();
  
  // Update Live Time Badge in Header
  const timeBadge = $('liveTimeBadge');
  if (timeBadge) {
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    timeBadge.innerText = `${hh}:${mm}`;
  }
  
  // Dynamic Greeting based on current local hour
  const headerGreeting = $('headerGreeting');
  const headerSubGreeting = $('headerSubGreeting');
  if (headerGreeting) {
    const hour = now.getHours();
    let greeting = 'Olá, Caio';
    let sub = 'Pronto para codar hoje?';
    
    if (hour >= 5 && hour < 12) {
      greeting = 'Bom dia, Caio ☕';
      sub = 'Comece o dia organizando suas metas!';
    } else if (hour >= 12 && hour < 18) {
      greeting = 'Boa tarde, Caio 💻';
      sub = 'Foco total no desenvolvimento!';
    } else {
      greeting = 'Boa noite, Caio 🌙';
      sub = 'Projetando códigos estelares!';
    }
    
    headerGreeting.innerText = greeting;
    headerSubGreeting.innerText = sub;
  }
}

function showToast(message, type = 'info') {
  const container = $('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  // Icon Select
  let iconSvg = '';
  if (type === 'success') {
    iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width: 20px; height: 20px;"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`;
  } else if (type === 'warning') {
    iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width: 20px; height: 20px;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>`;
  } else if (type === 'error') {
    iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width: 20px; height: 20px;"><path stroke-linecap="round" stroke-linejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`;
  } else {
    iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width: 20px; height: 20px;"><path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 111.063.852l-.708 2.836a.75.75 0 001.063.852l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" /></svg>`;
  }

  toast.innerHTML = `
    <div class="toast-icon">${iconSvg}</div>
    <div class="toast-message">${message}</div>
  `;

  container.appendChild(toast);

  // Auto dismiss toast after 4s
  setTimeout(() => {
    toast.style.opacity = 0;
    toast.style.transform = 'translateY(-20px)';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 4000);
}

function updateLiveCountdowns() {
  // If user is currently looking at Dashboard or Agenda, refresh the UI elements to update countdown times
  const activeTab = document.querySelector('.tab-item.active');
  if (activeTab) {
    if (activeTab.innerHTML.includes('Início')) {
      renderDashboard();
    } else if (activeTab.innerHTML.includes('Agenda')) {
      renderTimeline();
    }
  }
}

// Meeting Notification engine (runs in background)
function scanUpcomingMeetingsForAlerts() {
  if (localStorage.getItem('crm_devhub_logged_in') !== 'true') return;
  
  const now = new Date();
  let alertCount = 0;
  
  clients.forEach(client => {
    if (!client.dateNextContact) return;
    
    const nextMeetingDate = new Date(client.dateNextContact);
    const diffMs = nextMeetingDate - now;
    const diffMins = diffMs / 1000 / 60;
    
    // If meeting is in the next 15 minutes AND has not passed AND hasn't been alerted yet
    if (diffMins > 0 && diffMins <= 15) {
      const alertKey = `${client.id}_${client.dateNextContact}`;
      
      if (!alertedMeetings.has(alertKey)) {
        alertedMeetings.add(alertKey);
        alertCount++;
        
        const text = `Acompanhamento agendado com ${client.name} em ${Math.ceil(diffMins)} min (${client.projectName})! ⏱️`;
        
        // 1. Show dynamic in-app toast
        showToast(text, 'warning');
        
        // 2. Trigger native OS/Browser notification
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Reunião Próxima! 📅', {
            body: text,
            icon: 'https://cdn-icons-png.flaticon.com/512/3652/3652191.png'
          });
        }
      }
    }
  });

  // Badge notification count in Header
  const badge = $('notificationBadgeCount');
  if (badge) {
    if (alertCount > 0) {
      badge.innerText = alertCount;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }
}

function toggleNotificationList() {
  const now = new Date();
  const upcomingMeetings = clients.filter(c => {
    if (!c.dateNextContact) return false;
    return new Date(c.dateNextContact) > now;
  });

  if (upcomingMeetings.length === 0) {
    showToast('Nenhuma reunião agendada pendente! 📅', 'info');
  } else {
    // Alert the user about their immediate next contact
    upcomingMeetings.sort((a, b) => new Date(a.dateNextContact) - new Date(b.dateNextContact));
    const next = upcomingMeetings[0];
    const diff = new Date(next.dateNextContact) - now;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    let timeStr = `${mins} minutos`;
    if (hours > 0) timeStr = `${hours}h e ${mins}m`;
    
    showToast(`O seu próximo contato agendado é com ${next.name} em ${timeStr}!`, 'info');
  }
  
  // Clear header notification count badge on click
  const badge = $('notificationBadgeCount');
  if (badge) badge.style.display = 'none';
}

// Helper: format money
function formatBRL(value) {
  if (value === undefined || value === null || isNaN(value)) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

// Helper: Calculate countdown string
function getCountdownText(targetDateStr) {
  if (!targetDateStr) return null;
  const now = new Date();
  const target = new Date(targetDateStr);
  const diffMs = target - now;
  
  if (diffMs < 0) {
    return { text: 'Reunião Realizada', class: '', isPast: true };
  }
  
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffDays > 0) {
    return { text: `em ${diffDays}d ${diffHours % 24}h`, class: 'distante', isPast: false };
  } else if (diffHours > 0) {
    return { text: `em ${diffHours}h ${diffMins % 60}m`, class: 'proxima', isPast: false };
  } else {
    return { text: `em ${diffMins} min`, class: 'alert-near', isPast: false };
  }
}

// Helper: Format DateTime to local friendly text
function formatFriendlyDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// ==========================================================================
// 4. Dashboard View Rendering & Calculations
// ==========================================================================
function renderDashboard() {
  // 1. Calculate financial variables
  let totalRevenue = 0;
  let activePipeline = 0;
  let recurringMaintenance = 0;
  let activeProjectsCount = 0;
  let totalProjectsCount = clients.length;

  clients.forEach(c => {
    const cost = parseFloat(c.projectCost) || 0;
    totalRevenue += cost;
    
    // Active states represent current pipeline
    const isActive = ['Idealizando', 'Estrutura sendo feita', 'Fase de testes'].includes(c.projectStatus);
    if (isActive) {
      activePipeline += cost;
      activeProjectsCount++;
    }
    
    // Maintenance status represents steady recurring income
    if (c.projectStatus === 'Manutenção') {
      recurringMaintenance += cost;
      activeProjectsCount++; // also considered active in dashboard tracker
    }
  });

  // Calculate dynamic Estimated Monthly Revenue
  // Strategy: Steady maintenance contracts + active pipelines spread over a typical 3-month development cycle
  const estimatedMonthly = recurringMaintenance + (activePipeline / 3);

  // Update UI cards
  $('dashTotalProfit').innerText = formatBRL(totalRevenue);
  $('dashMonthlyProfit').innerText = formatBRL(estimatedMonthly);
  $('dashActiveTotalRatio').innerText = `${activeProjectsCount} / ${totalProjectsCount}`;

  // 2. Render Project Status breakdown Donut Chart
  let idealizando = 0;
  let estrutura = 0;
  let testes = 0;
  let deploy = 0;
  let manutencao = 0;

  clients.forEach(c => {
    switch (c.projectStatus) {
      case 'Idealizando': idealizando++; break;
      case 'Estrutura sendo feita': estrutura++; break;
      case 'Fase de testes': testes++; break;
      case 'Deploy': deploy++; break;
      case 'Manutenção': manutencao++; break;
    }
  });

  // Set counts
  $('countIdealizando').innerText = idealizando;
  $('countEstrutura').innerText = estrutura;
  $('countTestes').innerText = testes;
  $('countDeploy').innerText = deploy;
  $('countManutencao').innerText = manutencao;

  // Render donut SVG slices
  const totalStatus = idealizando + estrutura + testes + deploy + manutencao;
  updateDonutSlices(totalStatus, idealizando, estrutura, testes, deploy, manutencao);

  // 3. Render Upcoming Meetings List on Dashboard
  const now = new Date();
  const upcomingMeetings = clients.filter(c => {
    if (!c.dateNextContact) return false;
    return new Date(c.dateNextContact) > now;
  });

  // Sort upcoming chronologically (closest first)
  upcomingMeetings.sort((a, b) => new Date(a.dateNextContact) - new Date(b.dateNextContact));

  const listWrap = $('dashboardUpcomingList');
  listWrap.innerHTML = '';

  if (upcomingMeetings.length === 0) {
    listWrap.innerHTML = `
      <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z" />
        </svg>
        <span>Nenhum acompanhamento agendado</span>
      </div>
    `;
  } else {
    upcomingMeetings.forEach(meeting => {
      const countdown = getCountdownText(meeting.dateNextContact);
      const isUrgent = countdown && countdown.class === 'alert-near';
      
      const item = document.createElement('div');
      item.className = 'upcoming-item';
      item.innerHTML = `
        <div class="meeting-info">
          <h4>${meeting.name}</h4>
          <p>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 14px; height: 14px;"><path stroke-linecap="round" stroke-linejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" /></svg>
            ${meeting.projectName}
          </p>
        </div>
        <div class="meeting-countdown" onclick="viewClientDetails('${meeting.id}')" style="cursor: pointer;">
          <span class="countdown-badge ${isUrgent ? 'alert-near' : ''}">${countdown ? countdown.text : '-'}</span>
          <span class="countdown-time-left">${formatFriendlyDateTime(meeting.dateNextContact)}</span>
        </div>
      `;
      listWrap.appendChild(item);
    });
  }
}

function updateDonutSlices(total, ideal, est, test, dep, man) {
  const slices = [
    { el: $('segIdealizando'), count: ideal },
    { el: $('segEstrutura'), count: est },
    { el: $('segTestes'), count: test },
    { el: $('segDeploy'), count: dep },
    { el: $('segManutencao'), count: man }
  ];

  if (total === 0) {
    // If no data, hide all slices
    slices.forEach(s => {
      if (s.el) s.el.setAttribute('stroke-dasharray', '0 100');
    });
    return;
  }

  let accumulatedPercent = 0;
  
  slices.forEach(slice => {
    if (!slice.el) return;
    const percentage = (slice.count / total) * 100;
    
    // SVG stroke-dasharray properties: dash length, gap length
    slice.el.setAttribute('stroke-dasharray', `${percentage} 100`);
    slice.el.setAttribute('stroke-dashoffset', `-${accumulatedPercent}`);
    
    accumulatedPercent += percentage;
  });
}

// ==========================================================================
// 5. Clients & Projects View Grid Render
// ==========================================================================
function renderClientsList() {
  const container = $('clientsContainer');
  if (!container) return;

  const searchQuery = $('clientSearchInput').value.toLowerCase().trim();
  const filterStatus = $('clientFilterStatus').value;

  // Filter logic
  const filtered = clients.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery) ||
                          (c.company && c.company.toLowerCase().includes(searchQuery)) ||
                          c.projectName.toLowerCase().includes(searchQuery);
                          
    const matchesFilter = filterStatus === 'todos' || c.projectStatus === filterStatus;
    
    return matchesSearch && matchesFilter;
  });

  container.innerHTML = '';

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1; min-height: 250px;">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
        </svg>
        <h3>Nenhum cliente cadastrado</h3>
        <p>Clique em "Novo Cliente" para começar a organizar seus projetos.</p>
      </div>
    `;
    return;
  }

  filtered.forEach(client => {
    // Generate card initial layout
    const statusClass = getStatusClassModifier(client.projectStatus);
    const initials = getClientInitials(client.name);
    
    const card = document.createElement('article');
    card.className = `client-card ${statusClass}`;
    
    // Optional finance info
    let costText = client.projectCost ? formatBRL(parseFloat(client.projectCost)) : 'Não informado';
    let hoursText = client.projectHours ? `${client.projectHours}h` : 'Não informadas';
    
    // Git Repo Badge (synced or pending)
    let gitBadgeHtml = '';
    if (client.projectGit) {
      const shortGit = client.projectGit.replace(/https:\/\/github\.com\//i, '').replace(/\/$/, '');
      const isSynced = !!client.gitCachedData;
      
      gitBadgeHtml = `
        <div class="git-badge ${isSynced ? 'synced' : ''}">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
          </svg>
          <span style="font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px;">
            ${shortGit}
          </span>
          ${isSynced ? `<span style="color: var(--success); font-size: 0.7rem; font-weight: bold; margin-left: auto;">OK</span>` : ''}
        </div>
      `;
    }

    // Deploy Link Button
    let deployBtnHtml = '';
    if (client.projectDeploy) {
      deployBtnHtml = `
        <a href="${client.projectDeploy}" target="_blank" class="btn-secondary icon-only" title="Acessar Deploy" style="color: var(--success);">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
        </a>
      `;
    }

    // WhatsApp Button
    let waBtnHtml = '';
    if (client.phone) {
      waBtnHtml = `
        <button class="btn-whatsapp-icon" onclick="contactClientWhatsApp('${client.id}')" title="Falar no WhatsApp">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.858-4.42 9.86-9.86.001-2.636-1.026-5.112-2.893-6.98C16.573 1.897 14.1 .869 11.468.868 6.03.868 1.61 5.289 1.608 10.729c-.001 1.718.453 3.393 1.31 4.887l-1.012 3.693 3.791-.994c1.478.807 3.12 1.239 4.743 1.239-.001 0-.001 0 0 0zm10.967-7.493c-.3-.15-1.77-.874-2.043-.974-.275-.102-.475-.152-.674.152-.2.302-.776.974-.95 1.176-.176.202-.351.226-.651.077-.3-.15-1.267-.467-2.414-1.492-.893-.797-1.495-1.782-1.67-2.083-.176-.3-.019-.462.13-.61.135-.133.301-.352.451-.527.15-.176.2-.3.3-.5.101-.2.05-.376-.025-.526-.076-.15-.675-1.627-.925-2.227-.244-.588-.492-.507-.675-.516-.174-.008-.375-.01-.576-.01-.2 0-.525.075-.8.376-.275.301-1.05 1.027-1.05 2.507 0 1.481 1.075 2.913 1.225 3.113.15.2 2.113 3.227 5.113 4.527.714.31 1.272.495 1.707.634.717.228 1.37.195 1.887.118.577-.087 1.77-.724 2.02-.142.25-.376.25-.699.175-.774-.075-.075-.275-.15-.575-.3z"/>
          </svg>
        </button>
      `;
    }

    // Determine status badge color
    const badgeStatusColor = client.projectStatus.toLowerCase().split(' ')[0];

    card.innerHTML = `
      <div class="card-top">
        <div class="client-brand">
          <div class="client-initials">${initials}</div>
          <div class="client-title-info">
            <h3>${client.name}</h3>
            <p>${client.company || 'Autônomo / Direto'}</p>
          </div>
        </div>
        <span class="status-badge ${badgeStatusColor}">${client.projectStatus}</span>
      </div>

      <div class="project-details-block">
        <div class="project-name-line">
          <span class="project-label">${client.projectName}</span>
          <span class="category-tag">${client.projectType}</span>
        </div>
        
        <div class="project-finance-line">
          <div class="finance-item">Valor: <span>${costText}</span></div>
          <div class="finance-item">Horas: <span>${hoursText}</span></div>
        </div>
      </div>

      ${gitBadgeHtml}

      <div class="card-actions">
        <button class="btn-secondary" onclick="viewClientDetails('${client.id}')">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          Detalhes
        </button>
        <button class="btn-secondary" onclick="openEditClientModal('${client.id}')">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /></svg>
          Editar
        </button>
        ${deployBtnHtml}
        ${waBtnHtml}
      </div>
    `;

    container.appendChild(card);
  });
}

function getStatusClassModifier(status) {
  switch (status) {
    case 'Idealizando': return 'status-idealizando';
    case 'Estrutura sendo feita': return 'status-estrutura';
    case 'Fase de testes': return 'status-testes';
    case 'Deploy': return 'status-deploy';
    case 'Manutenção': return 'status-manutencao';
    default: return '';
  }
}

function getClientInitials(name) {
  if (!name) return 'C';
  const parts = name.split(' ');
  if (parts.length > 1) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

// ==========================================================================
// 6. Agenda / Vertical Timeline Rendering
// ==========================================================================
function renderTimeline() {
  const container = $('timelineContainer');
  if (!container) return;

  // Build a unified chronological list of timeline nodes
  let nodes = [];

  clients.forEach(client => {
    // 1. First Contact Node
    if (client.dateFirstContact) {
      nodes.push({
        clientId: client.id,
        clientName: client.name,
        projectName: client.projectName,
        projectStatus: client.projectStatus,
        date: new Date(client.dateFirstContact),
        type: 'primeiro',
        typeLabel: 'Primeiro Contato',
        notes: `Contato inicial estabelecido para alinhamento de escopo do projeto: ${client.projectName}`
      });
    }

    // 2. Next Contact Node
    if (client.dateNextContact) {
      nodes.push({
        clientId: client.id,
        clientName: client.name,
        projectName: client.projectName,
        projectStatus: client.projectStatus,
        date: new Date(client.dateNextContact),
        type: 'proximo',
        typeLabel: 'Próximo Acompanhamento',
        notes: `Acompanhamento agendado para discutir atualizações e marcos técnicos.`
      });
    }
  });

  // Sort nodes: next contacts in future/past, first contacts in past. Closest date first
  nodes.sort((a, b) => b.date - a.date); // Descending (most recent first)

  container.innerHTML = '';

  if (nodes.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h3>Linha do tempo vazia</h3>
        <p>Defina datas de contatos ao cadastrar ou editar seus clientes.</p>
      </div>
    `;
    return;
  }

  nodes.forEach(node => {
    const statusClass = getStatusClassModifier(node.projectStatus);
    const dateFormatted = formatFriendlyDateTime(node.date);
    
    let countdownBadgeHtml = '';
    let isNextUrgent = false;

    if (node.type === 'proximo') {
      const countdown = getCountdownText(node.date);
      if (countdown) {
        isNextUrgent = countdown.class === 'alert-near';
        countdownBadgeHtml = `<span class="countdown-badge ${countdown.class}">${countdown.text}</span>`;
      }
    }

    const nodeEl = document.createElement('div');
    // Mark if this node represents an upcoming urgent meeting
    nodeEl.className = `timeline-node ${statusClass} ${isNextUrgent ? 'next-meeting' : ''}`;
    nodeEl.innerHTML = `
      <div class="timeline-dot"></div>
      <div class="timeline-card">
        <div class="timeline-meta">
          <span class="timeline-type-badge ${node.type}">${node.typeLabel}</span>
          <span style="font-family: monospace;">${dateFormatted}</span>
        </div>
        <h3>${node.clientName}</h3>
        <p class="timeline-desc">${node.notes}</p>
        <div class="timeline-footer">
          <span>Projeto: <strong>${node.projectName}</strong></span>
          ${countdownBadgeHtml}
        </div>
      </div>
    `;
    
    // Add click event to timeline card to view deep details
    nodeEl.querySelector('.timeline-card').addEventListener('click', () => {
      viewClientDetails(node.clientId);
    });

    container.appendChild(nodeEl);
  });
}

// ==========================================================================
// 7. Modals CRUD Operations (Client Form & Detail Cards)
// ==========================================================================
function openAddClientModal() {
  $('clientFormModalTitle').innerText = 'Adicionar Novo Cliente';
  $('clientForm').reset();
  $('formClientId').value = '';
  
  // Set default dates to current time
  const now = new Date();
  // ISO format required for datetime-local: YYYY-MM-DDTHH:MM
  const formatISO = (d) => {
    const tzoffset = d.getTimezoneOffset() * 60000; //offset in milliseconds
    const localISOTime = (new Date(d - tzoffset)).toISOString().slice(0, 16);
    return localISOTime;
  };
  
  $('formContactFirst').value = formatISO(now);
  
  $('modalClientForm').style.display = 'flex';
}

function openEditClientModal(id) {
  const client = clients.find(c => c.id === id);
  if (!client) return;

  $('clientFormModalTitle').innerText = `Editar Cliente: ${client.name}`;
  $('formClientId').value = client.id;
  
  // Populate form
  $('formClientName').value = client.name;
  $('formClientCompany').value = client.company || '';
  $('formClientEmail').value = client.email || '';
  $('formClientPhone').value = client.phone || '';
  $('formProjectName').value = client.projectName;
  $('formProjectType').value = client.projectType;
  $('formProjectStatus').value = client.projectStatus;
  $('formProjectGit').value = client.projectGit || '';
  $('formProjectDeploy').value = client.projectDeploy || '';
  $('formProjectCost').value = client.projectCost || '';
  $('formProjectHours').value = client.projectHours || '';
  
  $('formContactFirst').value = client.dateFirstContact ? client.dateFirstContact.slice(0, 16) : '';
  $('formContactNext').value = client.dateNextContact ? client.dateNextContact.slice(0, 16) : '';
  $('formProjectNotes').value = client.notes || '';

  $('modalClientForm').style.display = 'flex';
}

function closeClientFormModal(event) {
  // If clicked directly on the overlay backdrop OR manually closed
  if (event === null || event.target === $('modalClientForm')) {
    $('modalClientForm').style.display = 'none';
  }
}

function saveClientData() {
  const id = $('formClientId').value;
  const name = $('formClientName').value.trim();
  const company = $('formClientCompany').value.trim();
  const email = $('formClientEmail').value.trim();
  const phone = $('formClientPhone').value.trim();
  const projectName = $('formProjectName').value.trim();
  const projectType = $('formProjectType').value;
  const projectStatus = $('formProjectStatus').value;
  const projectGit = $('formProjectGit').value.trim();
  const projectDeploy = $('formProjectDeploy').value.trim();
  const projectCost = $('formProjectCost').value ? parseFloat($('formProjectCost').value) : null;
  const projectHours = $('formProjectHours').value ? parseInt($('formProjectHours').value) : null;
  const dateFirstContact = $('formContactFirst').value;
  const dateNextContact = $('formContactNext').value || null;
  const notes = $('formProjectNotes').value.trim();

  if (id) {
    // EDIT MODE
    const index = clients.findIndex(c => c.id === id);
    if (index !== -1) {
      // Retain gitCachedData if repository was not changed
      const oldGit = clients[index].projectGit;
      const gitCachedData = (oldGit === projectGit) ? clients[index].gitCachedData : null;
      
      clients[index] = {
        ...clients[index],
        name, company, email, phone, projectName, projectType, projectStatus,
        projectGit, projectDeploy, projectCost, projectHours, dateFirstContact, dateNextContact, notes,
        gitCachedData
      };
      showToast('Cliente atualizado com sucesso!', 'success');
    }
  } else {
    // NEW CLIENT MODE
    const newClient = {
      id: Date.now().toString(),
      name, company, email, phone, projectName, projectType, projectStatus,
      projectGit, projectDeploy, projectCost, projectHours, dateFirstContact, dateNextContact, notes,
      gitCachedData: null
    };
    clients.push(newClient);
    showToast('Novo cliente cadastrado com sucesso!', 'success');
  }

  // Persist & Refresh views
  localStorage.setItem('crm_clients', JSON.stringify(clients));

  // Cloud Sync PUSH hook
  if (id) {
    const updatedClient = clients.find(c => c.id === id);
    if (updatedClient) SupabaseSyncEngine.pushRecord('clients', mapClientToDb(updatedClient));
  } else {
    const newClient = clients[clients.length - 1];
    if (newClient) SupabaseSyncEngine.pushRecord('clients', mapClientToDb(newClient));
  }

  $('modalClientForm').style.display = 'none';
  
  renderDashboard();
  renderClientsList();
  renderTimeline();
}

// VIEW RICH DETAIL CARD
let activeDetailClientId = null;

function viewClientDetails(id) {
  const client = clients.find(c => c.id === id);
  if (!client) return;

  activeDetailClientId = id;

  // Set top identity
  $('detailInitials').innerText = getClientInitials(client.name);
  $('detailClientName').innerText = client.name;
  $('detailClientCompany').innerText = client.company || 'Autônomo / Direto';

  // Set fields
  let contactHtml = '';
  if (client.phone) contactHtml += `📞 ${client.phone}<br>`;
  if (client.email) contactHtml += `✉️ ${client.email}`;
  if (!contactHtml) contactHtml = 'Nenhuma informação de contato direta.';
  $('detailContactInfo').innerHTML = contactHtml;

  $('detailProjectName').innerText = client.projectName;
  $('detailProjectType').innerText = client.projectType;

  // Status Badge classes
  const badge = $('detailProjectStatus');
  badge.className = `status-badge ${client.projectStatus.toLowerCase().split(' ')[0]}`;
  badge.innerText = client.projectStatus;

  // Finance stats
  let costText = client.projectCost ? formatBRL(parseFloat(client.projectCost)) : 'Não informado';
  let hoursText = client.projectHours ? `${client.projectHours}h` : 'Não informadas';
  $('detailFinanceInfo').innerHTML = `💵 <strong>Valor:</strong> ${costText}<br>⏱️ <strong>Horas:</strong> ${hoursText}`;

  // Dates
  $('detailDateFirst').innerText = formatFriendlyDateTime(client.dateFirstContact);
  $('detailDateNext').innerText = client.dateNextContact ? formatFriendlyDateTime(client.dateNextContact) : 'Nenhum agendado';

  // Notes
  $('detailNotes').innerText = client.notes || 'Nenhuma anotação disponível para este projeto.';

  // Deploy link visual toggling
  if (client.projectDeploy) {
    $('detailDeployField').style.display = 'block';
    $('detailDeployLink').href = client.projectDeploy;
  } else {
    $('detailDeployField').style.display = 'none';
  }

  // GitHub integration container visual toggling
  const gitCard = $('detailGitCard');
  if (client.projectGit) {
    gitCard.style.display = 'block';
    const shortGit = client.projectGit.replace(/https:\/\/github\.com\//i, '').replace(/\/$/, '');
    $('detailGitRepoName').innerText = shortGit;
    
    // Display cached git info if it exists
    if (client.gitCachedData) {
      $('gitDetailsLoader').style.display = 'none';
      $('gitDetailsContent').style.display = 'grid';
      $('gitLang').innerText = client.gitCachedData.language || 'N/A';
      $('gitStars').innerText = client.gitCachedData.stars !== undefined ? client.gitCachedData.stars : '-';
      $('gitIssues').innerText = client.gitCachedData.issues !== undefined ? client.gitCachedData.issues : '-';
      $('gitLastCommitMsg').innerText = client.gitCachedData.lastCommitMsg || 'Sem commits';
      $('gitLastCommitDate').innerText = client.gitCachedData.lastCommitDate ? `Atualizado em: ${formatFriendlyDateTime(client.gitCachedData.lastCommitDate)}` : '';
    } else {
      // Reset git display layout to prompt sync
      $('gitDetailsContent').style.display = 'none';
      $('gitDetailsLoader').style.display = 'block';
      $('gitDetailsLoader').innerHTML = `<p style="font-size: 0.8rem; color: var(--text-secondary);">Repositório configurado. Clique em <strong>Sincronizar Agora</strong> para puxar os dados.</p>`;
    }
  } else {
    gitCard.style.display = 'none';
  }

  $('modalClientDetails').style.display = 'flex';
}

function closeClientDetailsModal(event) {
  if (event === null || event.target === $('modalClientDetails')) {
    $('modalClientDetails').style.display = 'none';
    activeDetailClientId = null;
  }
}

function deleteClientFromDetails() {
  if (!activeDetailClientId) return;
  
  if (confirm('Tem certeza absoluta de que deseja remover este cliente e todos os seus projetos?')) {
    // Cloud Sync DELETE hook
    SupabaseSyncEngine.deleteRecord('clients', activeDetailClientId);

    clients = clients.filter(c => c.id !== activeDetailClientId);
    localStorage.setItem('crm_clients', JSON.stringify(clients));
    
    showToast('Cliente removido do sistema.', 'warning');
    $('modalClientDetails').style.display = 'none';
    activeDetailClientId = null;

    renderDashboard();
    renderClientsList();
    renderTimeline();
  }
}

function editClientFromDetails() {
  if (!activeDetailClientId) return;
  const id = activeDetailClientId;
  $('modalClientDetails').style.display = 'none';
  activeDetailClientId = null;
  openEditClientModal(id);
}

// ==========================================================================
// 8. GitHub API Integration
// ==========================================================================
async function syncGitRepositoryDetails() {
  if (!activeDetailClientId) return;
  const clientIndex = clients.findIndex(c => c.id === activeDetailClientId);
  if (clientIndex === -1) return;

  const client = clients[clientIndex];
  if (!client.projectGit) return;

  const repoClean = client.projectGit.replace(/https:\/\/github\.com\//i, '').replace(/\/$/, '');
  
  // Show Loading state
  $('gitDetailsContent').style.display = 'none';
  $('gitDetailsLoader').style.display = 'block';
  $('gitDetailsLoader').innerHTML = `<p style="font-size: 0.8rem; color: var(--info);">Conectando à API do GitHub...</p>`;

  // Headers config (include Auth Token if provided)
  const headers = {};
  if (githubToken) {
    headers['Authorization'] = `token ${githubToken}`;
  }

  try {
    // 1. Fetch Repository Base Stats
    const repoResponse = await fetch(`https://api.github.com/repos/${repoClean}`, { headers });
    if (!repoResponse.ok) {
      throw new Error(`Falha ao obter repositório: ${repoResponse.statusText}`);
    }
    const repoData = await repoResponse.json();

    // 2. Fetch Latest Commit
    let lastCommitMsg = 'Sem commits recentes';
    let lastCommitDate = '';
    
    try {
      const commitsResponse = await fetch(`https://api.github.com/repos/${repoClean}/commits?per_page=1`, { headers });
      if (commitsResponse.ok) {
        const commitsData = await commitsResponse.json();
        if (commitsData && commitsData.length > 0) {
          lastCommitMsg = commitsData[0].commit.message;
          lastCommitDate = commitsData[0].commit.author.date;
        }
      }
    } catch (e) {
      console.warn('Erro ao carregar commits do GitHub: ', e);
    }

    // Cache the GitHub synced details
    const gitCachedData = {
      language: repoData.language,
      stars: repoData.stargazers_count,
      issues: repoData.open_issues_count,
      lastCommitMsg,
      lastCommitDate,
      lastSyncTime: Date.now()
    };

    clients[clientIndex].gitCachedData = gitCachedData;
    localStorage.setItem('crm_clients', JSON.stringify(clients));

    showToast('GitHub sincronizado com sucesso! ⭐', 'success');
    
    // Refresh visual representation in details modal
    viewClientDetails(client.id);
    renderClientsList(); // also refresh clients tab so check mark appears
    
  } catch (error) {
    console.error(error);
    showToast('Falha na integração Git. Verifique a URL do repositório ou seu Token.', 'error');
    
    // Restore visual prompt in loader
    $('gitDetailsLoader').innerHTML = `<p style="font-size: 0.8rem; color: var(--danger);">Erro na conexão. Verifique se o repositório é público ou configure seu token nos Ajustes.</p>`;
  }
}

// ==========================================================================
// 9. Lembretes (To-Do & Scratchpad Notepad)
// ==========================================================================
function renderTodoList() {
  const wrap = $('todoListWrap');
  if (!wrap) return;

  wrap.innerHTML = '';

  if (todos.length === 0) {
    wrap.innerHTML = `
      <div class="empty-state" style="padding: 20px 10px;">
        <span>Sem tarefas pendentes</span>
      </div>
    `;
    return;
  }

  todos.forEach(todo => {
    const item = document.createElement('div');
    item.className = `todo-item ${todo.completed ? 'completed' : ''}`;
    
    item.innerHTML = `
      <div class="todo-content" onclick="toggleTodoItem('${todo.id}')">
        <div class="todo-checkbox">
          <!-- Check icon SVG -->
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <span class="todo-text">${todo.text}</span>
      </div>
      <button class="btn-delete-todo" onclick="deleteTodoItem('${todo.id}')" aria-label="Remover lembrete">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 18px; height: 18px;">
          <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
        </svg>
      </button>
    `;
    wrap.appendChild(item);
  });
}

function handleTodoKeypress(event) {
  if (event.key === 'Enter') {
    addTodoItem();
  }
}

function addTodoItem() {
  const input = $('todoInputText');
  const text = input.value.trim();
  
  if (!text) return;

  const newTodo = {
    id: Date.now().toString(),
    text,
    completed: false
  };

  todos.push(newTodo);
  localStorage.setItem('crm_todos', JSON.stringify(todos));
  
  // Cloud Sync PUSH hook
  SupabaseSyncEngine.pushRecord('todos', newTodo);

  input.value = '';

  renderTodoList();
  showToast('Lembrete adicionado!', 'success');
}

function toggleTodoItem(id) {
  const index = todos.findIndex(t => t.id === id);
  if (index !== -1) {
    todos[index].completed = !todos[index].completed;
    localStorage.setItem('crm_todos', JSON.stringify(todos));
    
    // Cloud Sync PUSH hook
    SupabaseSyncEngine.pushRecord('todos', todos[index]);

    renderTodoList();
  }
}

function deleteTodoItem(id) {
  // Cloud Sync DELETE hook
  SupabaseSyncEngine.deleteRecord('todos', id);

  todos = todos.filter(t => t.id !== id);
  localStorage.setItem('crm_todos', JSON.stringify(todos));
  renderTodoList();
}

// Scratchpad Autosave
let scratchpadSyncTimeout = null;

function saveScratchpad() {
  const text = $('notesScratchpad').value;
  const now = new Date();
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  
  localStorage.setItem('crm_scratchpad', text);
  localStorage.setItem('crm_scratchpad_time', timeStr);
  
  $('scratchpadSaveTime').innerText = `Última alteração: salvo às ${timeStr}`;

  // Cloud Sync PUSH hook with 1s debounce
  if (scratchpadSyncTimeout) clearTimeout(scratchpadSyncTimeout);
  scratchpadSyncTimeout = setTimeout(() => {
    SupabaseSyncEngine.pushRecord('scratchpad', { id: 'single_notes', content: text });
  }, 1000);
}

// ==========================================================================
// 10. Settings Control Tools (JSON Backup & Token)
// ==========================================================================
function saveGithubToken() {
  const token = $('githubTokenInput').value.trim();
  githubToken = token;
  localStorage.setItem('crm_github_token', token);
  showToast('Token GitHub salvo com sucesso!', 'success');
}

function exportDataToJSON() {
  const backupData = {
    clients,
    todos,
    scratchpad: localStorage.getItem('crm_scratchpad') || "",
    version: "1.0"
  };

  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href",     dataStr);
  
  const today = new Date().toISOString().slice(0,10);
  downloadAnchor.setAttribute("download", `devhub_crm_backup_${today}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();

  showToast('Backup JSON gerado e baixado! 📁', 'success');
}

function importDataFromJSON(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const imported = JSON.parse(e.target.result);
      
      if (imported.clients && Array.isArray(imported.clients)) {
        clients = imported.clients;
        localStorage.setItem('crm_clients', JSON.stringify(clients));
      }
      if (imported.todos && Array.isArray(imported.todos)) {
        todos = imported.todos;
        localStorage.setItem('crm_todos', JSON.stringify(todos));
      }
      if (imported.scratchpad) {
        localStorage.setItem('crm_scratchpad', imported.scratchpad);
        if ($('notesScratchpad')) {
          $('notesScratchpad').value = imported.scratchpad;
        }
      }

      showToast('Dados restaurados com sucesso! 🔄', 'success');

      // Cloud Sync PUSH hook (upload everything to cloud)
      if (SupabaseSyncEngine.active) {
        pushAllLocalDataToCloud();
      }
      
      // Reload UI
      renderDashboard();
      renderClientsList();
      renderTimeline();
      renderTodoList();
      
    } catch (err) {
      console.error(err);
      showToast('Erro ao importar arquivo JSON. Formato inválido.', 'error');
    }
  };
  reader.readAsText(file);
}

function wipeAllDatabaseData() {
  if (confirm('ATENÇÃO EXTREMA: Deseja apagar ABSOLUTAMENTE TODOS os dados salvos localmente? Esta ação é irreversível.')) {
    localStorage.removeItem('crm_clients');
    localStorage.removeItem('crm_todos');
    localStorage.removeItem('crm_scratchpad');
    localStorage.removeItem('crm_scratchpad_time');
    localStorage.removeItem('crm_github_token');
    localStorage.removeItem('crm_supabase_url');
    localStorage.removeItem('crm_supabase_key');
    
    showToast('Banco de dados local limpo. Reiniciando...', 'error');
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  }
}

// ==========================================================================
// 10A. Supabase Cloud Sync Engine & WhatsApp Direct Linker
// ==========================================================================

// Mappings between Frontend CamelCase State and PostgreSQL SnakeCase Tables
function mapClientToDb(c) {
  return {
    id: c.id,
    name: c.name,
    company: c.company || null,
    email: c.email || null,
    phone: c.phone || null,
    project_name: c.projectName,
    project_type: c.projectType,
    project_status: c.projectStatus,
    project_git: c.projectGit || null,
    project_deploy: c.projectDeploy || null,
    project_cost: c.projectCost !== null && c.projectCost !== undefined ? parseFloat(c.projectCost) : null,
    project_hours: c.projectHours !== null && c.projectHours !== undefined ? parseInt(c.projectHours) : null,
    date_first_contact: c.dateFirstContact,
    date_next_contact: c.dateNextContact || null,
    notes: c.notes || null,
    git_cached_data: c.gitCachedData || null
  };
}

function mapClientFromDb(db) {
  return {
    id: db.id,
    name: db.name,
    company: db.company || '',
    email: db.email || '',
    phone: db.phone || '',
    projectName: db.project_name,
    projectType: db.project_type,
    projectStatus: db.project_status,
    projectGit: db.project_git || '',
    projectDeploy: db.project_deploy || '',
    projectCost: db.project_cost !== null && db.project_cost !== undefined ? parseFloat(db.project_cost) : '',
    projectHours: db.project_hours !== null && db.project_hours !== undefined ? parseInt(db.project_hours) : '',
    dateFirstContact: db.date_first_contact,
    dateNextContact: db.date_next_contact || '',
    notes: db.notes || '',
    gitCachedData: db.git_cached_data || null
  };
}

const SupabaseSyncEngine = {
  url: '',
  key: '',
  active: false,

  init() {
    this.url = localStorage.getItem('crm_supabase_url') || '';
    this.key = localStorage.getItem('crm_supabase_key') || '';
    
    if (this.url && this.key) {
      this.active = true;
      this.updateHeaderBadge(true);
      // Populate inputs in settings
      if ($('supabaseUrlInput')) $('supabaseUrlInput').value = this.url;
      if ($('supabaseKeyInput')) $('supabaseKeyInput').value = this.key;
      if ($('btnDisconnectSupabase')) $('btnDisconnectSupabase').style.display = 'block';
    } else {
      this.active = false;
      this.updateHeaderBadge(false);
    }
  },

  updateHeaderBadge(isActive) {
    const badge = $('cloudStatusBadge');
    if (badge) {
      if (isActive) {
        badge.className = 'cloud-status-badge nuvem';
        badge.querySelector('.status-text').innerText = 'Nuvem';
      } else {
        badge.className = 'cloud-status-badge local';
        badge.querySelector('.status-text').innerText = 'Local';
      }
    }
  },

  getHeaders() {
    return {
      'apikey': this.key,
      'Authorization': `Bearer ${this.key}`,
      'Content-Type': 'application/json'
    };
  },

  async testConnection(url, key) {
    try {
      const response = await fetch(`${url}/rest/v1/clients?limit=1`, {
        method: 'GET',
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${key}`
        }
      });
      return response.ok;
    } catch (e) {
      console.error('Erro de conexão Supabase:', e);
      return false;
    }
  },

  async pullAll() {
    if (!this.active) return;
    try {
      // 1. Pull Clients
      const resClients = await fetch(`${this.url}/rest/v1/clients`, {
        method: 'GET',
        headers: this.getHeaders()
      });
      if (resClients.ok) {
        const dbClients = await resClients.json();
        if (dbClients) {
          clients = dbClients.map(mapClientFromDb);
          localStorage.setItem('crm_clients', JSON.stringify(clients));
        }
      }

      // 2. Pull Todos
      const resTodos = await fetch(`${this.url}/rest/v1/todos`, {
        method: 'GET',
        headers: this.getHeaders()
      });
      if (resTodos.ok) {
        const dbTodos = await resTodos.json();
        if (dbTodos) {
          todos = dbTodos;
          localStorage.setItem('crm_todos', JSON.stringify(todos));
        }
      }

      // 3. Pull Scratchpad
      const resNotes = await fetch(`${this.url}/rest/v1/scratchpad?id=eq.single_notes`, {
        method: 'GET',
        headers: this.getHeaders()
      });
      if (resNotes.ok) {
        const dbNotes = await resNotes.json();
        if (dbNotes && dbNotes.length > 0) {
          const notesText = dbNotes[0].content || '';
          localStorage.setItem('crm_scratchpad', notesText);
          if ($('notesScratchpad')) {
            $('notesScratchpad').value = notesText;
          }
        }
      }

      // Trigger re-renders
      renderDashboard();
      renderClientsList();
      renderTimeline();
      renderTodoList();

      showToast('Dados sincronizados com a nuvem Supabase! ☁️', 'success');
    } catch (e) {
      console.error('Erro ao puxar dados da nuvem:', e);
      showToast('Conectado à nuvem, mas falhou ao sincronizar. Verifique se executou o script SQL no Supabase.', 'warning');
    }
  },

  async pushRecord(table, record) {
    if (!this.active) return;
    try {
      const response = await fetch(`${this.url}/rest/v1/${table}`, {
        method: 'POST',
        headers: {
          ...this.getHeaders(),
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify(record)
      });
      if (!response.ok) {
        const errText = await response.text();
        console.error(`Erro ao empurrar registro para tabela ${table}:`, errText);
      }
    } catch (e) {
      console.error(`Erro de rede ao salvar registro na tabela ${table}:`, e);
    }
  },

  async deleteRecord(table, id) {
    if (!this.active) return;
    try {
      const response = await fetch(`${this.url}/rest/v1/${table}?id=eq.${id}`, {
        method: 'DELETE',
        headers: this.getHeaders()
      });
      if (!response.ok) {
        const errText = await response.text();
        console.error(`Erro ao remover registro da tabela ${table}:`, errText);
      }
    } catch (e) {
      console.error(`Erro de rede ao remover registro da tabela ${table}:`, e);
    }
  }
};

async function connectSupabaseCloud() {
  const url = $('supabaseUrlInput').value.trim();
  const key = $('supabaseKeyInput').value.trim();

  if (!url || !key) {
    showToast('Por favor, preencha a URL e a Chave Anon Key do Supabase.', 'warning');
    return;
  }

  showToast('Testando conexão com o Supabase...', 'info');

  const isConnected = await SupabaseSyncEngine.testConnection(url, key);
  if (isConnected) {
    localStorage.setItem('crm_supabase_url', url);
    localStorage.setItem('crm_supabase_key', key);
    
    SupabaseSyncEngine.url = url;
    SupabaseSyncEngine.key = key;
    SupabaseSyncEngine.active = true;
    SupabaseSyncEngine.updateHeaderBadge(true);

    $('btnDisconnectSupabase').style.display = 'block';

    showToast('Conectado ao Supabase! Enviando backup local...', 'success');

    // Perform initial sync (Push local data to Supabase first so the cloud has our current projects, then Pull)
    await pushAllLocalDataToCloud();
    
    // Now pull to align
    await SupabaseSyncEngine.pullAll();
  } else {
    showToast('Erro ao conectar. Verifique a URL, a chave Anon ou sua conexão de internet.', 'error');
  }
}

async function pushAllLocalDataToCloud() {
  if (!SupabaseSyncEngine.active) return;
  
  // Push clients
  for (const c of clients) {
    await SupabaseSyncEngine.pushRecord('clients', mapClientToDb(c));
  }
  
  // Push todos
  for (const t of todos) {
    await SupabaseSyncEngine.pushRecord('todos', t);
  }
  
  // Push scratchpad
  const notesText = localStorage.getItem('crm_scratchpad') || "";
  await SupabaseSyncEngine.pushRecord('scratchpad', { id: 'single_notes', content: notesText });
}

function disconnectSupabaseCloud() {
  if (confirm('Deseja realmente desconectar a sincronização em nuvem? Seus dados locais serão mantidos, mas novas alterações não serão salvas na nuvem.')) {
    localStorage.removeItem('crm_supabase_url');
    localStorage.removeItem('crm_supabase_key');
    
    SupabaseSyncEngine.url = '';
    SupabaseSyncEngine.key = '';
    SupabaseSyncEngine.active = false;
    SupabaseSyncEngine.updateHeaderBadge(false);

    $('supabaseUrlInput').value = '';
    $('supabaseKeyInput').value = '';
    $('btnDisconnectSupabase').style.display = 'none';

    showToast('Sincronização em nuvem desativada. Operando em Modo Local.', 'warning');
  }
}

function goToSettingsTab() {
  const settingsTab = document.querySelector('a[onclick*="viewConfiguracoes"]');
  if (settingsTab) {
    switchActiveTab('viewConfiguracoes', settingsTab);
  }
}

function contactClientWhatsApp(clientId) {
  const client = clients.find(c => c.id === clientId);
  if (!client) {
    showToast('Cliente não encontrado.', 'error');
    return;
  }

  if (!client.phone) {
    showToast('Este cliente não possui telefone/WhatsApp cadastrado.', 'warning');
    return;
  }

  // Sanitize phone number (keep only numbers)
  let cleanPhone = client.phone.replace(/\D/g, '');

  // Prepend Brazil country code '55' if DDD cellphone starts without it
  if (cleanPhone.length === 11 && cleanPhone.startsWith('9')) {
    cleanPhone = '55' + cleanPhone;
  } else if (cleanPhone.length === 11 && !cleanPhone.startsWith('55')) {
    cleanPhone = '55' + cleanPhone;
  } else if (cleanPhone.length === 10) {
    cleanPhone = '55' + cleanPhone;
  } else if (cleanPhone.length === 9) {
    cleanPhone = '5511' + cleanPhone;
  }

  // Message template
  const textMsg = `Olá ${client.name}, aqui é o Caio. Gostaria de falar sobre o andamento do projeto ${client.projectName}!`;
  const encodedMsg = encodeURIComponent(textMsg);

  // Open WhatsApp Link (web/app format)
  const waUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMsg}`;
  
  window.open(waUrl, '_blank');
}

// ==========================================================================
// 11. Initial Mock Database
// ==========================================================================
function getMockData() {
  const firstContactDate = new Date();
  firstContactDate.setDate(firstContactDate.getDate() - 10);
  
  const nextContactDate = new Date();
  nextContactDate.setMinutes(nextContactDate.getMinutes() + 10); // 10 minutes in the future for testing countdowns!

  return [
    {
      id: "1",
      name: "Arthur Pendragon",
      company: "Camelot Technologies",
      email: "arthur@camelot.tech",
      phone: "+55 (11) 98888-7777",
      projectName: "Sistema de Távola Redonda",
      projectType: "Sistema",
      projectStatus: "Estrutura sendo feita",
      projectGit: "facebook/react", // Valid public repo for instant Github sync tests
      projectDeploy: "https://react.dev",
      projectCost: 8500.00,
      projectHours: 120,
      dateFirstContact: firstContactDate.toISOString(),
      dateNextContact: nextContactDate.toISOString(),
      notes: "O cliente deseja uma mesa redonda virtual de discussão corporativa sincronizada em tempo real via websockets.",
      gitCachedData: null
    },
    {
      id: "2",
      name: "Guilherme de Orange",
      company: "Nassau Sites",
      email: "guilherme@nassau.co",
      phone: "+31 6 12345678",
      projectName: "Landing Page Coroa Holandesa",
      projectType: "Site",
      projectStatus: "Deploy",
      projectGit: "",
      projectDeploy: "https://wikipedia.org",
      projectCost: 2800.00,
      projectHours: 24,
      dateFirstContact: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
      dateNextContact: null,
      notes: "Landing page corporativa extremamente polida contendo micro-animações em canvas e paleta de cores laranja/indigo premium.",
      gitCachedData: null
    },
    {
      id: "3",
      name: "Luiza de Bragança",
      company: "Império Apps",
      email: "luiza@imperio.com.br",
      phone: "(21) 97777-6666",
      projectName: "App Real Grandeza",
      projectType: "App",
      projectStatus: "Idealizando",
      projectGit: "",
      projectDeploy: "",
      projectCost: 15000.00,
      projectHours: 200,
      dateFirstContact: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
      dateNextContact: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000 + 3 * 3600 * 1000).toISOString(), // 5 days, 3 hours from now
      notes: "App mobile para investidores corporativos de alto nível acompanharem métricas macroeconômicas.",
      gitCachedData: null
    }
  ];
}

function getMockTodos() {
  return [
    { id: "t1", text: "Sincronizar repositório Git no detalhe de Arthur Pendragon", completed: false },
    { id: "t2", text: "Finalizar escopo do projeto Real Grandeza de Luiza", completed: false },
    { id: "t3", text: "Fazer deploy do site Nassau no ar", completed: true }
  ];
}
