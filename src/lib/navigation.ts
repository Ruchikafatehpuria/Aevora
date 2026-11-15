import {
  LayoutDashboard, Sparkles, Inbox, FolderClosed, BookMarked, CalendarClock, KanbanSquare, GraduationCap, Compass,
  Workflow, PenTool, Wallet, Users, BarChart3, UserRound, Settings, type LucideIcon,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  description: string;
  /** False until the module's real functionality ships. */
  available: boolean;
};

export type NavGroup = { label: string; items: NavItem[] };

export const navigation: NavGroup[] = [
  {
    label: "Home",
    items: [
      { title: "Home", href: "/overview", icon: LayoutDashboard, description: "Your day at a glance", available: true },
      { title: "AI Assistant", href: "/assistant", icon: Sparkles, description: "Syncly Brain: ask questions, including about your files", available: true },
      { title: "Everything Inbox", href: "/locker/inbox", icon: Inbox, description: "New imports, suggestions, duplicates and failures", available: true },
      { title: "My Files", href: "/locker", icon: FolderClosed, description: "Your digital locker: upload, organize, search", available: true },
    ],
  },
  {
    label: "Workspace",
    items: [
      { title: "Knowledge", href: "/knowledge", icon: BookMarked, description: "Notes, saved links and tags the assistant can search", available: true },
      { title: "Scheduler", href: "/scheduler", icon: CalendarClock, description: "Calendar, events and reminders", available: true },
      { title: "Tasks & Projects", href: "/tasks", icon: KanbanSquare, description: "Tasks, projects, boards, repeats and reminders", available: true },
    ],
  },
  {
    label: "Grow",
    items: [
      { title: "Learn", href: "/learn", icon: GraduationCap, description: "AI tutor, learning paths, study workspace", available: false },
      { title: "Career", href: "/career", icon: Compass, description: "Mentor, internships, scholarships, certifications, interviews", available: false },
    ],
  },
  {
    label: "Build",
    items: [
      { title: "Automation", href: "/automation", icon: Workflow, description: "Workflows and personal AI agents", available: false },
      { title: "Create", href: "/create", icon: PenTool, description: "Documents, presentations, diagrams, portfolios", available: false },
    ],
  },
  {
    label: "Life",
    items: [
      { title: "Finance", href: "/finance", icon: Wallet, description: "Expenses, budgets, subscriptions and bills", available: false },
      { title: "Collaboration", href: "/collaboration", icon: Users, description: "Share and work together", available: false },
      { title: "Analytics", href: "/analytics", icon: BarChart3, description: "Insights into your productivity and growth", available: false },
    ],
  },
  {
    label: "Account",
    items: [
      { title: "My Profile", href: "/profile", icon: UserRound, description: "Your personal and academic profile", available: true },
      { title: "Settings", href: "/settings", icon: Settings, description: "Appearance, security and account", available: true },
    ],
  },
];

export const allNavItems = navigation.flatMap((g) => g.items);

export function findNavItem(href: string) {
  return allNavItems.find((i) => i.href === href);
}

/** The nav item that best matches a path (longest matching href), so nested routes highlight one item. */
export function activeHref(pathname: string) {
  return allNavItems
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}
