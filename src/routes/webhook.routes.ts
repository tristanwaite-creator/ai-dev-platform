import { Router } from 'express';
import crypto from 'crypto';
import { asyncHandler } from '../middleware/error.middleware.js';
import { db } from '../lib/db.js';

const router = Router();

/**
 * Verify GitHub webhook signature
 * GitHub signs webhook payloads with HMAC-SHA256 using the webhook secret
 */
function verifyGitHubSignature(payload: string, signature: string | undefined, secret: string): boolean {
  if (!signature) {
    return false;
  }

  // GitHub signature format: sha256=<hash>
  const expectedSignature = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

/**
 * GitHub Webhook Handler
 * Handles events from GitHub webhooks
 *
 * Setup:
 * 1. Go to your GitHub repository → Settings → Webhooks
 * 2. Add webhook with URL: https://your-domain.com/api/webhooks/github
 * 3. Set secret to GITHUB_WEBHOOK_SECRET from .env
 * 4. Select events: Pull requests
 */
router.post(
  '/github',
  asyncHandler(async (req, res) => {
    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('❌ GITHUB_WEBHOOK_SECRET not configured');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    // Verify webhook signature
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    const payload = JSON.stringify(req.body);

    if (!verifyGitHubSignature(payload, signature, webhookSecret)) {
      console.error('❌ Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Get event type
    const eventType = req.headers['x-github-event'] as string;
    const hookId = req.headers['x-github-delivery'] as string;

    console.log(`📥 GitHub webhook received: ${eventType} (ID: ${hookId})`);

    // Handle pull request events
    if (eventType === 'pull_request') {
      const { action, pull_request, repository } = req.body;

      console.log(`🔔 Pull Request ${action}: #${pull_request.number} in ${repository.full_name}`);

      // Extract branch name to find associated task
      const branchName = pull_request.head.ref;
      console.log(`🌿 Branch: ${branchName}`);

      // Find task by branch name and PR number
      const task = await db.task.findFirst({
        where: {
          branchName: branchName,
          prNumber: pull_request.number,
        },
        include: {
          project: true,
        },
      });

      if (!task) {
        console.log(`⚠️  No task found for branch ${branchName} and PR #${pull_request.number}`);
        return res.status(200).json({
          message: 'No associated task found',
          processed: false,
        });
      }

      console.log(`📋 Found task: ${task.title} (ID: ${task.id})`);

      // Handle different PR actions
      switch (action) {
        case 'closed':
          if (pull_request.merged) {
            // PR was merged - mark task as done
            console.log(`✅ PR #${pull_request.number} merged - updating task to 'done'`);

            await db.task.update({
              where: { id: task.id },
              data: {
                status: 'done',
                column: 'done',
                buildStatus: 'ready',
                completedAt: new Date(),
              },
            });

            console.log(`✅ Task ${task.id} moved to 'done'`);

            return res.status(200).json({
              message: 'Task marked as done',
              taskId: task.id,
              action: 'merged',
            });
          } else {
            // PR was closed without merging - revert task to todo
            console.log(`🔙 PR #${pull_request.number} closed without merge - reverting task to 'todo'`);

            await db.task.update({
              where: { id: task.id },
              data: {
                status: 'todo',
                column: 'research',
                buildStatus: 'pending',
              },
            });

            console.log(`🔙 Task ${task.id} reverted to 'todo'`);

            return res.status(200).json({
              message: 'Task reverted to todo',
              taskId: task.id,
              action: 'closed_without_merge',
            });
          }

        case 'opened':
          console.log(`🆕 PR #${pull_request.number} opened - task already tracked`);
          return res.status(200).json({
            message: 'PR opened',
            taskId: task.id,
            action: 'opened',
          });

        case 'reopened':
          console.log(`🔄 PR #${pull_request.number} reopened - updating task`);

          await db.task.update({
            where: { id: task.id },
            data: {
              status: 'review',
              column: 'testing',
              buildStatus: 'ready',
            },
          });

          return res.status(200).json({
            message: 'Task updated for reopened PR',
            taskId: task.id,
            action: 'reopened',
          });

        case 'ready_for_review':
          console.log(`👀 PR #${pull_request.number} ready for review - updating task`);

          await db.task.update({
            where: { id: task.id },
            data: {
              status: 'review',
              column: 'testing',
            },
          });

          return res.status(200).json({
            message: 'Task moved to review',
            taskId: task.id,
            action: 'ready_for_review',
          });

        default:
          console.log(`ℹ️  Unhandled PR action: ${action}`);
          return res.status(200).json({
            message: 'Event received but not processed',
            action,
          });
      }
    }

    // Acknowledge other events
    console.log(`ℹ️  Event ${eventType} received but not handled`);
    return res.status(200).json({ message: 'Event received' });
  })
);

/**
 * Webhook ping handler for testing
 * GitHub sends a ping event when webhook is first created
 */
router.post(
  '/github/ping',
  asyncHandler(async (req, res) => {
    console.log('🏓 GitHub webhook ping received');
    res.status(200).json({ message: 'pong' });
  })
);

/**
 * Health check endpoint for webhooks
 */
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    webhookSecret: !!process.env.GITHUB_WEBHOOK_SECRET,
  });
});

export default router;
