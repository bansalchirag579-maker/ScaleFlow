const mongoose = require('mongoose');

const schemaOptions = {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
};

// 1. Organization Schema
const OrganizationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  tier: { type: String, enum: ['free', 'pro', 'enterprise'], default: 'free' },
  createdAt: { type: Date, default: Date.now }
}, schemaOptions);

// 2. User Schema (Hashed passwords, unique keys)
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, enum: ['admin', 'manager', 'member'], default: 'member' },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  avatar: { type: String },
  createdAt: { type: Date, default: Date.now }
}, schemaOptions);

// 3. Project Schema
const ProjectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  status: { type: String, default: 'active' },
  createdAt: { type: Date, default: Date.now }
}, schemaOptions);

// 4. Task Schema
const TaskCommentSchema = new mongoose.Schema({
  author: { type: String, required: true },
  avatar: { type: String },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
}, schemaOptions);

const TaskSchema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  title: { type: String, required: true },
  description: { type: String },
  status: { type: String, enum: ['todo', 'in_progress', 'in_review', 'done'], default: 'todo' },
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  assigneeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  dueDate: { type: String },
  comments: [TaskCommentSchema],
  createdAt: { type: Date, default: Date.now }
}, schemaOptions);

// 5. Activity Audit Schema
const ActivitySchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  user: { type: String, required: true },
  avatar: { type: String },
  action: { type: String, required: true },
  target: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
}, schemaOptions);

module.exports = {
  Organization: mongoose.model('Organization', OrganizationSchema),
  User: mongoose.model('User', UserSchema),
  Project: mongoose.model('Project', ProjectSchema),
  Task: mongoose.model('Task', TaskSchema),
  Activity: mongoose.model('Activity', ActivitySchema)
};
