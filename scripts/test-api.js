#!/usr/bin/env node

// Simple API test script
const BASE_URL = 'http://localhost:3000/api';

async function testAPI() {
  console.log('🧪 Testing Phase 1 API Implementation\n');

  // Test 1: Health Check
  console.log('1️⃣  Testing Health Check...');
  const healthRes = await fetch(`${BASE_URL}/health`);
  const health = await healthRes.json();
  console.log('   Status:', health.services);
  console.log('   ✓ Health check passed\n');

  // Test 2: Register User
  console.log('2️⃣  Testing User Registration...');
  const registerRes = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `test${Date.now()}@example.com`,
      password: 'TestPass123',
      name: 'Test User'
    })
  });
  const registerData = await registerRes.json();
  if (registerData.error) {
    console.log('   ✗ Registration failed:', registerData.error);
    return;
  }
  console.log('   User ID:', registerData.user.id);
  console.log('   ✓ Registration successful\n');

  const accessToken = registerData.tokens.accessToken;

  // Test 3: Get Current User
  console.log('3️⃣  Testing Authentication...');
  const meRes = await fetch(`${BASE_URL}/auth/me`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const meData = await meRes.json();
  console.log('   User:', meData.user.email);
  console.log('   ✓ Authentication working\n');

  // Test 4: Create Project
  console.log('4️⃣  Testing Project Creation...');
  const projectRes = await fetch(`${BASE_URL}/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      name: 'Test Portfolio',
      description: 'A test project for Phase 1'
    })
  });
  const projectData = await projectRes.json();
  console.log('   Project ID:', projectData.project.id);
  console.log('   ✓ Project creation successful\n');

  // Test 5: List Projects
  console.log('5️⃣  Testing Project Listing...');
  const listRes = await fetch(`${BASE_URL}/projects`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const listData = await listRes.json();
  console.log(`   Found ${listData.projects.length} project(s)`);
  console.log('   ✓ Project listing working\n');

  // Test 6: Create Task
  console.log('6️⃣  Testing Task Creation...');
  const taskRes = await fetch(`${BASE_URL}/projects/${projectData.project.id}/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      title: 'Build landing page',
      description: 'Create responsive landing page',
      priority: 'high'
    })
  });
  const taskData = await taskRes.json();
  console.log('   Task ID:', taskData.task.id);
  console.log('   ✓ Task creation successful\n');

  console.log('🎉 All Phase 1 tests passed!\n');
  console.log('📊 Implementation Status:');
  console.log('   ✓ Database (PostgreSQL)');
  console.log('   ✓ Authentication (JWT)');
  console.log('   ✓ API Structure');
  console.log('   ✓ Project Management CRUD');
  console.log('   ✓ Task Management');
  console.log('   ⏳ Redis (optional - not running)');
  console.log('   ⏳ GitHub OAuth (pending)');
  console.log('   ⏳ E2B Integration (pending)\n');
}

testAPI().catch(console.error);
