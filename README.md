# ScaleFlow | SaaS Team & Kanban Management System

ScaleFlow is a premium, full-stack **SaaS Team Management System** built with **Node.js** and **Express** on the backend, and **Vanilla CSS + HTML5** on the frontend. The project is designed with a modern glassmorphism dark mode UI, and features a multi-tenant structure with user role management, resource allocation quotas, and an interactive Kanban board.

## Key Features

*   **SaaS Resource Quotas & Limits**: Simulates free and paid tiers (**Free**, **Pro**, **Enterprise**) enforcing strict limits on projects, tasks, and team members on the server. Attempting to exceed limits displays a custom premium modal urging users to upgrade.
*   **Tenant Separation**: Supports clean organization isolation where each organization has its own database namespace.
*   **Role-Based Access Control (RBAC)**: Users are assigned roles (`Admin`, `Manager`, `Member`) which dynamically control permissions across the application (e.g. only Admins can adjust subscription plans).
*   **Interactive Kanban Board**: Manage tasks using a drag-and-drop board mapping tasks to *To Do*, *In Progress*, *In Review*, and *Completed* statuses.
*   **Performance Metrics Chart**: Uses standard HTML5 Canvas rendering to plot animated task status distribution charts natively in the client.
*   **Audit Logging**: Automatically logs activities to create a searchable, real-time audit trail of actions taken in the organization workspace.
*   **Interactive Identity Switcher**: A sidebar switcher allows developers and testers to hot-swap between multiple pre-configured users (Admin, Manager, Member) across organizations to view the system from different permission perspectives.

## Tech Stack

*   **Backend**: Node.js, Express.js
*   **Frontend**: HTML5, Vanilla CSS (CSS Variables, Flexbox, Grid), ES6 Javascript
*   **Database**: File-system based JSON database engine
*   **Icons**: Lucide Icons

## Getting Started

### Prerequisites

*   Node.js (v16.0.0 or higher)
*   npm

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/saas-team-management.git
   cd saas-team-management
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the application:
   ```bash
   npm start
   ```

4. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

## Project Structure

```
├── server.js               # Express server and REST API routes
├── database.js             # Plain JSON database layer (mock engine)
├── package.json            # Node.js project configuration
├── README.md               # Documentation
├── data/                   # JSON data files (auto-seeded on startup)
│   ├── users.json
│   ├── organizations.json
│   ├── projects.json
│   ├── tasks.json
│   └── activity.json
└── public/                 # Static frontend assets
    ├── index.html          # Main HTML structure
    ├── app.js              # Routing, drag & drop, and chart plotting logic
    └── styles.css          # Dark theme styles & glassmorphism components
```

## License

This project is licensed under the MIT License.
