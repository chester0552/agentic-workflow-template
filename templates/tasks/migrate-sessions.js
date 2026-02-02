#!/usr/bin/env node

/**
 * Migration Script: Add Multi-Session Support
 *
 * Adds claimed_by_session field to tasks table for session-based task isolation.
 * Can be run multiple times safely (idempotent).
 *
 * Usage: node tasks/migrate-sessions.js
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'tasks.db');

async function migrate() {
  console.log('Starting multi-session migration...\n');

  if (!fs.existsSync(DB_PATH)) {
    console.error('Error: Database file not found at', DB_PATH);
    console.error('Run the CLI first to create the database.');
    process.exit(1);
  }

  const SQL = await initSqlJs();
  const buffer = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(buffer);

  try {
    // Check if column already exists
    const tableInfo = db.exec('PRAGMA table_info(tasks)');
    const columns = tableInfo[0]?.values.map(row => row[1]) || [];

    if (columns.includes('claimed_by_session')) {
      console.log('✅ Migration already applied - claimed_by_session column exists');
      console.log('   Nothing to do.');
      db.close();
      return;
    }

    console.log('Adding claimed_by_session column to tasks table...');

    // Add the new column
    db.run('ALTER TABLE tasks ADD COLUMN claimed_by_session TEXT');

    console.log('✅ Column added successfully');

    // Create index for faster session-based queries
    console.log('Creating index on claimed_by_session...');
    db.run('CREATE INDEX IF NOT EXISTS idx_tasks_session ON tasks(claimed_by_session)');
    console.log('✅ Index created');

    // Save the database
    const data = db.export();
    const newBuffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, newBuffer);

    console.log('✅ Database saved');
    console.log('\n🎉 Migration completed successfully!');
    console.log('\nYou can now use session-based task claiming:');
    console.log('  node tasks/cli.js claim <id> --agent developer --session my-session');
    console.log('  node tasks/cli.js list --session my-session');
    console.log('  node tasks/cli.js session-tasks my-session');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

migrate();
