import type { ReactNode } from "react";
export function Panel({
  title,
  icon,
  action,
  children,
  className = "",
}: {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={"panel " + className}>
      <header className="panel-header">
        <h2>
          {icon}
          {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}
export function Badge({
  children,
  tone = "cyan",
}: {
  children: ReactNode;
  tone?: "green" | "cyan" | "amber" | "muted";
}) {
  return <span className={"badge badge-" + tone}>{children}</span>;
}
