const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src');
const distDir = path.join(__dirname, '..', 'dist');

/** 폴더가 없으면 생성 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** 파일 복사 (와일드카드 지원 x, 직접 리스트업) */
function copyFile(src, dest) {
  try {
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    }
  } catch (err) {
    console.error(`Error copying ${src} to ${dest}:`, err);
  }
}

/** 디렉토리 전체 복사 (.bak 파일 제외) */
function copyDir(src, dest) {
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (let entry of entries) {
    // .bak 파일은 빌드 결과물에서 제외
    if (entry.name.endsWith('.bak')) continue;

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFile(srcPath, destPath);
    }
  }
}

// 1. dist 폴더 준비
ensureDir(distDir);

/** 특정 폴더만 청소 */
function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  ensureDir(dir);
}

// 2. 개별 리소스 복사 (.html, .css)
const files = fs.readdirSync(srcDir);
files.forEach(file => {
  if (file.endsWith('.html') || file.endsWith('.css')) {
    copyFile(path.join(srcDir, file), path.join(distDir, file));
  }
});

// 3. 디렉토리 복사 (icons, assets)
const dirsToCopy = ['icons', 'assets'];
dirsToCopy.forEach(dir => {
  const s = path.join(srcDir, dir);
  const d = path.join(distDir, dir);
  if (fs.existsSync(s)) {
    cleanDir(d); // 복사 전 대상 폴더 청소
    copyDir(s, d);
  }
});

console.log('✅ Resources copied to dist/ successfully.');
