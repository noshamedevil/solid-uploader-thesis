import { processAndBlur } from './ocrProcess.js';
const input = './test-id.jpg';
const output = './redacted-id.jpg';

await processAndBlur(input, output);
