/* ==========================================================================
   CRM DevHub - Application Logic & State Management
   Author: Antigravity (Google DeepMind Advanced Agentic Coding Team)
   ========================================================================== */

// --- Global Application State ---
let clients = [];
let todos = [];
let githubToken = "";
let alertedMeetings = new Set(); // Tracks meetings that already fired desktop notifications

// Multi-User state variables
let activeUser = null;
let verificationCode = "";
let verificationType = ""; // 'register' or 'recover'
let verificationTargetUser = null; // Temp user storage
let selectedLogoBase64 = ""; // Loaded company logo from file selector
let selectedCompanyId = null;
let companies = [];
let presenceTimer = null;
let adminCompanyLogoBase64 = "";
let newCompanyLogoBase64 = "";

// Helper: Get element by ID
const $ = (id) => document.getElementById(id);

// Helper: Sanitize Supabase URL to strip trailing slash or /rest/v1 if included
function sanitizeSupabaseUrl(url) {
  if (!url) return '';
  let clean = url.trim();
  clean = clean.replace(/\/+$/, '');
  clean = clean.replace(/\/rest\/v1$/, '');
  return clean;
}

// Scoping Helper: scopes localstorage keys by company or user email
function getUserKey(key) {
  if (activeUser && activeUser.email) {
    // Shared company-wide resources
    if (['crm_clients', 'crm_todos', 'crm_scratchpad', 'crm_scratchpad_time', 'crm_github_token'].includes(key)) {
      const compId = activeUser.companyId || 'local';
      return `${key}_company_${compId}`;
    }
    // Scoped individual user preferences (wallpapers, theme color, local states)
    return `${key}_user_${activeUser.email}`;
  }
  return key;
}

// Scoping Helper: gets company/user initials
function getInitials(text) {
  if (!text) return 'MC';
  const parts = text.trim().split(/\s+/);
  if (parts.length > 1) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return text.substring(0, 2).toUpperCase();
}

// ==========================================================================
// 1. Initializer & Auth
// ==========================================================================
window.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  // Check active user session first
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

function loadScopedUserData() {
  if (!activeUser) return;
  
  clients = JSON.parse(localStorage.getItem(getUserKey('crm_clients'))) || [];
  todos = JSON.parse(localStorage.getItem(getUserKey('crm_todos'))) || [];
  githubToken = localStorage.getItem(getUserKey('crm_github_token')) || "";
  
  // Set values in config tab if elements exist
  if ($('githubTokenInput')) {
    $('githubTokenInput').value = githubToken;
  }
  if ($('githubClientIdInput')) {
    $('githubClientIdInput').value = localStorage.getItem('crm_github_client_id') || "Ov23liGGfMoztRrGRKHL";
  }
  
  // Load Notes Scratchpad
  if ($('notesScratchpad')) {
    const savedNotes = localStorage.getItem(getUserKey('crm_scratchpad')) || "";
    $('notesScratchpad').value = savedNotes;
    if (savedNotes) {
      $('scratchpadSaveTime').innerText = `Última alteração: ${localStorage.getItem(getUserKey('crm_scratchpad_time')) || 'carregado'}`;
    } else {
      $('scratchpadSaveTime').innerText = `Última alteração: nunca`;
    }
  }

  // Carrega o wallpaper do usuário ativo
  const savedWallpaper = localStorage.getItem(getUserKey('crm_active_wallpaper')) || 'bg.png';
  document.body.style.background = `linear-gradient(rgba(15, 23, 42, 0.75), rgba(15, 23, 42, 0.85)), url('${savedWallpaper}') no-repeat center center / cover`;

  // Carrega as preferências personalizadas do usuário ativo
  const savedThemeColor = localStorage.getItem(getUserKey('crm_theme_color')) || 'indigo';
  selectThemeColor(savedThemeColor, true);

  const liquidGlassDisabled = localStorage.getItem(getUserKey('crm_liquid_glass_disabled')) === 'true';
  handleLiquidGlassChange(!liquidGlassDisabled, true);

  const stackToasts = localStorage.getItem(getUserKey('crm_stack_toasts')) !== 'false';
  handleStackToastsChange(stackToasts, true);

  // Initialize Supabase Sync Engine
  SupabaseSyncEngine.init();
  if (SupabaseSyncEngine.active) {
    SupabaseSyncEngine.pullAll();
  }
}

function checkAuth() {
  // Inicializa a lista de empresas e o seeding administrativo
  initCompaniesAndUsersSeed();

  const sessionStr = localStorage.getItem('crm_active_user');
  if (sessionStr) {
    activeUser = JSON.parse(sessionStr);
    selectedCompanyId = activeUser.companyId;
    
    // Load scoped data
    loadScopedUserData();

    // Set company details in header
    if ($('headerGreeting')) {
      const nameParts = activeUser.name.split(' ');
      const firstName = nameParts[0] || 'Usuário';
      const now = new Date();
      const hour = now.getHours();
      let greeting = `Olá, ${firstName}`;
      let sub = 'Pronto para codar hoje?';
      if (hour >= 5 && hour < 12) {
        greeting = `Bom dia, ${firstName} ☕`;
      } else if (hour >= 12 && hour < 18) {
        greeting = `Boa tarde, ${firstName} 💻`;
      } else {
        greeting = `Boa noite, ${firstName} 🌙`;
      }
      $('headerGreeting').innerText = greeting;
    }

    if (activeUser.logo) {
      $('headerCompanyLogo').src = activeUser.logo;
      $('headerCompanyLogo').style.display = 'block';
      $('headerAvatar').style.display = 'none';
    } else {
      $('headerAvatar').innerText = getInitials(activeUser.name);
      $('headerAvatar').style.display = 'flex';
      $('headerCompanyLogo').style.display = 'none';
    }

    // Inicia o motor de presença online do time
    initPresenceEngine();

    removeLogoSelect(null);

    $('loginOverlay').style.display = 'none';
    $('appContainer').style.display = 'flex';
    
    // Initial Render
    renderDashboard();
    renderClientsList();
    renderTimeline();
    renderTodoList();
  } else {
    activeUser = null;
    selectedCompanyId = null;

    // Para o motor de presença se deslogado
    if (presenceTimer) clearInterval(presenceTimer);
    if ($('presenceIndicator')) $('presenceIndicator').style.display = 'none';

    // Reseta o wallpaper para o padrão ao deslogar
    document.body.style.background = `linear-gradient(rgba(15, 23, 42, 0.75), rgba(15, 23, 42, 0.85)), url('bg.png') no-repeat center center / cover`;
    
    $('loginOverlay').style.display = 'flex';
    $('appContainer').style.display = 'none';
    
    // Mostra o portal corporativo de seleção
    showCompanyPortal();
    renderCompanyPortal();
  }
}

async function handleLogin() {
  const loginInput = $('loginEmail').value.trim().toLowerCase();
  const passwordInput = $('loginPassword').value;
  const loginCard = $('loginCard');
  const errorMsg = $('loginError');

  if (!selectedCompanyId) {
    showToast('Selecione uma empresa primeiro!', 'warning');
    return;
  }

  // Custom locked auth rules for CRdevs
  if (selectedCompanyId === 'crdevs') {
    if (loginInput !== 'z0oom1' && loginInput !== 'caiodevs@gmail.com') {
      showToast('Acesso Restrito! Apenas a conta oficial da CRdevs é permitida.', 'error');
      errorMsg.innerText = 'Conta bloqueada para novas inscrições!';
      errorMsg.classList.add('visible');
      loginCard.classList.add('shake');
      setTimeout(() => loginCard.classList.remove('shake'), 500);
      return;
    }
    if (passwordInput !== 'c4iovix2') {
      showToast('Senha incorreta para a conta CRdevs!', 'error');
      errorMsg.innerText = 'Senha incorreta para a conta CRdevs!';
      errorMsg.classList.add('visible');
      loginCard.classList.add('shake');
      setTimeout(() => loginCard.classList.remove('shake'), 500);
      return;
    }
  }

  // Search in local database scoping by selected company
  const users = JSON.parse(localStorage.getItem('crm_users')) || [];
  let foundUser = users.find(u => 
    u.companyId === selectedCompanyId && 
    (u.email.toLowerCase() === loginInput || (u.username && u.username.toLowerCase() === loginInput)) && 
    u.password === passwordInput
  );

  // If not found local, check Supabase
  if (!foundUser) {
    showToast('Buscando conta corporativa...', 'info');
    foundUser = await SupabaseSyncEngine.fetchProfile(loginInput, passwordInput);
    if (foundUser) {
      if (!foundUser.companyId) foundUser.companyId = selectedCompanyId;
      users.push(foundUser);
      localStorage.setItem('crm_users', JSON.stringify(users));
    }
  }

  if (foundUser) {
    errorMsg.classList.remove('visible');
    activeUser = foundUser;
    
    // Persist session
    localStorage.setItem('crm_active_user', JSON.stringify(activeUser));
    
    loadScopedUserData();
    showToast(`Bem-vindo de volta à empresa ${companies.find(c => c.id === selectedCompanyId).name}! 🚀`, 'success');
    
    // Smooth transition
    $('loginOverlay').style.opacity = 0;
    setTimeout(() => {
      checkAuth();
      $('loginOverlay').style.opacity = 1;
    }, 400);
  } else {
    // Shake animation
    loginCard.classList.add('shake');
    errorMsg.innerText = "Login ou senha incorretos para esta empresa!";
    errorMsg.classList.add('visible');
    
    setTimeout(() => {
      loginCard.classList.remove('shake');
    }, 500);
  }
}

function handleLogout() {
  localStorage.removeItem('crm_active_user');
  activeUser = null;

  // Reset visual overrides on logout
  const root = document.documentElement;
  root.style.setProperty('--primary', '#6366f1');
  root.style.setProperty('--primary-glow', 'rgba(99, 102, 241, 0.25)');
  document.body.classList.remove('liquid-glass-disabled');

  showToast('Sessão encerrada com sucesso.', 'info');
  checkAuth();
}

// --- Dynamic View Routing Functions for Auth Screens ---
function showLoginView() {
  $('loginView').style.display = 'block';
  $('registerView').style.display = 'none';
  $('forgotPasswordView').style.display = 'none';
  $('verificationView').style.display = 'none';
  $('resetPasswordView').style.display = 'none';
  $('loginError').classList.remove('visible');
}

function showRegisterView() {
  $('loginView').style.display = 'none';
  $('registerView').style.display = 'block';
  $('forgotPasswordView').style.display = 'none';
  $('verificationView').style.display = 'none';
  $('resetPasswordView').style.display = 'none';
  $('loginError').classList.remove('visible');
  removeLogoSelect(null);
}

function showForgotPasswordView() {
  $('loginView').style.display = 'none';
  $('registerView').style.display = 'none';
  $('forgotPasswordView').style.display = 'block';
  $('verificationView').style.display = 'none';
  $('resetPasswordView').style.display = 'none';
  $('loginError').classList.remove('visible');
}

function showVerificationView(subtitleText) {
  $('loginView').style.display = 'none';
  $('registerView').style.display = 'none';
  $('forgotPasswordView').style.display = 'none';
  $('verificationView').style.display = 'block';
  $('resetPasswordView').style.display = 'none';
  $('loginError').classList.remove('visible');
  
  if (subtitleText) {
    $('verificationSubtitle').innerText = subtitleText;
  }
  $('verificationCodeInput').value = "";
}

function showResetPasswordView() {
  $('loginView').style.display = 'none';
  $('registerView').style.display = 'none';
  $('forgotPasswordView').style.display = 'none';
  $('verificationView').style.display = 'none';
  $('resetPasswordView').style.display = 'block';
  $('loginError').classList.remove('visible');
}

function cancelVerification() {
  verificationCode = "";
  verificationType = "";
  verificationTargetUser = null;
  showLoginView();
}

// --- Logo Selection Handlers (FileReader & Base64 preview) ---
function handleLogoSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showToast('Por favor, selecione uma imagem válida.', 'error');
    return;
  }

  if (file.size > 2 * 1024 * 1024) {
    showToast('A imagem deve ter no máximo 2MB.', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    selectedLogoBase64 = e.target.result;
    
    // Display preview
    $('logoPreviewImg').src = selectedLogoBase64;
    $('logoPreviewContainer').style.display = 'block';
    $('uploadPlaceholder').style.display = 'none';
    
    showToast('Logotipo carregado com sucesso!', 'success');
  };
  reader.readAsDataURL(file);
}

function removeLogoSelect(event) {
  if (event) event.stopPropagation();
  selectedLogoBase64 = "";
  if ($('regCompanyLogo')) $('regCompanyLogo').value = "";
  if ($('logoPreviewImg')) $('logoPreviewImg').src = "";
  if ($('logoPreviewContainer')) $('logoPreviewContainer').style.display = 'none';
  if ($('uploadPlaceholder')) $('uploadPlaceholder').style.display = 'flex';
}

// --- Auth Actions: Register, Recovery PIN generation & Gmail Inbox Simulator ---
function handleRegister() {
  const username = $('regUsername').value.trim();
  const name = $('regName').value.trim();
  const email = $('regEmail').value.trim().toLowerCase();
  const password = $('regPassword').value;
  const logo = selectedLogoBase64 || "";
  const companyId = selectedCompanyId;

  if (!username || !name || !email || !password || !companyId) {
    showToast('Por favor, preencha todos os campos obrigatórios.', 'warning');
    return;
  }

  if (!email.includes('@') || !email.includes('.')) {
    showToast('Por favor, insira um e-mail válido.', 'warning');
    return;
  }

  // Check unique email and username
  const users = JSON.parse(localStorage.getItem('crm_users')) || [];
  const emailExists = users.some(u => u.email.toLowerCase() === email);
  const usernameExists = users.some(u => u.username && u.username.toLowerCase() === username.toLowerCase());

  if (emailExists) {
    showToast('E-mail já cadastrado! Faça login ou recupere a senha.', 'error');
    return;
  }
  if (usernameExists) {
    showToast('Nome de Usuário (Login) já cadastrado! Escolha outro.', 'error');
    return;
  }

  // Generate OTP PIN
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  verificationCode = code;
  verificationType = "register";
  verificationTargetUser = { username, name, email, password, companyId, logo, role: 'member' };

  showVerificationView(`Insira o código de 6 dígitos enviado para ${email}`);
  showMockEmail(email, name, code, "Confirmação de Cadastro");
  showToast('Código de verificação gerado no simulador de e-mail!', 'success');
}

function handleVerifyCode() {
  const pinInput = $('verificationCodeInput').value.trim();
  if (pinInput.length !== 6 || isNaN(pinInput)) {
    showToast('O código deve conter 6 dígitos numéricos.', 'warning');
    return;
  }

  if (pinInput === verificationCode) {
    if (verificationType === 'register') {
      const users = JSON.parse(localStorage.getItem('crm_users')) || [];
      
      if (users.some(u => u.email.toLowerCase() === verificationTargetUser.email.toLowerCase())) {
        showToast('Esta conta já foi criada.', 'error');
        cancelVerification();
        return;
      }

      users.push(verificationTargetUser);
      localStorage.setItem('crm_users', JSON.stringify(users));
      
      // Salva o cadastro do usuário na nuvem Supabase
      SupabaseSyncEngine.pushProfile(verificationTargetUser);
      
      // Auto log-in session
      localStorage.setItem('crm_active_user', JSON.stringify(verificationTargetUser));
      activeUser = verificationTargetUser;
      selectedLogoBase64 = "";

      showToast('Conta criada e validada com sucesso! Bem-vindo! 🚀', 'success');

      const emailWindow = $('mockGmailNotification');
      if (emailWindow) emailWindow.remove();

      checkAuth();
      
      verificationCode = "";
      verificationType = "";
      verificationTargetUser = null;
    } else if (verificationType === 'recover') {
      showResetPasswordView();
      showToast('Código confirmado. Crie sua nova senha.', 'success');
      
      const emailWindow = $('mockGmailNotification');
      if (emailWindow) emailWindow.remove();
    }
  } else {
    const otpCard = $('loginCard');
    otpCard.classList.add('shake');
    showToast('Código incorreto! Verifique seu simulador de e-mail.', 'error');
    setTimeout(() => {
      otpCard.classList.remove('shake');
    }, 500);
  }
}

function handleForgotPassword() {
  const emailInput = $('forgotEmail').value.trim().toLowerCase();
  if (!emailInput) {
    showToast('Insira seu e-mail cadastrado.', 'warning');
    return;
  }

  const users = JSON.parse(localStorage.getItem('crm_users')) || [];
  const foundUser = users.find(u => u.email.toLowerCase() === emailInput);

  if (!foundUser) {
    showToast('Não encontramos nenhuma conta com esse e-mail.', 'error');
    return;
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  verificationCode = code;
  verificationType = "recover";
  verificationTargetUser = foundUser;

  showVerificationView(`Insira o código de recuperação enviado para ${emailInput}`);
  showMockEmail(emailInput, foundUser.name, code, "Recuperação de Senha");
  showToast('Código de recuperação enviado!', 'success');
}

function handleResetPassword() {
  const newPass = $('newPasswordInput').value;
  if (!newPass || newPass.length < 6) {
    showToast('A senha deve ter pelo menos 6 caracteres.', 'warning');
    return;
  }

  const users = JSON.parse(localStorage.getItem('crm_users')) || [];
  const userIndex = users.findIndex(u => u.email.toLowerCase() === verificationTargetUser.email.toLowerCase());

  if (userIndex !== -1) {
    users[userIndex].password = newPass;
    localStorage.setItem('crm_users', JSON.stringify(users));
    
    // Atualiza a senha na nuvem Supabase
    SupabaseSyncEngine.pushProfile(users[userIndex]);

    showToast('Senha alterada com sucesso! Faça login com a nova senha.', 'success');
    
    verificationCode = "";
    verificationType = "";
    verificationTargetUser = null;
    showLoginView();
  } else {
    showToast('Erro ao atualizar senha. Usuário não encontrado.', 'error');
    cancelVerification();
  }
}

// --- Floating Glassmorphic Simulated Gmail Inbox Notification Window ---
function showMockEmail(email, name, pin, subjectPrefix) {
  const oldEmail = $('mockGmailNotification');
  if (oldEmail) oldEmail.remove();

  const mockEmail = document.createElement('div');
  mockEmail.id = 'mockGmailNotification';
  mockEmail.style.cssText = `
    position: fixed;
    top: 24px;
    right: 24px;
    width: 360px;
    background: rgba(15, 23, 42, 0.95);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(99, 102, 241, 0.35);
    border-radius: 16px;
    padding: 18px;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
    z-index: 10005;
    color: #f8fafc;
    font-family: system-ui, -apple-system, sans-serif;
    animation: emailSlideIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  `;

  if (!document.getElementById('emailAnimStyle')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'emailAnimStyle';
    styleEl.innerHTML = `
      @keyframes emailSlideIn {
        from { opacity: 0; transform: translateX(100px) scale(0.9); }
        to { opacity: 1; transform: translateX(0) scale(1); }
      }
      @keyframes emailSlideOut {
        from { opacity: 1; transform: translateX(0) scale(1); }
        to { opacity: 0; transform: translateX(100px) scale(0.9); }
      }
    `;
    document.head.appendChild(styleEl);
  }

  mockEmail.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 10px; margin-bottom: 12px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <div style="background: #ea4335; width: 24px; height: 24px; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 0.75rem;">M</div>
        <span style="font-size: 0.8rem; font-weight: 600; color: #94a3b8; letter-spacing: 0.05em; text-transform: uppercase;">Caixa de Entrada (Simulador)</span>
      </div>
      <button id="closeEmailBtn" style="background: none; border: none; color: #94a3b8; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 2px; border-radius: 50%; transition: background 0.2s;">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" style="width: 16px; height: 16px;"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </div>
    
    <div style="font-size: 0.8rem; color: #94a3b8; margin-bottom: 6px;">
      <strong>De:</strong> security@meusclientes.com.br
    </div>
    <div style="font-size: 0.8rem; color: #94a3b8; margin-bottom: 6px;">
      <strong>Para:</strong> ${email}
    </div>
    <div style="font-size: 0.85rem; color: #f8fafc; font-weight: 600; margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 6px;">
      <strong>Assunto:</strong> ${subjectPrefix} - Código: ${pin}
    </div>
    
    <div style="font-size: 0.85rem; line-height: 1.4; color: #cbd5e1; margin-bottom: 16px;">
      Olá <strong>${name}</strong>,<br><br>
      Recebemos sua solicitação no sistema <strong>Meus Clientes</strong>. Use o código de 6 dígitos abaixo para concluir sua ação:<br>
      <div style="text-align: center; margin: 14px 0; background: rgba(99, 102, 241, 0.15); border: 1px dashed rgba(99, 102, 241, 0.4); padding: 12px; border-radius: 8px; font-size: 1.6rem; font-weight: bold; letter-spacing: 0.15em; color: var(--info);">
        ${pin}
      </div>
      Este código expira em 10 minutos. Se você não solicitou este código, desconsidere este e-mail.
    </div>
    
    <button id="btnAutoFillPin" style="width: 100%; background: var(--primary); color: white; border: none; padding: 10px; border-radius: 8px; font-size: 0.85rem; font-weight: 600; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35);">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width: 16px; height: 16px;"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0A2.25 2.25 0 0113.5 3.75H12c-.076 0-.15.005-.224.014m-.496 0A2.25 2.25 0 0010.5 3.75h-.334m7.332 0c.006.066.01.134.01.202a3 3 0 01-3 3M10.5 3.75a3 3 0 00-3 3v8.25m9-8.25v1.25m-9 7h10.5M7.5 15.75H18" /></svg>
      Copiar & Autopreencher PIN
    </button>
  `;

  document.body.appendChild(mockEmail);

  mockEmail.querySelector('#closeEmailBtn').onclick = () => {
    mockEmail.style.animation = 'emailSlideOut 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards';
    setTimeout(() => mockEmail.remove(), 400);
  };

  const btn = mockEmail.querySelector('#btnAutoFillPin');
  if (btn) {
    btn.onclick = () => {
      const pinInput = $('verificationCodeInput');
      if (pinInput) {
        pinInput.value = pin;
        pinInput.focus();
        showToast('Código inserido com sucesso!', 'success');
      }
      mockEmail.style.animation = 'emailSlideOut 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards';
      setTimeout(() => mockEmail.remove(), 400);
    };
  }
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
  } else if (viewId === 'viewConfiguracoes') {
    renderWallpaperGrid();
    populateProfileSettings();
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
  
  // Dynamic Greeting based on current local hour and activeUser
  const headerGreeting = $('headerGreeting');
  const headerSubGreeting = $('headerSubGreeting');
  if (headerGreeting && activeUser) {
    const hour = now.getHours();
    const nameParts = activeUser.name.split(' ');
    const firstName = nameParts[0] || 'Usuário';
    
    let greeting = `Olá, ${firstName}`;
    let sub = 'Pronto para codar hoje?';
    
    if (hour >= 5 && hour < 12) {
      greeting = `Bom dia, ${firstName} ☕`;
      sub = 'Comece o dia organizando suas metas!';
    } else if (hour >= 12 && hour < 18) {
      greeting = `Boa tarde, ${firstName} 💻`;
      sub = 'Foco total no desenvolvimento!';
    } else {
      greeting = `Boa noite, ${firstName} 🌙`;
      sub = 'Projetando códigos estelares!';
    }
    
    headerGreeting.innerText = greeting;
    headerSubGreeting.innerText = sub;
  }
}

function showToast(message, type = 'info') {
  const container = $('toastContainer');
  if (!container) return;

  // Check toast stack preference
  const stackToasts = localStorage.getItem(getUserKey('crm_stack_toasts')) !== 'false';
  if (!stackToasts) {
    container.innerHTML = '';
  }

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
  if (!activeUser) return;
  
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
 
    // Deploy Link Button (compact icon-only)
    let deployBtnHtml = '';
    if (client.projectDeploy) {
      deployBtnHtml = `
        <a href="${client.projectDeploy}" target="_blank" class="btn-secondary icon-only" title="Acessar Deploy" style="color: var(--success); width: 34px; height: 34px; min-height: 34px; padding: 0; display: flex; align-items: center; justify-content: center;">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" style="width: 16px; height: 16px;">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
        </a>
      `;
    }
 
    // WhatsApp Button (compact icon-only)
    let waBtnHtml = '';
    if (client.phone) {
      waBtnHtml = `
        <button class="btn-whatsapp-icon" onclick="contactClientWhatsApp('${client.id}')" title="Falar no WhatsApp" style="width: 34px; height: 34px; min-height: 34px; padding: 0;">
          <svg viewBox="0 0 24 24" fill="currentColor" style="width: 16px; height: 16px;">
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
        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
          <span class="status-badge ${badgeStatusColor}">${client.projectStatus}</span>
          <div style="display: flex; gap: 6px;">
            ${deployBtnHtml}
            ${waBtnHtml}
          </div>
        </div>
      </div>
 
      <div class="project-details-block" style="margin-bottom: 0;">
        <div class="project-name-line">
          <span class="project-label">${client.projectName}</span>
          <span class="category-tag">${client.projectType}</span>
        </div>
        
        <div class="project-finance-line" style="margin-bottom: 12px;">
          <div class="finance-item">Valor: <span>${costText}</span></div>
          <div class="finance-item">Horas: <span>${hoursText}</span></div>
        </div>
      </div>
 
      ${gitBadgeHtml}
    `;

    // Evento de clique esquerdo (Abre detalhes completo)
    card.addEventListener('click', (e) => {
      // Evita disparar se clicou nas ações de deploy ou WhatsApp
      if (e.target.closest('a') || e.target.closest('button') || e.target.closest('.btn-whatsapp-icon')) {
        return;
      }
      viewClientDetails(client.id);
    });

    // Evento de clique direito (Context Menu)
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(client.id, e.clientX, e.clientY);
    });

    // Toque longo para dispositivos móveis (Long Press de 500ms)
    let touchTimer;
    card.addEventListener('touchstart', (e) => {
      if (e.target.closest('a') || e.target.closest('button') || e.target.closest('.btn-whatsapp-icon')) {
        return;
      }
      touchTimer = setTimeout(() => {
        if (navigator.vibrate) {
          navigator.vibrate(40);
        }
        const touch = e.touches[0];
        showContextMenu(client.id, touch.clientX, touch.clientY);
      }, 500);
    }, { passive: true });

    card.addEventListener('touchend', () => {
      clearTimeout(touchTimer);
    });

    card.addEventListener('touchmove', () => {
      clearTimeout(touchTimer);
    });
 
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
  
  // Oculta a data de próximo contato na criação
  if ($('formContactNextGroup')) {
    $('formContactNextGroup').style.display = 'none';
  }
  
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
  
  // Exibe a data de próximo contato na edição
  if ($('formContactNextGroup')) {
    $('formContactNextGroup').style.display = 'block';
  }
  
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
  localStorage.setItem(getUserKey('crm_clients'), JSON.stringify(clients));

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

  // Atualiza a barra de progresso e stepper de status nos detalhes
  updateDetailStepper(client.projectStatus);

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
    localStorage.setItem(getUserKey('crm_clients'), JSON.stringify(clients));
    
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
    localStorage.setItem(getUserKey('crm_clients'), JSON.stringify(clients));

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
  localStorage.setItem(getUserKey('crm_todos'), JSON.stringify(todos));
  
  // Cloud Sync PUSH hook
  SupabaseSyncEngine.pushRecord('todos', mapTodoToDb(newTodo));

  input.value = '';

  renderTodoList();
  showToast('Lembrete adicionado!', 'success');
}

function toggleTodoItem(id) {
  const index = todos.findIndex(t => t.id === id);
  if (index !== -1) {
    todos[index].completed = !todos[index].completed;
    localStorage.setItem(getUserKey('crm_todos'), JSON.stringify(todos));
    
    // Cloud Sync PUSH hook
    SupabaseSyncEngine.pushRecord('todos', mapTodoToDb(todos[index]));

    renderTodoList();
  }
}

function deleteTodoItem(id) {
  // Cloud Sync DELETE hook
  SupabaseSyncEngine.deleteRecord('todos', id);

  todos = todos.filter(t => t.id !== id);
  localStorage.setItem(getUserKey('crm_todos'), JSON.stringify(todos));
  renderTodoList();
}

// Scratchpad Autosave
let scratchpadSyncTimeout = null;

function saveScratchpad() {
  const text = $('notesScratchpad').value;
  const now = new Date();
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  
  localStorage.setItem(getUserKey('crm_scratchpad'), text);
  localStorage.setItem(getUserKey('crm_scratchpad_time'), timeStr);
  
  $('scratchpadSaveTime').innerText = `Última alteração: salvo às ${timeStr}`;

  // Cloud Sync PUSH hook with 1s debounce
  if (scratchpadSyncTimeout) clearTimeout(scratchpadSyncTimeout);
  scratchpadSyncTimeout = setTimeout(() => {
    SupabaseSyncEngine.pushRecord('scratchpad', { id: `single_notes_${activeUser.email}`, user_email: activeUser.email, content: text });
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
        localStorage.setItem(getUserKey('crm_clients'), JSON.stringify(clients));
      }
      if (imported.todos && Array.isArray(imported.todos)) {
        todos = imported.todos;
        localStorage.setItem(getUserKey('crm_todos'), JSON.stringify(todos));
      }
      if (imported.scratchpad) {
        localStorage.setItem(getUserKey('crm_scratchpad'), imported.scratchpad);
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
  if (confirm('ATENÇÃO: Deseja apagar todos os dados da sua conta localmente? Esta ação é irreversível.')) {
    if (activeUser) {
      localStorage.removeItem(getUserKey('crm_clients'));
      localStorage.removeItem(getUserKey('crm_todos'));
      localStorage.removeItem(getUserKey('crm_scratchpad'));
      localStorage.removeItem(getUserKey('crm_scratchpad_time'));
      localStorage.removeItem(getUserKey('crm_github_token'));
      localStorage.removeItem(getUserKey('crm_supabase_url'));
      localStorage.removeItem(getUserKey('crm_supabase_key'));
      
      // Remove active session
      localStorage.removeItem('crm_active_user');
    }
    
    showToast('Dados da conta limpos com sucesso.', 'error');
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
    user_email: activeUser ? activeUser.email : 'local',
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

function mapTodoToDb(t) {
  return {
    id: t.id,
    user_email: activeUser ? activeUser.email : 'local',
    text: t.text,
    completed: t.completed
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

  async fetchProfile(email, password) {
    if (!this.active) {
      this.init();
    }
    if (!this.active) return null;
    try {
      const response = await fetch(`${this.url}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&password=eq.${encodeURIComponent(password)}`, {
        method: 'GET',
        headers: this.getHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          return {
            name: data[0].name,
            email: data[0].email,
            password: data[0].password,
            company: data[0].company,
            logo: data[0].logo || ""
          };
        }
      }
    } catch (e) {
      console.error('Erro ao buscar perfil no Supabase:', e);
    }
    return null;
  },

  async pushProfile(user) {
    if (!this.active) {
      this.init();
    }
    if (!this.active) return;
    try {
      const record = {
        email: user.email,
        name: user.name,
        password: user.password,
        company: user.company,
        logo: user.logo || ""
      };
      const response = await fetch(`${this.url}/rest/v1/profiles`, {
        method: 'POST',
        headers: {
          ...this.getHeaders(),
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify(record)
      });
      if (!response.ok) {
        const errText = await response.text();
        console.error('Erro ao salvar perfil no Supabase:', errText);
      }
    } catch (e) {
      console.error('Erro de rede ao salvar perfil no Supabase:', e);
    }
  },

  init() {
    const isDisabled = localStorage.getItem(getUserKey('crm_supabase_disabled')) === 'true';
    
    this.url = sanitizeSupabaseUrl(localStorage.getItem(getUserKey('crm_supabase_url')) || (isDisabled ? '' : 'https://lsmxobsoxkiqxdgjvcsd.supabase.co'));
    this.key = localStorage.getItem(getUserKey('crm_supabase_key')) || (isDisabled ? '' : 'sb_publishable_TpHRzg0Nz0CerdrpgBHVgA_p3hFTljK');
    
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
      if ($('supabaseUrlInput')) $('supabaseUrlInput').value = '';
      if ($('supabaseKeyInput')) $('supabaseKeyInput').value = '';
      if ($('btnDisconnectSupabase')) $('btnDisconnectSupabase').style.display = 'none';
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
    if (!this.active || !activeUser) return;
    try {
      // 1. Pull Clients scoped by user_email
      const resClients = await fetch(`${this.url}/rest/v1/clients?user_email=eq.${activeUser.email}`, {
        method: 'GET',
        headers: this.getHeaders()
      });
      if (resClients.ok) {
        const dbClients = await resClients.json();
        if (dbClients) {
          const cloudClients = dbClients.map(mapClientFromDb);
          
          // Bidirectional safe merge
          const mergedClientsMap = new Map();
          cloudClients.forEach(c => mergedClientsMap.set(c.id, c));
          
          let hasLocalOnlyClients = false;
          clients.forEach(localClient => {
            if (!mergedClientsMap.has(localClient.id)) {
              // Client only exists locally (not in cloud). Keep it and push it.
              mergedClientsMap.set(localClient.id, localClient);
              this.pushRecord('clients', mapClientToDb(localClient));
              hasLocalOnlyClients = true;
            }
          });
          
          clients = Array.from(mergedClientsMap.values());
          localStorage.setItem(getUserKey('crm_clients'), JSON.stringify(clients));
          
          if (hasLocalOnlyClients) {
            console.log('Sincronizados clientes locais adicionais para a nuvem.');
          }
        }
      }

      // 2. Pull Todos scoped by user_email
      const resTodos = await fetch(`${this.url}/rest/v1/todos?user_email=eq.${activeUser.email}`, {
        method: 'GET',
        headers: this.getHeaders()
      });
      if (resTodos.ok) {
        const dbTodos = await resTodos.json();
        if (dbTodos) {
          const cloudTodos = dbTodos.map(t => ({
            id: t.id,
            text: t.text,
            completed: t.completed
          }));
          
          // Bidirectional safe merge
          const mergedTodosMap = new Map();
          cloudTodos.forEach(t => mergedTodosMap.set(t.id, t));
          
          let hasLocalOnlyTodos = false;
          todos.forEach(localTodo => {
            if (!mergedTodosMap.has(localTodo.id)) {
              // Todo only exists locally. Keep it and push it.
              mergedTodosMap.set(localTodo.id, localTodo);
              this.pushRecord('todos', mapTodoToDb(localTodo));
              hasLocalOnlyTodos = true;
            }
          });
          
          todos = Array.from(mergedTodosMap.values());
          localStorage.setItem(getUserKey('crm_todos'), JSON.stringify(todos));
          
          if (hasLocalOnlyTodos) {
            console.log('Sincronizados lembretes locais adicionais para a nuvem.');
          }
        }
      }

      // 3. Pull Scratchpad scoped by id
      const resNotes = await fetch(`${this.url}/rest/v1/scratchpad?id=eq.single_notes_${activeUser.email}`, {
        method: 'GET',
        headers: this.getHeaders()
      });
      if (resNotes.ok) {
        const dbNotes = await resNotes.json();
        const localNotes = localStorage.getItem(getUserKey('crm_scratchpad')) || "";
        
        if (dbNotes && dbNotes.length > 0) {
          const notesText = dbNotes[0].content || '';
          
          // Merge logic for notepad
          if (notesText.trim()) {
            // Cloud has notes, update local
            localStorage.setItem(getUserKey('crm_scratchpad'), notesText);
            if ($('notesScratchpad')) {
              $('notesScratchpad').value = notesText;
            }
          } else if (localNotes.trim() && !notesText.trim()) {
            // Local has notes but cloud is empty. Push local notes to cloud.
            this.pushRecord('scratchpad', { id: `single_notes_${activeUser.email}`, user_email: activeUser.email, content: localNotes });
          }
        } else {
          // Cloud has no record for this user's scratchpad. Push local notes if they exist.
          if (localNotes.trim()) {
            this.pushRecord('scratchpad', { id: `single_notes_${activeUser.email}`, user_email: activeUser.email, content: localNotes });
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
  const url = sanitizeSupabaseUrl($('supabaseUrlInput').value);
  const key = $('supabaseKeyInput').value.trim();

  if (!url || !key) {
    showToast('Por favor, preencha a URL e a Chave Anon Key do Supabase.', 'warning');
    return;
  }

  showToast('Testando conexão com o Supabase...', 'info');

  const isConnected = await SupabaseSyncEngine.testConnection(url, key);
  if (isConnected) {
    localStorage.removeItem(getUserKey('crm_supabase_disabled'));
    localStorage.setItem(getUserKey('crm_supabase_url'), url);
    localStorage.setItem(getUserKey('crm_supabase_key'), key);
    
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
  if (!SupabaseSyncEngine.active || !activeUser) return;
  
  // Envia o perfil do usuário ativo para a nuvem
  await SupabaseSyncEngine.pushProfile(activeUser);
  
  // Push clients
  for (const c of clients) {
    await SupabaseSyncEngine.pushRecord('clients', mapClientToDb(c));
  }
  
  // Push todos
  for (const t of todos) {
    await SupabaseSyncEngine.pushRecord('todos', mapTodoToDb(t));
  }
  
  // Push scratchpad
  const notesText = localStorage.getItem(getUserKey('crm_scratchpad')) || "";
  await SupabaseSyncEngine.pushRecord('scratchpad', { id: `single_notes_${activeUser.email}`, user_email: activeUser.email, content: notesText });
}

function disconnectSupabaseCloud() {
  if (confirm('Deseja realmente desconectar a sincronização em nuvem? Seus dados locais serão mantidos, mas novas alterações não serão salvas na nuvem.')) {
    localStorage.setItem(getUserKey('crm_supabase_disabled'), 'true');
    localStorage.removeItem(getUserKey('crm_supabase_url'));
    localStorage.removeItem(getUserKey('crm_supabase_key'));
    
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
  return [];
}

function getMockTodos() {
  return [];
}

// ==========================================================================
// 12. Redesenho Premium: Menu de Contexto, Gestão de Toques e Stepper Lógica
// ==========================================================================
let activeContextMenuClientId = null;

function showContextMenu(id, clientX, clientY) {
  const client = clients.find(c => c.id === id);
  if (!client) return;
  
  activeContextMenuClientId = id;
  
  // Preenche dados no menu
  $('contextMenuProjectName').innerText = client.projectName;
  $('contextMenuClientName').innerText = client.name;
  
  // Destaca o status ativo
  const activeStatus = client.projectStatus;
  
  const btns = {
    'Idealizando': $('menuStatusIdealizando'),
    'Estrutura sendo feita': $('menuStatusEstrutura'),
    'Fase de testes': $('menuStatusTestes'),
    'Deploy': $('menuStatusDeploy'),
    'Manutenção': $('menuStatusManutencao')
  };
  
  Object.keys(btns).forEach(status => {
    if (btns[status]) {
      btns[status].classList.remove('active');
      if (status === activeStatus) {
        btns[status].classList.add('active');
      }
    }
  });
  
  const menu = $('projectContextMenu');
  const backdrop = $('contextMenuBackdrop');
  
  menu.style.display = 'flex';
  backdrop.style.display = 'block';
  
  const menuWidth = 220;
  const menuHeight = 330;
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  
  let posX = clientX;
  let posY = clientY;
  
  if (clientX + menuWidth > windowWidth) {
    posX = windowWidth - menuWidth - 10;
  }
  if (clientY + menuHeight > windowHeight) {
    posY = windowHeight - menuHeight - 10;
  }
  
  if (windowWidth > 600) {
    menu.style.left = `${posX}px`;
    menu.style.top = `${posY}px`;
  } else {
    menu.style.left = '0';
    menu.style.top = 'auto';
  }
}

function closeContextMenu() {
  $('projectContextMenu').style.display = 'none';
  $('contextMenuBackdrop').style.display = 'none';
  activeContextMenuClientId = null;
}

function triggerContextMenuAction(action) {
  if (!activeContextMenuClientId) return;
  const id = activeContextMenuClientId;
  closeContextMenu();
  
  if (action === 'details') {
    viewClientDetails(id);
  } else if (action === 'edit') {
    openEditClientModal(id);
  } else if (action === 'delete') {
    deleteClientDirect(id);
  }
}

function deleteClientDirect(id) {
  if (!id) return;
  if (confirm('Tem certeza absoluta de que deseja remover este cliente e todos os seus projetos?')) {
    // Cloud Sync DELETE hook
    SupabaseSyncEngine.deleteRecord('clients', id);

    clients = clients.filter(c => c.id !== id);
    localStorage.setItem(getUserKey('crm_clients'), JSON.stringify(clients));
    
    showToast('Cliente removido do sistema.', 'warning');
    renderDashboard();
    renderClientsList();
    renderTimeline();
  }
}

async function changeProjectStatusDirect(newStatus) {
  if (!activeContextMenuClientId) return;
  const id = activeContextMenuClientId;
  const clientIndex = clients.findIndex(c => c.id === id);
  if (clientIndex !== -1) {
    clients[clientIndex].projectStatus = newStatus;
    localStorage.setItem(getUserKey('crm_clients'), JSON.stringify(clients));
    
    // Sync with Supabase
    if (SupabaseSyncEngine.active) {
      SupabaseSyncEngine.pushRecord('clients', mapClientToDb(clients[clientIndex]));
    }
    
    showToast(`Status atualizado para "${newStatus}"!`, 'success');
    closeContextMenu();
    
    renderDashboard();
    renderClientsList();
    renderTimeline();
  }
}

async function changeActiveProjectStatus(newStatus) {
  if (!activeDetailClientId) return;
  const id = activeDetailClientId;
  const clientIndex = clients.findIndex(c => c.id === id);
  if (clientIndex !== -1) {
    clients[clientIndex].projectStatus = newStatus;
    localStorage.setItem(getUserKey('crm_clients'), JSON.stringify(clients));
    
    // Atualiza o distintivo de status
    const badge = $('detailProjectStatus');
    if (badge) {
      badge.innerText = newStatus;
      badge.className = `status-badge ${newStatus.toLowerCase().split(' ')[0]}`;
    }
    
    // Anima o stepper na visualização
    updateDetailStepper(newStatus);
    
    // Sync com Supabase
    if (SupabaseSyncEngine.active) {
      SupabaseSyncEngine.pushRecord('clients', mapClientToDb(clients[clientIndex]));
    }
    
    showToast(`Status atualizado para "${newStatus}"!`, 'success');
    
    renderDashboard();
    renderClientsList();
    renderTimeline();
  }
}

function updateDetailStepper(status) {
  const steps = document.querySelectorAll('#modalClientDetails .stepper-step');
  const fill = $('detailStepperProgress');
  if (!fill) return;
  
  const statuses = [
    'Idealizando',
    'Estrutura sendo feita',
    'Fase de testes',
    'Deploy',
    'Manutenção'
  ];
  
  const currentIndex = statuses.indexOf(status);
  const progressWidths = [0, 25, 50, 75, 100];
  const width = currentIndex !== -1 ? progressWidths[currentIndex] : 0;
  fill.style.width = `${width}%`;
  
  steps.forEach((step, idx) => {
    step.classList.remove('active', 'completed', 'pulse');
    if (idx < currentIndex) {
      step.classList.add('completed');
    } else if (idx === currentIndex) {
      step.classList.add('active');
      step.classList.add('pulse');
    }
  });
}

// --- Seletor de Wallpapers SO Estilo Paisagem ---
const wallpapers = [
  { id: 'desk', name: 'Dev Setup', url: 'bg.png' },
  { id: 'misty', name: 'Montanhas', url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80' },
  { id: 'galaxy', name: 'Espaço', url: 'https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?auto=format&fit=crop&w=1200&q=80' },
  { id: 'desert', name: 'Deserto', url: 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?auto=format&fit=crop&w=1200&q=80' },
  { id: 'aurora', name: 'Aurora Boreal', url: 'https://images.unsplash.com/photo-1529963183134-61a90db47eaf?auto=format&fit=crop&w=1200&q=80' },
  { id: 'neon', name: 'Cyberpunk', url: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?auto=format&fit=crop&w=1200&q=80' },
  { id: 'autumn', name: 'Outono', url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1200&q=80' },
  { id: 'ocean', name: 'Oceano', url: 'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?auto=format&fit=crop&w=1200&q=80' }
];

function renderWallpaperGrid() {
  const grid = $('wallpaperGrid');
  if (!grid) return;
  
  const savedWallpaper = localStorage.getItem(getUserKey('crm_active_wallpaper')) || 'bg.png';
  
  grid.innerHTML = '';
  
  wallpapers.forEach(w => {
    const isActive = savedWallpaper === w.url;
    const item = document.createElement('div');
    item.className = `wallpaper-item ${isActive ? 'active' : ''}`;
    item.setAttribute('onclick', `selectWallpaper('${w.url}')`);
    item.setAttribute('title', w.name);
    
    item.innerHTML = `
      <img src="${w.url}" alt="${w.name}">
      <div class="wallpaper-check">✓</div>
    `;
    
    grid.appendChild(item);
  });
}

function selectWallpaper(url) {
  document.body.style.background = `linear-gradient(rgba(15, 23, 42, 0.75), rgba(15, 23, 42, 0.85)), url('${url}') no-repeat center center / cover`;
  localStorage.setItem(getUserKey('crm_active_wallpaper'), url);
  renderWallpaperGrid();
  showToast('Plano de fundo atualizado!', 'success');
}

// ==========================================================================
// 17. Gerenciamento de Perfil e Preferências Estilo Apple HIG
// ==========================================================================
let selectedProfileLogoBase64 = "";

function handleProfileLogoSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showToast('Por favor, selecione uma imagem válida.', 'error');
    return;
  }

  if (file.size > 2 * 1024 * 1024) {
    showToast('A imagem deve ter no máximo 2MB.', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    selectedProfileLogoBase64 = e.target.result;
    
    // Display preview
    if ($('profileLogoPreviewImg')) $('profileLogoPreviewImg').src = selectedProfileLogoBase64;
    if ($('profileLogoPreviewContainer')) $('profileLogoPreviewContainer').style.display = 'block';
    if ($('profileUploadPlaceholder')) $('profileUploadPlaceholder').style.display = 'none';
    
    showToast('Logotipo do perfil carregado!', 'success');
  };
  reader.readAsDataURL(file);
}

function removeProfileLogoSelect(event) {
  if (event) event.stopPropagation();
  selectedProfileLogoBase64 = "";
  if ($('profileCompanyLogoInput')) $('profileCompanyLogoInput').value = "";
  if ($('profileLogoPreviewImg')) $('profileLogoPreviewImg').src = "";
  if ($('profileLogoPreviewContainer')) $('profileLogoPreviewContainer').style.display = 'none';
  if ($('profileUploadPlaceholder')) $('profileUploadPlaceholder').style.display = 'flex';
}

function selectThemeColor(colorName, skipToast = false) {
  const themeColors = {
    indigo: { primary: '#6366f1', glow: 'rgba(99, 102, 241, 0.25)' },
    blue: { primary: '#3b82f6', glow: 'rgba(59, 130, 246, 0.25)' },
    emerald: { primary: '#10b981', glow: 'rgba(16, 185, 129, 0.25)' },
    crimson: { primary: '#ef4444', glow: 'rgba(239, 68, 68, 0.25)' },
    amber: { primary: '#f59e0b', glow: 'rgba(245, 158, 11, 0.25)' },
    teal: { primary: '#14b8a6', glow: 'rgba(20, 184, 166, 0.25)' }
  };

  const theme = themeColors[colorName] || themeColors.indigo;
  const root = document.documentElement;
  root.style.setProperty('--primary', theme.primary);
  root.style.setProperty('--primary-glow', theme.glow);

  // Update dots active class
  document.querySelectorAll('.color-dot').forEach(dot => dot.classList.remove('active'));
  const activeDot = document.querySelector(`.color-dot.${colorName}`);
  if (activeDot) activeDot.classList.add('active');

  // Persist choice scoped
  localStorage.setItem(getUserKey('crm_theme_color'), colorName);

  if (!skipToast) {
    showToast(`Cor de tema alterada com sucesso!`, 'success');
  }
}

function handleLiquidGlassChange(isEnabled, skipToast = false) {
  const toggleEl = $('prefLiquidGlassToggle');
  if (toggleEl) toggleEl.checked = isEnabled;

  if (isEnabled) {
    document.body.classList.remove('liquid-glass-disabled');
    localStorage.setItem(getUserKey('crm_liquid_glass_disabled'), 'false');
    if (!skipToast) showToast('Efeito Liquid Glass premium ativado!', 'success');
  } else {
    document.body.classList.add('liquid-glass-disabled');
    localStorage.setItem(getUserKey('crm_liquid_glass_disabled'), 'true');
    if (!skipToast) showToast('Efeito Liquid Glass premium desativado!', 'info');
  }
}

function handleStackToastsChange(isEnabled, skipToast = false) {
  const toggleEl = $('prefStackToastsToggle');
  if (toggleEl) toggleEl.checked = isEnabled;

  localStorage.setItem(getUserKey('crm_stack_toasts'), isEnabled ? 'true' : 'false');
  if (!skipToast) {
    if (isEnabled) {
      showToast('Empilhamento de notificações ativado!', 'success');
    } else {
      showToast('Empilhamento desativado. Avisos serão sobrepostos.', 'info');
    }
  }
}

function populateProfileSettings() {
  if (!activeUser) return;
  
  if ($('profileName')) $('profileName').value = activeUser.name || '';
  if ($('profileUsername')) $('profileUsername').value = activeUser.username || '';
  if ($('profileEmail')) $('profileEmail').value = activeUser.email || '';
  if ($('profilePassword')) $('profilePassword').value = ''; 

  if (activeUser.logo) {
    selectedProfileLogoBase64 = activeUser.logo;
    if ($('profileLogoPreviewImg')) $('profileLogoPreviewImg').src = activeUser.logo;
    if ($('profileLogoPreviewContainer')) $('profileLogoPreviewContainer').style.display = 'block';
    if ($('profileUploadPlaceholder')) $('profileUploadPlaceholder').style.display = 'none';
  } else {
    removeProfileLogoSelect(null);
  }
}

async function saveProfileInfo() {
  if (!activeUser) return;

  const name = $('profileName').value.trim();
  const password = $('profilePassword').value;
  const logo = selectedProfileLogoBase64 || "";

  if (!name) {
    showToast('Por favor, preencha todos os campos obrigatórios.', 'warning');
    return;
  }

  // Update active user details
  activeUser.name = name;
  if (password) {
    activeUser.password = password;
  }
  activeUser.logo = logo;

  // Save active user in localStorage
  localStorage.setItem('crm_active_user', JSON.stringify(activeUser));

  // Update crm_users database list
  const users = JSON.parse(localStorage.getItem('crm_users')) || [];
  const uIdx = users.findIndex(u => u.email.toLowerCase() === activeUser.email.toLowerCase());
  if (uIdx !== -1) {
    users[uIdx].name = name;
    if (password) {
      users[uIdx].password = password;
    }
    users[uIdx].logo = logo;
    localStorage.setItem('crm_users', JSON.stringify(users));
  }

  // Push to Supabase Cloud
  if (SupabaseSyncEngine.active) {
    showToast('Sincronizando perfil com a nuvem...', 'info');
    await SupabaseSyncEngine.pushProfile(activeUser);
  }

  // Update UI Elements Immediately
  if (activeUser.logo) {
    if ($('headerCompanyLogo')) {
      $('headerCompanyLogo').src = activeUser.logo;
      $('headerCompanyLogo').style.display = 'block';
    }
    if ($('headerAvatar')) $('headerAvatar').style.display = 'none';
  } else {
    if ($('headerAvatar')) {
      $('headerAvatar').innerText = getInitials(activeUser.name);
      $('headerAvatar').style.display = 'flex';
    }
    if ($('headerCompanyLogo')) $('headerCompanyLogo').style.display = 'none';
  }

  updateClockAndGreeting();
  showToast('Perfil atualizado com sucesso!', 'success');
}

// ==========================================================================
// 18. Multi-Tenant Corporate Portal & Seeding
// ==========================================================================

function initCompaniesAndUsersSeed() {
  // Load or initialize companies - CRdevs ONLY by default!
  const localCompanies = localStorage.getItem('crm_companies');
  if (!localCompanies || localCompanies.includes('"id":"google"')) {
    companies = [
      { id: 'crdevs', name: 'CRdevs', logo: 'logo.png', isLocked: true }
    ];
    localStorage.setItem('crm_companies', JSON.stringify(companies));
  } else {
    companies = JSON.parse(localCompanies);
  }

  // Load or initialize users
  const localUsers = localStorage.getItem('crm_users');
  let users = [];
  if (localUsers) {
    users = JSON.parse(localUsers);
  }
  
  // Ensure Z0oom1 admin exists in crm_users
  const hasAdmin = users.some(u => u.username === 'Z0oom1' || u.email === 'caiodevs@gmail.com');
  if (!hasAdmin) {
    users.push({
      username: 'Z0oom1',
      name: 'Caio Rodrigues',
      email: 'caiodevs@gmail.com',
      password: 'C4iovix2',
      companyId: 'crdevs',
      role: 'admin',
      logo: '' // Personal avatar
    });
    localStorage.setItem('crm_users', JSON.stringify(users));
  }
}

function renderCompanyPortal() {
  const grid = $('companyPortalGrid');
  if (!grid) return;
  grid.innerHTML = '';
  
  companies.forEach(comp => {
    const card = document.createElement('div');
    card.className = `company-portal-card ${comp.isLocked ? 'locked' : ''}`;
    card.onclick = () => selectCompanyPortal(comp.id);
    
    card.innerHTML = `
      <img src="${comp.logo}" alt="${comp.name}" onerror="this.src='logo.png'">
      <h4>
        ${comp.name}
        ${comp.isLocked ? `
          <span class="company-badge-lock" title="Acesso Restrito">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="width: 14px; height: 14px;">
              <path fill-rule="evenodd" d="M12 1.5a5.25 5.25 0 00-5.25 5.25v3a3 3 0 00-3 3v6.75a3 3 0 003 3h10.5a3 3 0 003-3v-6.75a3 3 0 00-3-3v-3c0-2.9-2.35-5.25-5.25-5.25zm3.75 8.25v-3a3.75 3.75 0 10-7.5 0v3h7.5z" clip-rule="evenodd" />
            </svg>
          </span>
        ` : ''}
      </h4>
    `;
    grid.appendChild(card);
  });
}

function selectCompanyPortal(companyId) {
  selectedCompanyId = companyId;
  const comp = companies.find(c => c.id === companyId);
  if (!comp) return;

  $('companyPortalView').style.display = 'none';
  $('loginCard').style.display = 'block';
  
  $('loginLogoImg').src = comp.logo;
  $('loginCompanyName').innerText = comp.name;
  
  // Hide standard links and GitHub SSO button if CRdevs to enforce locks
  if (companyId === 'crdevs') {
    $('authLinksContainer').style.display = 'none';
    $('socialLoginSeparator').style.display = 'none';
    $('socialLoginGrid').style.display = 'none';
  } else {
    $('authLinksContainer').style.display = 'block';
    $('socialLoginSeparator').style.display = 'block';
    $('socialLoginGrid').style.display = 'flex';
  }
  
  showLoginView();
}

function showCompanyPortal() {
  selectedCompanyId = null;
  $('loginCard').style.display = 'none';
  $('companyPortalView').style.display = 'block';
  renderCompanyPortal();
}

// ==========================================================================
// 19. Real GitHub Device Authorization Flow (OAuth)
// ==========================================================================

let devicePollTimer = null;

// Robust Multi-Proxy Fallback Helper to bypass CORS in client-side environments (e.g. Vercel)
async function fetchWithCORSBypass(targetUrl, options = {}) {
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const proxies = [];

  // 1. Same-Origin Vercel Serverless Function Proxy (highly reliable for production Vercel)
  // Since it is same-origin, it has ZERO CORS issues, is extremely secure, and avoids 3rd-party limits!
  // Note: Only attempted if NOT local, since static 'serve' doesn't execute API functions locally.
  if (!isLocal) {
    proxies.push({
      name: 'Vercel Serverless Proxy',
      url: (url) => `/api/cors?url=${encodeURIComponent(url)}`
    });
  }

  // 2. If local, prioritize corsproxy.io (high performance, free on local)
  if (isLocal) {
    proxies.push({
      name: 'CORSproxy.io (Localhost)',
      url: (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`
    });
  }

  // 3. Cors.lol (modern free CORS proxy, supports POST)
  proxies.push({
    name: 'Cors.lol Proxy',
    url: (url) => `https://cors.lol/?url=${encodeURIComponent(url)}`
  });

  // 4. Thingproxy (supports POST, free)
  proxies.push({
    name: 'Thingproxy',
    url: (url) => `https://thingproxy.freeboard.io/fetch/${url}`
  });

  // 5. CORSproxy.io as a desperate last resort on non-local
  if (!isLocal) {
    proxies.push({
      name: 'CORSproxy.io (Production Fallback)',
      url: (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`
    });
  }

  let lastError = null;

  for (const proxy of proxies) {
    const proxiedUrl = proxy.url(targetUrl);
    try {
      console.log(`[CORS Proxy] Tentando requisição via ${proxy.name}: ${proxiedUrl}`);
      
      const response = await fetch(proxiedUrl, options);
      
      // Check for proxy level errors (like 403 billing/localhost restrictions, 400 Bad Request, or 429 rate limit)
      if (!response.ok) {
        const tempRes = response.clone();
        let bodyText = '';
        try {
          bodyText = await tempRes.text();
        } catch (_) {}
        
        if (response.status === 403 && (bodyText.includes('pricing') || bodyText.includes('localhost') || bodyText.includes('Free usage'))) {
          console.warn(`[CORS Proxy] ${proxy.name} recusou a requisição (restrição de ambiente). Tentando próximo proxy...`);
          continue;
        }
        if (response.status === 400 && (bodyText.includes('Bad request') || bodyText.includes('format') || bodyText.includes('codetabs'))) {
          console.warn(`[CORS Proxy] ${proxy.name} retornou erro de formato. Tentando próximo proxy...`);
          continue;
        }
        if (response.status === 429) {
          console.warn(`[CORS Proxy] ${proxy.name} retornou limite de requisições (429). Tentando próximo proxy...`);
          continue;
        }
        if (response.status >= 500) {
          console.warn(`[CORS Proxy] ${proxy.name} retornou erro interno do servidor (${response.status}). Tentando próximo proxy...`);
          continue;
        }
      }
      
      console.log(`[CORS Proxy] Sucesso ou resposta semântica obtida via ${proxy.name}.`);
      return response;
    } catch (err) {
      console.warn(`[CORS Proxy] Erro de rede com ${proxy.name}: ${err.message}. Tentando próximo proxy...`);
      lastError = err;
    }
  }

  throw lastError || new Error("Todos os proxies CORS falharam.");
}

async function handleSocialLogin(provider) {
  if (provider.toLowerCase() !== 'github') return;
  
  if (!selectedCompanyId) {
    showToast('Selecione uma empresa primeiro!', 'warning');
    return;
  }

  const clientId = localStorage.getItem('crm_github_client_id') || "Ov23liGGfMoztRrGRKHL";
  if (!clientId) {
    showToast('Por favor, configure o GitHub Client ID em Ajustes para ativar o login real!', 'warning');
    return;
  }
  
  showToast('Iniciando pareamento com o GitHub...', 'info');
  
  try {
    const targetUrl = `https://github.com/login/device/code?client_id=${clientId}&scope=read:user`;
    const response = await fetchWithCORSBypass(targetUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`HTTP ${response.status}: ${errBody || 'Erro desconhecido'}`);
    }
    
    const data = await response.json();
    if (data.user_code) {
      openGitHubDeviceModal(data.user_code, data.verification_uri);
      startDevicePolling(clientId, data.device_code, data.interval || 5);
    } else {
      showToast('Falha no pareamento. Verifique se o Client ID é válido e possui Device Flow ativo.', 'error');
    }
  } catch (e) {
    console.error('Erro de login no GitHub:', e);
    showToast(`Erro de conexão ao iniciar login do GitHub: ${e.message}`, 'error');
  }
}

function openGitHubDeviceModal(userCode, verificationUri) {
  const oldModal = $('gitDeviceModal');
  if (oldModal) oldModal.remove();

  const modal = document.createElement('div');
  modal.id = 'gitDeviceModal';
  modal.className = 'modal-overlay';
  modal.style.cssText = 'display: flex; z-index: 10002;';
  
  modal.innerHTML = `
    <div class="modal-sheet" style="max-width: 420px; text-align: center; background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(20px); border: 1px solid var(--glass-border); border-radius: 24px; padding: 24px;">
      <div class="modal-header" style="border: none; padding: 0; justify-content: center; margin-bottom: 16px;">
        <h3 class="modal-title" style="font-family: 'Outfit', sans-serif; font-size: 1.3rem;">Autorização GitHub</h3>
      </div>
      <div class="modal-body" style="padding: 0;">
        <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" style="width: 48px; height: 48px; margin: 0 auto 16px; color: var(--text-primary);">
          <path fill-rule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" clip-rule="evenodd" />
        </svg>
        <p style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 16px;">
          Para validar sua identidade, acesse o link oficial do GitHub em qualquer dispositivo:
        </p>
        <a href="${verificationUri}" target="_blank" style="color: var(--primary); font-weight: bold; font-size: 1.1rem; text-decoration: none; display: block; margin-bottom: 20px; transition: color 0.2s;">
          ${verificationUri.replace('https://', '')}
        </a>
        <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 8px;">
          E insira o código de pareamento abaixo:
        </p>
        <div style="background: rgba(255,255,255,0.03); border: 1.5px dashed var(--glass-border); padding: 14px 20px; font-size: 1.8rem; font-weight: 800; letter-spacing: 0.1em; border-radius: 12px; color: var(--warning); margin-bottom: 24px; box-shadow: inset 0 2px 8px rgba(0,0,0,0.2);">
          ${userCode}
        </div>
        <div style="font-size: 0.8rem; color: var(--text-muted); display: flex; align-items: center; justify-content: center; gap: 8px;">
          <div style="width: 8px; height: 8px; border-radius: 50%; background: var(--primary); animation: ping 1.2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          Aguardando aprovação no site do GitHub...
        </div>
      </div>
      <div class="modal-footer" style="padding: 0; margin-top: 24px; border: none;">
        <button class="btn-secondary" style="width: 100%; padding: 10px; font-size: 0.9rem; border-radius: 12px;" onclick="cancelDeviceFlow()">Cancelar Operação</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function cancelDeviceFlow() {
  if (devicePollTimer) clearInterval(devicePollTimer);
  const modal = $('gitDeviceModal');
  if (modal) modal.remove();
  showToast('Fluxo de login cancelado.', 'info');
}

function startDevicePolling(clientId, deviceCode, interval) {
  if (devicePollTimer) clearInterval(devicePollTimer);
  
  let currentInterval = interval * 1000;
  
  devicePollTimer = setInterval(async () => {
    try {
      const targetUrl = `https://github.com/login/oauth/access_token?client_id=${clientId}&device_code=${deviceCode}&grant_type=urn:ietf:params:oauth:grant-type:device_code`;
      const response = await fetchWithCORSBypass(targetUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      const tokenData = await response.json();
      
      if (tokenData.access_token) {
        clearInterval(devicePollTimer);
        const modal = $('gitDeviceModal');
        if (modal) modal.remove();
        
        // Save Token scoped to current company session and globally for api integrations
        localStorage.setItem(getUserKey('crm_github_token'), tokenData.access_token);
        githubToken = tokenData.access_token;
        if ($('githubTokenInput')) $('githubTokenInput').value = tokenData.access_token;
        
        showToast('Dispositivo autorizado pelo GitHub! Buscando dados...', 'info');
        await fetchGitHubUserProfile(tokenData.access_token);
      } else if (tokenData.error) {
        if (tokenData.error === 'authorization_pending') {
          // Keep polling
        } else if (tokenData.error === 'slow_down') {
          clearInterval(devicePollTimer);
          startDevicePolling(clientId, deviceCode, (tokenData.interval || 5) + 5);
        } else {
          clearInterval(devicePollTimer);
          const modal = $('gitDeviceModal');
          if (modal) modal.remove();
          showToast(`Erro na autenticação: ${tokenData.error}`, 'error');
        }
      }
    } catch (e) {
      console.error('Erro de polling:', e);
    }
  }, currentInterval);
}

async function fetchGitHubUserProfile(accessToken) {
  try {
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    if (userRes.ok) {
      const profile = await userRes.json();
      
      const users = JSON.parse(localStorage.getItem('crm_users')) || [];
      let foundUser = users.find(u => u.email === profile.email && u.companyId === selectedCompanyId);
      
      if (!foundUser) {
        foundUser = {
          username: profile.login,
          name: profile.name || profile.login,
          email: profile.email || `${profile.login}@github.com`,
          password: 'github-oauth-authorized',
          companyId: selectedCompanyId,
          logo: profile.avatar_url, // Personal avatar url from git
          role: 'member'
        };
        users.push(foundUser);
        localStorage.setItem('crm_users', JSON.stringify(users));
        
        // Sync with Supabase Cloud
        SupabaseSyncEngine.pushProfile(foundUser);
      }
      
      activeUser = foundUser;
      localStorage.setItem('crm_active_user', JSON.stringify(activeUser));
      loadScopedUserData();
      
      showToast(`Olá, ${activeUser.name}! Autenticado com sucesso! 🚀`, 'success');
      
      $('loginOverlay').style.opacity = 0;
      setTimeout(() => {
        checkAuth();
        $('loginOverlay').style.opacity = 1;
      }, 400);
    }
  } catch (e) {
    console.error(e);
    showToast('Falha ao obter perfil do GitHub.', 'error');
  }
}

function saveGithubSettings() {
  const tokenVal = $('githubTokenInput').value.trim();
  const clientIdVal = $('githubClientIdInput').value.trim();

  localStorage.setItem(getUserKey('crm_github_token'), tokenVal);
  localStorage.setItem('crm_github_client_id', clientIdVal); // Global OAuth Client ID
  
  githubToken = tokenVal;

  showToast('Configurações do GitHub salvas com sucesso!', 'success');
}

// ==========================================================================
// 20. Real-Time Presence Indicator Engine
// ==========================================================================

function initPresenceEngine() {
  if (presenceTimer) clearInterval(presenceTimer);
  
  // Initial run
  updatePresence();
  
  // Loop every 3 seconds
  presenceTimer = setInterval(updatePresence, 3000);
}

function updatePresence() {
  if (!activeUser || !activeUser.companyId) return;

  const compId = activeUser.companyId;
  const presenceKey = `crm_presence_${compId}`;
  
  let presenceList = [];
  try {
    presenceList = JSON.parse(localStorage.getItem(presenceKey)) || [];
  } catch (e) {
    presenceList = [];
  }

  // Filter out stale users (inactive for more than 8 seconds)
  const now = Date.now();
  presenceList = presenceList.filter(u => (now - u.lastSeen) < 8000 && u.email !== activeUser.email);

  // Add/update current user
  presenceList.push({
    email: activeUser.email,
    name: activeUser.name,
    logo: activeUser.logo || '',
    lastSeen: now
  });

  // If CRdevs, inject mock colleagues Lucas and Beatriz
  if (compId === 'crdevs') {
    presenceList.push({
      email: 'lucas.techlead@crdevs.com.br',
      name: 'Lucas (Tech Lead)',
      logo: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&h=120&q=80',
      lastSeen: now
    });
    presenceList.push({
      email: 'beatriz.ux@crdevs.com.br',
      name: 'Beatriz (UX Designer)',
      logo: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&h=120&q=80',
      lastSeen: now
    });
  }

  // Save list back
  localStorage.setItem(presenceKey, JSON.stringify(presenceList));

  // Render the presence indicator
  renderPresenceIndicator(presenceList);
}

function renderPresenceIndicator(presenceList) {
  const container = $('presenceIndicator');
  const stack = $('presenceStack');
  const count = $('presenceCount');
  
  if (!container || !stack || !count) return;

  if (!activeUser) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';
  stack.innerHTML = '';
  
  // Display at most 4 avatars
  const displayList = presenceList.slice(0, 4);
  displayList.forEach(user => {
    if (user.logo) {
      const avatar = document.createElement('img');
      avatar.className = 'presence-avatar';
      avatar.src = user.logo;
      avatar.title = user.name;
      stack.appendChild(avatar);
    } else {
      const avatar = document.createElement('div');
      avatar.className = 'presence-avatar';
      avatar.title = user.name;
      avatar.style.display = 'flex';
      avatar.style.alignItems = 'center';
      avatar.style.justifyContent = 'center';
      avatar.style.fontSize = '0.7rem';
      avatar.style.fontWeight = '700';
      avatar.style.color = '#fff';
      avatar.style.background = 'var(--primary)';
      avatar.innerText = getInitials(user.name);
      stack.appendChild(avatar);
    }
  });

  count.innerText = `${presenceList.length} online`;
}

// ==========================================================================
// 21. Corporate Admin Gates
// ==========================================================================

function unlockAdminCompanySettings() {
  if (!activeUser) return;
  
  if (activeUser.role === 'admin') {
    revealAdminCompanyControls();
    showToast('Acesso de Administrador concedido automaticamente!', 'success');
    return;
  }
  
  const pin = prompt('Digite a senha de administrador da empresa para desbloquear estes ajustes:');
  if (pin === '1234') {
    revealAdminCompanyControls();
    showToast('Ajustes corporativos desbloqueados com sucesso!', 'success');
  } else if (pin !== null) {
    showToast('Senha de administrador incorreta!', 'error');
  }
}

function revealAdminCompanyControls() {
  $('adminCompanyLocked').style.display = 'none';
  $('adminCompanyUnlocked').style.display = 'flex';
  
  const comp = companies.find(c => c.id === activeUser.companyId);
  if (comp) {
    $('adminCompanyName').value = comp.name;
    if (comp.logo) {
      $('adminLogoPreviewImg').src = comp.logo;
      $('adminLogoPreviewContainer').style.display = 'block';
    } else {
      $('adminLogoPreviewContainer').style.display = 'none';
    }
  }
}

function handleAdminCompanyLogoSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showToast('Por favor, selecione uma imagem válida.', 'error');
    return;
  }

  if (file.size > 2 * 1024 * 1024) {
    showToast('A imagem deve ter no máximo 2MB.', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    adminCompanyLogoBase64 = e.target.result;
    
    $('adminLogoPreviewImg').src = adminCompanyLogoBase64;
    $('adminLogoPreviewContainer').style.display = 'block';
    
    showToast('Logotipo corporativo carregado!', 'success');
  };
  reader.readAsDataURL(file);
}

function saveAdminCompanyInfo() {
  if (!activeUser || !activeUser.companyId) return;

  const newName = $('adminCompanyName').value.trim();
  if (!newName) {
    showToast('O nome da empresa não pode ser vazio!', 'warning');
    return;
  }

  const compIndex = companies.findIndex(c => c.id === activeUser.companyId);
  if (compIndex !== -1) {
    companies[compIndex].name = newName;
    if (adminCompanyLogoBase64) {
      companies[compIndex].logo = adminCompanyLogoBase64;
    }
    localStorage.setItem('crm_companies', JSON.stringify(companies));
    
    showToast('Dados corporativos atualizados com sucesso!', 'success');
    
    // Lock back
    $('adminCompanyUnlocked').style.display = 'none';
    $('adminCompanyLocked').style.display = 'block';
    
    // Refresh header company logo if same
    if (companies[compIndex].logo) {
      // If user had no avatar, we keep header company logo or display
      showToast('Empresa atualizada! As alterações serão propagadas.', 'info');
    }
    
    // Propagate change via localStorage to other tabs
    localStorage.setItem('crm_trigger_reload', Date.now().toString());
  }
}

// ==========================================================================
// 22. New Company Creation Modals
// ==========================================================================

function openAddCompanyModal() {
  $('addCompanyForm').reset();
  removeNewCompanyLogoSelect(null);
  $('modalAddCompany').style.display = 'flex';
}

function closeAddCompanyModal(event) {
  if (event === null || event.target === $('modalAddCompany')) {
    $('modalAddCompany').style.display = 'none';
  }
}

function handleNewCompanyLogoSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showToast('Por favor, selecione uma imagem de logo válida.', 'error');
    return;
  }

  if (file.size > 2 * 1024 * 1024) {
    showToast('A imagem do logo deve ter no máximo 2MB.', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    newCompanyLogoBase64 = e.target.result;
    
    $('newCompanyLogoPreviewImg').src = newCompanyLogoBase64;
    $('newCompanyLogoPreviewContainer').style.display = 'block';
    $('newCompanyUploadPlaceholder').style.display = 'none';
    
    showToast('Logo da nova empresa carregado!', 'success');
  };
  reader.readAsDataURL(file);
}

function removeNewCompanyLogoSelect(event) {
  if (event) event.stopPropagation();
  newCompanyLogoBase64 = "";
  $('newCompanyLogoInput').value = "";
  $('newCompanyLogoPreviewImg').src = "";
  $('newCompanyLogoPreviewContainer').style.display = 'none';
  $('newCompanyUploadPlaceholder').style.display = 'flex';
}

function saveNewCompany() {
  const name = $('newCompanyName').value.trim();
  if (!name) {
    showToast('Por favor, preencha o nome da empresa.', 'warning');
    return;
  }

  const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.floor(1000 + Math.random() * 9000);
  
  const newComp = {
    id: id,
    name: name,
    logo: newCompanyLogoBase64 || 'logo.png',
    isLocked: false
  };

  companies.push(newComp);
  localStorage.setItem('crm_companies', JSON.stringify(companies));
  
  showToast(`Empresa "${name}" cadastrada com sucesso!`, 'success');
  
  closeAddCompanyModal(null);
  renderCompanyPortal();
}

// ==========================================================================
// 23. Real-Time Multi-Tab Synchronization Broadcast
// ==========================================================================

window.addEventListener('storage', (e) => {
  if (e.key && (e.key.startsWith('crm_') || e.key === 'crm_trigger_reload')) {
    loadScopedUserData();
    
    // Repaint all active grids based on active view in the DOM
    const activeView = document.querySelector('.app-view.active');
    if (activeView) {
      const viewId = activeView.id;
      if (viewId === 'viewDashboard') {
        renderDashboard();
      } else if (viewId === 'viewClientes') {
        renderClientsList();
      } else if (viewId === 'viewAgenda') {
        renderTimeline();
      } else if (viewId === 'viewLembretes') {
        renderTodoList();
      } else if (viewId === 'viewConfiguracoes') {
        renderWallpaperGrid();
        populateProfileSettings();
      }
    }
  }
});
