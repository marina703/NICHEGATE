const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const sourcePath = path.join(projectRoot, 'data', 'profession-box.db');
const backupDir = path.join(projectRoot, 'runtime', 'backups');

if (!fs.existsSync(sourcePath)) {
  console.error(`Database not found: ${sourcePath}`);
  process.exitCode = 1;
} else {
  fs.mkdirSync(backupDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `profession-box-${timestamp}.db`);
  const escapedBackupPath = backupPath.replace(/'/g, "''");
  const db = new DatabaseSync(sourcePath, { readOnly: true });

  try {
    db.exec(`VACUUM INTO '${escapedBackupPath}'`);
    console.log(`Database backup created: ${backupPath}`);
  } finally {
    db.close();
  }
}
