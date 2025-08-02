# 📦 Solid Refugee Document Manager

A privacy-preserving, Solid-compliant document uploader designed to empower refugees to securely upload, redact, encrypt, and sync identity documents using decentralized personal data stores (Solid Pods).

## 🔧 Features

- Upload identity documents
- Auto-redaction of sensitive info (e.g., name, DOB, MRZ)
- AES-256 encrypted original storage
- Redacted version stored on user’s Solid Pod
- RDF metadata generation (Turtle syntax)
- Cross-device access via Solid login
- Offline-first upload with IndexedDB queue
- View-only access link to original (encrypted) file
- Redis-backed session persistence

---

## 🚀 Getting Started

### 📦 Prerequisites

- Node.js (v18–20 recommended)
- Redis (installed locally or via Docker)

### 🔐 Environment Variables

Create a `.env` file at the project root:

```env
SESSION_SECRET=your_random_secret_here
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
# REDIS_PASSWORD=optional_if_needed

# Optional fallback credentials (for testing only)
CLIENT_ID=YourSolidAppClientID
CLIENT_SECRET=YourSolidAppClientSecret
OIDC_ISSUER=https://broker.pod.inrupt.com
DEFAULT_TARGET_POD=https://yourpod.solidcommunity.net/public/
```

---

### 📥 Install Dependencies

```bash
npm install
```

---

### ▶️ Run the App

```bash
node server.js
```

Then open your browser to:

```
http://localhost:3001/login.html
```

---

## 👤 Creating Users (Solid Setup)

1. Go to [https://broker.pod.inrupt.com](https://broker.pod.inrupt.com)
2. Create a Solid Pod account (e.g., refugee-pod)
3. Register an app/client ID
4. Store your `clientId` and `clientSecret` in your `.env` or provide them via login form

---

## 📁 Folder Structure

```txt
├── server.js            # Main Express app
├── auth.js              # Handles login and session
├── sync.js              # Syncs RDF metadata from Pod
├── upload.js            # (Optional modular upload logic)
├── encryption.js        # AES encryption/decryption
├── ocrProcess.js        # Redaction and OCR processing
├── public/
│   ├── index.html       # Upload UI
│   ├── login.html       # Login form
│   ├── dashboard.html   # Button panel (docs + metadata)
│   ├── view.html        # Secure view gate
│   └── ...
├── uploads/raw/         # Encrypted original files
└── .env                 # Your environment config
```

---

## ✈️ Deployment Tips

- Use `pm2` to keep the server running:
```bash
npm install -g pm2
pm2 start server.js --name solid-app
```
- Or deploy to platforms like Render, Railway, Fly.io, or DigitalOcean

---

## 🔒 Security Notes

- Never commit your `.env` file
- Always hash or encrypt sensitive fields
- Validate all uploaded files and metadata

---

## 📄 License

MIT License. Built for academic research and humanitarian use.
