import fs from 'fs';
import vm from 'vm';

const course = JSON.parse(
  fs.readFileSync(process.argv[2] || 'scripts/sample-course.json', 'utf8'),
);

let runtime = fs.readFileSync('_runtime_check.js', 'utf8');
const nav = { innerHTML: '' };
const page = { innerHTML: '' };
const progressFill = { style: { width: '' } };
const progressText = { textContent: '0%' };

const document = {
  readyState: 'complete',
  querySelector(sel) {
    if (sel === '#nav') return nav;
    if (sel === '#page') return page;
    if (sel === '#progress-fill') return progressFill;
    if (sel === '#progress-text') return progressText;
    return null;
  },
  querySelectorAll() {
    return [];
  },
  addEventListener() {},
  getElementById() {
    return null;
  },
};

const sandbox = {
  window: {
    __SCORM_COURSE__: course,
    scormRuntime: {
      init: () => true,
      get: () => '',
      set: () => {},
      commit: () => true,
      finish: () => {},
    },
    addEventListener() {},
  },
  document,
  console,
};

sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
const courseDataJs = `window.__SCORM_COURSE__=${JSON.stringify(course).replace(/</g, '\\u003c')};`;
vm.runInContext(courseDataJs, sandbox);
vm.runInContext(runtime, sandbox);

await new Promise((r) => setTimeout(r, 50));

console.log('nav length', nav.innerHTML.length);
console.log('page length', page.innerHTML.length);
console.log('nav preview', nav.innerHTML.slice(0, 120));
console.log('page preview', page.innerHTML.slice(0, 200));
