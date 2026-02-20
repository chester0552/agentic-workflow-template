const db = require('./db');

async function migrate() {
  const database = await db.getDb();

  // task_artifacts table
  database.run(`
    CREATE TABLE IF NOT EXISTS task_artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      artifact_type TEXT NOT NULL,
      agent TEXT,
      content TEXT,
      iteration INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES tasks(id)
    )
  `);
  database.run('CREATE INDEX IF NOT EXISTS idx_artifacts_task ON task_artifacts(task_id, artifact_type)');

  // Add columns to tasks (safe — skips if already exist)
  const cols = database.exec("PRAGMA table_info(tasks)");
  const colNames = cols[0] ? cols[0].values.map(row => row[1]) : [];

  if (!colNames.includes('iteration')) {
    database.run('ALTER TABLE tasks ADD COLUMN iteration INTEGER DEFAULT 1');
  }
  if (!colNames.includes('parent_task_id')) {
    database.run('ALTER TABLE tasks ADD COLUMN parent_task_id INTEGER');
  }

  // review_feedback table
  database.run(`
    CREATE TABLE IF NOT EXISTS review_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER,
      dimension TEXT,
      checklist_item TEXT,
      result TEXT,
      was_useful INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.saveDb(database);
  console.log('✅ Migration complete: task_artifacts, iteration tracking, review_feedback');
}

migrate().catch(err => { console.error('Migration failed:', err.message); process.exit(1); });
