#!/usr/bin/env node

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function header(message) {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(message, 'bright');
  log('='.repeat(60), 'cyan');
}

// Readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise((resolve) => {
    rl.question(`${colors.blue}${question}${colors.reset} `, resolve);
  });
}

async function gatherInputs() {
  header('AGENTIC WORKFLOW BOOTSTRAP');
  log('Setting up an orchestrated subagent workflow for Claude Code\n', 'cyan');

  const answers = {};

  answers.projectName = await ask('1. Project name (e.g., "My SaaS App"):');
  answers.description = await ask('2. Short description (one line):');
  answers.techStack = await ask('3. Tech stack summary (e.g., "Next.js 14 + TypeScript + PostgreSQL + Tailwind CSS"):');
  answers.framework = await ask('4. Primary framework (e.g., "Next.js", "Astro", "Vue", "SvelteKit"):');
  answers.styling = await ask('5. Styling approach (e.g., "Tailwind CSS", "CSS Modules", "styled-components") or "none":');
  answers.cms = await ask('6. CMS/backend (e.g., "Strapi", "Supabase", "none"):');
  answers.hosting = await ask('7. Hosting target (e.g., "Vercel", "Cloudflare Pages", "AWS"):');
  answers.testing = await ask('8. Testing framework (e.g., "Vitest", "Jest", "Playwright") or "none":');
  answers.brandColors = await ask('9. Brand colors (comma-separated hex codes, or "skip" to fill later):');
  answers.fonts = await ask('10. Font families (comma-separated: "headings: X, body: Y", or "skip"):');

  return answers;
}

function deriveValues(answers) {
  const derived = {};

  // CMS_NAME: empty if "none", otherwise the CMS name (used for security keyword enrichment)
  const cmsName = answers.cms.toLowerCase() === 'none' ? '' : answers.cms;

  // SECURITY_KEYWORDS: base list + CMS name if applicable
  const baseKeywords = 'API, form, fetch, POST, env, .env, token, auth, secret, cookie, session, input, validation, CSRF, XSS, redirect, sanitize';
  derived.SECURITY_KEYWORDS = cmsName ? `${baseKeywords}, ${cmsName}` : baseKeywords;

  // BRAND_COLORS: use "TBD" message if skipped
  derived.BRAND_COLORS = answers.brandColors.toLowerCase() === 'skip'
    ? 'TBD — fill in .claude/context/design-system.md'
    : answers.brandColors;

  // FONTS: use "TBD" message if skipped
  derived.FONTS = answers.fonts.toLowerCase() === 'skip'
    ? 'TBD — fill in .claude/context/design-system.md'
    : answers.fonts;

  return derived;
}

function buildReplacements(answers, derived) {
  return {
    '{{PROJECT_NAME}}': answers.projectName,
    '{{PROJECT_DESCRIPTION}}': answers.description,
    '{{TECH_STACK}}': answers.techStack,
    '{{FRAMEWORK}}': answers.framework,
    '{{STYLING}}': answers.styling,
    '{{CMS}}': answers.cms,
    '{{HOSTING}}': answers.hosting,
    '{{TESTING}}': answers.testing,
    '{{BRAND_COLORS}}': derived.BRAND_COLORS,
    '{{FONTS}}': derived.FONTS,
    '{{SECURITY_KEYWORDS}}': derived.SECURITY_KEYWORDS,
  };
}

function replaceTokens(content, replacements) {
  let result = content;
  for (const [token, value] of Object.entries(replacements)) {
    result = result.split(token).join(value);
  }
  return result;
}

function processDirectory(sourceDir, targetDir, replacements, filesCreated = []) {
  // Ensure target directory exists
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const items = fs.readdirSync(sourceDir);

  for (const item of items) {
    const sourcePath = path.join(sourceDir, item);
    const targetPath = path.join(targetDir, item);
    const stat = fs.statSync(sourcePath);

    if (stat.isDirectory()) {
      processDirectory(sourcePath, targetPath, replacements, filesCreated);
    } else {
      // Read file, replace tokens, write to target
      const content = fs.readFileSync(sourcePath, 'utf8');
      const processed = replaceTokens(content, replacements);
      fs.writeFileSync(targetPath, processed, 'utf8');
      filesCreated.push(path.relative(targetDir, targetPath));
    }
  }

  return filesCreated;
}

async function main() {
  try {
    // Gather inputs
    const answers = await gatherInputs();
    rl.close();

    // Derive computed values
    const derived = deriveValues(answers);

    // Build replacement map
    const replacements = buildReplacements(answers, derived);

    header('PROCESSING TEMPLATES');

    // Locate templates directory (relative to this script)
    const scriptDir = __dirname;
    const templatesDir = path.join(scriptDir, 'templates');
    const targetDir = process.cwd();

    if (!fs.existsSync(templatesDir)) {
      log('ERROR: templates/ directory not found!', 'yellow');
      log(`Expected at: ${templatesDir}`, 'yellow');
      process.exit(1);
    }

    log(`Source: ${templatesDir}`, 'cyan');
    log(`Target: ${targetDir}\n`, 'cyan');

    // Process all files
    const filesCreated = [];
    processDirectory(templatesDir, targetDir, replacements, filesCreated);

    log(`\n✓ Created ${filesCreated.length} files`, 'green');

    header('INSTALLING DEPENDENCIES');

    const tasksDir = path.join(targetDir, 'tasks');
    if (fs.existsSync(tasksDir)) {
      try {
        log('Running npm install in tasks/...', 'cyan');
        execSync('npm install', { cwd: tasksDir, stdio: 'inherit' });
        log('✓ Dependencies installed', 'green');
      } catch (error) {
        log('⚠ npm install failed, but continuing. Run "npm install" manually in tasks/ directory.', 'yellow');
      }
    } else {
      log('⚠ tasks/ directory not found, skipping npm install', 'yellow');
    }

    header('INITIALIZING TASK DATABASE');

    const cliPath = path.join(tasksDir, 'cli.js');
    if (fs.existsSync(cliPath)) {
      try {
        log('Running node tasks/cli.js list (triggers DB init)...', 'cyan');
        execSync('node tasks/cli.js list', { cwd: targetDir, stdio: 'pipe' });
        log('✓ Task database initialized', 'green');
      } catch (error) {
        log('⚠ Database initialization failed, but continuing. Run "node tasks/cli.js list" manually.', 'yellow');
      }
    }

    header('SETUP COMPLETE!');

    log('\n📋 NEXT STEPS:\n', 'bright');
    log('1. Fill in context files:', 'cyan');
    log('   - .claude/context/project-overview.md');
    log('   - .claude/context/design-system.md');
    log('   - .claude/context/requirements-summary.md\n');

    log('2. Create your first task:', 'cyan');
    log('   node tasks/cli.js add --title "Your first task" --priority HIGH --description "..." --category Development\n');

    log('3. Start working:', 'cyan');
    log('   Tell Claude: "work on task 1"\n');

    log('📚 Read .claude/ORCHESTRATION.md for full workflow details', 'blue');
    log('🤖 Your orchestrator + subagent workflow is ready!\n', 'green');

  } catch (error) {
    log(`\n❌ ERROR: ${error.message}`, 'yellow');
    process.exit(1);
  }
}

main();
