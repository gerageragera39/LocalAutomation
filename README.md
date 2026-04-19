<div align="center">

<img src="https://img.shields.io/badge/PhoneDesk-1.0.0-6366f1?style=for-the-badge&labelColor=0f0f0f" alt="version"/>

# 📱 PhoneDesk

**Turn your phone into a powerful desktop control surface — no app install required.**

Launch apps, move the mouse, and control your PC from any browser on your local network.

<br/>

[![Node 20+](https://img.shields.io/badge/node-20%2B-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![React 18](https://img.shields.io/badge/react-18-149eca?style=flat-square&logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/typescript-5-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Express](https://img.shields.io/badge/express-4-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com)
[![Platform](https://img.shields.io/badge/platform-windows%20%7C%20linux-111827?style=flat-square)](https://github.com/gerageragera39/LocalAutomation)
[![CI](https://img.shields.io/badge/CI-passing-22c55e?style=flat-square&logo=github-actions&logoColor=white)](https://github.com/gerageragera39/LocalAutomation/actions)
[![License: MIT](https://img.shields.io/badge/license-MIT-f59e0b?style=flat-square)](LICENSE)

<br/>

> **No native app. No cloud. No subscription.**  
> A single `npm start` puts your desktop at your fingertips.

</div>

---

## ✨ Why PhoneDesk?

Most remote desktop tools are bloated, cloud-dependent, or require installing software on every device. PhoneDesk is different: it's a **lightweight, self-hosted web dashboard** that lives on your machine and is instantly accessible from any phone or tablet on the same Wi-Fi network.

| | PhoneDesk | Traditional remote tools |
|---|---|---|
| Cloud required | ❌ | ✅ Often required |
| Install on phone | ❌ Just a browser | ✅ Proprietary app |
| Open source | ✅ | ❌ Usually not |
| Zero-config storage | ✅ JSON files | ❌ Needs a database |
| PWA support | ✅ Installable | ❌ Separate app stores |

---

## 🚀 Core Features

### 🎛️ App Launcher Dashboard
A mobile-optimised, animated React dashboard that lets you launch any desktop application with a single tap. Scans your Windows Start Menu and Linux `.desktop` entries automatically.

### 🖱️ Remote Mouse Control
Move the cursor, click, and scroll directly from your phone. On Windows, a **persistent PowerShell worker** keeps latency near-zero. On Linux, it's powered by `xdotool`.

### 🔒 Security-First Architecture
- PIN authentication with **JWT sessions** and **bcrypt hashing**
- **Brute-force protection** via request rate limiting
- Admin panel locked to `localhost` — only you can add or remove apps
- All API inputs validated with **Zod schemas**
- Full **audit log** written to `data/audit.log`
- Security headers via **Helmet**, strict **CORS** policy

### 📂 Native File Picker Integration
Adding a new app is frictionless — click "Add App" and your OS's **native file picker** opens. No typing paths manually.

### 📡 PWA-Ready
Users can install PhoneDesk to their phone's home screen for a native-like experience — no app store needed.

### 🏥 Health Endpoint
Built-in `GET /api/health` for monitoring and uptime checks — production-ready out of the box.

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────┐
│                Phone / Tablet                │
│         (any browser — PWA installable)      │
└───────────────────┬──────────────────────────┘
                    │  HTTP on local network
┌───────────────────▼──────────────────────────┐
│              React Client (Vite)             │
│  Tailwind CSS · React Query · Framer Motion  │
└───────────────────┬──────────────────────────┘
                    │
┌───────────────────▼──────────────────────────┐
│              Express API Server              │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│  │ PIN Auth │  │  App     │  │   Mouse   │  │
│  │  + JWT   │  │ Registry │  │  Service  │  │
│  └──────────┘  └──────────┘  └─────┬─────┘  │
│                                    │        │
│               ┌────────────────────┤        │
│               │                    │        │
│        ┌──────▼──────┐   ┌─────────▼──────┐ │
│        │  Win Worker │   │  xdotool (Lin) │ │
│        │ (PowerShell)│   └────────────────┘ │
│        └─────────────┘                      │
│                                              │
│  Persistence: flat JSON files in data/       │
└──────────────────────────────────────────────┘
```

---

## 🛠️ Tech Stack

**Frontend**
- ⚛️ React 18 + TypeScript
- ⚡ Vite (sub-second HMR)
- 🎨 Tailwind CSS
- 🌀 Framer Motion (animations)
- 🔄 React Query (server state)

**Backend**
- 🟢 Node.js 20+ / Express 4
- 📝 TypeScript throughout
- ✅ Zod (runtime validation)
- 🔐 Helmet · CORS · express-rate-limit
- 🔑 bcryptjs · jsonwebtoken

---

## ⚡ Quick Start

```bash
git clone https://github.com/gerageragera39/LocalAutomation.git
cd LocalAutomation/phonedesk

npm ci
npm run build
npm start
```

1. Open **`http://127.0.0.1:3000/admin`** on your PC
2. Set your PIN and add the apps you want to expose
3. Open the printed URL on your **phone** — and you're live

> **Linux users:** install `xdotool` for mouse support and `wmctrl` for window focusing.

---

## 📁 Project Structure

```
phonedesk/
├── client/          # React + Vite frontend
├── server/          # Express API & platform integrations
│   ├── routes/      # Auth, apps, mouse, admin, health
│   ├── services/    # App launcher, mouse controller
│   └── platform/   # Windows & Linux adapters
├── docs/            # Architecture, security, ops guides
├── data/            # Runtime state — gitignored
└── package.json
```

---

## 🔌 API Reference

<details>
<summary><strong>Auth</strong></summary>

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/auth/login` | Exchange PIN for JWT |
| `GET` | `/api/auth/verify` | Verify active session |
| `POST` | `/api/auth/change-pin` | Update PIN (localhost only) |

</details>

<details>
<summary><strong>Apps</strong></summary>

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/apps` | List available apps |
| `POST` | `/api/apps/:id/launch` | Launch an app |
| `GET` | `/api/apps/status` | Check running state |

</details>

<details>
<summary><strong>Mouse</strong></summary>

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/mouse/move` | Move cursor |
| `POST` | `/api/mouse/click` | Left/right/middle click |
| `POST` | `/api/mouse/scroll` | Scroll up/down |

</details>

<details>
<summary><strong>Admin (localhost only)</strong></summary>

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/admin/apps` | List all apps |
| `POST` | `/api/admin/apps` | Add app manually |
| `POST` | `/api/admin/apps/pick-executable` | Open native file picker |
| `POST` | `/api/admin/apps/scan` | Auto-scan for installed apps |
| `PUT` | `/api/admin/apps/:id` | Update app entry |
| `DELETE` | `/api/admin/apps/:id` | Remove app |

</details>

<details>
<summary><strong>Ops</strong></summary>

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/health` | Health check |

</details>

---

## 🔐 Security Overview

PhoneDesk was designed with a **security-first** mindset:

- **No cloud attack surface** — everything stays on your LAN
- **Admin routes** are restricted to `127.0.0.1` at the middleware level
- **Rate limiting** blocks brute-force PIN attacks
- **Zod validation** on every incoming payload — no raw user input reaches business logic
- **bcrypt** hashed PIN storage — plaintext PINs never persisted
- **JWT** sessions with configurable expiry
- **Audit log** records all sensitive actions with timestamps
- **Cache-Control: no-store** on all `/api/*` responses

---

## 📚 Documentation

| Guide | Description |
|-------|-------------|
| [Installation](phonedesk/docs/INSTALLATION.md) | Step-by-step setup for Windows & Linux |
| [Architecture](phonedesk/docs/ARCHITECTURE.md) | Deep-dive into design decisions |
| [Operations](phonedesk/docs/OPERATIONS.md) | Running in production, updates, backups |
| [Security](phonedesk/docs/SECURITY.md) | Threat model and hardening tips |
| [Contributing](CONTRIBUTING.md) | How to contribute |

---

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

```bash
# Development mode with hot reload
cd phonedesk
npm run dev
```

---

## ⚠️ Important: data/ folder

**Do not commit the `data/` directory.** It contains runtime state including:
- Hashed PIN & JWT secret
- Your personal app catalog
- Audit logs

Only `data/.gitkeep` should be tracked. This is already handled by `.gitignore`.

---

<div align="center">

Made with ❤️ · [Report a bug](https://github.com/gerageragera39/LocalAutomation/issues) · [Request a feature](https://github.com/gerageragera39/LocalAutomation/issues)

</div>
