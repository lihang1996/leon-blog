import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";

/**
 * Public site shell (architecture §5 / §6.7): fixed header, content column and
 * footer. Content is Server Components by default.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Keyboard/screen-reader first stop: skip the fixed header (FIND-212). */}
      <a
        href="#main-content"
        className="focus-skip sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:px-4 focus:py-2 focus:text-sm"
      >
        跳到主要内容
      </a>
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-blog flex-1 px-page">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
