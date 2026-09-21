import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-12 w-full min-w-0 rounded-xl border-2 border-input bg-card px-4 py-2 text-base shadow-xs transition-colors outline-none",
        "placeholder:text-muted-foreground/70",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "file:inline-flex file:border-0 file:bg-transparent file:text-sm file:font-semibold",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
