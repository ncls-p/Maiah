import { Badge } from "@/components/ui/badge";
export function TabBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
      {count}
    </Badge>
  );
}
