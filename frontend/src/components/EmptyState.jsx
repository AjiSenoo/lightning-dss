export default function EmptyState({ icon = '📭', title, description, action }) {
  return (
    <div className="text-center py-12 px-4 animate-fade-in-up">
      <div className="text-5xl mb-3 opacity-70">{icon}</div>
      <h3 className="text-base font-semibold text-gray-700">{title}</h3>
      {description && (
        <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
