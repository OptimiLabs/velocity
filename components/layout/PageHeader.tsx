interface PageHeaderProps {
  title?: string;
  count?: number | string;
  children?: React.ReactNode;
}

export function PageHeader({ title, count, children }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        {title && <h1 className="text-page-title">{title}</h1>}
        {count !== undefined && (
          <span className="text-detail tabular-nums">{count}</span>
        )}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
