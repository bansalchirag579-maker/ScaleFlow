// TOKEN INITIAL VERIFICATION
const token = localStorage.getItem('scaleflow_token');
if (!token && !window.location.pathname.endsWith('login.html')) {
  window.location.href = '/login.html';
}

// STATE MANAGEMENT
const state = {
  currentUser: null,
  allUsers: [],
  organization: null,
  projects: [],
  activeProjectId: null,
  tasks: [],
  stats: {},
  activeView: 'dashboard',
  kanbanFilterPriority: 'all'
};

// API HELPER
async function apiCall(endpoint, method = 'GET', body = null) {
  const token = localStorage.getItem('scaleflow_token');
  if (!token && !window.location.pathname.endsWith('login.html')) {
    window.location.href = '/login.html';
    return;
  }

  const headers = {
    'Content-Type': 'application/json'
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const config = {
    method,
    headers
  };
  
  if (body) {
    config.body = JSON.stringify(body);
  }
  
  try {
    const response = await fetch(endpoint, config);
    
    // Auto-logout if token is expired or unauthorized
    if (response.status === 401 && !window.location.pathname.endsWith('login.html')) {
      localStorage.removeItem('scaleflow_token');
      window.location.href = '/login.html';
      return;
    }

    // Check if the response is JSON
    const contentType = response.headers.get('content-type');
    let data;
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      throw new Error(`Server returned non-JSON response (${response.status}): ${text.substring(0, 150)}`);
    }
    
    if (!response.ok) {
      throw new Error(data.error || 'Server error occurred');
    }
    
    return data;
  } catch (error) {
    console.error(`API Error on ${method} ${endpoint}:`, error);
    throw error;
  }
}

// INITIALIZE APP
document.addEventListener('DOMContentLoaded', async () => {
  await loadSession();
  setupRouting();
  setupEventListeners();
  
  // Set default view from hash or dashboard
  const hash = window.location.hash.replace('#', '') || 'dashboard';
  navigateTo(hash);
});

// LOAD CORE SESSION & DEMO DATA
async function loadSession() {
  try {
    const session = await apiCall('/api/session');
    state.currentUser = session.user;
    state.organization = session.organization;
    state.allUsers = session.allUsers;
    state.stats = session.stats;
    
    // Set project listing
    const projects = await apiCall('/api/projects');
    state.projects = projects;
    
    // Choose active project
    if (state.projects.length > 0) {
      if (!state.activeProjectId || !state.projects.some(p => p.id === state.activeProjectId)) {
        state.activeProjectId = state.projects[0].id;
      }
    } else {
      state.activeProjectId = null;
    }
    
    // Load tasks
    state.tasks = await apiCall('/api/tasks');
    
    // Render static header/sidebar elements
    renderSidebarAndIdentity();
    
  } catch (error) {
    showErrorAlert('Initialization Error', 'Could not sync database session. Make sure node server is active.');
  }
}

// RENDER SIDEBAR & INITIAL IDENTITY CONTROLS
function renderSidebarAndIdentity() {
  // 1. Set Org info
  document.getElementById('current-org-name').textContent = state.organization.name;
  
  // 2. Set Active User info
  document.getElementById('current-user-avatar').src = state.currentUser.avatar;
  document.getElementById('current-user-name').textContent = state.currentUser.name;
  document.getElementById('current-user-role').textContent = state.currentUser.role;
  
  // 3. Setup Switcher Dropdown
  const switcher = document.getElementById('user-switch-dropdown');
  switcher.innerHTML = '';
  
  state.allUsers.forEach(u => {
    // Get org name
    const userOrg = u.organizationId === 1 ? 'Acme' : 'Initech';
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = `${u.name} (${u.role.toUpperCase()} - ${userOrg})`;
    if (u.id === state.currentUser.id) {
      opt.selected = true;
    }
    switcher.appendChild(opt);
  });
  
  lucide.createIcons();
}

// ROUTING / VIEW NAVIGATION
function setupRouting() {
  window.addEventListener('hashchange', () => {
    const view = window.location.hash.replace('#', '') || 'dashboard';
    navigateTo(view);
  });
  
  // Handle click on sidebar links
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetView = link.getAttribute('data-view');
      window.location.hash = `#${targetView}`;
    });
  });
}

async function navigateTo(viewName) {
  const views = ['dashboard', 'kanban', 'members', 'billing', 'activity'];
  if (!views.includes(viewName)) return;
  
  state.activeView = viewName;
  
  // Update nav links active class
  document.querySelectorAll('.nav-link').forEach(link => {
    if (link.getAttribute('data-view') === viewName) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
  
  // Show active view panel
  document.querySelectorAll('.view-panel').forEach(panel => {
    if (panel.id === `view-${viewName}`) {
      panel.classList.add('active');
    } else {
      panel.classList.remove('active');
    }
  });
  
  // Page titles and Header actions toggling
  const pageTitle = document.getElementById('page-title');
  const projectSelector = document.getElementById('header-project-selector');
  const btnCreateProject = document.getElementById('btn-create-project');
  
  // Default header displays
  btnCreateProject.classList.remove('hidden');
  projectSelector.classList.add('hidden');
  
  // Capitalize view title
  pageTitle.textContent = viewName.charAt(0).toUpperCase() + viewName.slice(1);
  
  // Reload fresh session metrics & data for the view
  await loadSession();
  
  // Render target view template
  if (viewName === 'dashboard') {
    renderDashboardView();
  } else if (viewName === 'kanban') {
    projectSelector.classList.remove('hidden');
    renderKanbanView();
  } else if (viewName === 'members') {
    renderMembersView();
  } else if (viewName === 'billing') {
    renderBillingView();
  } else if (viewName === 'activity') {
    renderActivityView();
  }
}

// ================= RENDER DYNAMIC TEMPLATES =================

// 1. DASHBOARD VIEW
function renderDashboardView() {
  // Set stat values
  document.getElementById('stat-projects-val').textContent = state.stats.projectsCount;
  document.getElementById('stat-projects-limit').textContent = `Limit: ${state.stats.projectsLimit === Infinity ? 'Unlimited' : state.stats.projectsLimit}`;
  
  document.getElementById('stat-tasks-val').textContent = state.stats.tasksCount;
  document.getElementById('stat-tasks-limit').textContent = `Limit: ${state.stats.tasksLimit === Infinity ? 'Unlimited' : state.stats.tasksLimit}`;
  
  document.getElementById('stat-members-val').textContent = state.stats.usersCount;
  document.getElementById('stat-members-limit').textContent = `Limit: ${state.stats.usersLimit === Infinity ? 'Unlimited' : state.stats.usersLimit}`;
  
  document.getElementById('stat-tier-val').textContent = state.stats.tier.toUpperCase();
  
  // Set Meters
  const projPct = state.stats.projectsLimit === Infinity ? 0 : (state.stats.projectsCount / state.stats.projectsLimit) * 100;
  const taskPct = state.stats.tasksLimit === Infinity ? 0 : (state.stats.tasksCount / state.stats.tasksLimit) * 100;
  const membPct = state.stats.usersLimit === Infinity ? 0 : (state.stats.usersCount / state.stats.usersLimit) * 100;
  
  document.getElementById('meter-projects-text').textContent = `${state.stats.projectsCount} / ${state.stats.projectsLimit === Infinity ? '∞' : state.stats.projectsLimit}`;
  document.getElementById('meter-projects-fill').style.width = `${Math.min(projPct, 100)}%`;
  
  document.getElementById('meter-tasks-text').textContent = `${state.stats.tasksCount} / ${state.stats.tasksLimit === Infinity ? '∞' : state.stats.tasksLimit}`;
  document.getElementById('meter-tasks-fill').style.width = `${Math.min(taskPct, 100)}%`;
  
  document.getElementById('meter-members-text').textContent = `${state.stats.usersCount} / ${state.stats.usersLimit === Infinity ? '∞' : state.stats.usersLimit}`;
  document.getElementById('meter-members-fill').style.width = `${Math.min(membPct, 100)}%`;
  
  // Set warning box if Free tier
  const warningBox = document.getElementById('free-tier-warning');
  if (state.stats.tier === 'free') {
    warningBox.classList.remove('hidden');
  } else {
    warningBox.classList.add('hidden');
  }
  
  // Render Projects List
  const projContainer = document.getElementById('dashboard-project-items');
  projContainer.innerHTML = '';
  
  const orgProjects = state.projects;
  if (orgProjects.length === 0) {
    projContainer.innerHTML = `<div class="empty-state">No projects created yet.</div>`;
  } else {
    orgProjects.forEach(p => {
      const row = document.createElement('div');
      row.className = 'project-item-row';
      row.innerHTML = `
        <div class="project-item-info">
          <h4>${escapeHTML(p.name)}</h4>
          <p>${escapeHTML(p.description || 'No description provided')}</p>
        </div>
        <div class="project-item-actions">
          <i data-lucide="chevron-right"></i>
        </div>
      `;
      row.addEventListener('click', () => {
        state.activeProjectId = p.id;
        window.location.hash = '#kanban';
      });
      projContainer.appendChild(row);
    });
  }
  
  // Render Mini Activity Feed
  loadMiniActivity();
  
  // Render Status Doughnut Chart
  renderTaskChart();
  
  lucide.createIcons();
}

// 2. KANBAN VIEW
function renderKanbanView() {
  // Populate dropdown header
  const dropdown = document.getElementById('project-select');
  dropdown.innerHTML = '';
  
  if (state.projects.length === 0) {
    dropdown.innerHTML = '<option value="">No Active Projects</option>';
    clearKanbanBoard();
    return;
  }
  
  state.projects.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    if (p.id === state.activeProjectId) {
      opt.selected = true;
    }
    dropdown.appendChild(opt);
  });
  
  // Make sure activeProjectId matches selected option
  if (!state.activeProjectId) {
    state.activeProjectId = state.projects[0].id;
  }
  
  // Render Board columns
  renderKanbanTasks();
}

function clearKanbanBoard() {
  document.getElementById('container-todo').innerHTML = '<div class="empty-state">Add a project first.</div>';
  document.getElementById('container-inprogress').innerHTML = '';
  document.getElementById('container-inreview').innerHTML = '';
  document.getElementById('container-done').innerHTML = '';
}

function renderKanbanTasks() {
  const projectTasks = state.tasks.filter(t => t.projectId === state.activeProjectId);
  
  const columns = {
    todo: document.getElementById('container-todo'),
    in_progress: document.getElementById('container-inprogress'),
    in_review: document.getElementById('container-inreview'),
    done: document.getElementById('container-done')
  };
  
  const counts = {
    todo: 0,
    in_progress: 0,
    in_review: 0,
    done: 0
  };
  
  // Clear lists
  Object.keys(columns).forEach(status => {
    columns[status].innerHTML = '';
  });
  
  // Get active priority filter
  const activePriority = state.kanbanFilterPriority;
  
  const filteredTasks = projectTasks.filter(t => {
    if (activePriority === 'all') return true;
    return t.priority === activePriority;
  });
  
  if (filteredTasks.length === 0) {
    Object.keys(columns).forEach(status => {
      columns[status].innerHTML = `<div class="empty-state">No tasks</div>`;
    });
  } else {
    filteredTasks.forEach(task => {
      counts[task.status]++;
      
      const card = document.createElement('div');
      card.className = 'kanban-card';
      card.setAttribute('draggable', 'true');
      card.setAttribute('data-id', task.id);
      
      // Determine assignee details
      let assigneeHtml = '<div class="unassigned-avatar"><i data-lucide="user"></i></div>';
      if (task.assigneeId) {
        const assignee = state.allUsers.find(u => u.id === task.assigneeId);
        if (assignee) {
          assigneeHtml = `<img src="${assignee.avatar}" alt="${escapeHTML(assignee.name)}" class="assignee-avatar" title="${escapeHTML(assignee.name)}">`;
        }
      }
      
      // Determine due date warning
      let dateHtml = '';
      if (task.dueDate) {
        const isOverdue = new Date(task.dueDate) < new Date() && task.status !== 'done';
        const formattedDate = new Date(task.dueDate).toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
        dateHtml = `
          <div class="due-date ${isOverdue ? 'overdue' : ''}">
            <i data-lucide="calendar"></i>
            <span>${formattedDate}</span>
          </div>
        `;
      }
      
      const commentCount = task.comments ? task.comments.length : 0;
      
      card.innerHTML = `
        <div class="card-top">
          <span class="priority-badge priority-${task.priority}">${task.priority}</span>
        </div>
        <h4 class="card-title">${escapeHTML(task.title)}</h4>
        <p class="card-desc-preview">${escapeHTML(task.description || 'No description')}</p>
        <div class="card-footer">
          <div class="card-meta-left">
            ${dateHtml}
            <div class="comments-count">
              <i data-lucide="message-square"></i>
              <span>${commentCount}</span>
            </div>
          </div>
          <div class="card-assignee">
            ${assigneeHtml}
          </div>
        </div>
      `;
      
      // HTML5 Drag Event Listeners
      card.addEventListener('dragstart', (e) => {
        card.classList.add('dragging');
        e.dataTransfer.setData('text/plain', task.id);
        e.dataTransfer.effectAllowed = 'move';
      });
      
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
      });
      
      // Double click to view details modal
      card.addEventListener('dblclick', () => {
        openTaskDetailsModal(task);
      });
      
      // Also support single click with delay or tap
      card.addEventListener('click', () => {
        openTaskDetailsModal(task);
      });
      
      columns[task.status].appendChild(card);
    });
  }
  
  // Update count indicators
  document.getElementById('count-todo').textContent = counts.todo;
  document.getElementById('count-inprogress').textContent = counts.in_progress;
  document.getElementById('count-inreview').textContent = counts.in_review;
  document.getElementById('count-done').textContent = counts.done;
  
  // Recreate icons in cards
  lucide.createIcons();
}

// 3. MEMBERS VIEW
function renderMembersView() {
  const tbody = document.getElementById('members-table-body');
  tbody.innerHTML = '';
  
  // Find members of active org
  const orgMembers = state.allUsers.filter(u => u.organizationId === state.organization.id);
  
  orgMembers.forEach(m => {
    const tr = document.createElement('tr');
    
    // Format date mock
    const dateJoined = new Date(m.createdAt || Date.now()).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    
    tr.innerHTML = `
      <td>
        <div class="table-user-cell">
          <img src="${m.avatar}" alt="Avatar" class="avatar-sm">
          <div>
            <h4>${escapeHTML(m.name)}</h4>
          </div>
        </div>
      </td>
      <td>@${escapeHTML(m.username)}</td>
      <td>${escapeHTML(m.email)}</td>
      <td><span class="table-role-badge">${m.role}</span></td>
      <td>${dateJoined}</td>
      <td>
        <span class="table-status-pill">
          <span class="status-dot-pulse"></span>
          <span>Online</span>
        </span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// 4. BILLING VIEW
function renderBillingView() {
  // Update plan badges
  document.getElementById('billing-active-plan').textContent = `${state.organization.tier} Tier`;
  
  // Set meters
  const projPct = state.stats.projectsLimit === Infinity ? 0 : (state.stats.projectsCount / state.stats.projectsLimit) * 100;
  const taskPct = state.stats.tasksLimit === Infinity ? 0 : (state.stats.tasksCount / state.stats.tasksLimit) * 100;
  const membPct = state.stats.usersLimit === Infinity ? 0 : (state.stats.usersCount / state.stats.usersLimit) * 100;
  
  document.getElementById('billing-projects-usage-text').textContent = `${state.stats.projectsCount} of ${state.stats.projectsLimit === Infinity ? 'Unlimited' : state.stats.projectsLimit} used`;
  document.getElementById('billing-projects-fill').style.width = `${Math.min(projPct, 100)}%`;
  
  document.getElementById('billing-tasks-usage-text').textContent = `${state.stats.tasksCount} of ${state.stats.tasksLimit === Infinity ? 'Unlimited' : state.stats.tasksLimit} allocated`;
  document.getElementById('billing-tasks-fill').style.width = `${Math.min(taskPct, 100)}%`;
  
  document.getElementById('billing-members-usage-text').textContent = `${state.stats.usersCount} of ${state.stats.usersLimit === Infinity ? 'Unlimited' : state.stats.usersLimit} seats filled`;
  document.getElementById('billing-members-fill').style.width = `${Math.min(membPct, 100)}%`;
  
  // Update pricing cards highlights
  const plans = ['free', 'pro', 'enterprise'];
  plans.forEach(plan => {
    const card = document.getElementById(`pricing-card-${plan}`);
    const btn = document.getElementById(`btn-select-${plan}`);
    
    if (plan === state.organization.tier) {
      card.classList.add('active-plan');
      btn.textContent = 'Active Plan';
      btn.classList.add('btn-secondary');
      btn.classList.remove('btn-primary');
    } else {
      card.classList.remove('active-plan');
      btn.textContent = 'Choose Plan';
      if (plan === 'pro') {
        btn.classList.add('btn-primary');
        btn.classList.remove('btn-secondary');
      } else {
        btn.classList.add('btn-secondary');
        btn.classList.remove('btn-primary');
      }
    }
  });
}

// 5. ACTIVITY LOG VIEW
async function renderActivityView() {
  const container = document.getElementById('activity-full-timeline');
  container.innerHTML = '';
  
  try {
    const activities = await apiCall('/api/activity');
    if (activities.length === 0) {
      container.innerHTML = `<div class="empty-state">No activities recorded yet.</div>`;
      return;
    }
    
    activities.forEach(a => {
      const item = document.createElement('div');
      item.className = 'timeline-item';
      
      // Icon selection based on action
      let icon = 'info';
      let dotClass = 'dot-update';
      if (a.action.includes('created task')) { icon = 'plus-circle'; dotClass = 'dot-create'; }
      else if (a.action.includes('moved task to "Completed"')) { icon = 'check-circle2'; dotClass = 'dot-complete'; }
      else if (a.action.includes('comment')) { icon = 'message-square'; dotClass = 'dot-comment'; }
      else if (a.action.includes('created project')) { icon = 'folder-plus'; dotClass = 'dot-create'; }
      else if (a.action.includes('invited')) { icon = 'user-plus'; dotClass = 'dot-create'; }
      else if (a.action.includes('upgraded') || a.action.includes('tier')) { icon = 'zap'; dotClass = 'dot-complete'; }
      else if (a.action.includes('moved')) { icon = 'arrow-right'; dotClass = 'dot-update'; }
      
      const timeString = new Date(a.timestamp).toLocaleString();
      
      item.innerHTML = `
        <div class="timeline-dot ${dotClass}">
          <i data-lucide="${icon}"></i>
        </div>
        <div class="timeline-content-box">
          <div class="timeline-event-desc">
            <img src="${a.avatar}" alt="${escapeHTML(a.user)}" class="timeline-actor-avatar">
            <div class="timeline-text">
              <span class="feed-actor">${escapeHTML(a.user)}</span>
              <span class="feed-action">${escapeHTML(a.action)}</span>
              <span class="feed-target">"${escapeHTML(a.target)}"</span>
            </div>
          </div>
          <span class="timeline-time-badge">${timeString}</span>
        </div>
      `;
      container.appendChild(item);
    });
    
    lucide.createIcons();
    
  } catch (error) {
    container.innerHTML = `<div class="empty-state">Failed to load activity log.</div>`;
  }
}

// DASHBOARD MINI ACTIONS FEED
async function loadMiniActivity() {
  const container = document.getElementById('dashboard-activity-feed');
  container.innerHTML = '';
  
  try {
    const activities = await apiCall('/api/activity');
    if (activities.length === 0) {
      container.innerHTML = `<div class="empty-state">No recent activity.</div>`;
      return;
    }
    
    // Take top 4
    activities.slice(0, 4).forEach(a => {
      const timeAgo = formatTimeAgo(new Date(a.timestamp));
      
      const div = document.createElement('div');
      div.className = 'activity-feed-item';
      div.innerHTML = `
        <img src="${a.avatar}" alt="Avatar" class="feed-actor-avatar">
        <div class="feed-content">
          <span class="feed-actor">${escapeHTML(a.user)}</span>
          <span class="feed-action">${escapeHTML(a.action)}</span>
          <span class="feed-target">"${escapeHTML(a.target)}"</span>
          <span class="feed-time">${timeAgo}</span>
        </div>
      `;
      container.appendChild(div);
    });
  } catch (e) {
    container.innerHTML = `<div class="empty-state">Error syncing feed.</div>`;
  }
}

// TASK CHART CANVAS RENDERER
function renderTaskChart() {
  const canvas = document.getElementById('taskStatusChart');
  const fallback = document.getElementById('chart-fallback');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  
  // Calculate statuses of current tasks
  const counts = { todo: 0, in_progress: 0, in_review: 0, done: 0 };
  state.tasks.forEach(t => {
    if (counts[t.status] !== undefined) counts[t.status]++;
  });
  
  const total = state.tasks.length;
  
  if (total === 0) {
    // Render fallback empty graphic
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('No tasks available for metrics', canvas.width / 2, canvas.height / 2);
    fallback.classList.add('hidden');
    return;
  }
  
  fallback.classList.add('hidden');
  
  // Set Canvas high definition
  const devicePixelRatio = window.devicePixelRatio || 1;
  canvas.style.width = '300px';
  canvas.style.height = '200px';
  canvas.width = 300 * devicePixelRatio;
  canvas.height = 200 * devicePixelRatio;
  ctx.scale(devicePixelRatio, devicePixelRatio);
  
  // Configuration
  const colors = {
    todo: '#64748b',       // slate-500
    in_progress: '#3b82f6', // blue-500
    in_review: '#a855f7',   // purple-500
    done: '#10b981'        // emerald-500
  };
  
  const data = [
    { label: 'To Do', value: counts.todo, color: colors.todo },
    { label: 'In Progress', value: counts.in_progress, color: colors.in_progress },
    { label: 'In Review', value: counts.in_review, color: colors.in_review },
    { label: 'Done', value: counts.done, color: colors.done }
  ].filter(d => d.value > 0);
  
  // Chart dimensions
  const centerX = 100;
  const centerY = 100;
  const outerRadius = 70;
  const innerRadius = 45;
  
  let startAngle = -Math.PI / 2;
  
  ctx.clearRect(0, 0, 300, 200);
  
  // 1. Draw Donut Segments
  data.forEach(segment => {
    const sliceAngle = (segment.value / total) * (2 * Math.PI);
    const endAngle = startAngle + sliceAngle;
    
    ctx.beginPath();
    ctx.arc(centerX, centerY, outerRadius, startAngle, endAngle);
    ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
    ctx.closePath();
    
    ctx.fillStyle = segment.color;
    ctx.fill();
    
    startAngle = endAngle;
  });
  
  // Center Text
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 20px Outfit';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(total.toString(), centerX, centerY - 6);
  
  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px Inter';
  ctx.fillText('TASKS', centerX, centerY + 14);
  
  // 2. Draw Legends
  const legendX = 190;
  let legendY = 40;
  
  data.forEach(segment => {
    // Dot
    ctx.beginPath();
    ctx.arc(legendX, legendY, 5, 0, 2 * Math.PI);
    ctx.fillStyle = segment.color;
    ctx.fill();
    
    // Label & count
    ctx.fillStyle = '#f1f5f9';
    ctx.font = '500 12px Inter';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${segment.label} (${segment.value})`, legendX + 12, legendY);
    
    legendY += 30;
  });
}

// ================= MODALS & EVENTS CODE =================

let activeDetailTask = null;

function setupEventListeners() {
  
  // 1. Switch User Dropdown Switcher
  document.getElementById('user-switch-dropdown').addEventListener('change', async (e) => {
    const newUserId = e.target.value;
    try {
      const result = await apiCall('/api/auth/switch-demo-identity', 'POST', { userId: newUserId });
      localStorage.setItem('scaleflow_token', result.token);
      await loadSession();
      // Reload active panel
      navigateTo(state.activeView);
    } catch (err) {
      showErrorAlert('Identity Switch Error', err.message);
    }
  });

  // Logout Button
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      localStorage.removeItem('scaleflow_token');
      window.location.href = '/login.html';
    });
  }
  
  // 2. Create Project Modal Toggles
  const modalProj = document.getElementById('modal-create-project');
  document.getElementById('btn-create-project').addEventListener('click', () => openModal(modalProj));
  document.getElementById('btn-dashboard-new-project').addEventListener('click', () => openModal(modalProj));
  document.getElementById('btn-close-project-modal').addEventListener('click', () => closeModal(modalProj));
  document.getElementById('btn-cancel-project-modal').addEventListener('click', () => closeModal(modalProj));
  
  document.getElementById('form-create-project').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('new-project-name').value;
    const description = document.getElementById('new-project-desc').value;
    
    try {
      const newProj = await apiCall('/api/projects', 'POST', { name, description });
      closeModal(modalProj);
      e.target.reset();
      state.activeProjectId = newProj.id;
      await loadSession();
      navigateTo('kanban');
    } catch (err) {
      closeModal(modalProj);
      showErrorAlert('Project Cap Limit', err.message);
    }
  });
  
  // 3. Project Selection Dropdown Change
  document.getElementById('project-select').addEventListener('change', (e) => {
    state.activeProjectId = e.target.value;
    renderKanbanTasks();
  });
  
  // 4. Create Task Modal Toggles
  const modalTask = document.getElementById('modal-create-task');
  document.getElementById('btn-add-task-kanban').addEventListener('click', () => {
    populateCreateTaskModal();
    openModal(modalTask);
  });
  document.getElementById('btn-close-task-modal').addEventListener('click', () => closeModal(modalTask));
  document.getElementById('btn-cancel-task-modal').addEventListener('click', () => closeModal(modalTask));
  
  document.getElementById('form-create-task').addEventListener('submit', async (e) => {
    e.preventDefault();
    const projectId = document.getElementById('new-task-project').value;
    const title = document.getElementById('new-task-title').value;
    const description = document.getElementById('new-task-desc').value;
    const priority = document.getElementById('new-task-priority').value;
    const assigneeId = document.getElementById('new-task-assignee').value || null;
    const dueDate = document.getElementById('new-task-due').value;
    
    try {
      await apiCall('/api/tasks', 'POST', { projectId, title, description, priority, assigneeId, dueDate });
      closeModal(modalTask);
      e.target.reset();
      await loadSession();
      renderKanbanTasks();
    } catch (err) {
      closeModal(modalTask);
      showErrorAlert('Task Capacity Exceeded', err.message);
    }
  });
  
  // 5. Kanban Drag-and-Drop Columns Handling
  const columns = document.querySelectorAll('.kanban-column');
  columns.forEach(col => {
    col.addEventListener('dragover', (e) => {
      e.preventDefault();
      const container = col.querySelector('.kanban-cards-container');
      container.classList.add('drag-over');
    });
    
    col.addEventListener('dragleave', () => {
      const container = col.querySelector('.kanban-cards-container');
      container.classList.remove('drag-over');
    });
    
    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      const container = col.querySelector('.kanban-cards-container');
      container.classList.remove('drag-over');
      
      const taskId = e.dataTransfer.getData('text/plain');
      const newStatus = col.getAttribute('data-status');
      
      // Update locally first for smooth visual response
      const taskIndex = state.tasks.findIndex(t => t.id === taskId);
      if (taskIndex !== -1 && state.tasks[taskIndex].status !== newStatus) {
        const oldStatus = state.tasks[taskIndex].status;
        state.tasks[taskIndex].status = newStatus;
        renderKanbanTasks(); // Refresh visual board instantly
        
        try {
          // Sync with Server REST API
          await apiCall(`/api/tasks/${taskId}`, 'PUT', { status: newStatus });
        } catch (err) {
          // Revert if API fails
          state.tasks[taskIndex].status = oldStatus;
          renderKanbanTasks();
          showErrorAlert('Update Failed', err.message);
        }
      }
    });
  });
  
  // 6. Invite Member Modal Toggles
  const modalInvite = document.getElementById('modal-invite-member');
  document.getElementById('btn-invite-member').addEventListener('click', () => openModal(modalInvite));
  document.getElementById('btn-close-invite-modal').addEventListener('click', () => closeModal(modalInvite));
  document.getElementById('btn-cancel-invite-modal').addEventListener('click', () => closeModal(modalInvite));
  
  document.getElementById('form-invite-member').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('invite-name').value;
    const username = document.getElementById('invite-username').value;
    const email = document.getElementById('invite-email').value;
    const role = document.getElementById('invite-role').value;
    
    try {
      await apiCall('/api/members', 'POST', { name, username, email, role });
      closeModal(modalInvite);
      e.target.reset();
      await loadSession();
      renderMembersView();
    } catch (err) {
      closeModal(modalInvite);
      showErrorAlert('Seat Quota Exhausted', err.message);
    }
  });
  
  // 7. Select Plans/Tiers in Billing View
  document.querySelectorAll('.btn-pricing').forEach(btn => {
    btn.addEventListener('click', async () => {
      const selectedTier = btn.getAttribute('data-tier-select');
      if (selectedTier === state.organization.tier) return;
      
      // Admin verification
      if (state.currentUser.role !== 'admin') {
        showErrorAlert('Access Restrained', 'Only administrators can update subscription plans.');
        return;
      }
      
      try {
        await apiCall('/api/organization/tier', 'PUT', { tier: selectedTier });
        await loadSession();
        renderBillingView();
        
        // Show success
        const activeModal = document.getElementById('modal-alert');
        document.getElementById('alert-modal-title').textContent = 'Subscription Activated!';
        document.getElementById('alert-modal-message').textContent = `Your organization workspace is now configured on the ${selectedTier.toUpperCase()} tier. Resource limits have been adjusted.`;
        document.getElementById('btn-upgrade-alert-modal').classList.add('hidden');
        openModal(activeModal);
      } catch (err) {
        showErrorAlert('Billing System Error', err.message);
      }
    });
  });
  
  // 8. Custom Alerts Dismissal
  const modalAlert = document.getElementById('modal-alert');
  document.getElementById('btn-close-alert-modal').addEventListener('click', () => closeModal(modalAlert));
  document.getElementById('btn-upgrade-alert-modal').addEventListener('click', () => {
    closeModal(modalAlert);
    window.location.hash = '#billing';
  });
  
  // 9. Kanban Board Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.kanbanFilterPriority = btn.getAttribute('data-priority');
      renderKanbanTasks();
    });
  });
  
  // 10. Task Detail Modal Interactions
  const modalDetails = document.getElementById('modal-task-details');
  document.getElementById('btn-close-detail-modal').addEventListener('click', () => closeModal(modalDetails));
  
  // Title inline blur save
  document.getElementById('detail-task-title').addEventListener('blur', async (e) => {
    if (!activeDetailTask) return;
    const newTitle = e.target.textContent.trim();
    if (newTitle && newTitle !== activeDetailTask.title) {
      try {
        const updated = await apiCall(`/api/tasks/${activeDetailTask.id}`, 'PUT', { title: newTitle });
        activeDetailTask.title = updated.title;
        // Refresh background kanban board
        await loadSession();
        renderKanbanTasks();
      } catch (err) {
        e.target.textContent = activeDetailTask.title;
        showErrorAlert('Update Failed', err.message);
      }
    }
  });
  
  // Show save button when description focused
  const descEl = document.getElementById('detail-task-desc');
  const btnSaveDesc = document.getElementById('btn-save-desc');
  
  descEl.addEventListener('focus', () => {
    btnSaveDesc.classList.remove('hidden');
  });
  
  btnSaveDesc.addEventListener('click', async () => {
    if (!activeDetailTask) return;
    const newDesc = descEl.textContent.trim();
    try {
      const updated = await apiCall(`/api/tasks/${activeDetailTask.id}`, 'PUT', { description: newDesc });
      activeDetailTask.description = updated.description;
      btnSaveDesc.classList.add('hidden');
      await loadSession();
      renderKanbanTasks();
    } catch (err) {
      descEl.textContent = activeDetailTask.description;
      showErrorAlert('Update Failed', err.message);
    }
  });
  
  // Sidebar select elements inside Details modal
  document.getElementById('detail-task-status').addEventListener('change', async (e) => {
    if (!activeDetailTask) return;
    const newStatus = e.target.value;
    try {
      const updated = await apiCall(`/api/tasks/${activeDetailTask.id}`, 'PUT', { status: newStatus });
      activeDetailTask.status = updated.status;
      await loadSession();
      renderKanbanTasks();
    } catch (err) {
      e.target.value = activeDetailTask.status;
      showErrorAlert('Update Failed', err.message);
    }
  });
  
  document.getElementById('detail-task-priority').addEventListener('change', async (e) => {
    if (!activeDetailTask) return;
    const newPriority = e.target.value;
    try {
      const updated = await apiCall(`/api/tasks/${activeDetailTask.id}`, 'PUT', { priority: newPriority });
      activeDetailTask.priority = updated.priority;
      await loadSession();
      renderKanbanTasks();
    } catch (err) {
      e.target.value = activeDetailTask.priority;
      showErrorAlert('Update Failed', err.message);
    }
  });
  
  document.getElementById('detail-task-assignee').addEventListener('change', async (e) => {
    if (!activeDetailTask) return;
    const assigneeVal = e.target.value;
    const newAssigneeId = assigneeVal || null;
    try {
      const updated = await apiCall(`/api/tasks/${activeDetailTask.id}`, 'PUT', { assigneeId: newAssigneeId });
      activeDetailTask.assigneeId = updated.assigneeId;
      await loadSession();
      renderKanbanTasks();
    } catch (err) {
      e.target.value = activeDetailTask.assigneeId || '';
      showErrorAlert('Update Failed', err.message);
    }
  });
  
  document.getElementById('detail-task-due').addEventListener('change', async (e) => {
    if (!activeDetailTask) return;
    const newDue = e.target.value;
    try {
      const updated = await apiCall(`/api/tasks/${activeDetailTask.id}`, 'PUT', { dueDate: newDue });
      activeDetailTask.dueDate = updated.dueDate;
      await loadSession();
      renderKanbanTasks();
    } catch (err) {
      e.target.value = activeDetailTask.dueDate || '';
      showErrorAlert('Update Failed', err.message);
    }
  });
  
  // Delete Task Click
  document.getElementById('btn-delete-task').addEventListener('click', async () => {
    if (!activeDetailTask) return;
    
    // Quick confirmation
    if (confirm(`Are you sure you want to delete task "${activeDetailTask.title}"?`)) {
      try {
        await apiCall(`/api/tasks/${activeDetailTask.id}`, 'DELETE');
        closeModal(modalDetails);
        await loadSession();
        renderKanbanTasks();
      } catch (err) {
        showErrorAlert('Deletion Failed', err.message);
      }
    }
  });
  
  // Add Comment Form Submit
  document.getElementById('form-add-comment').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeDetailTask) return;
    
    const input = document.getElementById('new-comment-text');
    const text = input.value.trim();
    if (!text) return;
    
    try {
      const comment = await apiCall(`/api/tasks/${activeDetailTask.id}/comments`, 'POST', { text });
      
      // Push locally and re-render comments list
      if (!activeDetailTask.comments) activeDetailTask.comments = [];
      activeDetailTask.comments.push(comment);
      
      renderCommentsList(activeDetailTask.comments);
      input.value = '';
      
      // Update background board count
      await loadSession();
      renderKanbanTasks();
    } catch (err) {
      showErrorAlert('Comment Failed', err.message);
    }
  });
}

// POPULATE DROPDOWNS IN CREATE TASK MODAL
function populateCreateTaskModal() {
  // 1. Projects dropdown
  const projSelect = document.getElementById('new-task-project');
  projSelect.innerHTML = '';
  state.projects.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    if (p.id === state.activeProjectId) {
      opt.selected = true;
    }
    projSelect.appendChild(opt);
  });
  
  // 2. Assignee dropdown
  const assSelect = document.getElementById('new-task-assignee');
  assSelect.innerHTML = '<option value="">Unassigned</option>';
  
  // Only members of current org
  const orgMembers = state.allUsers.filter(u => u.organizationId === state.organization.id);
  orgMembers.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.name;
    assSelect.appendChild(opt);
  });
}

// OPEN DETAILED TASK MODAL
function openTaskDetailsModal(task) {
  activeDetailTask = task;
  
  // Set project details header
  const proj = state.projects.find(p => p.id === task.projectId);
  document.getElementById('detail-project-name').textContent = proj ? proj.name : 'Unknown Project';
  
  // Set title & desc editable content
  document.getElementById('detail-task-title').textContent = task.title;
  document.getElementById('detail-task-desc').textContent = task.description || '';
  document.getElementById('btn-save-desc').classList.add('hidden');
  
  // Populate dropdowns inside details
  document.getElementById('detail-task-status').value = task.status;
  document.getElementById('detail-task-priority').value = task.priority;
  document.getElementById('detail-task-due').value = task.dueDate || '';
  
  const assigneeSelect = document.getElementById('detail-task-assignee');
  assigneeSelect.innerHTML = '<option value="">Unassigned</option>';
  
  const orgMembers = state.allUsers.filter(u => u.organizationId === state.organization.id);
  orgMembers.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.name;
    if (m.id === task.assigneeId) {
      opt.selected = true;
    }
    assigneeSelect.appendChild(opt);
  });
  
  // Setup comment form avatar
  document.getElementById('comment-user-avatar').src = state.currentUser.avatar;
  document.getElementById('new-comment-text').value = '';
  
  // Load comments
  renderCommentsList(task.comments || []);
  
  // Show Modal
  openModal(document.getElementById('modal-task-details'));
}

// RENDER COMMENTS LIST
function renderCommentsList(comments) {
  const container = document.getElementById('detail-comments-list');
  container.innerHTML = '';
  
  if (comments.length === 0) {
    container.innerHTML = `<div class="empty-state">No comments yet. Start the conversation!</div>`;
    return;
  }
  
  comments.forEach(c => {
    const time = new Date(c.createdAt).toLocaleDateString(undefined, {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'});
    
    const div = document.createElement('div');
    div.className = 'comment-item';
    div.innerHTML = `
      <img src="${c.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80'}" alt="${escapeHTML(c.author)}" class="avatar-xs">
      <div style="flex-grow: 1;">
        <div class="comment-meta">
          <span class="comment-author">${escapeHTML(c.author)}</span>
          <span class="comment-time">${time}</span>
        </div>
        <div class="comment-body">${escapeHTML(c.text)}</div>
      </div>
    `;
    container.appendChild(div);
  });
  
  // Scroll to bottom
  container.scrollTop = container.scrollHeight;
}

// MODAL CONTROLLERS
function openModal(el) {
  el.classList.remove('hidden');
  lucide.createIcons();
}

function closeModal(el) {
  el.classList.add('hidden');
}

// SHOW LIMITS / ERROR PROMPT
function showErrorAlert(title, message) {
  const modalAlert = document.getElementById('modal-alert');
  document.getElementById('alert-modal-title').textContent = title;
  document.getElementById('alert-modal-message').textContent = message;
  
  const upgradeBtn = document.getElementById('btn-upgrade-alert-modal');
  if (title.toLowerCase().includes('limit') || title.toLowerCase().includes('quota') || title.toLowerCase().includes('cap')) {
    upgradeBtn.classList.remove('hidden');
  } else {
    upgradeBtn.classList.add('hidden');
  }
  
  openModal(modalAlert);
}

// HELPER UTILITIES
function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

function formatTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  
  let interval = Math.floor(seconds / 31536000);
  if (interval >= 1) return interval + 'y ago';
  interval = Math.floor(seconds / 2592000);
  if (interval >= 1) return interval + 'mo ago';
  interval = Math.floor(seconds / 86400);
  if (interval >= 1) return interval + 'd ago';
  interval = Math.floor(seconds / 3600);
  if (interval >= 1) return interval + 'h ago';
  interval = Math.floor(seconds / 60);
  if (interval >= 1) return interval + 'm ago';
  return 'just now';
}
