import { db } from '../src/lib/db.js';
import { Octokit } from '@octokit/rest';

async function checkToken() {
  const user = await db.user.findFirst({
    where: { githubUsername: 'tristanwaite-creator' },
    select: {
      id: true,
      githubUsername: true,
      githubAccessToken: true,
    }
  });
  
  if (user) {
    console.log('User:', user.githubUsername);
    console.log('Token exists:', !!user.githubAccessToken);
    console.log('Token length:', user.githubAccessToken?.length);
    console.log('Token prefix:', user.githubAccessToken?.substring(0, 10) + '...');
    
    // Test the token with GitHub API
    if (user.githubAccessToken) {
      const octokit = new Octokit({ auth: user.githubAccessToken });
      
      try {
        const { data } = await octokit.users.getAuthenticated();
        console.log('\n✅ Token is valid!');
        console.log('Authenticated as:', data.login);
        
        // Also test repo access
        const { data: repoData } = await octokit.repos.get({
          owner: 'tristanwaite-creator',
          repo: 'ai-dev-test'
        });
        console.log('Can access repo:', repoData.full_name);
      } catch (error: any) {
        console.log('\n❌ Token validation failed:', error.message);
      }
    }
  } else {
    console.log('User not found');
  }
  
  await db.$disconnect();
}

checkToken();
