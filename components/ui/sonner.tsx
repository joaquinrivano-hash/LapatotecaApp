"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

/** Avisos cortos. El tema sale de los tokens, no de los colores de sonner. */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="top-center"
      toastOptions={{
        classNames: {
          toast:
            "!bg-card !text-foreground !border-border !rounded-2xl !shadow-lg !font-sans",
          description: "!text-muted-foreground",
          actionButton: "!bg-primary !text-primary-foreground !rounded-full",
          cancelButton: "!bg-secondary !text-secondary-foreground !rounded-full",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
