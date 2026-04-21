# 🎲 RuleBook Arbiter

RuleBook Arbiter is a modern web application designed to help you master any board game without the slog of reading a 40-page manual. Upload your PDFs, chat with an AI expert, and get back to the table faster.

[![Deploy to GitHub Pages](https://github.com/K10hrn/Rulebook/actions/workflows/deploy.yml/badge.svg)](https://github.com/K10hrn/Rulebook/actions/workflows/deploy.yml)

## ✨ Features

-   **📄 Smart PDF Upload**: Drag and drop your favorite rulebooks directly into the browser.
-   **🤖 AI Rules Expert**: Powered by Gemini 2.0, get context-aware answers calibrated specifically to the rules text.
-   **🛡️ Secure Storage**: Your rule library is synced across devices using Firebase authentication.
-   **📱 Mobile Friendly**: Check a rule on your phone right at the game table.
-   **🔄 Cross-Game Comparison**: Quickly check how mechanics differ between multiple uploaded books.

## 🚀 Tech Stack

-   **Frontend**: React + Vite + TypeScript
-   **Styling**: Tailwind CSS + Motion (Framer Motion)
-   **Authentication**: Firebase Auth
-   **Database**: Google Firestore
-   **AI Engine**: Google Gemini API (@google/genai)
-   **Icons**: Lucide React

## 🛠️ Getting Started

### Prerequisites

-   Node.js (v18 or higher)
-   A Google Gemini API Key
-   A Firebase Project

### Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/K10hrn/Rulebook.git
    cd Rulebook
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Environment Setup**:
    Create a `.env` file in the root directory and add your keys:
    ```env
    GEMINI_API_KEY=your_key_here
    VITE_FIREBASE_API_KEY=your_key
    # ... other firebase config
    ```

4.  **Run Development Server**:
    ```bash
    npm run dev
    ```

## 🌐 Deployment (GitHub Pages)

This project is configured to deploy automatically via GitHub Actions.

1.  Push your changes to the `main` branch.
2.  Enable **GitHub Actions** as the source in your Repository Settings -> Pages.
3.  The workflow will build the project and host it at `https://K10hrn.github.io/Rulebook/`.

## 🔒 Firebase Security

Ensure your Firestore rules are deployed using the included `firestore.rules` file to protect user data. Remember to add `k10hrn.github.io` to your Authorized Domains in the Firebase Console.

---
Built with ❤️ for Board Gamers everywhere.
