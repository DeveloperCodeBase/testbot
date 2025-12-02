
const { glob } = require('fast-glob');
const path = require('path');

async function testGlob() {
    const cwd = '/home/ubuntu/Desktop/test1/ai-testbot-demo-monorepo/backend-node';
    const pattern = '**/*.e2e.{ts,js,tsx,jsx}';

    console.log(`Searching in: ${cwd}`);
    console.log(`Pattern: ${pattern}`);

    const files = await glob(pattern, {
        cwd: cwd,
        absolute: true,
        onlyFiles: true
    });

    console.log(`Found ${files.length} files:`);
    files.forEach(f => console.log(f));
}

testGlob();
