interface PageHeaderProps {
  title: string
  description?: string
  action?: React.ReactNode
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-serif text-3xl font-bold text-barber-gold">{title}</h1>
        {description && (
          <p className="mt-1 text-barber-white/60">{description}</p>
        )}
      </div>
      {action}
    </div>
  )
}
