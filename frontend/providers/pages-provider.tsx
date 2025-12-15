'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { api } from '@/lib/api';
import type { Page, CreatePageInput, UpdatePageInput } from '@/lib/types/pages';

interface PagesContextType {
  pages: Page[];
  currentPage: Page | null;
  isLoading: boolean;
  isSaving: boolean;
  fetchPages: (projectId: string) => Promise<void>;
  selectPage: (pageId: string | null) => Promise<void>;
  createPage: (projectId: string, data: CreatePageInput) => Promise<Page>;
  updatePage: (pageId: string, data: UpdatePageInput) => Promise<void>;
  deletePage: (pageId: string) => Promise<void>;
  movePage: (pageId: string, parentId: string | null, order?: number) => Promise<void>;
  refreshCurrentPage: () => Promise<void>;
}

const PagesContext = createContext<PagesContextType | undefined>(undefined);

interface PagesProviderProps {
  children: ReactNode;
  projectId?: string;
}

export function PagesProvider({ children, projectId }: PagesProviderProps) {
  const [pages, setPages] = useState<Page[]>([]);
  const [currentPage, setCurrentPage] = useState<Page | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const fetchPages = useCallback(async (projId: string) => {
    setIsLoading(true);
    try {
      const data = await api.getPages(projId);
      setPages(data.pages || []);
    } catch (error) {
      console.error('Failed to fetch pages:', error);
      setPages([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const selectPage = useCallback(async (pageId: string | null) => {
    if (!pageId) {
      setCurrentPage(null);
      return;
    }

    setIsLoading(true);
    try {
      const data = await api.getPage(pageId);
      setCurrentPage(data.page);
    } catch (error) {
      console.error('Failed to fetch page:', error);
      setCurrentPage(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createPage = useCallback(
    async (projId: string, data: CreatePageInput): Promise<Page> => {
      setIsSaving(true);
      try {
        const result = await api.createPage(projId, data);
        const newPage = result.page;
        setPages((prev) => [...prev, newPage]);
        return newPage;
      } catch (error) {
        console.error('Failed to create page:', error);
        throw error;
      } finally {
        setIsSaving(false);
      }
    },
    []
  );

  const updatePage = useCallback(async (pageId: string, data: UpdatePageInput) => {
    setIsSaving(true);
    try {
      const result = await api.updatePage(pageId, data);
      const updatedPage = result.page;

      // Update in pages list
      setPages((prev) =>
        prev.map((p) => (p.id === pageId ? { ...p, ...updatedPage } : p))
      );

      // Update current page if it's the one being edited
      if (currentPage?.id === pageId) {
        setCurrentPage((prev) => (prev ? { ...prev, ...updatedPage } : null));
      }
    } catch (error) {
      console.error('Failed to update page:', error);
      throw error;
    } finally {
      setIsSaving(false);
    }
  }, [currentPage?.id]);

  const deletePage = useCallback(async (pageId: string) => {
    setIsSaving(true);
    try {
      await api.deletePage(pageId);

      // Remove from pages list
      setPages((prev) => prev.filter((p) => p.id !== pageId));

      // Clear current page if it was deleted
      if (currentPage?.id === pageId) {
        setCurrentPage(null);
      }
    } catch (error) {
      console.error('Failed to delete page:', error);
      throw error;
    } finally {
      setIsSaving(false);
    }
  }, [currentPage?.id]);

  const movePage = useCallback(
    async (pageId: string, parentId: string | null, order?: number) => {
      setIsSaving(true);
      try {
        const result = await api.movePage(pageId, { parentId, order });
        const updatedPage = result.page;

        // Update in pages list
        setPages((prev) =>
          prev.map((p) => (p.id === pageId ? { ...p, ...updatedPage } : p))
        );
      } catch (error) {
        console.error('Failed to move page:', error);
        throw error;
      } finally {
        setIsSaving(false);
      }
    },
    []
  );

  const refreshCurrentPage = useCallback(async () => {
    if (!currentPage?.id) return;
    await selectPage(currentPage.id);
  }, [currentPage?.id, selectPage]);

  return (
    <PagesContext.Provider
      value={{
        pages,
        currentPage,
        isLoading,
        isSaving,
        fetchPages,
        selectPage,
        createPage,
        updatePage,
        deletePage,
        movePage,
        refreshCurrentPage,
      }}
    >
      {children}
    </PagesContext.Provider>
  );
}

export function usePages() {
  const context = useContext(PagesContext);
  if (context === undefined) {
    throw new Error('usePages must be used within a PagesProvider');
  }
  return context;
}
