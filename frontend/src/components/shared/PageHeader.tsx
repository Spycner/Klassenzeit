import { Fragment, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import {
  Breadcrumb,
  BreadcrumbItem as BreadcrumbItemPrimitive,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

export interface BreadcrumbItem {
  /** Display label */
  label: string;
  /** Link href (omit for current page) */
  href?: string;
}

export interface PageHeaderProps {
  /** Page title */
  title: string;
  /** Optional description */
  description?: string;
  /** Action elements (e.g., buttons) */
  actions?: ReactNode;
  /** Breadcrumb navigation items */
  breadcrumbs?: BreadcrumbItem[];
  /** Additional CSS classes */
  className?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  className,
}: PageHeaderProps) {
  const { i18n } = useTranslation();

  const buildHref = (href: string) => {
    // Prepend language prefix if not already present
    if (href.startsWith(`/${i18n.language}/`) || href === `/${i18n.language}`) {
      return href;
    }
    return `/${i18n.language}${href.startsWith("/") ? "" : "/"}${href}`;
  };

  return (
    <div className={cn("mb-6", className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumb className="mb-4">
          <BreadcrumbList>
            {breadcrumbs.map((item, index) => {
              const isLast = index === breadcrumbs.length - 1;
              return (
                <Fragment key={item.label}>
                  <BreadcrumbItemPrimitive>
                    {isLast || !item.href ? (
                      <BreadcrumbPage>{item.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild>
                        <Link to={buildHref(item.href)}>{item.label}</Link>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItemPrimitive>
                  {!isLast && <BreadcrumbSeparator />}
                </Fragment>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {description && (
            <p className="mt-1 text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex-shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
