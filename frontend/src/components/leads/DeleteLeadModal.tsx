import { Button } from '../ui/Button'

export function DeleteLeadModal({ name, onConfirm, onCancel, loading }: {
  name: string
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h3 className="text-base font-semibold text-[#0f172a] mb-2">Delete Lead</h3>
        <p className="text-sm text-[#475569] mb-1">
          Are you sure you want to delete <span className="font-medium text-[#0f172a]">{name}</span>?
        </p>
        <p className="text-xs text-[#94a3b8] mb-6">
          The lead will be marked for deletion and removed within 30 days.
        </p>
        <div className="flex items-center justify-end gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>Delete</Button>
        </div>
      </div>
    </div>
  )
}
