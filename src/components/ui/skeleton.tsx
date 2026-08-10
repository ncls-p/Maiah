import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "t-skel-skeleton is-pulsing rounded-md bg-muted",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
