"use client";

import React from "react";

// Standard v2 palette tokens
export const DOODLE_COLORS = {
  catOrange: "#F28A32",
  catLightOrange: "#F6A54B",
  catDarkOrange: "#E65A00",
  catWhite: "#FFFFFF",
  catOutline: "#2D1B0A",
  catEye: "#1A1A1A",
  catNose: "#E65A00",
  catCheek: "#FFA96A",
  sage: "#5B7B5A",
  sageLight: "#8FA88E",
  pottery: "#E8C8A6",
  yellow: "#F9D490",
  mustard: "#D9A821",
};

/** Cat head logo icon */
export function CatLogo({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <img
      src="/images/illustrations/cat-logo.png"
      alt="Leon Blog Logo"
      className={"inline-block select-none object-contain " + className}
      draggable={false}
    />
  );
}

/** Cat head circular avatar in header */
export function CatAvatar({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <img
      src="/images/illustrations/cat-avatar.png"
      alt="Leon Avatar"
      className={"inline-block rounded-full select-none object-contain " + className}
      draggable={false}
    />
  );
}

/** Paw Icon */
export function PawIcon({ className = "w-5 h-5 inline-block text-[#E65A00]" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="12" cy="15" rx="4.5" ry="3.5" />
      <circle cx="6.5" cy="9.5" r="2.2" />
      <circle cx="10.2" cy="6.8" r="2.2" />
      <circle cx="13.8" cy="6.8" r="2.2" />
      <circle cx="17.5" cy="9.5" r="2.2" />
    </svg>
  );
}

/** 4-Point Sparkle Star (Solid) */
export function SparkleStar({ className = "w-4 h-4 text-[#F9D490]" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C12 7.5 16.5 12 22 12C16.5 12 12 16.5 12 22C12 16.5 7.5 12 2 12C7.5 12 12 7.5 12 2Z" />
    </svg>
  );
}

/** 5-Point Outline Star Doodle */
export function OutlineStar({ className = "w-5 h-5 text-[#5B7B5A]" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
    </svg>
  );
}

/** Hand-drawn navigation underline curve */
export function NavUnderline({ className = "w-full h-2 text-[#E65A00]" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 50 8" fill="none" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 5.5C12 2 38 2 48 5.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Hand-drawn brush accent underline for section titles */
export function TitleBrushUnderline({ className = "w-12 h-2 text-[#E65A00]" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 60 8" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 5C18 3 42 2.5 58 5.5" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

/** Wavy list item divider with loop / swirl */
export function WavyDivider({ className = "w-full h-4 text-[#D8C7B0]" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 800 16" fill="none" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M0 8 C100 4, 200 12, 300 8 C400 4, 500 12, 600 8 C700 4, 750 10, 770 8 C778 7, 782 3, 786 5 C790 7, 792 12, 788 13 C784 14, 780 10, 784 7 C787 5, 794 8, 800 8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Leaf Doodle */
export function LeafDoodle({ className = "w-5 h-5 text-[#5B7B5A]" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
    </svg>
  );
}

// ----------------------------------------------------------------------------
// HIGH-FIDELITY DESIGN ILLUSTRATIONS MATCHING design/ui-screens/v2/
// ----------------------------------------------------------------------------

/**
 * Admin Categories Header Illustration (100% 1:1 match with redesign-admin-categories-desktop.png)
 */
export function CatCategoryAdmin({ className = "w-full max-w-[480px]" }: { className?: string; speech?: string }) {
  return (
    <div className={"relative select-none " + className}>
      <img
        src="/images/illustrations/cat-category-admin.png"
        alt="分类管理"
        className="w-full h-auto object-contain drop-shadow-xs"
        draggable={false}
      />
    </div>
  );
}

/**
 * Admin Dashboard Waving Cat (100% 1:1 match with redesign-admin-dashboard-desktop.png)
 */
export function CatDashboardWave({ className = "w-28 h-18" }: { className?: string }) {
  return (
    <div className={"relative select-none inline-block " + className}>
      <img
        src="/images/illustrations/cat-dashboard-wave.png"
        alt="概览"
        className="w-full h-auto object-contain drop-shadow-xs"
        draggable={false}
      />
    </div>
  );
}

/**
 * Admin Tags Sleeping Cat & Mug & Plant (100% 1:1 match with redesign-admin-tags-desktop.png)
 */
export function CatTagsSleep({ className = "w-full max-w-[480px]" }: { className?: string; speech?: string }) {
  return (
    <div className={"relative select-none " + className}>
      <img
        src="/images/illustrations/cat-tags-sleep.png"
        alt="标签管理"
        className="w-full h-auto object-contain drop-shadow-xs"
        draggable={false}
      />
    </div>
  );
}

/**
 * Admin Editor Writing Cat (100% 1:1 match with redesign-admin-editor-desktop.png)
 */
export function CatEditorWrite({ className = "w-36 h-24" }: { className?: string }) {
  return (
    <div className={"relative select-none inline-block " + className}>
      <img
        src="/images/illustrations/cat-editor-write.png"
        alt="文章编辑"
        className="w-full h-auto object-contain drop-shadow-xs"
        draggable={false}
      />
    </div>
  );
}

/**
 * Peeking Cat on Table/Card border (100% 1:1 match with redesign-admin-posts-desktop.png & redesign-login-desktop.png)
 */
export function CatPeek({ className = "w-36 h-28", speech }: { className?: string; speech?: string }) {
  return (
    <div className={"relative select-none inline-block " + className}>
      <img
        src="/images/illustrations/cat-peek.png"
        alt="偷看小猫"
        className="w-full h-auto object-contain"
        draggable={false}
      />
      {speech && (
        <div className="absolute -top-7 -right-12 bg-white border border-[#2D1B0A] rounded-full px-2.5 py-0.5 text-[11px] font-bold text-[#1A1A1A] shadow-xs whitespace-nowrap">
          {speech}
        </div>
      )}
    </div>
  );
}

/**
 * Home Hero Cat & Laptop & Coffee (100% 1:1 match with redesign-home-desktop.png)
 */
export function CatHero({ className = "w-full max-w-[460px]" }: { className?: string }) {
  return (
    <div className={"relative select-none " + className}>
      <img
        src="/images/illustrations/cat-hero.png"
        alt="你好，我是 Leon"
        className="w-full h-auto object-contain drop-shadow-sm"
        draggable={false}
      />
    </div>
  );
}

/**
 * Shocked Cat with knocked-over flowerpot (100% 1:1 match with redesign-empty-error-desktop.png)
 */
export function CatShocked({ className = "w-64 h-48" }: { className?: string }) {
  return (
    <div className={"relative select-none inline-block " + className}>
      <img
        src="/images/illustrations/cat-shocked.png"
        alt="页面出错"
        className="w-full h-auto object-contain drop-shadow-sm"
        draggable={false}
      />
    </div>
  );
}

/**
 * 404 Cat (100% 1:1 match with redesign-404-desktop.png)
 */
export function Cat404({ className = "w-64 h-56" }: { className?: string }) {
  return (
    <div className={"relative select-none inline-block " + className}>
      <img
        src="/images/illustrations/cat-404.png"
        alt="404 走丢了"
        className="w-full h-auto object-contain drop-shadow-sm"
        draggable={false}
      />
    </div>
  );
}

/** Potted Plant (Sidebar & Footer decoration) */
export function PottedPlant({ className = "w-16 h-24" }: { className?: string }) {
  return (
    <img
      src="/images/illustrations/plant-potted.png"
      alt="盆栽"
      className={"select-none object-contain " + className}
      draggable={false}
    />
  );
}

/** Cat Stretching Lazily */
export function CatStretch({ className = "w-64 h-36" }: { className?: string }) {
  return (
    <div className={"relative select-none inline-block " + className}>
      <img
        src="/images/illustrations/cat-stretching.png"
        alt="小猫"
        className="w-full h-auto object-contain"
        draggable={false}
      />
    </div>
  );
}

// ----------------------------------------------------------------------------
// HAND-DRAWN STAT & CATEGORY ICONS
// ----------------------------------------------------------------------------

export function NotePencilIcon({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="5" width="22" height="28" rx="3.5" fill="#FFFDF8" stroke="currentColor" strokeWidth="2.2" />
      <line x1="11" y1="12" x2="23" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="11" y1="18" x2="23" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="11" y1="24" x2="18" y2="24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <g transform="translate(16, 12) rotate(45)">
        <path d="M0 0 L6 0 L6 14 L3 17 L0 14 Z" fill="#FFA96A" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

export function FolderOutlineIcon({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 11 C5 8.5 7 6.5 9.5 6.5 H16 L19.5 10.5 H31.5 C34 10.5 36 12.5 36 15 V28 C36 30.5 34 32.5 31.5 32.5 H9.5 C7 32.5 5 30.5 5 28 Z" fill="#FFFDF8" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M5 14.5 H36" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function TagOutlineIcon({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 8 H18 L32 22 C33.5 23.5 33.5 26 32 27.5 L25.5 34 C24 35.5 21.5 35.5 20 34 L6 20 V8 Z" fill="#FFFDF8" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      <circle cx="12" cy="14" r="2.5" fill="currentColor" />
    </svg>
  );
}

export function CategoryIcon({ iconKey, className = "w-8 h-8" }: { iconKey?: string; className?: string }) {
  switch (iconKey) {
    case "dev":
      return (
        <svg className={className} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="10 8 4 16 10 24" />
          <polyline points="22 8 28 16 22 24" />
          <line x1="18" y1="6" x2="14" y2="26" />
        </svg>
      );
    case "bulb":
      return (
        <svg className={className} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 4 C11 4 7 8 7 13 C7 16.5 9 19.5 12 21 V24 H20 V21 C23 19.5 25 16.5 25 13 C25 8 21 4 16 4 Z" />
          <line x1="13" y1="27" x2="19" y2="27" />
        </svg>
      );
    case "design":
      return (
        <svg className={className} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 4 L28 14 L14 28 L4 28 L4 18 Z" />
          <line x1="14" y1="8" x2="24" y2="18" />
        </svg>
      );
    case "tool":
      return (
        <svg className={className} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="9" width="24" height="17" rx="3" />
          <path d="M11 9 V6 C11 4.5 12.5 3 14 3 H18 C19.5 3 21 4.5 21 6 V9" />
          <line x1="4" y1="16" x2="28" y2="16" />
        </svg>
      );
    case "plane":
      return (
        <svg className={className} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M28 4 L4 14 L14 18 L18 28 Z" />
          <line x1="14" y1="18" x2="28" y2="4" />
        </svg>
      );
    case "coffee":
      return (
        <svg className={className} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 10 H22 V20 C22 24 19 27 14 27 C9 27 6 24 6 20 Z" />
          <path d="M22 13 H25 C26.5 13 28 14.5 28 16 C28 17.5 26.5 19 25 19 H22" />
        </svg>
      );
    case "heart":
      return (
        <svg className={className} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 28 C16 28 4 20 4 12 C4 7 8 4 12 4 C14.5 4 16 6 16 6 C16 6 17.5 4 20 4 C24 4 28 7 28 12 C28 20 16 28 16 28 Z" />
        </svg>
      );
    default:
      return (
        <svg className={className} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 4 C9 4 4 10 4 17 C4 23 8 28 16 28 C24 28 28 23 28 17 C28 10 23 4 16 4 Z" />
          <path d="M16 4 V28" />
        </svg>
      );
  }
}

// ----------------------------------------------------------------------------
// DASHBOARD V2 SPECIFIC ILLUSTRATIONS
// ----------------------------------------------------------------------------

/** Right banner decoration: Desk plant + stack of books + cat paw photo frame */
export function DeskPlantBooksFrame({ className = "w-44 h-auto" }: { className?: string }) {
  return (
    <img
      src="/images/illustrations/desk-plant-books-frame.png"
      alt="书桌与相框"
      className={"select-none object-contain drop-shadow-xs " + className}
      draggable={false}
    />
  );
}

/** Greeting waving cat next to title */
export function GreetingWavingCat({ className = "w-20 h-auto" }: { className?: string }) {
  return (
    <img
      src="/images/illustrations/greeting-waving-cat.png"
      alt="招手小猫"
      className={"select-none object-contain drop-shadow-xs " + className}
      draggable={false}
    />
  );
}

/** Card 1: Cat reading document */
export function CatReading({ className = "w-20 h-auto" }: { className?: string }) {
  return (
    <img
      src="/images/illustrations/cat-reading.png"
      alt="看书小猫"
      className={"select-none object-contain " + className}
      draggable={false}
    />
  );
}

/** Card 2: Cat in green folder */
export function CatInFolder({ className = "w-20 h-auto" }: { className?: string }) {
  return (
    <img
      src="/images/illustrations/cat-in-folder.png"
      alt="文件夹小猫"
      className={"select-none object-contain " + className}
      draggable={false}
    />
  );
}

/** Card 3: Cat hugging tag */
export function CatWithTag({ className = "w-20 h-auto" }: { className?: string }) {
  return (
    <img
      src="/images/illustrations/cat-with-tag.png"
      alt="标签小猫"
      className={"select-none object-contain " + className}
      draggable={false}
    />
  );
}

/** Bottom left: Yarn ball with loose thread */
export function YarnBall({ className = "w-24 h-auto" }: { className?: string }) {
  return (
    <img
      src="/images/illustrations/yarn-ball.png"
      alt="毛线球"
      className={"select-none object-contain " + className}
      draggable={false}
    />
  );
}

/** Bottom right: Orange cat paw prints */
export function PawPrints({ className = "w-20 h-auto" }: { className?: string }) {
  return (
    <img
      src="/images/illustrations/paw-prints.png"
      alt="猫爪印"
      className={"select-none object-contain " + className}
      draggable={false}
    />
  );
}

// ----------------------------------------------------------------------------
// PUBLIC PAGES V2 SPECIFIC ILLUSTRATIONS
// ----------------------------------------------------------------------------

/** Search page: Cat holding magnifying glass with sparkles and paw prints */
export function CatMagnifier({ className = "w-48 h-auto" }: { className?: string }) {
  return (
    <img
      src="/images/illustrations/cat-magnifier.png"
      alt="搜索小猫"
      className={"select-none object-contain drop-shadow-xs " + className}
      draggable={false}
    />
  );
}

/** Tags page: Stretching orange cat with paw prints and caption */
export function CatStretching({ className = "w-72 h-auto" }: { className?: string }) {
  return (
    <img
      src="/images/illustrations/cat-stretching.png"
      alt="伸懒腰小猫"
      className={"select-none object-contain drop-shadow-xs " + className}
      draggable={false}
    />
  );
}

/** Categories page: Sitting orange cat next to potted plant */
export function CatSittingPlant({ className = "w-44 h-auto" }: { className?: string }) {
  return (
    <img
      src="/images/illustrations/cat-sitting-plant.png"
      alt="端坐小猫与盆栽"
      className={"select-none object-contain drop-shadow-xs " + className}
      draggable={false}
    />
  );
}

/** Posts page sidebar: Peeking cat with plant and '喵~' speech bubble */
export function CatPeekSidebar({ className = "w-48 h-auto" }: { className?: string }) {
  return (
    <img
      src="/images/illustrations/cat-peek-sidebar.png"
      alt="侧边栏小猫"
      className={"select-none object-contain " + className}
      draggable={false}
    />
  );
}

/** Home page sidebar: Project evidence window illustration */
export function ProjectEvidenceWindow({ className = "w-44 h-auto" }: { className?: string }) {
  return (
    <img
      src="/images/illustrations/project-evidence-window.png"
      alt="作品卡片插画"
      className={"select-none object-contain " + className}
      draggable={false}
    />
  );
}

/** Illustrated Category Card Icon */
export function CategoryIllustratedIcon({
  iconKey,
  className = "w-20 h-14",
}: {
  iconKey?: string;
  className?: string;
}) {
  let src = "/images/illustrations/cat-dev-laptop.png";
  if (iconKey === "dev" || iconKey === "development") src = "/images/illustrations/cat-dev-laptop.png";
  else if (iconKey === "bulb" || iconKey === "thoughts" || iconKey === "product") src = "/images/illustrations/cat-bulb-idea.png";
  else if (iconKey === "design") src = "/images/illustrations/cat-design-book.png";
  else if (iconKey === "tool" || iconKey === "tools") src = "/images/illustrations/cat-tool-box.png";
  else if (iconKey === "plane" || iconKey === "life") src = "/images/illustrations/cat-plane-note.png";
  else if (iconKey === "coffee" || iconKey === "engineering") src = "/images/illustrations/cat-coffee-cup.png";

  return (
    <img
      src={src}
      alt={iconKey || "category"}
      className={"select-none object-contain " + className}
      draggable={false}
    />
  );
}

/** Post detail header banner: Lounging cat with flowers and stars */
export function CatLoungingBanner({ className = "w-full max-w-2xl h-auto" }: { className?: string }) {
  return (
    <img
      src="/images/illustrations/cat-lounging-banner.png"
      alt="花丛小猫"
      className={"select-none object-contain " + className}
      draggable={false}
    />
  );
}

/** Post detail left side: Pinned handwritten sticky note */
export function PinnedNote({ className = "w-32 h-auto" }: { className?: string }) {
  return (
    <img
      src="/images/illustrations/pinned-note.png"
      alt="便签纸"
      className={"select-none object-contain drop-shadow-xs " + className}
      draggable={false}
    />
  );
}

/** Post detail right side: Hanging cat photo frame */
export function HangingFrame({ className = "w-28 h-auto" }: { className?: string }) {
  return (
    <img
      src="/images/illustrations/hanging-frame.png"
      alt="挂画相框"
      className={"select-none object-contain drop-shadow-xs " + className}
      draggable={false}
    />
  );
}

// ----------------------------------------------------------------------------
// ALIAS EXPORTS FOR BACKWARD COMPATIBILITY
// ----------------------------------------------------------------------------
export const CatSit = CatCategoryAdmin;
export const CatWave = CatDashboardWave;
export const CatSleep = CatTagsSleep;
export const CatWrite = CatEditorWrite;

/** Back to top FAB Button */
export function BackToTopButton() {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const handleScroll = () => {
      setVisible(window.scrollY > 300);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="fixed bottom-8 right-8 z-40 flex flex-col items-center justify-center w-14 h-14 rounded-full bg-[#E65A00] text-white shadow-lg hover:bg-[#D14F00] transition-all hover:scale-105 active:scale-95 group focus:outline-none cursor-pointer"
      aria-label="回到顶部"
    >
      <PawIcon className="w-6 h-6 text-white" />
      <span className="text-[10px] font-bold mt-0.5">顶部</span>
    </button>
  );
}
