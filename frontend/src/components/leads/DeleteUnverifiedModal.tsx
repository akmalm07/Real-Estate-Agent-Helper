import { AlertTriangle } from 'lucide-react'
import { Button } from '../ui/Button'

export function DeleteUnverifiedModal({ name, onConfirm, onCancel, loading }: {
  name: string
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-4 h-4 text-red-600" />
          </div>
          <h3 className="text-base font-semibold text-[#0f172a]">Permanently Delete Lead</h3>
        </div>
        <p className="text-sm text-[#475569] mb-1">
          Are you sure you want to permanently delete{' '}
          <span className="font-medium text-[#0f172a]">{name}</span>?
        </p>
        <p className="text-xs text-red-600 font-medium mb-1">This action cannot be undone.</p>
        <p className="text-xs text-[#94a3b8] mb-6">
          All data associated with this unverified lead will be immediately and permanently removed.
        </p>
        <div className="flex items-center justify-end gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>Permanently Delete</Button>
        </div>
      </div>
    </div>
  )
}
