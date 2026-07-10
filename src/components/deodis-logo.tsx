import Image from "next/image";
import { Link } from "@/i18n/navigation";

import { cn } from "@/lib/utils";

interface DeodisLogoProps {
  className?: string;
  href?: string;
  priority?: boolean;
  label?: string;
}

export function DeodisLogo({
  className,
  href = "/",
  priority = true,
  label = "Deodis home",
}: DeodisLogoProps) {
  const image = (
    <Image
      src="/deodis-logo.png"
      alt="Deodis"
      data-no-outline="true"
      width={857}
      height={320}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      className={cn("h-8 w-auto sm:h-9", className)}
    />
  );

  if (!href) {
    return image;
  }

  return (
    <Link
      href={href}
      className="inline-flex min-h-10 shrink-0 items-center rounded-lg"
      aria-label={label}
    >
      {image}
    </Link>
  );
}
