#!/usr/bin/env node

const db = require('./db');

const args = process.argv.slice(2);
const command = args[0];

function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].replace('--', '');
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
      flags[key] = value;
      if (value !== true) i++;
    }
  }
  return flags;
}

function formatTask(task) {
  const statusIcons = {
    ready: '⬡',
    in_progress: '▶',
    blocked: '🔴',
    completed: '✅'
  };
  const priorityColors = {
    CRITICAL: '\x1b[31m',
    HIGH: '\x1b[33m',
    MEDIUM: '\x1b[36m',
    LOW: '\x1b[37m'
  };
  const reset = '\x1b[0m';
  const icon = statusIcons[task.status] || '?';
  const color = priorityColors[task.priority] || '';

  let line = `${icon} #${task.id} ${color}[${task.priority}]${reset} ${task.title}`;
  if (task.status === 'in_progress' && task.claimed_by) {
    const sessionNote = task.claimed_by_session ? ` @ ${task.claimed_by_session}` : '';
    line += ` (${task.claimed_by}${sessionNote})`;
  }
  if (task.group_name) line += ` [Group ${task.group_name}]`;
  return line;
}

function formatTaskDetail(task) {
  const lines = [
    `╔══════════════════════════════════════════════════`,
    `║ Task #${task.id}: ${task.title}`,
    `╠══════════════════════════════════════════════════`,
    `║ Status:     ${task.status}`,
    `║ Priority:   ${task.priority}`,
    `║ Group:      ${task.group_name || 'None'}`,
    `║ Category:   ${task.category || 'None'}`,
  ];

  lines.push(`║ Model:      ${task.model || 'sonnet'}`);
  lines.push(`║ Reviews:    ${task.reviews || 'auto (category-based)'}`);
  if (task.description) lines.push(`║ Description: ${task.description}`);
  if (task.files_affected) lines.push(`║ Files:      ${task.files_affected}`);
  if (task.tests) lines.push(`║ Tests:      ${task.tests}`);
  if (task.blocked_by) lines.push(`║ Blocked By: ${task.blocked_by}`);
  if (task.claimed_by) {
    const sessionNote = task.claimed_by_session ? ` @ ${task.claimed_by_session}` : '';
    lines.push(`║ Claimed By: ${task.claimed_by}${sessionNote} (${task.claimed_at})`);
  }
  if (task.fix_required) lines.push(`║ Fix Req:    ${task.fix_required}`);
  if (task.completion_summary) lines.push(`║ Summary:    ${task.completion_summary}`);
  if (task.completed_at) lines.push(`║ Completed:  ${task.completed_at} by ${task.completed_by}`);

  lines.push(`║ Created:    ${task.created_at}`);
  lines.push(`║ Updated:    ${task.updated_at}`);
  lines.push(`╚══════════════════════════════════════════════════`);

  return lines.join('\n');
}

async function main() {
  try {
    switch (command) {

      // ═══ TASK MANAGEMENT ═══

      case 'list': {
        const flags = parseFlags(args.slice(1));
        const tasks = await db.listTasks({
          status: flags.status,
          priority: flags.priority,
          group_name: flags.group,
          category: flags.category,
          claimed_by: flags.agent,
          claimed_by_session: flags.session
        });
        if (!tasks.length) {
          console.log('No tasks found matching filters.');
          break;
        }
        console.log(`\n📋 Tasks (${tasks.length}):\n`);
        for (const task of tasks) {
          console.log('  ' + formatTask(task));
        }
        console.log('');
        break;
      }

      case 'get': {
        const id = parseInt(args[1]);
        if (!id) { console.error('Usage: get <id>'); process.exit(1); }
        const task = await db.getTask(id);
        if (!task) { console.error(`Task #${id} not found`); process.exit(1); }
        console.log(formatTaskDetail(task));
        break;
      }

      case 'add': {
        const flags = parseFlags(args.slice(1));
        if (!flags.title) { console.error('Usage: add --title "Title" [--priority HIGH] [--group A] [--description "..."] [--category "..."] [--files "..."] [--blocked-by "1,2"] [--model sonnet] [--reviews "qa,security,pm"]'); process.exit(1); }
        const id = await db.addTask({
          title: flags.title,
          priority: flags.priority || 'MEDIUM',
          group_name: flags.group,
          category: flags.category,
          description: flags.description,
          files_affected: flags.files,
          tests: flags.tests,
          blocked_by: flags['blocked-by'],
          model: flags.model || 'sonnet',
          reviews: flags.reviews
        });
        console.log(`✅ Task #${id} created: ${flags.title} [model: ${flags.model || 'sonnet'}]`);
        break;
      }

      case 'update': {
        const id = parseInt(args[1]);
        if (!id) { console.error('Usage: update <id> --field value'); process.exit(1); }
        const flags = parseFlags(args.slice(2));
        const updates = {};
        if (flags.title) updates.title = flags.title;
        if (flags.priority) updates.priority = flags.priority;
        if (flags.status) updates.status = flags.status;
        if (flags.group) updates.group_name = flags.group;
        if (flags.category) updates.category = flags.category;
        if (flags.description) updates.description = flags.description;
        if (flags.files) updates.files_affected = flags.files;
        if (flags.tests) updates.tests = flags.tests;
        if (flags['blocked-by']) updates.blocked_by = flags['blocked-by'];
        if (flags.model) updates.model = flags.model;
        if (flags.reviews) updates.reviews = flags.reviews;

        await db.updateTask(id, updates);
        console.log(`✅ Task #${id} updated`);
        break;
      }

      case 'claim': {
        const id = parseInt(args[1]);
        const flags = parseFlags(args.slice(2));
        if (!id) { console.error('Usage: claim <id> --agent <name> [--session <session-id>]'); process.exit(1); }
        await db.claimTask(id, flags.agent || 'primary', flags.session);
        const sessionNote = flags.session ? ` (session: ${flags.session})` : '';
        console.log(`✅ Task #${id} claimed by ${flags.agent || 'primary'}${sessionNote}`);
        break;
      }

      case 'release': {
        const id = parseInt(args[1]);
        if (!id) { console.error('Usage: release <id>'); process.exit(1); }
        await db.releaseTask(id);
        console.log(`✅ Task #${id} released`);
        break;
      }

      case 'complete': {
        const id = parseInt(args[1]);
        const flags = parseFlags(args.slice(2));
        if (!id) { console.error('Usage: complete <id> --summary "..."'); process.exit(1); }
        await db.completeTask(id, flags.summary || 'Completed', flags.agent);
        console.log(`✅ Task #${id} completed`);
        break;
      }

      case 'block': {
        const id = parseInt(args[1]);
        const flags = parseFlags(args.slice(2));
        if (!id) { console.error('Usage: block <id> --reason "..."'); process.exit(1); }
        await db.blockTask(id, flags.reason || 'Blocked');
        console.log(`🔴 Task #${id} blocked: ${flags.reason || 'Blocked'}`);
        break;
      }

      case 'unblock': {
        const id = parseInt(args[1]);
        if (!id) { console.error('Usage: unblock <id>'); process.exit(1); }
        await db.unblockTask(id);
        console.log(`✅ Task #${id} unblocked`);
        break;
      }

      // ═══ ANALYTICS ═══

      case 'stats': {
        const stats = await db.getStats();
        console.log(`
╔══════════════════════════════════════════════
║  📊 Task Statistics
╠══════════════════════════════════════════════
║  Total:        ${stats.total}
║  Ready:        ${stats.ready}
║  In Progress:  ${stats.in_progress}
║  Blocked:      ${stats.blocked}
║  Completed:    ${stats.completed}
║  Completion:   ${stats.completion_pct}%
╚══════════════════════════════════════════════
`);
        break;
      }

      case 'history': {
        const id = parseInt(args[1]);
        if (!id) { console.error('Usage: history <id>'); process.exit(1); }
        const history = await db.getHistory(id);
        if (!history.length) {
          console.log(`No history for Task #${id}`);
          break;
        }
        console.log(`\n📜 History for Task #${id}:\n`);
        for (const entry of history) {
          console.log(`  ${entry.timestamp} | ${entry.action} | Agent: ${entry.agent || 'system'} | ${entry.old_value || ''} → ${entry.new_value || ''}`);
        }
        console.log('');
        break;
      }

      case 'stale': {
        const flags = parseFlags(args.slice(1));
        const hours = parseInt(flags.hours) || 24;
        const stale = await db.getStaleTasks(hours);
        if (!stale.length) {
          console.log(`No stale tasks (threshold: ${hours}h)`);
          break;
        }
        console.log(`\n⚠️ Stale Tasks (>${hours}h):\n`);
        for (const task of stale) {
          console.log('  ' + formatTask(task) + ` (claimed: ${task.claimed_at})`);
        }
        console.log('');
        break;
      }

      case 'next': {
        const task = await db.getNextTask();
        if (!task) {
          console.log('No ready tasks available.');
          break;
        }
        console.log(`\n🎯 Suggested next task:\n`);
        console.log(formatTaskDetail(task));
        break;
      }

      case 'agent-stats': {
        const stats = await db.getAgentStats();
        if (!stats.length) {
          console.log('No agent activity recorded yet.');
          break;
        }
        console.log(`\n🤖 Agent Performance:\n`);
        for (const stat of stats) {
          console.log(`  ${stat.agent}: ${stat.completions} completions, ${stat.claims} claims, ${stat.actions} total actions`);
        }
        console.log('');
        break;
      }

      // ═══ MULTI-SESSION ═══

      case 'session-start': {
        const sessionId = args[1];
        if (!sessionId) { console.error('Usage: session-start <session-name>'); process.exit(1); }
        const flags = parseFlags(args.slice(2));
        await db.startSession(sessionId, flags.agent);
        console.log(`✅ Session "${sessionId}" started`);
        break;
      }

      case 'session-active': {
        const sessions = await db.getActiveSessions();
        if (!sessions.length) {
          console.log('No active sessions.');
          break;
        }
        console.log(`\n🟢 Active Sessions:\n`);
        for (const s of sessions) {
          const taskCount = s.task_count || 0;
          console.log(`  ${s.session_id} | Agent: ${s.agent_type} | Tasks: ${taskCount} | Started: ${s.started_at}`);
        }
        console.log('');
        break;
      }

      case 'session-tasks': {
        const sessionId = args[1];
        if (!sessionId) { console.error('Usage: session-tasks <session-id>'); process.exit(1); }
        const tasks = await db.getTasksBySession(sessionId);
        if (!tasks.length) {
          console.log(`No tasks found for session "${sessionId}"`);
          break;
        }
        console.log(`\n📋 Tasks for session "${sessionId}" (${tasks.length}):\n`);
        for (const task of tasks) {
          console.log('  ' + formatTask(task));
        }
        console.log('');
        break;
      }

      case 'session-claim': {
        const sessionId = args[1];
        const taskId = parseInt(args[2]);
        if (!sessionId || !taskId) {
          console.error('Usage: session-claim <session-id> <task-id> [--agent developer]');
          process.exit(1);
        }
        const flags = parseFlags(args.slice(3));
        await db.assignTaskToSession(taskId, sessionId, flags.agent || 'developer');
        console.log(`✅ Task #${taskId} assigned to session "${sessionId}"`);
        break;
      }

      case 'session-end': {
        const sessionId = args[1];
        if (!sessionId) { console.error('Usage: session-end <session-name>'); process.exit(1); }
        await db.endSession(sessionId);
        console.log(`✅ Session "${sessionId}" ended`);
        break;
      }

      case 'session-cleanup': {
        const database = await db.getDb();
        database.run(`UPDATE sessions SET status = 'stale' WHERE status = 'active' AND last_active < datetime('now', '-2 hours')`);
        db.saveDb(database);
        console.log('✅ Stale sessions cleaned up');
        break;
      }

      case 'conflict-check': {
        const ids = (args[1] || '').split(',').map(s => parseInt(s.trim())).filter(Boolean);
        if (ids.length < 2) { console.error('Usage: conflict-check 1,2,3'); process.exit(1); }
        const conflicts = await db.conflictCheck(ids);
        if (!conflicts.length) {
          console.log('✅ No file conflicts detected');
        } else {
          console.log(`\n⚠️ File Conflicts:\n`);
          for (const c of conflicts) {
            console.log(`  Task #${c.task_a} vs Task #${c.task_b}: ${c.conflicting_files.join(', ')}`);
          }
        }
        break;
      }

      case 'suggest-batch': {
        const flags = parseFlags(args.slice(1));
        const sessions = parseInt(flags.sessions) || 2;
        const autoAssign = flags.assign === true || flags.assign === 'true';
        const agent = flags.agent || 'developer';

        const batches = await db.suggestBatch(sessions, autoAssign, agent);

        if (autoAssign) {
          console.log(`\n✅ Tasks assigned to ${sessions} sessions:\n`);
        } else {
          console.log(`\n📦 Suggested Batch (${sessions} sessions):\n`);
        }

        for (const batch of batches) {
          console.log(`  ${batch.session}:`);
          for (const task of batch.tasks) {
            console.log(`    #${task.id} [${task.priority}] ${task.title}`);
          }
        }

        if (!autoAssign) {
          console.log('\nTo actually assign these tasks, run:');
          console.log(`  node tasks/cli.js suggest-batch --sessions ${sessions} --assign --agent ${agent}`);
        }

        console.log('');
        break;
      }

      // ═══ VISUALIZATION ═══

      case 'dependency-tree': {
        const id = parseInt(args[1]);
        if (!id) { console.error('Usage: dependency-tree <id>'); process.exit(1); }
        const tree = await db.getDependencyTree(id);
        if (!tree) { console.error(`Task #${id} not found`); process.exit(1); }

        function printTree(node, indent = '') {
          const icon = node.status === 'completed' ? '✅' : node.status === 'blocked' ? '🔴' : '⬡';
          console.log(`${indent}${icon} #${node.id} ${node.title} [${node.priority}] (${node.status})`);
          for (const child of node.children) {
            printTree(child, indent + '  ├─ ');
          }
        }
        console.log(`\n🌲 Dependency Tree:\n`);
        printTree(tree);
        console.log('');
        break;
      }

      case 'dependency-graph': {
        const tasks = await db.listTasks({});
        console.log(`\n📊 Dependency Graph:\n`);
        for (const task of tasks) {
          const deps = (task.blocked_by || '').split(',').map(s => s.trim()).filter(Boolean);
          if (deps.length) {
            console.log(`  #${task.id} ${task.title} ← blocked by: ${deps.map(d => '#' + d).join(', ')}`);
          }
        }
        const noDeps = tasks.filter(t => !t.blocked_by);
        if (noDeps.length) {
          console.log(`\n  Independent tasks: ${noDeps.map(t => '#' + t.id).join(', ')}`);
        }
        console.log('');
        break;
      }

      // ═══ EXPORT ═══

      case 'export': {
        const flags = parseFlags(args.slice(1));
        const format = flags.format || 'json';
        const output = await db.exportTasks(format);
        if (flags.file) {
          const fs = require('fs');
          fs.writeFileSync(flags.file, output);
          console.log(`✅ Exported to ${flags.file}`);
        } else {
          console.log(output);
        }
        break;
      }

      // ═══ HELP ═══

      case 'help':
      default: {
        console.log(`
╔══════════════════════════════════════════════════════════════════
║  {{PROJECT_NAME}} - Task Management CLI
╠══════════════════════════════════════════════════════════════════
║
║  Task Management:
║    list [--status X] [--priority X] [--session X]  List tasks
║    get <id>                                         Get task details
║    add --title "..." [--priority X] [--model X]     Create task
║        [--group X] [--reviews "qa,security,pm"]
║    update <id> --field value                        Update task
║    claim <id> [--agent name] [--session id]         Claim task
║    release <id>                                     Release task
║    complete <id> --summary "..."                    Complete task
║    block <id> --reason "..."                        Block task
║    unblock <id>                                     Unblock task
║
║  Analytics:
║    stats                                            Overall statistics
║    history <id>                                     Task history
║    stale [--hours N]                                Find stale tasks
║    next                                             Suggest next task
║    agent-stats                                      Agent performance
║
║  Multi-Session:
║    session-start <name> [--agent type]              Start session
║    session-active                                   List active sessions
║    session-tasks <session-id>                       List session tasks
║    session-claim <session-id> <task-id> [--agent X] Assign task to session
║    session-end <name>                               End session
║    session-cleanup                                  Clean stale sessions
║    conflict-check <id1,id2,...>                     Check file conflicts
║    suggest-batch [--sessions N] [--assign]          Suggest/assign batches
║
║  Visualization:
║    dependency-tree <id>                             Show dependency tree
║    dependency-graph                                 Show all dependencies
║
║  Export:
║    export [--format json|md] [--file path]          Export tasks
║
║  help                                               Show this help
║
╚══════════════════════════════════════════════════════════════════
`);
        break;
      }
    }
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  } finally {
    await db.close();
  }
}

main();
