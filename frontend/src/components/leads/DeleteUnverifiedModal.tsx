import { AlertTriangle } from 'lucide-react'
import { Button } from '../ui/Button'
import { ModalFrame } from './LeadFormShared'

export function DeleteUnverifiedModal({ name, onConfirm, onCancel, loading }: {
  name: string
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}) {
  return (
    <ModalFrame titleId="delete-unverified-title" onClose={onCancel} busy={loading}>
      <div className="w-full max-w-sm p-6">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-md bg-destructive-subtle flex items-center justify-center flex-shrink-0">
            <AlertTriangle aria-hidden="true" className="w-4 h-4 text-destructive" />
          </div>
          <h3 id="delete-unverified-title" className="text-base font-semibold">Permanently Delete Lead</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-1">
          Are you sure you want to permanently delete{' '}
          <span className="font-medium text-foreground">{name}</span>?
        </p>
        <p className="text-xs text-destructive font-medium mb-1">This action cannot be undone.</p>
        <p className="text-xs text-muted-foreground mb-6">
          All data associated with this unverified lead will be immediately and permanently removed.
        </p>
        <div className="flex items-center justify-end gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>Permanently Delete</Button>
        </div>
      </div>
    </ModalFrame>
  )
}
