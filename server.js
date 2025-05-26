// ✅ Full server.js with UID-based filenames and all routes

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
import fetch from "node-fetch";
import crypto from "crypto";

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
    const ext = path.extname(file.name);
    const uid = crypto.randomUUID();
    const serverName = `${uid}${ext}`;
    const rawPath = path.join(rawDir, serverName);
    const encryptedPath = rawPath + ".enc";

    await file.mv(rawPath);
    console.log(`📥 Raw file saved at ${rawPath}`);

    const redactedBuffer = await processAndBlur(rawPath);

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

    const podFolder = user.targetPod.endsWith("/") ? user.targetPod : user.targetPod + "/";
    const remoteUrl = new URL(serverName, podFolder).href;

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

app.get("/me", (req, res) => {
  if (!req.session.user) return res.status(401).send("Unauthorized");
  res.json({ email: req.session.user.email });
});

app.get("/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).send("Logout failed.");
    res.clearCookie("connect.sid");
    res.send("✅ Logged out.");
  });
});

app.get("/view", async (req, res) => {
  const fileParam = req.query.file;
  const isFromGate = req.get("X-Trusted-Gate") === "true";
  if (!fileParam) return res.status(400).send("Missing file parameter");
  if (!isFromGate) return res.status(403).send("Access denied. Use secure view interface.");

  const encFilePath = path.join(rawDir, fileParam);
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

app.delete("/file", async (req, res) => {
  const url = req.query.url;
  if (!url || !req.session.user) return res.status(400).send("Missing URL or not logged in");

  try {
    const fileName = decodeURIComponent(url.split("/").pop());
    const encPath = path.join(rawDir, fileName + ".enc");
    if (fs.existsSync(encPath)) fs.unlinkSync(encPath);

    const podFolder = req.session.user.targetPod.endsWith("/")
      ? req.session.user.targetPod
      : req.session.user.targetPod + "/";
    const podFileUrl = new URL(fileName, podFolder).href;

    const session = new Session();
    await session.login({
      clientId: req.session.user.clientId,
      clientSecret: req.session.user.clientSecret,
      oidcIssuer: req.session.user.oidcIssuer,
    });

    await fetch(podFileUrl, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.info.sessionId}` }
    });

    res.send("✅ File deleted from server and Solid Pod.");
  } catch (err) {
    console.error("❌ Deletion error:", err.message);
    res.status(500).send("Failed to delete file.");
  }
});

app.listen(3001, () => {
  console.log("🚀 Upload server listening at http://localhost:3001");
});
