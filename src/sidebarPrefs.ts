export const NODE_SIDEBAR_COLLAPSED_KEY = "curmap-node-sidebar-collapsed";
export const CHAT_SIDEBAR_COLLAPSED_KEY = "curmap-chat-collapsed";

export function getSidebarCollapsed(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function setSidebarCollapsed(key: string, collapsed: boolean): void {
  try {
    localStorage.setItem(key, collapsed ? "1" : "0");
  } catch {
    /* ignore */
  }
}
