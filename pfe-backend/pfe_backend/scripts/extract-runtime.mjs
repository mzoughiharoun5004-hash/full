import fs from 'fs';
const src = fs.readFileSync('src/scorm/scorm.service.ts', 'utf8');
const start = src.indexOf('return `(() => {');
const end = src.indexOf('})();`;', start);
if (start < 0 || end < 0) {
  console.error('markers not found', start, end);
  process.exit(1);
}
const code = src.slice(start + 8, end + 6);
fs.writeFileSync('_runtime_check.js', code);
console.log('bytes', code.length);
