import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";

export const RouteScrollRestoration = () => {
  const { pathname, search } = useLocation();

  useLayoutEffect(() => {
    window.scrollTo({ left: 0, top: 0, behavior: "auto" });
  }, [pathname, search]);

  return null;
};
