import { OpportunityForm } from './OpportunityForm'

/** 新建商机弹窗：与编辑页共用 OpportunityForm（create + modal） */
export function CreateOpportunityModal({ onClose }: { onClose: () => void }) {
  return <OpportunityForm mode="create" variant="modal" onClose={onClose} />
}
