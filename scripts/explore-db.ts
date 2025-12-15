import 'dotenv/config';
import { db } from '../src/lib/db.js';

async function explore() {
  console.log('=== EXPLORING DATABASE STATE ===\n');

  // Get all projects with GitHub info
  const projects = await db.project.findMany({
    include: {
      tasks: true,
      user: { select: { email: true, githubUsername: true } }
    }
  });

  console.log('PROJECTS:', projects.length);
  for (const p of projects) {
    console.log('\n---');
    console.log('ID:', p.id);
    console.log('Name:', p.name);
    console.log('GitHub Repo:', (p.githubRepoOwner && p.githubRepoName) ? p.githubRepoOwner + '/' + p.githubRepoName : 'Not connected');
    console.log('GitHub URL:', p.githubRepoUrl || 'None');
    console.log('Sandbox ID:', p.sandboxId || 'None');
    console.log('Sandbox Status:', p.sandboxStatus || 'None');
    console.log('User:', p.user?.githubUsername || p.user?.email || 'Unknown');
    console.log('Tasks:', p.tasks.length);
    for (const t of p.tasks) {
      console.log('  - [' + t.status + '] ' + t.title);
      console.log('    Prompt:', ((t.synthesizedPrompt || t.description || 'None') as string).substring(0, 80));
      console.log('    Build Status:', t.buildStatus || 'None');
    }
  }

  // Get recent generations
  const generations = await db.generation.findMany({
    take: 3,
    orderBy: { createdAt: 'desc' },
    include: { project: { select: { name: true } } }
  });

  console.log('\n\nRECENT GENERATIONS:', generations.length);
  for (const g of generations) {
    console.log('---');
    console.log('ID:', g.id);
    console.log('Project:', g.project?.name);
    console.log('Status:', g.status);
    console.log('Sandbox ID:', g.sandboxId);
    console.log('Files:', g.filesCreated);
  }
}

explore().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
