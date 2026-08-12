import { createNavigation } from "next-intl/navigation";
import { createElement, forwardRef, type ComponentProps, useMemo } from "react";
import { routing } from "./routing";

const navigation = createNavigation(routing);
const NavigationLink = navigation.Link;

export const Link = forwardRef<
  HTMLAnchorElement,
  ComponentProps<typeof NavigationLink>
>(function Link({ transitionTypes, ...props }, ref) {
  return createElement(NavigationLink, {
    ...props,
    ref,
    transitionTypes: transitionTypes ?? ["workspace-route"],
  });
});

const useNavigationRouter = navigation.useRouter;
type NavigationRouter = ReturnType<typeof useNavigationRouter>;

export function useRouter(): NavigationRouter {
  const router = useNavigationRouter();
  return useMemo(
    () => ({
      ...router,
      push: ((href, options) =>
        router.push(href, {
          ...options,
          transitionTypes: options?.transitionTypes ?? ["workspace-route"],
        })) satisfies NavigationRouter["push"],
      replace: ((href, options) =>
        router.replace(href, {
          ...options,
          transitionTypes: options?.transitionTypes ?? ["workspace-route"],
        })) satisfies NavigationRouter["replace"],
    }),
    [router],
  );
}

export const { redirect, usePathname } = navigation;
