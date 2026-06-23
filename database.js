const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');

// Make sure the data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Helper to get filepath for a table
const getFilePath = (table) => path.join(DATA_DIR, `${table}.json`);

// Helper to read data from a table file
const readTable = (table) => {
  const filePath = getFilePath(table);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content || '[]');
  } catch (error) {
    console.error(`Error reading database table "${table}":`, error);
    return [];
  }
};

// Helper to write data to a table file
const writeTable = (table, data) => {
  const filePath = getFilePath(table);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error(`Error writing database table "${table}":`, error);
    return false;
  }
};

// Generic DB client wrapper
const db = {
  // Query all items matching a predicate or all if no predicate
  find: (table, predicate = () => true) => {
    const data = readTable(table);
    return data.filter(predicate);
  },

  // Query one item matching a predicate or by ID
  findOne: (table, predicateOrId) => {
    const data = readTable(table);
    if (typeof predicateOrId === 'function') {
      return data.find(predicateOrId) || null;
    }
    return data.find(item => item.id === predicateOrId) || null;
  },

  // Insert a new item with auto-increment ID
  insert: (table, item) => {
    const data = readTable(table);
    
    // Auto-generate numeric ID or string slug
    let nextId = 1;
    if (data.length > 0) {
      const maxId = Math.max(...data.map(i => typeof i.id === 'number' ? i.id : parseInt(i.id) || 0));
      nextId = maxId + 1;
    }
    
    const newItem = {
      id: nextId,
      createdAt: new Date().toISOString(),
      ...item
    };
    
    data.push(newItem);
    writeTable(table, data);
    return newItem;
  },

  // Update an existing item
  update: (table, id, updates) => {
    const data = readTable(table);
    const index = data.findIndex(item => item.id === id);
    if (index === -1) return null;

    data[index] = {
      ...data[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    writeTable(table, data);
    return data[index];
  },

  // Delete an item by ID
  delete: (table, id) => {
    const data = readTable(table);
    const index = data.findIndex(item => item.id === id);
    if (index === -1) return false;

    data.splice(index, 1);
    writeTable(table, data);
    return true;
  },

  // Initialize DB tables with seed data if empty
  initialize: () => {
    // 1. Seed Organizations
    if (readTable('organizations').length === 0) {
      console.log('Seeding default organizations...');
      const orgs = [
        {
          id: 1,
          name: "Acme Cloud Corp",
          slug: "acme-cloud",
          tier: "pro", // pro, free, enterprise
          createdAt: new Date().toISOString()
        },
        {
          id: 2,
          name: "Initech Software",
          slug: "initech",
          tier: "free",
          createdAt: new Date().toISOString()
        }
      ];
      writeTable('organizations', orgs);
    }

    // 2. Seed Users
    if (readTable('users').length === 0) {
      console.log('Seeding default users...');
      const users = [
        {
          id: 1,
          username: "alice",
          name: "Alice Smith",
          email: "alice@acme.com",
          role: "admin", // admin, manager, member
          organizationId: 1,
          avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80",
          createdAt: new Date().toISOString()
        },
        {
          id: 2,
          username: "bob",
          name: "Bob Jones",
          email: "bob@acme.com",
          role: "manager",
          organizationId: 1,
          avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80",
          createdAt: new Date().toISOString()
        },
        {
          id: 3,
          username: "charlie",
          name: "Charlie Brown",
          email: "charlie@acme.com",
          role: "member",
          organizationId: 1,
          avatar: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=150&q=80",
          createdAt: new Date().toISOString()
        },
        {
          id: 4,
          username: "peter",
          name: "Peter Gibbons",
          email: "peter@initech.com",
          role: "admin",
          organizationId: 2,
          avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80",
          createdAt: new Date().toISOString()
        },
        {
          id: 5,
          username: "samir",
          name: "Samir Nagheenanajar",
          email: "samir@initech.com",
          role: "member",
          organizationId: 2,
          avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80",
          createdAt: new Date().toISOString()
        }
      ];
      writeTable('users', users);
    }

    // 3. Seed Projects
    if (readTable('projects').length === 0) {
      console.log('Seeding default projects...');
      const projects = [
        {
          id: 1,
          name: "Cloud Platform Migration",
          description: "Migrating legacy core servers to serverless cloud infrastructure.",
          organizationId: 1,
          status: "active",
          createdAt: new Date().toISOString()
        },
        {
          id: 2,
          name: "Mobile App Redesign",
          description: "Overhauling the iOS and Android application UI and experience.",
          organizationId: 1,
          status: "active",
          createdAt: new Date().toISOString()
        },
        {
          id: 3,
          name: "TPS Reports System",
          description: "Automating the delivery of TPS reports with new cover sheets.",
          organizationId: 2,
          status: "active",
          createdAt: new Date().toISOString()
        }
      ];
      writeTable('projects', projects);
    }

    // 4. Seed Tasks
    if (readTable('tasks').length === 0) {
      console.log('Seeding default tasks...');
      const tasks = [
        {
          id: 1,
          projectId: 1,
          organizationId: 1,
          title: "Setup Kubernetes clusters",
          description: "Configure staging and production K8s clusters in AWS.",
          status: "in_progress", // todo, in_progress, in_review, done
          priority: "high", // low, medium, high
          assigneeId: 2,
          dueDate: "2026-07-15",
          comments: [
            { id: 1, author: "Alice Smith", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80", text: "Please use Terraform for the config.", createdAt: new Date().toISOString() }
          ],
          createdAt: new Date().toISOString()
        },
        {
          id: 2,
          projectId: 1,
          organizationId: 1,
          title: "Migrate Auth Service to JWT",
          description: "Replace legacy cookie sessions with secure stateless JWT authorization.",
          status: "done",
          priority: "high",
          assigneeId: 1,
          dueDate: "2026-06-10",
          comments: [],
          createdAt: new Date().toISOString()
        },
        {
          id: 3,
          projectId: 1,
          organizationId: 1,
          title: "Database replication testing",
          description: "Conduct load testing and failover simulation on replica DB instances.",
          status: "todo",
          priority: "medium",
          assigneeId: 3,
          dueDate: "2026-07-20",
          comments: [],
          createdAt: new Date().toISOString()
        },
        {
          id: 4,
          projectId: 2,
          organizationId: 1,
          title: "Design Figma layouts for Home screen",
          description: "Create interactive wireframes for the redesigned home and navigation tabs.",
          status: "in_review",
          priority: "high",
          assigneeId: 2,
          dueDate: "2026-06-30",
          comments: [
            { id: 1, author: "Alice Smith", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80", text: "The profile icon should be moved to the top right corner.", createdAt: new Date().toISOString() }
          ],
          createdAt: new Date().toISOString()
        },
        {
          id: 5,
          projectId: 2,
          organizationId: 1,
          title: "Setup React Native codebase",
          description: "Boilertplate app initialization and setup main navigation routing package.",
          status: "todo",
          priority: "low",
          assigneeId: 3,
          dueDate: "2026-08-01",
          comments: [],
          createdAt: new Date().toISOString()
        },
        {
          id: 6,
          projectId: 3,
          organizationId: 2,
          title: "Design new cover sheets",
          description: "Draft standard layouts for the new required TPS report cover sheets.",
          status: "in_progress",
          priority: "high",
          assigneeId: 5,
          dueDate: "2026-06-25",
          comments: [
            { id: 1, author: "Peter Gibbons", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80", text: "Did you get the memo about this?", createdAt: new Date().toISOString() }
          ],
          createdAt: new Date().toISOString()
        }
      ];
      writeTable('tasks', tasks);
    }

    // 5. Seed Activity Logs
    if (readTable('activity').length === 0) {
      console.log('Seeding default activity logs...');
      const activity = [
        {
          id: 1,
          organizationId: 1,
          user: "Alice Smith",
          avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80",
          action: "completed task",
          target: "Migrate Auth Service to JWT",
          timestamp: new Date(Date.now() - 4 * 3600000).toISOString()
        },
        {
          id: 2,
          organizationId: 1,
          user: "Bob Jones",
          avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80",
          action: "updated status of",
          target: "Setup Kubernetes clusters",
          timestamp: new Date(Date.now() - 2.5 * 3600000).toISOString()
        },
        {
          id: 3,
          organizationId: 1,
          user: "Alice Smith",
          avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80",
          action: "commented on",
          target: "Design Figma layouts for Home screen",
          timestamp: new Date(Date.now() - 1 * 3600000).toISOString()
        },
        {
          id: 4,
          organizationId: 2,
          user: "Peter Gibbons",
          avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80",
          action: "added comment to",
          target: "Design new cover sheets",
          timestamp: new Date(Date.now() - 1.2 * 3600000).toISOString()
        }
      ];
      writeTable('activity', activity);
    }

    console.log('Database initialized and seeded.');
  }
};

module.exports = db;
