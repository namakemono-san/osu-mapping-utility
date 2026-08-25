type EmptyStateProps = {
  icon: React.ComponentType<{ size?: number; stroke?: number; className?: string }>
  message: string
}

export function EmptyState({ icon: Icon, message }: EmptyStateProps): React.JSX.Element {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-2 text-text-muted">
        <Icon size={36} stroke={1} className="opacity-30" />
        <p className="text-sm">{message}</p>
      </div>
    </div>
  )
}
