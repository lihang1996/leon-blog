"use client";

import React from "react";
import { HomeView } from "@/components/views/home-view";
import { PostsView } from "@/components/views/posts-view";
import { PostDetailView } from "@/components/views/post-detail-view";
import { CategoriesView } from "@/components/views/categories-view";
import { CategoryDetailView } from "@/components/views/category-detail-view";
import { TagsView } from "@/components/views/tags-view";
import { TagDetailView } from "@/components/views/tag-detail-view";
import { SearchView } from "@/components/views/search-view";
import { LoginView } from "@/components/views/login-view";
import { NotFoundView } from "@/components/views/not-found-view";
import { ErrorView } from "@/components/views/error-view";
import { AdminDashboardView } from "@/components/views/admin/admin-dashboard-view";
import { AdminPostsView } from "@/components/views/admin/admin-posts-view";
import { AdminEditorView } from "@/components/views/admin/admin-editor-view";
import { AdminCategoriesView } from "@/components/views/admin/admin-categories-view";
import { AdminTagsView } from "@/components/views/admin/admin-tags-view";
import { AdminPreviewView } from "@/components/views/admin/admin-preview-view";
import type { PostItem, CategoryItem, TagItem } from "@/lib/client-api";
import type { PaginationInfo } from "@/lib/pagination";
import type { PublicQuery } from "@/lib/public-query";

export interface InitialData {
  posts?: PostItem[];
  totalPosts?: number;
  pagination?: PaginationInfo;
  query?: PublicQuery;
  categories?: CategoryItem[];
  tags?: TagItem[];
  category?: CategoryItem;
  tag?: TagItem;
  postDetail?: PostItem;
  nextPost?: PostItem;
  loginState?: { clearInvalidSession: boolean; callbackUrl: string };
}

export interface SiteShellProps {
  route?: string;
  initialData?: InitialData;
}

export default function SiteShell({ route = "home", initialData }: SiteShellProps) {
  const parts = route.split(":");
  const kind = parts[0];
  const arg1 = parts[1];
  const arg2 = parts[2];

  const renderContent = () => {
    switch (kind) {
      case "login":
        return <LoginView {...initialData?.loginState} />;

      case "admin": {
        if (arg1 === "posts") {
          if (arg2 === "new") return <AdminEditorView />;
          return <AdminPostsView />;
        }
        if (arg1 === "posts-new") return <AdminEditorView />;
        if (arg1 === "posts-edit" && arg2) return <AdminEditorView postId={arg2} />;
        if (arg1 === "posts-preview" && arg2) return <AdminPreviewView postId={arg2} />;
        if (arg1 === "categories") return <AdminCategoriesView />;
        if (arg1 === "tags") return <AdminTagsView />;
        return <AdminDashboardView />;
      }

      case "posts":
        return <PostsView initialData={initialData} />;

      case "post-detail":
        return <PostDetailView slug={arg1 || ""} initialData={initialData} />;

      case "categories":
        return <CategoriesView initialData={initialData} />;

      case "category-detail":
        return <CategoryDetailView slug={arg1 || ""} initialData={initialData} />;

      case "tags":
        return <TagsView initialData={initialData} />;

      case "tag-detail":
        return <TagDetailView slug={arg1 || ""} initialData={initialData} />;

      case "search":
        return <SearchView initialData={initialData} />;

      case "not-found":
      case "404":
        return <NotFoundView />;

      case "error":
        return <ErrorView />;

      case "home":
      default:
        return <HomeView initialData={initialData} />;
    }
  };

  return (
    <div className="min-h-screen">
      {renderContent()}
    </div>
  );
}
