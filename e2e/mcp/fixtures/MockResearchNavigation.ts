export function useRouter() {
  return {
    refresh() {
      sessionStorage.setItem("research-router-refresh", "true");
    },
    push(href: string) {
      window.history.pushState(null, "", href);
    },
    replace(href: string) {
      window.history.replaceState(null, "", href);
    },
  };
}
