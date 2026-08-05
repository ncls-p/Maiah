"use client";


import type { SidebarNavSection } from "@/modules/navigation/sidebar-config";

export type SidebarNavItem = {
  id: string;
  visible: boolean;
  section?: SidebarNavSection;
};

type SidebarNavCatalogItem = {
  id: string;
  labelKey: string;
  defaultSection: SidebarNavSection;
};

export type SidebarNavState = {
  config: { items: SidebarNavItem[] };
  catalog: SidebarNavCatalogItem[];
  isCustomized: boolean;
};
