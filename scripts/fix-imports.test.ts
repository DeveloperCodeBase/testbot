// @ts-nocheck
import { readFileSync, writeFileSync } from 'fs';
import { sync as globSync } from 'glob';

// Since the script is a standalone executable, we test its logic by importing and re-implementing core logic here.
// Instead of running the script directly, we'll test the regex replacements it performs.

const IMPORT_REPLACEMENTS = [
  { regex: /from\s+['"](\.\.[^'"]*?)\.js['"]/g, replacement: "from '$1'" },
  { regex: /from\s+['"](\.\/[^'"]*?)\.js['"]/g, replacement: "from '$1'" },
  { regex: /jest\.mock\s*\(\s*['"](\.\.[^'"]*?)\.js['"]/g, replacement: "jest.mock('$1'" },
  { regex: /jest\.mock\s*\(\s*['"](\.\/[^'"]*?)\.js['"]/g, replacement: "jest.mock('$1'" },
  { regex: /import\s*\(\s*['"](\.\.[^'"]*?)\.js['"]/g, replacement: "import('$1'" },
  { regex: /import\s*\(\s*['"](\.\/[^'"]*?)\.js['"]/g, replacement: "import('$1'" },
];

describe('fix-imports regex replacements', () => {
  it('should remove .js extension from relative import paths in from statements', () => {
    const inputs = [
      `import { something } from '../module.js';`,
      `import { other } from './localFile.js';`,
      `import { skip } from 'external-package.js';`,
      `import { another } from '../../deep/module.js';`,
    ];
    const expected = [
      `import { something } from '../module';`,
      `import { other } from './localFile';`,
      `import { skip } from 'external-package.js';`, // should remain unchanged
      `import { another } from '../../deep/module';`,
    ];

    inputs.forEach((input, idx) => {
      let output = input;
      output = output.replace(/from\s+['"](\.\.[^'"]*?)\.js['"]/g, "from '$1'");
      output = output.replace(/from\s+['"](\.\/[^'"]*?)\.js['"]/g, "from '$1'");
      expect(output).toBe(expected[idx]);
    });
  });

  it('should remove .js extension from jest.mock calls with relative paths', () => {
    const inputs = [
      `jest.mock('../module.js');`,
      `jest.mock('./localFile.js');`,
      `jest.mock('external-package.js');`,
    ];
    const expected = [
      `jest.mock('../module');`,
      `jest.mock('./localFile');`,
      `jest.mock('external-package.js');`,
    ];

    inputs.forEach((input, idx) => {
      let output = input;
      output = output.replace(/jest\.mock\s*\(\s*['"](\.\.[^'"]*?)\.js['"]/g, "jest.mock('$1'");
      output = output.replace(/jest\.mock\s*\(\s*['"](\.\/[^'"]*?)\.js['"]/g, "jest.mock('$1'");
      expect(output).toBe(expected[idx]);
    });
  });

  it('should remove .js extension from dynamic imports with relative paths', () => {
    const inputs = [
      `import('../module.js').then(mod => {});`,
      `import('./localFile.js').then(mod => {});`,
      `import('external-package.js').then(mod => {});`,
    ];
    const expected = [
      `import('../module').then(mod => {});`,
      `import('./localFile').then(mod => {});`,
      `import('external-package.js').then(mod => {});`,
    ];

    inputs.forEach((input, idx) => {
      let output = input;
      output = output.replace(/import\s*\(\s*['"](\.\.[^'"]*?)\.js['"]/g, "import('$1'");
      output = output.replace(/import\s*\(\s*['"](\.\/[^'"]*?)\.js['"]/g, "import('$1'");
      expect(output).toBe(expected[idx]);
    });
  });

  it('should not modify non-relative imports or imports without .js', () => {
    const inputs = [
      `import express from 'express';`,
      `import { something } from '../module.ts';`,
      `jest.mock('some-package');`,
      `import('some-package');`,
      `import utils from './utils';`,
    ];

    inputs.forEach((input) => {
      let output = input;
      IMPORT_REPLACEMENTS.forEach(({ regex, replacement }) => {
        output = output.replace(regex, replacement);
      });
      expect(output).toBe(input);
    });
  });
});