"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "../../ui/header";
import { StatusBadge, TagBadge } from "../../ui/badge";
import { CatLoungingBanner } from "../../ui/cat-doodles";
import { clientApi, getPostTags, type PostItem } from "@/lib/client-api";
import { MarkdownContent } from "../../ui/markdown-content";

export function AdminPreviewView({ postId }: { postId: string }) {
  const [post, setPost] = useState<PostItem | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void clientApi.getAdminPost(postId).then((result) => {
      if (!active) return;
      if (result.data) setPost(result.data);
      else setError(result.error || "文章不存在");
    });
    return () => {
      active = false;
    };
  }, [postId]);

  return (
    <div className="min-h-screen bg-[#FDFBF7]">
      <Header admin activePath="/admin/posts" />
      <div className="sticky top-0 z-20 border-b border-[#F0D5BF] bg-[#FFF5EE]/95 px-4 py-2 text-center text-xs font-bold text-[#E65A00] backdrop-blur">
        {post ? `${post.status === "DRAFT" ? "草稿" : post.status === "ARCHIVED" ? "已归档" : "已发布"}预览 · 仅管理员可见` : "文章预览"}
      </div>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-8 sm:py-14">
        {error ? (
          <div className="paper-card p-10 text-center space-y-4">
            <h1 className="text-2xl font-bold font-serif">无法预览</h1>
            <p className="text-sm text-[#8C8375]">{error}</p>
            <Link href="/admin/posts" className="text-sm font-bold text-[#E65A00]">← 返回文章管理</Link>
          </div>
        ) : !post ? (
          <div className="py-20 text-center text-sm text-[#8C8375]">正在加载预览…</div>
        ) : (
          <article>
            <div className="mb-6 flex items-center justify-between gap-4">
              <Link href={`/admin/posts/${post.id}/edit`} className="text-sm font-bold text-[#E65A00]">← 返回编辑</Link>
              <StatusBadge status={post.status} />
            </div>
            <CatLoungingBanner className="mx-auto mb-6 w-full max-w-xl" />
            <h1 className="text-3xl sm:text-5xl font-extrabold font-serif leading-tight text-[#1A1A1A]">{post.title}</h1>
            <p className="mt-4 text-base leading-8 text-[#6B655C]">{post.excerpt}</p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {post.category && <span className="rounded-full border border-[#5B7B5A] px-3 py-1 text-xs font-semibold text-[#5B7B5A]">{post.category.name}</span>}
              {getPostTags(post).map((tag) => <TagBadge key={tag.id} name={tag.name} size="sm" />)}
            </div>
            <div className="mt-10 border-t border-[#E2D6C5] pt-8 text-[15px] text-[#2E2822]"><MarkdownContent content={post.contentMd || ""} /></div>
          </article>
        )}
      </main>
    </div>
  );
}
