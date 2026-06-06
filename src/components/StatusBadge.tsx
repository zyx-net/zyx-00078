import { CaseStatus, CaseType, ResponsibleParty, CaseAction, USER_ROLE_LABELS, CASE_STATUS_LABELS, CASE_TYPE_LABELS, RESPONSIBLE_PARTY_LABELS, CASE_ACTION_LABELS } from '../../shared/types';

interface StatusBadgeProps {
  status: CaseStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const styles: Record<CaseStatus, string> = {
    pendingEvidence: 'bg-amber-100 text-amber-800 border-amber-200',
    merchantProcessing: 'bg-blue-100 text-blue-800 border-blue-200',
    csArbitration: 'bg-purple-100 text-purple-800 border-purple-200',
    refundCompleted: 'bg-green-100 text-green-800 border-green-200',
    rejected: 'bg-red-100 text-red-800 border-red-200'
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[status]}`}>
      {CASE_STATUS_LABELS[status]}
    </span>
  );
}

interface TypeBadgeProps {
  type: CaseType;
}

export function TypeBadge({ type }: TypeBadgeProps) {
  const styles: Record<CaseType, string> = {
    outOfStock: 'bg-gray-100 text-gray-800 border-gray-200',
    damaged: 'bg-red-100 text-red-800 border-red-200',
    wrongDelivery: 'bg-orange-100 text-orange-800 border-orange-200'
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[type]}`}>
      {CASE_TYPE_LABELS[type]}
    </span>
  );
}

interface PartyBadgeProps {
  party: ResponsibleParty;
}

export function PartyBadge({ party }: PartyBadgeProps) {
  const styles: Record<ResponsibleParty, string> = {
    merchant: 'bg-blue-50 text-blue-700 border-blue-200',
    logistics: 'bg-green-50 text-green-700 border-green-200',
    platform: 'bg-purple-50 text-purple-700 border-purple-200'
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[party]}`}>
      {RESPONSIBLE_PARTY_LABELS[party]}
    </span>
  );
}

interface ActionBadgeProps {
  action: CaseAction | 'create';
  role: string;
}

export function ActionBadge({ action, role }: ActionBadgeProps) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
        {CASE_ACTION_LABELS[action]}
      </span>
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200">
        {USER_ROLE_LABELS[role as keyof typeof USER_ROLE_LABELS]}
      </span>
    </div>
  );
}
