# ScaleFlow | SaaS Team & Kanban Management System

ScaleFlow is a premium, full-stack **SaaS Team Management System** built with **Node.js** and **Express** on the backend, **MongoDB** on the database tier, and **Vanilla CSS + HTML5** on the frontend. The project is designed with a modern glassmorphism dark mode UI, and features a multi-tenant structure with secure JWT authentication, user role management, resource allocation quotas, and an interactive Kanban board.

## 🔗 Live Deployment

The system is deployed live on Render and connected to a MongoDB Atlas cluster:
👉 **[ScaleFlow Live Demo](https://scaleflow-h7b5.onrender.com)**

---

## 🔑 Demo Access Credentials

To log in and experience the workspace immediately, use the pre-seeded account:
*   **Username**: `alice`
*   **Password**: `password123`
*(This grants you full **Admin** permissions on the pre-configured **Pro Tier** workspace).*

---

## ⚡ Key Features

*   **MongoDB Atlas Database Tier**: High-availability database layer utilizing Mongoose schemas for Organizations, Users, Projects, Tasks, and Activities.
*   **Secure Auth Portal**: Modern glassmorphic login and registration page featuring JWT token validation, secure password hashing with `bcryptjs`, and dynamic tenant creation.
*   **SaaS Resource Quotas & Limits**: Enforces strict tiers (**Free**, **Pro**, **Enterprise**) restricting projects, tasks, and team members on the server. Exceeding limits prompts the user to upgrade.
*   **Tenant Separation**: Total multi-tenant isolation where each user belongs to an organization document and can only access data belonging to their workspace.
*   **Role-Based Access Control (RBAC)**: Enforces permissions based on user roles:
    *   **Admin / Manager**: Can invite members (specifying temporary passwords), create projects, create/delete tasks, and modify all metadata (assignees, priorities, due dates).
    *   **Member**: Restricted to editing details/status of tasks explicitly assigned to them. Cannot invite members, create projects/tasks, or reassign priorities/due dates.
*   **Interactive Kanban Board**: Dynamic drag-and-drop board. Moving cards triggers REST API sync. Regular members are restricted from dragging tasks not assigned to them.
*   **Discussion Feed**: Interactive comment threads within tasks for collaborative updates.
*   **Natively-Rendered Metrics**: Interactive HTML5 Canvas chart plotting task status distributions.
*   **Activity Logs**: Fully-audited trail of actions taken in the organization workspace.
*   **Identity Switcher Simulation**: Dropdown selector in the sidebar allows developers/testers to hot-swap between multiple seeded roles on the fly using a mock JWT generation backend.

---

## 🛠️ Tech Stack

*   **Backend**: Node.js, Express.js, Mongoose, JSON Web Tokens (JWT), BcryptJS
*   **Frontend**: HTML5, Vanilla CSS (CSS Variables, Flexbox, Grid), ES6 Javascript
*   **Database**: MongoDB (Mongoose ODM)
*   **Icons**: Lucide Icons

---

## ⚙️ Environment Configuration

Ensure your environment variables are configured. Create a `.env` file in the project root:

```env
# MongoDB Atlas connection string
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/scaleflow?retryWrites=true&w=majority

# Secret key for JWT session signing
JWT_SECRET=your_jwt_signing_secret_key

# Web server port
PORT=3000
```

---

## 🚀 Local Installation

### Prerequisites

*   Node.js (v18.0.0 or higher)
*   npm
*   Running MongoDB instance (Local or Atlas)

### Setup Steps

1. Clone the repository:
   ```bash
   git clone https://github.com/bansalchirag579-maker/ScaleFlow.git
   cd ScaleFlow
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure your `.env` file (see the [Environment Configuration](#%EF%B8%8F-environment-configuration) section above).

4. Start the application:
   ```bash
   npm start
   ```

5. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

---

## 📂 Project Structure

```
├── models.js               # Mongoose schemas & virtual identifier configuration
├── server.js               # REST API endpoints, JWT validation, and DB seeding
├── package.json            # Node.js dependencies and run scripts
├── README.md               # Documentation
└── public/                 # Client assets
    ├── index.html          # Main application shell (Kanban, dashboard, billing)
    ├── login.html          # Glassmorphic SignIn & SignUp portal
    ├── app.js              # State manager, HTML5 drag-and-drop, and chart plotters
    └── styles.css          # Theme system and micro-animations
```

---

## 📄 License

This project is licensed under the MIT License.
