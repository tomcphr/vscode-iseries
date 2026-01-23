#!/usr/bin/env node

import { PreProcessor } from './test_output/preprocessor.js';

// Test with the actual problematic content from compilation spool
const testLines = [
    "h nomain",
    "",
    " /copy qrpglehdr,rgutils",
    "",
    "# Web Store Procedures",  // This is the problem line!
    "",
    "dcl-proc webstoreGetSettings export;"
];

console.log("=== Testing with # comment (the actual issue) ===");
console.log("");

const processor = new PreProcessor(testLines, "rpgle");
const result = processor.process();

console.log("Full output:");
result.forEach((line, i) => {
    console.log(`${(i+1).toString().padStart(3)}: "${line}"`);
});