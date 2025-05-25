import crypto from "crypto";
import fs from "fs";
import fsPromises from "fs/promises";
import dotenv from "dotenv";
dotenv.config();

const ALGORITHM = "aes-256-gcm";
const KEY = crypto.createHash("sha256").update(process.env.ENCRYPTION_SECRET).digest(); // 32-byte key
if (!process.env.ENCRYPTION_SECRET) {
  throw new Error("ENCRYPTION_SECRET is not defined in .env");
}

export function encryptFile(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

    const input = fs.createReadStream(inputPath);
    const output = fs.createWriteStream(outputPath);

    input.pipe(cipher).pipe(output);

    output.on("finish", () => {
      const authTag = cipher.getAuthTag();
      fs.writeFileSync(outputPath + ".meta.json", JSON.stringify({
        iv: iv.toString("hex"),
        tag: authTag.toString("hex")
      }));
      resolve();
    });

    output.on("error", reject);
  });
}

export async function decryptFileToBuffer(filePath) {
  const metaPath = filePath + ".meta.json";
  const meta = JSON.parse(await fsPromises.readFile(metaPath, "utf-8"));

  const iv = Buffer.from(meta.iv, "hex");
  const authTag = Buffer.from(meta.tag, "hex");
  const encryptedData = await fsPromises.readFile(filePath);

  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encryptedData),
    decipher.final()
  ]);

  return decrypted;
}
