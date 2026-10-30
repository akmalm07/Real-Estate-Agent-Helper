import { Button } from '../ui/Button'
import { ModalFrame } from './LeadFormShared'

export function DeleteLeadModal({ name, onConfirm, onCancel, loading }: {
  name: string
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}) {
  return (
    <ModalFrame titleId="delete-lead-title" onClose={onCancel} busy={loading}>
      <div className="w-full max-w-sm p-6">
        <h3 id="delete-lead-title" className="text-base font-semibold mb-2">Delete Lead</h3>
        <p className="text-sm text-muted-foreground mb-1">
          Are you sure you want to delete <span className="font-medium text-foreground">{name}</span>?
        </p>
        <p className="text-xs text-muted-foreground mb-6">
          The lead will be marked for deletion and removed within 30 days.
        </p>
        <div className="flex items-center justify-end gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>Delete</Button>
        </div>
      </div>
    </ModalFrame>
  )
}
