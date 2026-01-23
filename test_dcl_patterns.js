#!/usr/bin/env node

import { PreProcessor } from './src/preprocessor.js';

// Test the exact DCL statements that are failing
const testLines = [
    "dcl-proc webstoreGetSettings export;",
    "  dcl-proc webstoreGetSettings export;",
    "dcl-f DEF03;",
    "  dcl-f DEF03;",
    "dcl-pi likeds(#webstoreSettings);",
    "  dcl-pi likeds(#webstoreSettings);",
    "dcl-ds #settings likeds(#webstoreSettings);",
    "  dcl-ds #settings likeds(#webstoreSettings);"
];

console.log("=== Testing TypeScript Preprocessor DCL Patterns ===");
console.log("");

for (const line of testLines) {
    console.log(`Input: "${line}"`);
    const processor = new PreProcessor([line], "rpgle");
    const result = processor.process();
    console.log(`Output: "${result[0] || 'UNCHANGED'}"`);
    console.log("");
}