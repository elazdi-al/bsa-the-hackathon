import { cn } from "@/lib/utils";

/** Marks a surface whose numbers or action are only a demo. The real parts of the app go unmarked, so the contrast tells. */
export function DemoTag({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex h-5 shrink-0 items-center rounded-full bg-current/10 px-2 text-caption font-semibold text-muted-foreground", className)}>
      Demo
    </span>
  );
}
