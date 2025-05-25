import vision from '@google-cloud/vision';
import sharp from 'sharp';

const regexes = {
  dob: /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2})\b/,
  mrz: /^P<|^[A-Z0-9<]{25,}$/
};

const preservedLabels = [
  "ID", "Number", "Passport", "Country", "Nationality",
  "India", "Republic", "Issued", "Name"
];

const client = new vision.ImageAnnotatorClient();

export async function processAndBlur(filePath, outputPath) {
  console.log("📥 Starting redaction for:", filePath);

  const [result] = await client.documentTextDetection(filePath);
  const annotations = result.fullTextAnnotation;

  if (!annotations || !annotations.pages) {
    console.log("⚠️ No OCR results found.");
    return;
  }

  const text = annotations.text || "";
  console.log("🔤 Extracted Text:\n", text.trim());

  // 🔍 Auto-detect names by scanning lines after known labels
  const possibleNames = [];
  const lines = text.split(/\n+/);
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if (
      lower.includes("name") ||
      lower.includes("given") ||
      lower.includes("surname")
    ) {
      for (let j = 1; j <= 5; j++) {
        const candidate = lines[i + j]?.trim();
        if (candidate && /^[A-Z\s]+$/.test(candidate)) {
          possibleNames.push(
            ...candidate.split(/\s+/).map(p => p.trim().toLowerCase())
          );
        }
      }
    }
  }

  console.log("🧠 Auto-detected names:", possibleNames.join(", "));

  const blurBoxes = [];

  annotations.pages.forEach(page => {
    page.blocks.forEach(block => {
      block.paragraphs.forEach(paragraph => {
        const words = paragraph.words;

        words.forEach((word) => {
          const text = word.symbols.map(s => s.text).join('').trim();

          const isDOB = regexes.dob.test(text);
          const isName = possibleNames.includes(text.toLowerCase());
          const isMRZ = regexes.mrz.test(text);

          const isSensitive = isDOB || isName || isMRZ;
          const isPreserved = preservedLabels.some(label =>
            text.toLowerCase().includes(label.toLowerCase())
          );

          if (isSensitive && !isPreserved) {
            const vertices = word.boundingBox.vertices;
            const x0 = Math.min(...vertices.map(v => v.x || 0));
            const y0 = Math.min(...vertices.map(v => v.y || 0));
            const x1 = Math.max(...vertices.map(v => v.x || 0));
            const y1 = Math.max(...vertices.map(v => v.y || 0));

            blurBoxes.push({ x0, y0, x1, y1 });
            console.log(`🔒 Redacting: "${text}" at [${x0},${y0}] to [${x1},${y1}]`);
          }
        });
      });
    });
  });

  if (blurBoxes.length === 0) {
    console.log("⚠️ No sensitive matches — inserting fallback test box.");
    blurBoxes.push({ x0: 100, y0: 100, x1: 250, y1: 150 });
  }

  const overlays = [];

  for (const { x0, y0, x1, y1 } of blurBoxes) {
    const width = x1 - x0;
    const height = y1 - y0;

    const blurOverlay = await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 50, g: 50, b: 50 }
      }
    }).png().blur(30).toBuffer();

    overlays.push({ input: blurOverlay, top: y0, left: x0 });
  }

  await sharp(filePath)
    .composite(overlays)
    .jpeg()
    .toFile(outputPath);

  console.log("✅ Redacted image saved at:", outputPath);
  return outputPath;
}
