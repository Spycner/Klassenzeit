import type { LucideIcon } from "lucide-react";
import { NavLink } from "react-router";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface NavItemProps {
  to: string;
  icon: LucideIcon;
  label: string;
  collapsed?: boolean;
}

export function NavItem({ to, icon: Icon, label, collapsed }: NavItemProps) {
  return (
    <Tooltip delayDuration={0} key={collapsed ? "collapsed" : "expanded"}>
      <TooltipTrigger asChild>
        <NavLink to={to} className="group focus-visible:outline-none">
          {({ isActive }) => (
            <span
              className={cn(
                "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors",
                "group-focus-visible:bg-accent group-focus-visible:text-accent-foreground",
                "disabled:pointer-events-none disabled:opacity-50",
                "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
                "h-9 px-4 py-2",
                "w-full justify-start gap-3",
                collapsed && "justify-center px-2",
                isActive
                  ? "bg-secondary text-secondary-foreground shadow-sm"
                  : "hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </span>
          )}
        </NavLink>
      </TooltipTrigger>
      {collapsed && (
        <TooltipContent side="right">
          <p>{label}</p>
        </TooltipContent>
      )}
    </Tooltip>
  );
}
