import express from "express";
import fileUpload from "express-fileupload";
import session from "express-session";
import { overwriteFile } from "@inrupt/solid-client";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { processAndBlur } from "./ocrProcess.js";
import { encryptFile, decryptFileToBuffer } from "./encryption.js";
import authRoutes from "./auth.js";
import { Session } from "@inrupt/solid-client-authn-node";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(fileUpload());
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || "supersecret",
  resave: false,
  saveUninitialized: false
}));

app.use(authRoutes);

// Protect root: redirect if not logged in
app.get("/", (req, res, next) => {
  if (!req.session.user) return res.redirect("/login.html");
  next();
});

// User info for UI
app.get("/me", (req, res) => {
  if (!req.session.user) return res.status(401).send("Unauthorized");
  res.json({ email: req.session.user.email });
});

const uploadsDir = path.join(__dirname, "uploads");
const rawDir = path.join(uploadsDir, "raw");
[uploadsDir, rawDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

app.post("/upload", async (req, res) => {
  const user = req.session.user;
  if (!user) return res.status(401).send("Unauthorized. Please log in.");

  if (!req.files || !req.files.file) {
    return res.status(400).send("No file uploaded.");
  }

  try {
    const file = req.files.file;
    const fileName = file.name;
    const rawPath = path.join(rawDir, fileName);

    await file.mv(rawPath);
    console.log(`📥 Raw file saved at ${rawPath}`);

    const redactedBuffer = await processAndBlur(rawPath);

    const encryptedPath = rawPath + ".enc";
    await encryptFile(rawPath, encryptedPath);
    console.log(`🔐 Encrypted raw stored at ${encryptedPath}`);

    fs.unlinkSync(rawPath);
    console.log("🧹 Raw unencrypted file deleted");

    const session = new Session();
    await session.login({
      clientId: user.clientId,
      clientSecret: user.clientSecret,
      oidcIssuer: user.oidcIssuer,
    });

    if (!session.info.isLoggedIn) {
      return res.status(403).send("Solid login failed.");
    }

    const podFolder = user.targetPod.endsWith("/") ? user.targetPod : user.targetPod + "/";
    const remoteUrl = new URL(fileName, podFolder).href;

    await overwriteFile(remoteUrl, redactedBuffer, {
      contentType: file.mimetype || "application/octet-stream",
      fetch: session.fetch,
    });

    res.send({ message: "✅ File uploaded", url: remoteUrl });
  } catch (err) {
    console.error("❌ Upload error:", err);
    res.status(500).send("❌ Upload failed: " + err.message);
  }
});

app.get("/view", async (req, res) => {
  const fileParam = req.query.file;
  if (!fileParam) return res.status(400).send("Missing file parameter");

  const encFilePath = path.join(__dirname, "uploads/raw", fileParam);

  try {
    const decryptedBuffer = await decryptFileToBuffer(encFilePath);
    const ext = path.extname(fileParam).replace(".enc", "") || ".jpg";
    const mimeType = ext === ".pdf" ? "application/pdf" : "image/jpeg";
    res.setHeader("Content-Type", mimeType);
    res.send(decryptedBuffer);
  } catch (err) {
    console.error("❌ Failed to decrypt:", err.message);
    res.status(500).send("Decryption failed or file not found.");
  }
});

app.listen(3001, () => {
  console.log("🚀 Upload server listening at http://localhost:3001");
});
