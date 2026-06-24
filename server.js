require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Organization, User, Project, Task, Activity } = require('./models');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/scaleflow';
const JWT_SECRET = process.env.JWT_SECRET || 'scaleflow_jwt_super_secret_key';

// Connect to MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Successfully connected to MongoDB');
    seedDatabase();
  })
  .catch(err => {
    console.error('Error connecting to MongoDB:', err);
  });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// JWT Authentication Middleware
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
    }
    
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: User not found' });
    }
    
    const org = await Organization.findById(user.organizationId);
    if (!org) {
      return res.status(401).json({ error: 'Unauthorized: Organization not found' });
    }
    
    req.user = user;
    req.org = org;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token session' });
  }
};

// Helper to log user activities in DB
const logActivity = async (orgId, user, action, target) => {
  try {
    await Activity.create({
      organizationId: orgId,
      user: user.name,
      avatar: user.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
      action: action,
      target: target
    });
  } catch (err) {
    console.error('Activity logging failed:', err);
  }
};

// Diagnostic Endpoint for checking DB connectivity
app.get('/api/diag', (req, res) => {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };
  res.json({
    status: 'ok',
    dbState: states[mongoose.connection.readyState] || 'unknown',
    envUriPresent: !!process.env.MONGODB_URI,
    envSecretPresent: !!process.env.JWT_SECRET
  });
});

// --- AUTH & PUBLIC APIs ---

// 1. Register API (Create Organization + Admin user)
app.post('/api/auth/register', async (req, res) => {
  const { name, username, email, password, organizationName } = req.body;
  if (!name || !username || !email || !password || !organizationName) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  try {
    // Check if user already exists
    const userExists = await User.findOne({ $or: [{ username }, { email }] });
    if (userExists) {
      return res.status(400).json({ error: 'Username or Email is already registered.' });
    }

    // Generate Organization Slug
    const slug = organizationName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const orgExists = await Organization.findOne({ slug });
    if (orgExists) {
      return res.status(400).json({ error: 'Organization name is already taken.' });
    }

    // Create Organization
    const org = await Organization.create({
      name: organizationName,
      slug,
      tier: 'free' // Default Free tier
    });

    // Hash Password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create Admin User
    const user = await User.create({
      username: username.toLowerCase().replace(/\s+/g, ''),
      email,
      password: hashedPassword,
      name,
      role: 'admin',
      organizationId: org._id,
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80'
    });

    // Generate JWT
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });

    await logActivity(org._id, user, "created organization", organizationName);

    res.status(201).json({ token, user });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration.' });
  }
});

// 2. Login API
app.post('/api/auth/login', async (req, res) => {
  const { usernameOrEmail, password } = req.body;
  if (!usernameOrEmail || !password) {
    return res.status(400).json({ error: 'Username/Email and Password are required.' });
  }

  try {
    // Find User by username or email
    const user = await User.findOne({
      $or: [
        { username: usernameOrEmail.toLowerCase() },
        { email: usernameOrEmail.toLowerCase() }
      ]
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials.' });
    }

    // Check Password
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(400).json({ error: 'Invalid credentials.' });
    }

    // Generate JWT
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });

    res.json({ token, user });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

// 3. Switch Demo Identity API (demo switcher endpoint)
app.post('/api/auth/switch-demo-identity', async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required.' });
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Demo user not found.' });
    }

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user });
  } catch (error) {
    console.error('Demo switch error:', error);
    res.status(500).json({ error: 'Server error during demo switch.' });
  }
});

// --- AUTHENTICATED APIs (Use authMiddleware) ---

// 4. Session & Quota limits checking
app.get('/api/session', authMiddleware, async (req, res) => {
  try {
    // Count current allocations
    const usersCount = await User.countDocuments({ organizationId: req.org._id });
    const projectsCount = await Project.countDocuments({ organizationId: req.org._id });
    const tasksCount = await Task.countDocuments({ organizationId: req.org._id });

    // Quotas limit configuration mapping
    const limits = {
      free: { projects: 2, tasks: 5, members: 3 },
      pro: { projects: 10, tasks: 50, members: 15 },
      enterprise: { projects: Infinity, tasks: Infinity, members: Infinity }
    };

    const currentLimits = limits[req.org.tier] || limits.free;
    
    // Fetch all users in the system (for identity switcher simulation)
    const allUsers = await User.find({}, 'name role organizationId avatar');

    res.json({
      user: {
        id: req.user._id,
        name: req.user.name,
        username: req.user.username,
        email: req.user.email,
        role: req.user.role,
        avatar: req.user.avatar
      },
      organization: req.org,
      allUsers,
      stats: {
        usersCount,
        usersLimit: currentLimits.members,
        projectsCount,
        projectsLimit: currentLimits.projects,
        tasksCount,
        tasksLimit: currentLimits.tasks,
        tier: req.org.tier
      }
    });
  } catch (error) {
    console.error('Session API error:', error);
    res.status(500).json({ error: 'Failed to retrieve session statistics.' });
  }
});

// 5. Members List API
app.get('/api/members', authMiddleware, async (req, res) => {
  try {
    const members = await User.find({ organizationId: req.org._id }, 'name username email role avatar createdAt');
    res.json(members);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve members.' });
  }
});

// 6. Invite Member API (checks limits!)
app.post('/api/members', authMiddleware, async (req, res) => {
  const { name, email, role, username, password } = req.body;
  if (!name || !email || !role || !username || !password) {
    return res.status(400).json({ error: 'Name, email, username, role, and temporary password are required.' });
  }

  // Authorization check: Only admin and manager can invite members
  if (req.user.role !== 'admin' && req.user.role !== 'manager') {
    return res.status(403).json({ error: 'Access Restrained: Only administrators and managers can invite new members.' });
  }

  try {
    // Check tier limits
    const membersCount = await User.countDocuments({ organizationId: req.org._id });
    const limits = { free: 3, pro: 15, enterprise: Infinity };
    const limit = limits[req.org.tier] || 3;
    
    if (membersCount >= limit) {
      return res.status(403).json({
        error: `Upgrade required! Your organization is on the ${req.org.tier.toUpperCase()} tier, which allows a maximum of ${limit} members. Please upgrade your subscription.`
      });
    }

    // Check duplicate
    const userExists = await User.findOne({ $or: [{ username }, { email }] });
    if (userExists) {
      return res.status(400).json({ error: 'Username or Email is already registered.' });
    }

    // Default password for invited member (hash password)
    const hashedPassword = await bcrypt.hash(password || 'password123', 10);

    const avatars = [
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80",
      "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=150&q=80",
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80",
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80"
    ];
    const avatar = avatars[membersCount % avatars.length];

    const newUser = await User.create({
      username: username.toLowerCase().replace(/\s+/g, ''),
      email,
      password: hashedPassword,
      name,
      role,
      organizationId: req.org._id,
      avatar
    });

    await logActivity(req.org._id, req.user, "invited team member", name);
    res.status(201).json(newUser);
  } catch (error) {
    console.error('Invite error:', error);
    res.status(500).json({ error: 'Failed to create team member.' });
  }
});

// 7. Projects API
app.get('/api/projects', authMiddleware, async (req, res) => {
  try {
    const projects = await Project.find({ organizationId: req.org._id });
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve projects.' });
  }
});

app.post('/api/projects', authMiddleware, async (req, res) => {
  const { name, description } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Project name is required.' });
  }

  // Authorization check: Only admin and manager can create projects
  if (req.user.role !== 'admin' && req.user.role !== 'manager') {
    return res.status(403).json({ error: 'Access Restrained: Only administrators and managers can create projects.' });
  }

  try {
    // Check limits
    const projectsCount = await Project.countDocuments({ organizationId: req.org._id });
    const limits = { free: 2, pro: 10, enterprise: Infinity };
    const limit = limits[req.org.tier] || 2;
    
    if (projectsCount >= limit) {
      return res.status(403).json({
        error: `Upgrade required! Your organization is on the ${req.org.tier.toUpperCase()} tier, which allows a maximum of ${limit} projects. Please upgrade your subscription.`
      });
    }

    const newProject = await Project.create({
      name,
      description: description || '',
      organizationId: req.org._id,
      status: 'active'
    });

    await logActivity(req.org._id, req.user, "created project", name);
    res.status(201).json(newProject);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create project.' });
  }
});

// 8. Tasks API
app.get('/api/tasks', authMiddleware, async (req, res) => {
  const { projectId } = req.query;
  try {
    const query = { organizationId: req.org._id };
    if (projectId) {
      query.projectId = projectId;
    }
    const tasks = await Task.find(query);
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve tasks.' });
  }
});

app.post('/api/tasks', authMiddleware, async (req, res) => {
  const { projectId, title, description, priority, assigneeId, dueDate } = req.body;
  if (!projectId || !title) {
    return res.status(400).json({ error: 'Project ID and Title are required.' });
  }

  // Authorization check: Only admin and manager can create tasks
  if (req.user.role !== 'admin' && req.user.role !== 'manager') {
    return res.status(403).json({ error: 'Access Restrained: Only administrators and managers can create tasks.' });
  }

  try {
    // Validate project
    const project = await Project.findOne({ _id: projectId, organizationId: req.org._id });
    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    // Check limits
    const tasksCount = await Task.countDocuments({ organizationId: req.org._id });
    const limits = { free: 5, pro: 50, enterprise: Infinity };
    const limit = limits[req.org.tier] || 5;
    
    if (tasksCount >= limit) {
      return res.status(403).json({
        error: `Upgrade required! Your organization is on the ${req.org.tier.toUpperCase()} tier, which allows a maximum of ${limit} tasks. Please upgrade your subscription.`
      });
    }

    const newTask = await Task.create({
      projectId,
      organizationId: req.org._id,
      title,
      description: description || '',
      status: 'todo',
      priority: priority || 'medium',
      assigneeId: assigneeId || null,
      dueDate: dueDate || '',
      comments: []
    });

    await logActivity(req.org._id, req.user, "created task", title);
    res.status(201).json(newTask);
  } catch (error) {
    console.error('Task creation error:', error);
    res.status(500).json({ error: 'Failed to create task.' });
  }
});

app.put('/api/tasks/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const task = await Task.findOne({ _id: id, organizationId: req.org._id });
    if (!task) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    // Authorization check
    const isAssignee = String(task.assigneeId) === String(req.user._id);
    const isAdminOrManager = (req.user.role === 'admin' || req.user.role === 'manager');
    
    if (!isAdminOrManager && !isAssignee) {
      return res.status(403).json({ error: 'Access Restrained: Members can only edit tasks assigned to them.' });
    }

    const { status, assigneeId, priority, title, description, dueDate } = req.body;
    
    // For members, restrict changing metadata
    if (!isAdminOrManager) {
      if (assigneeId !== undefined || priority !== undefined || dueDate !== undefined) {
        return res.status(403).json({ error: 'Access Restrained: Only administrators and managers can edit task priority, assignee, or due dates.' });
      }
    }
    
    let changeLogged = false;

    if (status && status !== task.status) {
      task.status = status;
      const readableStatus = status.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
      await logActivity(req.org._id, req.user, `moved task to "${readableStatus}"`, task.title);
      changeLogged = true;
    }

    if (assigneeId !== undefined) {
      const cleanAssigneeId = assigneeId || null;
      if (String(cleanAssigneeId) !== String(task.assigneeId)) {
        task.assigneeId = cleanAssigneeId;
        if (cleanAssigneeId) {
          const assigneeUser = await User.findById(cleanAssigneeId);
          if (assigneeUser) {
            await logActivity(req.org._id, req.user, `assigned task to ${assigneeUser.name}`, task.title);
            changeLogged = true;
          }
        } else {
          await logActivity(req.org._id, req.user, "unassigned task", task.title);
          changeLogged = true;
        }
      }
    }

    if (priority) task.priority = priority;
    if (title) task.title = title;
    if (description !== undefined) task.description = description;
    if (dueDate !== undefined) task.dueDate = dueDate;

    const saved = await task.save();
    
    if (!changeLogged) {
      await logActivity(req.org._id, req.user, "updated details of task", task.title);
    }

    res.json(saved);
  } catch (error) {
    console.error('Task update error:', error);
    res.status(500).json({ error: 'Failed to update task.' });
  }
});

app.delete('/api/tasks/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  
  // Authorization check: Only admin and manager can delete tasks
  if (req.user.role !== 'admin' && req.user.role !== 'manager') {
    return res.status(403).json({ error: 'Access Restrained: Only administrators and managers can delete tasks.' });
  }

  try {
    const task = await Task.findOneAndDelete({ _id: id, organizationId: req.org._id });
    if (!task) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    await logActivity(req.org._id, req.user, "deleted task", task.title);
    res.json({ success: true, message: `Task "${task.title}" deleted.` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete task.' });
  }
});

app.post('/api/tasks/:id/comments', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Comment text is required.' });
  }

  try {
    const task = await Task.findOne({ _id: id, organizationId: req.org._id });
    if (!task) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    const comment = {
      author: req.user.name,
      avatar: req.user.avatar,
      text,
      createdAt: new Date()
    };

    task.comments.push(comment);
    await task.save();
    
    // Return the newly created comment (the last one in the array)
    const newComment = task.comments[task.comments.length - 1];

    await logActivity(req.org._id, req.user, "commented on task", task.title);
    res.status(201).json(newComment);
  } catch (error) {
    console.error('Comment error:', error);
    res.status(500).json({ error: 'Failed to add comment.' });
  }
});

// 9. Billing Upgrade API
app.put('/api/organization/tier', authMiddleware, async (req, res) => {
  const { tier } = req.body;
  if (!['free', 'pro', 'enterprise'].includes(tier)) {
    return res.status(400).json({ error: 'Invalid tier. Choose free, pro, or enterprise.' });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only administrators can update subscription plans.' });
  }

  try {
    req.org.tier = tier;
    const updated = await req.org.save();

    await logActivity(req.org._id, req.user, "upgraded subscription to tier", tier.toUpperCase());
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update organization plan.' });
  }
});

// 10. Audit Activity Logs API
app.get('/api/activity', authMiddleware, async (req, res) => {
  try {
    const activities = await Activity.find({ organizationId: req.org._id })
      .sort({ timestamp: -1 })
      .limit(50);
    res.json(activities);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve activity log.' });
  }
});

// --- MONGODB SEEDING LOGIC ---
const seedDatabase = async () => {
  try {
    const userCount = await User.countDocuments();
    if (userCount > 0) {
      console.log('Database already has users. Skipping seed.');
      return;
    }
    
    console.log('Database is empty. Seeding default data...');
    
    const acmeOrg = await Organization.create({
      name: "Acme Cloud Corp",
      slug: "acme-cloud",
      tier: "pro"
    });
    
    const initechOrg = await Organization.create({
      name: "Initech Software",
      slug: "initech",
      tier: "free"
    });
    
    const hashedPassword = await bcrypt.hash("password123", 10);
    
    const alice = await User.create({
      username: "alice",
      email: "alice@acme.com",
      password: hashedPassword,
      name: "Alice Smith",
      role: "admin",
      organizationId: acmeOrg._id,
      avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80"
    });
    
    const bob = await User.create({
      username: "bob",
      email: "bob@acme.com",
      password: hashedPassword,
      name: "Bob Jones",
      role: "manager",
      organizationId: acmeOrg._id,
      avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80"
    });
    
    const charlie = await User.create({
      username: "charlie",
      email: "charlie@acme.com",
      password: hashedPassword,
      name: "Charlie Brown",
      role: "member",
      organizationId: acmeOrg._id,
      avatar: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=150&q=80"
    });
    
    const peter = await User.create({
      username: "peter",
      email: "peter@initech.com",
      password: hashedPassword,
      name: "Peter Gibbons",
      role: "admin",
      organizationId: initechOrg._id,
      avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80"
    });
    
    const samir = await User.create({
      username: "samir",
      email: "samir@initech.com",
      password: hashedPassword,
      name: "Samir Nagheenanajar",
      role: "member",
      organizationId: initechOrg._id,
      avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80"
    });
    
    const acmeProj1 = await Project.create({
      name: "Cloud Platform Migration",
      description: "Migrating legacy core servers to serverless cloud infrastructure.",
      organizationId: acmeOrg._id,
      status: "active"
    });
    
    const acmeProj2 = await Project.create({
      name: "Mobile App Redesign",
      description: "Overhauling the iOS and Android application UI and experience.",
      organizationId: acmeOrg._id,
      status: "active"
    });
    
    const initechProj = await Project.create({
      name: "TPS Reports System",
      description: "Automating the delivery of TPS reports with new cover sheets.",
      organizationId: initechOrg._id,
      status: "active"
    });
    
    await Task.create([
      {
        projectId: acmeProj1._id,
        organizationId: acmeOrg._id,
        title: "Setup Kubernetes clusters",
        description: "Configure staging and production K8s clusters in AWS.",
        status: "in_progress",
        priority: "high",
        assigneeId: bob._id,
        dueDate: "2026-07-15",
        comments: [
          { author: "Alice Smith", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80", text: "Please use Terraform for the config." }
        ]
      },
      {
        projectId: acmeProj1._id,
        organizationId: acmeOrg._id,
        title: "Migrate Auth Service to JWT",
        description: "Replace legacy cookie sessions with secure stateless JWT authorization.",
        status: "done",
        priority: "high",
        assigneeId: alice._id,
        dueDate: "2026-06-10",
        comments: []
      },
      {
        projectId: acmeProj1._id,
        organizationId: acmeOrg._id,
        title: "Database replication testing",
        description: "Conduct load testing and failover simulation on replica DB instances.",
        status: "todo",
        priority: "medium",
        assigneeId: charlie._id,
        dueDate: "2026-07-20",
        comments: []
      },
      {
        projectId: acmeProj2._id,
        organizationId: acmeOrg._id,
        title: "Design Figma layouts for Home screen",
        description: "Create interactive wireframes for the redesigned home and navigation tabs.",
        status: "in_review",
        priority: "high",
        assigneeId: bob._id,
        dueDate: "2026-06-30",
        comments: [
          { author: "Alice Smith", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80", text: "The profile icon should be moved to the top right corner." }
        ]
      },
      {
        projectId: initechProj._id,
        organizationId: initechOrg._id,
        title: "Design new cover sheets",
        description: "Draft standard layouts for the new required TPS report cover sheets.",
        status: "in_progress",
        priority: "high",
        assigneeId: samir._id,
        dueDate: "2026-06-25",
        comments: [
          { author: "Peter Gibbons", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80", text: "Did you get the memo about this?" }
        ]
      }
    ]);
    
    await Activity.create([
      {
        organizationId: acmeOrg._id,
        user: "Alice Smith",
        avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80",
        action: "completed task",
        target: "Migrate Auth Service to JWT",
        timestamp: new Date(Date.now() - 4 * 3600000)
      },
      {
        organizationId: acmeOrg._id,
        user: "Bob Jones",
        avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80",
        action: "updated status of",
        target: "Setup Kubernetes clusters",
        timestamp: new Date(Date.now() - 2.5 * 3600000)
      },
      {
        organizationId: initechOrg._id,
        user: "Peter Gibbons",
        avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80",
        action: "added comment to",
        target: "Design new cover sheets",
        timestamp: new Date(Date.now() - 1.2 * 3600000)
      }
    ]);
    
    console.log('Database successfully seeded with default MongoDB structures.');
  } catch (error) {
    console.error('Error seeding MongoDB database:', error);
  }
};

// Start server
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`  SaaS Team Management System listening on port ${PORT}`);
  console.log(`==================================================`);
});
