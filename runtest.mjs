import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseGCode } from './parser.cjs';

// Determine current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testsDir = path.join(__dirname, 'tests');

// Simple equality comparison
function compareOutputs(current, proper) {
  return current === proper;
}

async function runTests() {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  
  try {
    const files = await fs.readdir(testsDir);
    // Only test files ending with .ngc
    const testFiles = files.filter(file => file.endsWith('.ngc'));

    for (const testFile of testFiles) {
      const testBase = testFile.slice(0, -4); // remove '.ngc'
      const inputPath = path.join(testsDir, testFile);
      const properOutputPath = path.join(testsDir, `${testBase}.po`);
      const currentOutputPath = path.join(testsDir, `${testBase}.co`);

      const inputContent = await fs.readFile(inputPath, 'utf-8');
      const ast = parseGCode(inputContent);
      const currentOutput = JSON.stringify(ast, null, 2);

      // Write the current output to file.
      await fs.writeFile(currentOutputPath, currentOutput, 'utf-8');

      let properExists = false;
      try {
        await fs.access(properOutputPath);
        properExists = true;
      } catch (err) {
        properExists = false;
      }

      if (properExists) {
        const properOutput = await fs.readFile(properOutputPath, 'utf-8');
        if (compareOutputs(currentOutput, properOutput)) {
          console.log(`PASS: ${testFile}`);
          passed++;
        } else {
          console.log(`FAIL: ${testFile}`);
          console.log(`See ${currentOutputPath} (current output) and ${properOutputPath} (expected output)`);
          failed++;
        }
      } else {
        console.log(`SKIP (no proper output): ${testFile}`);
        skipped++;
      }
    }

    console.log(`\nTest Summary: ${passed} passed, ${failed} failed, ${skipped} skipped.`);
  } catch (err) {
    console.error('Error running tests:', err);
  }
}

runTests();
