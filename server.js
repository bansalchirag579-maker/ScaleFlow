const express = require('express');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database with default seed data
db.initialize();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Middleware to simulate authentication using "x-user-id" header or fallback to User 1 (Alice)
app.use((req, res, next) => {
  const userIdHeader = req.headers['x-user-id'];
  let currentUserId = parseInt(userIdHeader) || 1;
  
  const currentUser = db.findOne('users', currentUserId);
  if (!currentUser) {
    // If headers specify a user that doesn't exist, fallback to first user
    const fallbackUser = db.findOne('users', 1);
    req.user = fallbackUser;
  } else {
    req.user = currentUser;
  }
  
  // Attach organization to request
  if (req.user) {
    req.org = db.findOne('organizations', req.user.organizationId);
  }
  next();
});

// Helper to log user activities
const logActivity = (orgId, user, action, target) => {
  db.insert('activity', {
    organizationId: orgId,
    user: user.name,
    avatar: user.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
    action: action,
    target: target
  });
};

// --- API ENDPOINTS ---

// 1. Session state & Stats API
app.get('/api/session', (req, res) => {
  if (!req.user || !req.org) {
    return res.status(401).json({ error: 'Unauthorized or Organization not found.' });
  }

  // Calculate usage statistics for limits checking
  const allUsers = db.find('users', u => u.organizationId === req.org.id);
  const allProjects = db.find('projects', p => p.organizationId === req.org.id);
  const allTasks = db.find('tasks', t => t.organizationId === req.org.id);

  // Define limits based on subscription tier
  const limits = {
    free: { projects: 2, tasks: 5, members: 3 },
    pro: { projects: 10, tasks: 50, members: 15 },
    enterprise: { projects: Infinity, tasks: Infinity, members: Infinity }
  };

  const currentLimits = limits[req.org.tier] || limits.free;

  res.json({
    user: req.user,
    organization: req.org,
    allUsers: db.find('users'), // List of all users in the system (for fast switching in demo)
    stats: {
      usersCount: allUsers.length,
      usersLimit: currentLimits.members,
      projectsCount: allProjects.length,
      projectsLimit: currentLimits.projects,
      tasksCount: allTasks.length,
      tasksLimit: currentLimits.tasks,
      tier: req.org.tier
    }
  });
});

// 2. Members Management API
app.get('/api/members', (req, res) => {
  const members = db.find('users', u => u.organizationId === req.org.id);
  res.json(members);
});

app.post('/api/members', (req, res) => {
  const { name, email, role, username } = req.body;
  if (!name || !email || !role || !username) {
    return res.status(400).json({ error: 'Name, email, username, and role are required.' });
  }

  // Check subscription limits
  const members = db.find('users', u => u.organizationId === req.org.id);
  const limits = {
    free: 3,
    pro: 15,
    enterprise: Infinity
  };
  const limit = limits[req.org.tier] || 3;
  if (members.length >= limit) {
    return res.status(403).json({
      error: `Upgrade required! Your organization is on the ${req.org.tier.toUpperCase()} tier, which allows a maximum of ${limit} members. Please upgrade your subscription.`
    });
  }

  // Simple avatar generator based on UI Avatars or random Unsplash
  const avatars = [
    "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80",
    "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=150&q=80",
    "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80",
    "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80"
  ];
  const avatar = avatars[members.length % avatars.length];

  const newMember = db.insert('users', {
    username: username.toLowerCase().replace(/\s+/g, ''),
    name,
    email,
    role,
    organizationId: req.org.id,
    avatar
  });

  logActivity(req.org.id, req.user, "invited team member", name);
  res.status(201).json(newMember);
});

// 3. Projects API
app.get('/api/projects', (req, res) => {
  const projects = db.find('projects', p => p.organizationId === req.org.id);
  res.json(projects);
});

app.post('/api/projects', (req, res) => {
  const { name, description } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Project name is required.' });
  }

  // Check subscription limits
  const projects = db.find('projects', p => p.organizationId === req.org.id);
  const limits = {
    free: 2,
    pro: 10,
    enterprise: Infinity
  };
  const limit = limits[req.org.tier] || 2;
  if (projects.length >= limit) {
    return res.status(403).json({
      error: `Upgrade required! Your organization is on the ${req.org.tier.toUpperCase()} tier, which allows a maximum of ${limit} projects. Please upgrade your subscription.`
    });
  }

  const newProject = db.insert('projects', {
    name,
    description: description || '',
    organizationId: req.org.id,
    status: 'active'
  });

  logActivity(req.org.id, req.user, "created project", name);
  res.status(201).json(newProject);
});

// 4. Tasks API
app.get('/api/tasks', (req, res) => {
  const { projectId } = req.query;
  let tasks;
  if (projectId) {
    tasks = db.find('tasks', t => t.organizationId === req.org.id && t.projectId === parseInt(projectId));
  } else {
    tasks = db.find('tasks', t => t.organizationId === req.org.id);
  }
  res.json(tasks);
});

app.post('/api/tasks', (req, res) => {
  const { projectId, title, description, priority, assigneeId, dueDate } = req.body;
  if (!projectId || !title) {
    return res.status(400).json({ error: 'Project ID and Title are required.' });
  }

  // Check project exists
  const project = db.findOne('projects', parseInt(projectId));
  if (!project || project.organizationId !== req.org.id) {
    return res.status(404).json({ error: 'Project not found.' });
  }

  // Check subscription limits
  const tasks = db.find('tasks', t => t.organizationId === req.org.id);
  const limits = {
    free: 5,
    pro: 50,
    enterprise: Infinity
  };
  const limit = limits[req.org.tier] || 5;
  if (tasks.length >= limit) {
    return res.status(403).json({
      error: `Upgrade required! Your organization is on the ${req.org.tier.toUpperCase()} tier, which allows a maximum of ${limit} tasks across all projects. Please upgrade your subscription.`
    });
  }

  const newTask = db.insert('tasks', {
    projectId: parseInt(projectId),
    organizationId: req.org.id,
    title,
    description: description || '',
    status: 'todo',
    priority: priority || 'medium',
    assigneeId: assigneeId ? parseInt(assigneeId) : null,
    dueDate: dueDate || '',
    comments: []
  });

  logActivity(req.org.id, req.user, "created task", title);
  res.status(201).json(newTask);
});

// Update task (e.g. moving on Kanban board or changing assignee)
app.put('/api/tasks/:id', (req, res) => {
  const taskId = parseInt(req.params.id);
  const task = db.findOne('tasks', taskId);

  if (!task || task.organizationId !== req.org.id) {
    return res.status(404).json({ error: 'Task not found.' });
  }

  const { status, assigneeId, priority, title, description, dueDate } = req.body;
  const updates = {};
  
  let changeLogged = false;

  if (status && status !== task.status) {
    updates.status = status;
    const readableStatus = status.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
    logActivity(req.org.id, req.user, `moved task to "${readableStatus}"`, task.title);
    changeLogged = true;
  }

  if (assigneeId !== undefined) {
    const cleanAssigneeId = assigneeId ? parseInt(assigneeId) : null;
    if (cleanAssigneeId !== task.assigneeId) {
      updates.assigneeId = cleanAssigneeId;
      if (cleanAssigneeId) {
        const assigneeUser = db.findOne('users', cleanAssigneeId);
        if (assigneeUser) {
          logActivity(req.org.id, req.user, `assigned task to ${assigneeUser.name}`, task.title);
          changeLogged = true;
        }
      } else {
        logActivity(req.org.id, req.user, "unassigned task", task.title);
        changeLogged = true;
      }
    }
  }

  if (priority) updates.priority = priority;
  if (title) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (dueDate !== undefined) updates.dueDate = dueDate;

  const updatedTask = db.update('tasks', taskId, updates);
  
  if (!changeLogged) {
    logActivity(req.org.id, req.user, "updated details of task", task.title);
  }

  res.json(updatedTask);
});

// Delete task
app.delete('/api/tasks/:id', (req, res) => {
  const taskId = parseInt(req.params.id);
  const task = db.findOne('tasks', taskId);

  if (!task || task.organizationId !== req.org.id) {
    return res.status(404).json({ error: 'Task not found.' });
  }

  db.delete('tasks', taskId);
  logActivity(req.org.id, req.user, "deleted task", task.title);
  res.json({ success: true, message: `Task "${task.title}" deleted successfully.` });
});

// Add comment to task
app.post('/api/tasks/:id/comments', (req, res) => {
  const taskId = parseInt(req.params.id);
  const task = db.findOne('tasks', taskId);

  if (!task || task.organizationId !== req.org.id) {
    return res.status(404).json({ error: 'Task not found.' });
  }

  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Comment text is required.' });
  }

  const comments = task.comments || [];
  const newCommentId = comments.length > 0 ? Math.max(...comments.map(c => c.id)) + 1 : 1;
  
  const comment = {
    id: newCommentId,
    author: req.user.name,
    avatar: req.user.avatar,
    text,
    createdAt: new Date().toISOString()
  };

  comments.push(comment);
  db.update('tasks', taskId, { comments });
  logActivity(req.org.id, req.user, "commented on task", task.title);

  res.status(201).json(comment);
});

// 5. Subscription & Billing API
app.put('/api/organization/tier', (req, res) => {
  const { tier } = req.body;
  if (!['free', 'pro', 'enterprise'].includes(tier)) {
    return res.status(400).json({ error: 'Invalid tier. Choose free, pro, or enterprise.' });
  }

  // Verify authorization (only admins can change subscription plans)
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only administrators can update subscription plans.' });
  }

  // Update organization tier
  const updatedOrg = db.update('organizations', req.org.id, { tier });
  
  logActivity(req.org.id, req.user, "upgraded subscription to tier", tier.toUpperCase());
  res.json(updatedOrg);
});

// 6. Activity log API
app.get('/api/activity', (req, res) => {
  // Return logs for organization, sorted by timestamp descending
  const logs = db.find('activity', a => a.organizationId === req.org.id);
  logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json(logs.slice(0, 50)); // Limit to last 50 activities
});

// Start server
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`  SaaS Team Management System listening on port ${PORT}`);
  console.log(`  Local Address: http://localhost:${PORT}`);
  console.log(`==================================================`);
});
