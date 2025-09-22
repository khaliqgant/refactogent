const { execSync } = require('child_process');
const path = require('path');

const cliPath = path.join(__dirname, 'dist/index.js');
const testProjectDir = path.join(__dirname, 'test-project-cli');

try {
  const result = execSync(`node ${cliPath} refactor-suggest ${testProjectDir} --format json`, {
    encoding: 'utf8',
    cwd: path.dirname(cliPath),
    timeout: 30000,
  });
  
  console.log('=== RAW OUTPUT ===');
  console.log(JSON.stringify(result));
  console.log('=== END RAW OUTPUT ===');
  
  console.log('=== FIRST 200 CHARS ===');
  console.log(result.substring(0, 200));
  console.log('=== END FIRST 200 CHARS ===');
  
  try {
    const parsed = JSON.parse(result);
    console.log('=== PARSED SUCCESSFULLY ===');
    console.log(JSON.stringify(parsed, null, 2));
  } catch (e) {
    console.log('=== JSON PARSE ERROR ===');
    console.log(e.message);
    console.log('Position:', e.message.match(/position (\d+)/)?.[1]);
  }
} catch (error) {
  console.error('Command failed:', error.message);
}
