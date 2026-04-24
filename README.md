# 🎲 Rulebook Arbiter

Rulebook Arbiter is an AI-powered board game rulebook assistant. Upload your PDFs, ask questions in plain English, and get precise rulings without flipping through a 40-page manual.

[![Deploy to GitHub Pages](https://github.com/K10hrn/Rulebook/actions/workflows/deploy.yml/badge.svg)](https://github.com/K10hrn/Rulebook/actions/workflows/deploy.yml)

## Features

- **PDF Upload** — Drag and drop rulebook PDFs directly in the browser
- **AI Rulings** — Powered by Google Gemini; get context-aware answers grounded in the actual rules text
- **House Rules** — Add global or session-specific overrides that the AI will always respect
- **Quick Start / Setup / FAQ** — Generate guides for any uploaded rulebook with one click
- **Cloud Library** — Rulebooks are stored in Firebase Firestore for authorised users, chunked to handle large files
- **Local Storage** — Guest users get full functionality via IndexedDB, no sign-in required
- **Google Drive Sync** — Import PDFs directly from a Google Drive folder (requires sign-in)
- **Dark / Light Theme** — Toggleable UI theme

## Tech Stack

- **Frontend** — React 19 + Vite + TypeScript
- **Styling** — Tailwind CSS v4 + Motion (Framer Motion)
- **AI** — Google Gemini API (`@google/genai`)
- **Auth & Database** — Firebase Auth + Firestore
- **Icons** — Lucide React

## Getting Started

### Prerequisites

- Node.js v18 or higher
- A [Google Gemini API key](https://aistudio.google.com/app/apikey)

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/K10hrn/Rulebook.git
   cd Rulebook
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Create a `.env` file**

   ```bash
   cp .env.example .env
   ```

   Fill in your values:

   | Variable | Description |
   |---|---|
   | `GEMINI_API_KEY` | Your Google Gemini API key |
   | `VITE_ADMIN_EMAIL` | Email address that gets full admin access |

4. **Start the dev server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

### Firebase Configuration

Firebase credentials are stored in `firebase-applet-config.json` at the project root. The repo ships with the original AI Studio project's config — this works out of the box, but if you want to use your own Firebase project:

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Authentication** (Google provider) and **Firestore**
3. Replace the values in `firebase-applet-config.json` with your project's config (from Project Settings → Your apps → SDK setup)
4. Deploy the Firestore security rules: `firebase deploy --only firestore:rules`
5. Add your domain to **Authorized Domains** in Firebase Console → Authentication → Settings

## Deployment (GitHub Pages)

The project deploys automatically on every push to `main`.

### First-time setup

1. Go to **Repository Settings → Pages** and set the source to **GitHub Actions**
2. Add the following **Repository Secrets** (Settings → Secrets and variables → Actions):
   - `GEMINI_API_KEY`
   - `VITE_ADMIN_EMAIL`
3. Push to `main` — the workflow builds and deploys to `https://K10hrn.github.io/Rulebook/`

## Access Control

The app uses a Firestore `allowlist` collection to control who can sign in:

- The `VITE_ADMIN_EMAIL` address always has full admin access (upload, delete, manage)
- Other users can be granted access by adding a document to `allowlist/{email}` with a `role` field (`"admin"` or `"user"`)
- Users not on the allowlist see an access-denied screen after signing in

---

Built with ❤️ for board gamers everywhere.
