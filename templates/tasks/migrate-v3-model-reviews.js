#!/usr/bin/env node
/**
 * Migration v3: Add model and reviews columns to tasks table
 *
 * model: Which AI model to use for developer/reviewer subagents
 *   - 'haiku' for simple fixes, syntax errors, test fixes
 *   - 'sonnet' for standard implementation (default)
 *   - 'opus' for complex architecture, optimization
 *
 * reviews: Which review dimensions to run (consolidated reviewer)
 *   - null: Use category-based defaults (orchestrator determines)
 *   - 'qa': QA review only
 *   - 'qa,security': QA + Security
 *   - 'qa,pm': QA + Requirements
 *   - 'qa,security,pm': Full review (all 3 dimensions)
 *
 * Run: node tasks/migrate-v3-model-reviews.js
 */

const db = require('./db');

async function migrate() {
  console.log('Starting migration v3: model + reviews columns...\n');

  const database = await db.getDb();

  // Check if columns already exist
  const tableInfo = database.exec("PRAGMA table_info(tasks)");
  const columns = tableInfo[0].values.map(row => row[1]);

  let changes = 0;

  if (!columns.includes('model')) {
    database.run("ALTER TABLE tasks ADD COLUMN model TEXT DEFAULT 'sonnet'");
    console.log('  Added "model" column (default: sonnet)');
    changes++;
  } else {
    console.log('  "model" column already exists');
  }

  if (!columns.includes('reviews')) {
    database.run("ALTER TABLE tasks ADD COLUMN reviews TEXT");
    console.log('  Added "reviews" column (default: null = category-based)');
    changes++;
  } else {
    console.log('  "reviews" column already exists');
  }

  if (changes > 0) {
    db.saveDb(database);
    console.log(`\n${changes} column(s) added.\n`);

    console.log('Applying smart defaults to existing tasks...');

    // Fix tasks → haiku model + qa-only reviews
    database.run("UPDATE tasks SET model = 'haiku', reviews = 'qa' WHERE title LIKE 'Fix:%' OR title LIKE 'Fix %'");
    const fixResult = database.exec("SELECT COUNT(*) FROM tasks WHERE model = 'haiku' AND reviews = 'qa' AND (title LIKE 'Fix:%' OR title LIKE 'Fix %')");
    const fixCount = fixResult[0]?.values[0]?.[0] || 0;
    console.log(`  ${fixCount} fix tasks -> model: haiku, reviews: qa`);

    // Follow-up tasks → haiku model + qa-only reviews
    database.run("UPDATE tasks SET model = 'haiku', reviews = 'qa' WHERE title LIKE 'Follow-up:%' OR title LIKE 'Follow-up %'");
    const followupResult = database.exec("SELECT COUNT(*) FROM tasks WHERE model = 'haiku' AND (title LIKE 'Follow-up:%' OR title LIKE 'Follow-up %')");
    const followupCount = followupResult[0]?.values[0]?.[0] || 0;
    console.log(`  ${followupCount} follow-up tasks -> model: haiku, reviews: qa`);

    // Test-related tasks → sonnet model + qa-only reviews
    database.run("UPDATE tasks SET reviews = 'qa' WHERE (category = 'Testing' OR title LIKE '%test%') AND reviews IS NULL");
    const testResult = database.exec("SELECT COUNT(*) FROM tasks WHERE reviews = 'qa' AND (category = 'Testing' OR title LIKE '%test%')");
    const testCount = testResult[0]?.values[0]?.[0] || 0;
    console.log(`  ${testCount} test tasks -> reviews: qa`);

    db.saveDb(database);
    console.log('\nSmart defaults applied.');
  } else {
    console.log('\nNo changes needed. Migration already applied.');
  }

  await db.close();
  console.log('Migration v3 complete.');
}

migrate().catch(err => {
  console.error(`Migration failed: ${err.message}`);
  process.exit(1);
});
