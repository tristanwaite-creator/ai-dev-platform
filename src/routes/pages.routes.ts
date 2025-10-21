import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/error.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { db } from '../lib/db.js';

const router = Router();

// All pages routes require authentication
router.use(authenticate);

/**
 * GET /projects/:projectId/pages
 * Get all pages for a project (hierarchical structure)
 */
router.get(
  '/projects/:projectId/pages',
  asyncHandler(async (req: Request, res: Response) => {
    const { projectId } = req.params;

    // Verify project ownership
    const project = await db.project.findFirst({
      where: { id: projectId, userId: req.userId! },
    });

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    // Get all pages with their nested structure
    const pages = await db.page.findMany({
      where: { projectId, isArchived: false },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        _count: {
          select: {
            blocks: true,
            children: true,
          },
        },
      },
      orderBy: { order: 'asc' },
    });

    res.json({ pages });
  })
);

/**
 * POST /projects/:projectId/pages
 * Create a new page
 */
router.post(
  '/projects/:projectId/pages',
  asyncHandler(async (req: Request, res: Response) => {
    const { projectId } = req.params;
    const { title = 'Untitled', icon, parentId, type = 'document' } = req.body;

    // Verify project ownership
    const project = await db.project.findFirst({
      where: { id: projectId, userId: req.userId! },
    });

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    // If parentId provided, verify it exists and belongs to same project
    if (parentId) {
      const parent = await db.page.findFirst({
        where: { id: parentId, projectId },
      });

      if (!parent) {
        res.status(404).json({ error: 'Parent page not found' });
        return;
      }
    }

    // Get the max order for pages at this level (same parent or root)
    const maxOrderPage = await db.page.findFirst({
      where: {
        projectId,
        parentId: parentId || null,
      },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    const order = maxOrderPage ? maxOrderPage.order + 1 : 0;

    // Create the page
    const page = await db.page.create({
      data: {
        title,
        icon,
        type,
        projectId,
        createdById: req.userId!,
        lastEditedById: req.userId!,
        parentId: parentId || null,
        order,
      },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        _count: {
          select: {
            blocks: true,
            children: true,
          },
        },
      },
    });

    console.log(`📄 Created page: ${page.id} - "${page.title}" in project ${projectId}`);

    res.status(201).json({
      message: 'Page created successfully',
      page,
    });
  })
);

/**
 * GET /pages/:pageId
 * Get a specific page with all blocks
 */
router.get(
  '/pages/:pageId',
  asyncHandler(async (req: Request, res: Response) => {
    const { pageId } = req.params;

    const page = await db.page.findUnique({
      where: { id: pageId },
      include: {
        project: true,
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        lastEditedBy: {
          select: { id: true, name: true, email: true },
        },
        blocks: {
          orderBy: { order: 'asc' },
        },
        parent: {
          select: { id: true, title: true, icon: true },
        },
        children: {
          select: { id: true, title: true, icon: true, order: true },
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!page) {
      res.status(404).json({ error: 'Page not found' });
      return;
    }

    // Verify project ownership
    const project = await db.project.findFirst({
      where: { id: page.projectId, userId: req.userId! },
    });

    if (!project) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    res.json({ page });
  })
);

/**
 * PATCH /pages/:pageId
 * Update a page (title, icon, favorite, archive)
 */
router.patch(
  '/pages/:pageId',
  asyncHandler(async (req: Request, res: Response) => {
    const { pageId } = req.params;
    const { title, icon, isFavorite, isArchived } = req.body;

    const existingPage = await db.page.findUnique({
      where: { id: pageId },
      include: { project: true },
    });

    if (!existingPage) {
      res.status(404).json({ error: 'Page not found' });
      return;
    }

    // Verify project ownership
    const project = await db.project.findFirst({
      where: { id: existingPage.projectId, userId: req.userId! },
    });

    if (!project) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const page = await db.page.update({
      where: { id: pageId },
      data: {
        ...(title !== undefined && { title }),
        ...(icon !== undefined && { icon }),
        ...(isFavorite !== undefined && { isFavorite }),
        ...(isArchived !== undefined && { isArchived }),
        lastEditedById: req.userId!,
      },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        lastEditedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    res.json({
      message: 'Page updated successfully',
      page,
    });
  })
);

/**
 * DELETE /pages/:pageId
 * Delete a page (cascades to blocks and child pages)
 */
router.delete(
  '/pages/:pageId',
  asyncHandler(async (req: Request, res: Response) => {
    const { pageId } = req.params;

    const existingPage = await db.page.findUnique({
      where: { id: pageId },
      include: { project: true },
    });

    if (!existingPage) {
      res.status(404).json({ error: 'Page not found' });
      return;
    }

    // Verify project ownership
    const project = await db.project.findFirst({
      where: { id: existingPage.projectId, userId: req.userId! },
    });

    if (!project) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    await db.page.delete({
      where: { id: pageId },
    });

    console.log(`🗑️  Deleted page: ${pageId} - "${existingPage.title}"`);

    res.json({ message: 'Page deleted successfully' });
  })
);

/**
 * POST /pages/:pageId/move
 * Move a page to a different parent (for nesting/unnesting)
 */
router.post(
  '/pages/:pageId/move',
  asyncHandler(async (req: Request, res: Response) => {
    const { pageId } = req.params;
    const { parentId, order } = req.body; // parentId can be null to move to root

    const existingPage = await db.page.findUnique({
      where: { id: pageId },
      include: { project: true },
    });

    if (!existingPage) {
      res.status(404).json({ error: 'Page not found' });
      return;
    }

    // Verify project ownership
    const project = await db.project.findFirst({
      where: { id: existingPage.projectId, userId: req.userId! },
    });

    if (!project) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // If parentId provided, verify it exists and belongs to same project
    if (parentId) {
      const parent = await db.page.findFirst({
        where: { id: parentId, projectId: existingPage.projectId },
      });

      if (!parent) {
        res.status(404).json({ error: 'Parent page not found' });
        return;
      }

      // Prevent circular nesting (page cannot be its own ancestor)
      if (parentId === pageId) {
        res.status(400).json({ error: 'A page cannot be its own parent' });
        return;
      }
    }

    // Update the page
    const page = await db.page.update({
      where: { id: pageId },
      data: {
        parentId: parentId || null,
        ...(order !== undefined && { order }),
        lastEditedById: req.userId!,
      },
    });

    console.log(`📦 Moved page: ${pageId} to parent: ${parentId || 'root'}`);

    res.json({
      message: 'Page moved successfully',
      page,
    });
  })
);

/**
 * PATCH /pages/bulk-reorder
 * Reorder multiple pages at once (for drag and drop)
 */
router.patch(
  '/pages/bulk-reorder',
  asyncHandler(async (req: Request, res: Response) => {
    const { updates } = req.body; // Array of { pageId, order, parentId? }

    if (!Array.isArray(updates) || updates.length === 0) {
      res.status(400).json({ error: 'Updates array is required' });
      return;
    }

    // Verify all pages exist and user has access
    const pageIds = updates.map((u: any) => u.pageId);
    const pages = await db.page.findMany({
      where: { id: { in: pageIds } },
      include: { project: true },
    });

    if (pages.length !== pageIds.length) {
      res.status(404).json({ error: 'One or more pages not found' });
      return;
    }

    // Verify all pages belong to projects owned by user
    for (const page of pages) {
      const project = await db.project.findFirst({
        where: { id: page.projectId, userId: req.userId! },
      });

      if (!project) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }
    }

    // Perform bulk update in transaction
    await db.$transaction(
      updates.map((update: any) =>
        db.page.update({
          where: { id: update.pageId },
          data: {
            order: update.order,
            ...(update.parentId !== undefined && { parentId: update.parentId || null }),
            lastEditedById: req.userId!,
          },
        })
      )
    );

    console.log(`🔄 Bulk reordered ${updates.length} pages`);

    res.json({ message: 'Pages reordered successfully' });
  })
);

/**
 * GET /pages/:pageId/blocks
 * Get all blocks for a page
 */
router.get(
  '/pages/:pageId/blocks',
  asyncHandler(async (req: Request, res: Response) => {
    const { pageId } = req.params;

    // Verify page exists and user has access
    const page = await db.page.findUnique({
      where: { id: pageId },
      include: { project: true },
    });

    if (!page) {
      res.status(404).json({ error: 'Page not found' });
      return;
    }

    const project = await db.project.findFirst({
      where: { id: page.projectId, userId: req.userId! },
    });

    if (!project) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const blocks = await db.block.findMany({
      where: { pageId },
      orderBy: { order: 'asc' },
    });

    res.json({ blocks });
  })
);

/**
 * POST /pages/:pageId/blocks
 * Create a new block in a page
 */
router.post(
  '/pages/:pageId/blocks',
  asyncHandler(async (req: Request, res: Response) => {
    const { pageId } = req.params;
    const { type = 'text', content, parentBlockId, order } = req.body;

    if (!content) {
      res.status(400).json({ error: 'Block content is required' });
      return;
    }

    // Verify page exists and user has access
    const page = await db.page.findUnique({
      where: { id: pageId },
      include: { project: true },
    });

    if (!page) {
      res.status(404).json({ error: 'Page not found' });
      return;
    }

    const project = await db.project.findFirst({
      where: { id: page.projectId, userId: req.userId! },
    });

    if (!project) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // If order not specified, get max order
    let blockOrder = order;
    if (blockOrder === undefined) {
      const maxOrderBlock = await db.block.findFirst({
        where: { pageId, parentBlockId: parentBlockId || null },
        orderBy: { order: 'desc' },
        select: { order: true },
      });
      blockOrder = maxOrderBlock ? maxOrderBlock.order + 1 : 0;
    }

    const block = await db.block.create({
      data: {
        type,
        content,
        pageId,
        parentBlockId: parentBlockId || null,
        order: blockOrder,
      },
    });

    // Update page's lastEditedBy
    await db.page.update({
      where: { id: pageId },
      data: { lastEditedById: req.userId! },
    });

    res.status(201).json({
      message: 'Block created successfully',
      block,
    });
  })
);

/**
 * PATCH /blocks/:blockId
 * Update a block
 */
router.patch(
  '/blocks/:blockId',
  asyncHandler(async (req: Request, res: Response) => {
    const { blockId } = req.params;
    const { type, content, order } = req.body;

    const existingBlock = await db.block.findUnique({
      where: { id: blockId },
      include: { page: { include: { project: true } } },
    });

    if (!existingBlock) {
      res.status(404).json({ error: 'Block not found' });
      return;
    }

    // Verify project ownership
    const project = await db.project.findFirst({
      where: { id: existingBlock.page.projectId, userId: req.userId! },
    });

    if (!project) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const block = await db.block.update({
      where: { id: blockId },
      data: {
        ...(type !== undefined && { type }),
        ...(content !== undefined && { content }),
        ...(order !== undefined && { order }),
      },
    });

    // Update page's lastEditedBy
    await db.page.update({
      where: { id: existingBlock.pageId },
      data: { lastEditedById: req.userId! },
    });

    res.json({
      message: 'Block updated successfully',
      block,
    });
  })
);

/**
 * DELETE /blocks/:blockId
 * Delete a block
 */
router.delete(
  '/blocks/:blockId',
  asyncHandler(async (req: Request, res: Response) => {
    const { blockId } = req.params;

    const existingBlock = await db.block.findUnique({
      where: { id: blockId },
      include: { page: { include: { project: true } } },
    });

    if (!existingBlock) {
      res.status(404).json({ error: 'Block not found' });
      return;
    }

    // Verify project ownership
    const project = await db.project.findFirst({
      where: { id: existingBlock.page.projectId, userId: req.userId! },
    });

    if (!project) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    await db.block.delete({
      where: { id: blockId },
    });

    // Update page's lastEditedBy
    await db.page.update({
      where: { id: existingBlock.pageId },
      data: { lastEditedById: req.userId! },
    });

    res.json({ message: 'Block deleted successfully' });
  })
);

/**
 * PATCH /blocks/bulk-reorder
 * Reorder multiple blocks at once
 */
router.patch(
  '/blocks/bulk-reorder',
  asyncHandler(async (req: Request, res: Response) => {
    const { updates } = req.body; // Array of { blockId, order, parentBlockId? }

    if (!Array.isArray(updates) || updates.length === 0) {
      res.status(400).json({ error: 'Updates array is required' });
      return;
    }

    // Verify all blocks exist and user has access
    const blockIds = updates.map((u: any) => u.blockId);
    const blocks = await db.block.findMany({
      where: { id: { in: blockIds } },
      include: { page: { include: { project: true } } },
    });

    if (blocks.length !== blockIds.length) {
      res.status(404).json({ error: 'One or more blocks not found' });
      return;
    }

    // Verify all blocks belong to projects owned by user
    for (const block of blocks) {
      const project = await db.project.findFirst({
        where: { id: block.page.projectId, userId: req.userId! },
      });

      if (!project) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }
    }

    // Perform bulk update in transaction
    await db.$transaction(
      updates.map((update: any) =>
        db.block.update({
          where: { id: update.blockId },
          data: {
            order: update.order,
            ...(update.parentBlockId !== undefined && {
              parentBlockId: update.parentBlockId || null,
            }),
          },
        })
      )
    );

    res.json({ message: 'Blocks reordered successfully' });
  })
);

/**
 * POST /pages/:pageId/generate-title
 * Auto-generate a title from page content
 */
router.post(
  '/pages/:pageId/generate-title',
  asyncHandler(async (req: Request, res: Response) => {
    const { pageId } = req.params;
    const { content } = req.body;

    if (!content || typeof content !== 'string') {
      res.status(400).json({ error: 'Content is required' });
      return;
    }

    // Verify page exists and user has access
    const page = await db.page.findUnique({
      where: { id: pageId },
      include: { project: true },
    });

    if (!page) {
      res.status(404).json({ error: 'Page not found' });
      return;
    }

    const project = await db.project.findFirst({
      where: { id: page.projectId, userId: req.userId! },
    });

    if (!project) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    try {
      // Use Claude to generate a short, descriptive title
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });

      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 100,
        messages: [
          {
            role: 'user',
            content: `Based on this document content, generate a short, descriptive title (2-6 words). Only respond with the title, nothing else.\n\nContent:\n${content}`,
          },
        ],
      });

      const titleContent = message.content[0];
      const generatedTitle =
        titleContent.type === 'text'
          ? titleContent.text.trim().replace(/^["']|["']$/g, '')
          : 'Untitled';

      // Update the page title
      const updatedPage = await db.page.update({
        where: { id: pageId },
        data: {
          title: generatedTitle,
          lastEditedById: req.userId!,
        },
      });

      console.log(`✨ Generated title for page ${pageId}: "${generatedTitle}"`);

      res.json({
        message: 'Title generated successfully',
        title: generatedTitle,
        page: updatedPage,
      });
    } catch (error) {
      console.error('Error generating title:', error);
      res.status(500).json({ error: 'Failed to generate title' });
    }
  })
);

export default router;
