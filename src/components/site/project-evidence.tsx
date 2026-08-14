import { siteContent } from "@/config/site-content";

/**
 * Homepage project evidence (architecture §6.8). Static config only — never
 * reads the database, an API, or an admin backend. The external link renders
 * only when a real URL exists; the screenshot renders only when provided.
 */
export function ProjectEvidence({ className = "py-16" }: { className?: string }) {
  const evidence = siteContent.projectEvidence;

  return (
    <section className={className}>
      <h2 className="font-serif-cn text-2xl font-bold md:text-3xl">作品能力证据</h2>
      <article className="mt-8 rounded-lg border border-border bg-surface p-6 md:p-8">
        <h3 className="font-serif-cn text-xl font-bold text-text">{evidence.title}</h3>
        <p className="mt-3 text-sm text-text-muted md:text-base">{evidence.problem}</p>
        <p className="mt-3 leading-relaxed text-text">{evidence.summary}</p>
        <ul className="mt-6 space-y-2">
          {evidence.points.map((point) => (
            <li key={point} className="flex gap-3 text-sm leading-relaxed text-text md:text-base">
              <span aria-hidden="true" className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              {point}
            </li>
          ))}
        </ul>
        <div className="mt-8 flex flex-wrap gap-6">
          {evidence.screenshot ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={evidence.screenshot.src}
              alt={evidence.screenshot.alt}
              width={evidence.screenshot.width}
              height={evidence.screenshot.height}
              loading="lazy"
              className="rounded-lg border border-border"
            />
          ) : null}
          {evidence.link ? (
            <a
              href={evidence.link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="focus-action-secondary inline-flex min-h-11 items-center gap-1.5 self-start rounded-md border border-border bg-bg px-5 text-sm font-medium text-accent-text transition-colors hover:border-accent-text"
            >
              {evidence.link.label} <span aria-hidden="true">↗</span>
            </a>
          ) : null}
        </div>
      </article>
    </section>
  );
}
