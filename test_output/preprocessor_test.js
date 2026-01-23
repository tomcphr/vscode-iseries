#!/usr/bin/env node

import { PreProcessor } from './preprocessor.js';
import fs from 'fs';

// Read the test file from command line argument
const filePath = process.argv[2];
if (!filePath) {
    console.error('Usage: node preprocessor_test.js <file.rpgle>');
    process.exit(1);
}

try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const lines = fileContent.split(/\r?\n/);
    
    const processor = new PreProcessor(lines, "rpgle");
    const result = processor.process();
    
    result.forEach(line => console.log(line));
} catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
}