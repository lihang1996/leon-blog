/**
 * Site-level static content (architecture §5.1, UI spec §9).
 * Author positioning, the fixed navigation, and the single homepage project
 * evidence. The evidence is static — it must NEVER read from the database,
 * an API, or an admin backend. Fill in real values when available.
 */

export type NavItem = { label: string; href: string };

export const siteNav: readonly NavItem[] = [
  { label: "文章", href: "/posts" },
  { label: "分类", href: "/categories" },
  { label: "标签", href: "/tags" },
  { label: "搜索", href: "/search" },
];

export const siteContent = {
  author: {
    name: "Leon",
    role: "全栈开发者",
    tagline: "用 Next.js 与 TypeScript 记录学习、工程实践与长期思考。",
    bio: "关注 Web 全栈、数据库设计与工程化实践,相信可维护性优先于功能炫技。",
  },
  home: {
    hero: {
      heading: "你好,我是 Leon。",
      lead: "全栈开发者,专注 Next.js、TypeScript 与 PostgreSQL 工程实践。这里记录我的技术学习、工程取舍与长期思考。",
    },
  },
  projectEvidence: {
    title: "本次博客项目:Leon Blog",
    problem: "一个个人技术内容平台,要求发布、展示、SEO 与安全的完整闭环。",
    summary:
      "基于 Next.js 16 App Router + Prisma 7 + PostgreSQL 的模块化单体。文章草稿/预览/发布/归档状态机、单一管理员认证、Cache Components 与事务后缓存失效、服务端代码高亮和完整 SEO。",
    points: [
      "Service/Repository 分层与纯领域规则,草稿绝不泄露到公开查询",
      "发布事务提交后再执行路径与 Tag 失效,保证数据库始终是事实来源",
      "Auth.js Credentials + Argon2id + 账号锁定,统一错误与 CSRF 防护",
    ],
    /** 真实外链;没有真实链接时必须为 null,组件不渲染按钮。 */
    link: null as { href: string; label: string } | null,
    /** 真实作品截图;没有真实截图时为 null,组件不渲染图片。 */
    screenshot: null as { src: string; alt: string; width: number; height: number } | null,
  },
  /**
   * 默认分享图。指向生成的 `/opengraph-image`(见 src/app/opengraph-image.tsx),
   * 避免提交二进制 PNG 资产。
   */
  defaultOgImagePath: "/opengraph-image",
} as const;
