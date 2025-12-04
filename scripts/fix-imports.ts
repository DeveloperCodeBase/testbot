#!/usr/bin/env node
/**
 * Fix all .js imports in TypeScript source files
 * This script removes .js extensions from relative imports to work with ts-jest
 */

import { readFileSync, writeFileSync } from 'fs';
import { sync as globSync } from 'glob';

const files = globSync('src/**/*.ts', { nodir: true });

console.log(`Found ${files.length} TypeScript files to process...`);

let totalFixed = 0;
const fixedFiles: string[] = [];

for (const file of files) {
    try {
        let content = readFileSync(file, 'utf-8');
        const original = content;

        // Fix: from './path.js' or from '../path.js' → from './path' or from '../path'
        content = content.replace(/from\s+['"](\.\.[^'"]*?)\.js['"]/g, "from '$1'");
        content = content.replace(/from\s+['"](\.\/[^'"]*?)\.js['"]/g, "from '$1'");

        // Fix: jest.mock('./path.js') → jest.mock('./path')
        content = content.replace(/jest\.mock\s*\(\s*['"](\.\.[^'"]*?)\.js['"]/g, "jest.mock('$1'");
        content = content.replace(/jest\.mock\s*\(\s*['"](\.\/[^'"]*?)\.js['"]/g, "jest.mock('$1'");

        // Fix: import('./path.js') → import('./path')
        content = content.replace(/import\s*\(\s*['"](\.\.[^'"]*?)\.js['"]/g, "import('$1'");
        content = content.replace(/import\s*\(\s*['"](\.\/[^'"]*?)\.js['"]/g, "import('$1'");

        if (content !== original) {
            writeFileSync(file, content, 'utf-8');
            fixedFiles.push(file);

            // Count how many replacements were made
            const matches = original.match(/\.js['"]|\.js\)/g);
            totalFixed += matches ? matches.length : 0;
        }
    } catch (error) {
        console.error(`Error processing ${file}:`, error);
    }
}

console.log(`\n✅ Fixed ${totalFixed} imports across ${fixedFiles.length} files`);

if (fixedFiles.length > 0) {
    console.log('\nModified files:');
    fixedFiles.slice(0, 20).forEach(f => console.log(`  - ${f}`));
    if (fixedFiles.length > 20) {
        console.log(`  ... and ${fixedFiles.length - 20} more`);
    }
}
