#!/usr/bin/env node

import { PreProcessor } from './test_output/preprocessor.js';

// Test the problematic lines from the actual file
const testLines = [
    "h nomain",
    "",
    " /copy qrpglehdr,rgutils",
    "",
    "// Web Store Procedures",
    "",
    "dcl-proc webstoreGetSettings export;"
];

console.log("=== Testing Format Detection Issues ===");
console.log("");

const processor = new PreProcessor(testLines, "rpgle");
const result = processor.process();

console.log("Full output:");
result.forEach((line, i) => {
    console.log(`${(i+1).toString().padStart(3)}: "${line}"`);
});