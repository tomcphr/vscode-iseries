#!/usr/bin/env node

import { PreProcessor } from './test_output/preprocessor.js';

// Test with D-spec formats from the copy members
const testLines = [
    "D SPAR20          DS           256",
    "D  DZBSuppNo                    10",
    "D commandExec     pr                  extpgm('QCMDEXC')",
    "D command                     1024a   const options(*varsize)",
    "d #webstoreSettings...",
    "d                 ds                  qualified",
    "d store                          5p 0"
];

console.log("=== Testing D-spec Format Detection ===");
console.log("");

const processor = new PreProcessor(testLines, "rpgle");
const result = processor.process();

console.log("Full output:");
result.forEach((line, i) => {
    console.log(`${(i+1).toString().padStart(3)}: "${line}"`);
});