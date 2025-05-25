import express from "express";
import fileUpload from "express-fileupload";
import { Session } from "@inrupt/solid-client-authn-node";
import { overwriteFile } from "@inrupt/solid-client";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { processAndBlur } from "./ocrProcess.js"; // ✅ Use redaction logic

dotenv.config();

// Setup __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Init Express
const app = express();
app.use(fileUpload());
app.use(express.static(path.join(__dirname, "public")));

const uploadsDir = path.join(__dirname, "uploads");
const rawDir = path.join(uploadsDir, "raw");
[uploadsDir, rawDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

// Solid auth session
const session = new Session();

await session.login({
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  oidcIssuer: process.env.OIDC_ISSUER,
});

if (!session.info.isLoggedIn) {
  console.error("❌ Login failed");
  process.exit(1);
}
console.log(`✅ Server logged in as ${session.info.webId}`);

const podFolder = process.env.TARGET_POD_FOLDER.endsWith("/")
  ? process.env.TARGET_POD_FOLDER
  : process.env.TARGET_POD_FOLDER + "/";

// POST /upload
app.post("/upload", async (req, res) => {
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

app.listen(3001, () => {
  console.log("🚀 Upload server listening at http://localhost:3001");
});
