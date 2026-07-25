# Vector Law — AI-Powered US Legal Research Assistant

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-Express-green?logo=node.js" />
  <img src="https://img.shields.io/badge/React-18-blue?logo=react" />
  <img src="https://img.shields.io/badge/PostgreSQL-Database-blue?logo=postgresql" />
  <img src="https://img.shields.io/badge/Qdrant-Vector%20DB-red" />
  <img src="https://img.shields.io/badge/AI-RAG%20Pipeline-purple" />
  <img src="https://img.shields.io/badge/License-ISC-lightgrey" />
</p>

> **Vector Law** is a Retrieval-Augmented Generation (RAG) chatbot that lets users ask questions about US federal law and receive answers grounded in indexed legal documents — with inline citations and no hallucinated statutes.

---

## Table of Contents

- [Features](#features)
- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Running the App](#running-the-app)
- [Data Ingestion](#data-ingestion)
- [API Reference](#api-reference)
- [Security Notes](#security-notes)

---

## Features

| Feature | Description |
|---|---|
|  **RAG Pipeline** | Embeds user questions → searches Qdrant vector DB → reranks results → generates grounded answers |
|  **Cited Answers** | Every legal answer includes inline citations from indexed federal sources |
|  **LLM Fallback Chain** | Gemini → OpenAI → Groq — if one provider fails, the next is tried automatically |
|  **Auth System** | Email/password registration with email verification + Google OAuth 2.0 |
|  **Chat History** | Authenticated users get persistent, named chat sessions saved in PostgreSQL |
|  **Guest Mode** | Unauthenticated users get 4 free messages before being prompted to sign up |
|  **Cross-Encoder Reranker** | Local HuggingFace `jina-reranker-v1-turbo-en` model re-scores Qdrant results for higher precision |
|  **UPL Guardrails** | System prompt prevents the AI from giving tailored legal advice (Unauthorized Practice of Law protection) |
|  **Rate Limiting** | Auth endpoints: 10 req/15 min. Legal endpoint: 60 req/min |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     User (Browser)                       │
│              React + Vite (port 5173)                    │
└─────────────────┬───────────────────────────────────────┘
                  │  /api/* (Vite proxy in dev)
                  ▼
┌─────────────────────────────────────────────────────────┐
│              Express Server (port 3000)                  │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ /api/auth/*  │  │ /api/chat/*  │  │ /api/legal/* │  │
│  │  authRouter  │  │  chatRouter  │  │ legalRouter  │  │
│  └──────────────┘  └──────────────┘  └──────┬───────┘  │
│                                              │           │
│                                    ┌─────────▼─────────┐│
│                                    │   RAG Pipeline    ││
│                                    │                   ││
│                                    │ 1. createEmbedding││
│                                    │ 2. Qdrant search  ││
│                                    │ 3. rerank (local) ││
│                                    │ 4. LLM generate   ││
│                                    └─────────┬─────────┘│
└──────────────────────────────────────────────┼──────────┘
                   ┌──────────────┬────────────┘
                   ▼              ▼
          ┌──────────────┐  ┌──────────────────────┐
          │  PostgreSQL  │  │    Qdrant Cloud       │
          │  (users,     │  │  (us-legal-knowledge  │
          │   sessions,  │  │   vector collection)  │
          │   messages)  │  └──────────────────────┘
          └──────────────┘
                                   │ LLM calls
                    ┌──────────────┼──────────────┐
                    ▼              ▼               ▼
             ┌────────────┐  ┌─────────┐  ┌──────────┐
             │   Gemini   │  │ OpenAI  │  │   Groq   │
             │  (primary) │  │(backup1)│  │(backup2) │
             └────────────┘  └─────────┘  └──────────┘
```

### Request Flow for a Legal Question

```
User types question
      │
      ▼
  isCasualChat()?
  ┌───┴────┐
 YES       NO
  │        │
  │        ▼
  │   createEmbedding(question)     [all-MiniLM-L6-v2, local, 384-dim]
  │        │
  │        ▼
  │   Qdrant.search(top 50)         [cosine similarity]
  │        │
  │        ▼
  │   rerank(top 5)                 [jina-reranker-v1-turbo-en, local]
  │        │
  │        ▼
  │   Build context block + prompt
  │        │
  └────────┤
           ▼
      LLM.generate()               [Gemini → OpenAI → Groq fallback]
           │
           ▼
      JSON response { answer, guestUsage, guestLimit }
```

---

## Tech Stack

### Backend
| Technology | Role |
|---|---|
| **Node.js + Express 5** | HTTP server and routing |
| **PostgreSQL + pg** | User accounts, chat sessions, messages |
| **Qdrant** | Cloud-hosted vector database for legal document embeddings |
| **@huggingface/transformers** | Local embedding model (`all-MiniLM-L6-v2`) and reranker (`jina-reranker-v1-turbo-en`) |
| **@google/genai (Gemini)** | Primary LLM provider (`gemini-2.5-flash-lite`) |
| **openai** | Fallback LLM provider |
| **groq-sdk** | Second fallback LLM provider |
| **bcryptjs** | Password hashing (cost factor 12) |
| **jsonwebtoken** | Access tokens (15 min) + refresh tokens (30 days) |
| **nodemailer** | Email verification via SMTP |
| **google-auth-library** | Google OAuth ID token verification |
| **helmet** | HTTP security headers |
| **express-rate-limit** | Brute-force and abuse protection |
| **cors** | Cross-origin resource sharing |
| **dotenv** | Environment variable management |

### Frontend
| Technology | Role |
|---|---|
| **React 18** | UI library |
| **Vite** | Dev server with API proxy + production bundler |
| **React Router v7** | Client-side routing |
| **Axios** | HTTP client with request interceptor for auth tokens |
| **@react-oauth/google** | Google One-Tap login component |
| **react-icons** | UI icon set (Feather Icons) |
| **CSS Modules** | Scoped component styles |

---

## Project Structure

```
Legal ChatBot/
├── README.md
├── .gitignore
│
├── server/                         # Express backend
│   ├── server.js                   # Entry point — middleware, rate limiting, route mounting
│   ├── db.js                       # PostgreSQL pool, schema creation, indexes
│   ├── package.json
│   ├── .env                        # ← Never commit this
│   │
│   ├── routes/
│   │   ├── legal.js                # /api/legal/* — full RAG pipeline
│   │   ├── auth.js                 # /api/auth/* — register, login, Google, refresh, logout
│   │   └── chat.js                 # /api/chat/* — session and message CRUD
│   │
│   ├── middleware/
│   │   └── auth.js                 # requireAuth — JWT verification middleware
│   │
│   ├── helpers/
│   │   ├── llmManager.js           # LLM provider fallback chain (Gemini → OpenAI → Groq)
│   │   ├── gemini.js               # Gemini API wrapper with internal retries
│   │   ├── openai.js               # OpenAI API wrapper
│   │   ├── groq.js                 # Groq API wrapper
│   │   ├── embedding.js            # Local all-MiniLM-L6-v2 embedding model
│   │   ├── reranker.js             # Local jina-reranker cross-encoder
│   │   ├── qdrant.js               # Qdrant client — init, store, search
│   │   └── chunking.js             # Text chunking for document ingestion
│   │
│   └── workers/                    # One-time data ingestion scripts
│       ├── fetch_govinfo.js        # Fetches US Code from GovInfo API
│       ├── fetch_court.js          # Fetches case law from CourtListener API
│       └── fetch_constitution.js  # Fetches US Constitution text
│
└── frontend/                       # React + Vite frontend
    ├── index.html
    ├── vite.config.js              # Dev proxy: /api/* → localhost:3000
    ├── package.json
    ├── .env                        # ← Never commit this
    │
    └── src/
        ├── App.jsx                 # Root component — providers + routing
        ├── main.jsx
        │
        ├── pages/
        │   ├── ChatDashboard.jsx   # Main chat UI (sidebar, messages, input)
        │   ├── ChatDashboard.module.css
        │   ├── LoginPage.jsx
        │   └── RegisterPage.jsx
        │
        ├── components/
        │   ├── Navbar.jsx
        │   ├── Navbar.module.css
        │   └── ProtectedRoute.jsx
        │
        ├── context/
        │   ├── AuthContext.jsx     # Auth state, token refresh, login/logout
        │   └── ChatContext.jsx     # Sessions, messages, guest limit, sendMessage
        │
        ├── services/
        │   ├── api.js              # askLegalQuestion, getGuestStatus (no auth header)
        │   └── authApi.js          # Auth + chat CRUD with auto-injected JWT interceptor
        │
        └── styles/
            ├── global.css
            ├── Auth.module.css
            └── Sidebar.module.css
```

---

## Prerequisites

- **Node.js** v18+ (required for `@huggingface/transformers`)
- **PostgreSQL** 14+ running locally or remotely
- **Qdrant** account (cloud) or local Qdrant instance
- API keys for: **Gemini**, **OpenAI** (optional backup), **Groq** (optional backup)
- **Google OAuth** Client ID (for Google login)
- SMTP credentials (Gmail App Password works)

---

## Installation

```bash
# 1. Clone the repository
git clone https://github.com/Najeeb-Patoana/Vector-Law-Legal-Chatbot.git
cd vector-law-legal-chatbot

# 2. Install server dependencies
cd server
npm install

# 3. Install frontend dependencies
cd ../frontend
npm install
```

---

## Environment Variables

### `server/.env`

```env
# ── Database ──────────────────────────────────────────────────────────────────
DB_HOST=localhost
DB_PORT=5432
DB_USER= pg_user
DB_PASSWORD= pg_password
DB_NAME= database_name

# ── Vector DB ─────────────────────────────────────────────────────────────────
QDRANT_URL=https:// -cluster.qdrant.io:443
QDRANT_API_KEY= qdrant_api_key

# ── LLM Providers ─────────────────────────────────────────────────────────────
GEMINI_API_KEY= gemini_api_key
GPT_API_KEY= openai_api_key
GROQ_API_KEY= groq_api_key

# ── Auth ──────────────────────────────────────────────────────────────────────
# Generate strong secrets: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=<64-byte-hex-string>
JWT_REFRESH_SECRET=<different-64-byte-hex-string>

# ── Google OAuth ──────────────────────────────────────────────────────────────
GOOGLE_CLIENT_ID= google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET= google_client_secret

# ── Email (SMTP) ──────────────────────────────────────────────────────────────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER= email@gmail.com
SMTP_PASS= gmail_app_password
MAIL_FROM=" Name < email@gmail.com>"

# ── External Data APIs ────────────────────────────────────────────────────────
GOVINFO_API_KEY= govinfo_api_key
COURTLISTENER_TOKEN= courtlistener_token

# ── App Config ────────────────────────────────────────────────────────────────
PORT=3000
CORS_ORIGIN=http://localhost:5173
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:3000
GUEST_LIMIT=4               # Number of free messages for unauthenticated users
```

### `frontend/.env`

```env
VITE_GOOGLE_CLIENT_ID= google_client_id.apps.googleusercontent.com
# VITE_API_URL=               # Leave empty for dev (Vite proxy handles it)
#                             # Set to   backend URL for production builds
```

---

## Running the App

### Development (two terminals)

```bash
# Terminal 1 — Backend
cd server
npm run dev          # nodemon server.js → http://localhost:3000

# Terminal 2 — Frontend
cd frontend
npm run dev          # Vite → http://localhost:5173
```

The Vite dev server proxies all `/api/*` requests to `localhost:3000`, so there are no CORS issues in development.

### Production

```bash
# Build the frontend
cd frontend
npm run build        # outputs to frontend/dist/

# Serve the backend (serve frontend/dist/ via nginx or Express static)
cd server
npm start
```

---

## Data Ingestion

The `server/workers/` directory contains one-time scripts to populate the Qdrant vector collection with legal documents.

```bash
# From the server directory:

# Fetch US Code from GovInfo API (federal statutes)
npm run govinfo

# Fetch court opinions from CourtListener
npm run court

# Fetch the US Constitution text
npm run constitution
```

Each worker:
1. Fetches raw legal text from the respective public API
2. Chunks the text into overlapping segments via `helpers/chunking.js`
3. Embeds each chunk using the local `all-MiniLM-L6-v2` model
4. Upserts the vectors into the Qdrant `us-legal-knowledge-v2` collection (with automatic retry on network failures)

---

## API Reference

### Auth — `/api/auth/*`
> Rate limited: 10 requests / 15 minutes per IP

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/register` | `{ name, email, password }` | Create account, sends verification email |
| `GET` | `/api/auth/verify-email` | `?token=...` | Verify email address |
| `POST` | `/api/auth/login` | `{ email, password }` | Login, returns access + refresh tokens |
| `POST` | `/api/auth/google` | `{ credential }` | Google OAuth login/register |
| `POST` | `/api/auth/refresh` | `{ refreshToken }` | Get new access token |
| `POST` | `/api/auth/logout` | — | Logout (clears client-side tokens) |

### Legal — `/api/legal/*`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/legal/ask` | Optional | Ask a legal question (60 req/min limit) |
| `GET` | `/api/legal/guest-status` | None | Get guest usage count for current IP |

**POST `/api/legal/ask`** request:
```json
{ "question": "What is the Fourth Amendment?" }
```
Response:
```json
{
  "success": true,
  "answer": "The Fourth Amendment protects against...",
  "guestUsage": 1,
  "guestLimit": 4
}
```

### Chat — `/api/chat/*`
> All routes require `Authorization: Bearer <accessToken>`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/chat/sessions` | List all sessions for the logged-in user |
| `POST` | `/api/chat/sessions` | Create a new session |
| `PATCH` | `/api/chat/sessions/:id/title` | Rename a session |
| `DELETE` | `/api/chat/sessions/:id` | Delete a session |
| `GET` | `/api/chat/sessions/:id/messages` | Load messages for a session |
| `POST` | `/api/chat/sessions/:id/messages` | Save a message to a session |

---