export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'COMPLETED': return 'text-green-600 bg-green-50'
    case 'FAILED': return 'text-red-600 bg-red-50'
    case 'PENDING': return 'text-yellow-600 bg-yellow-50'
    default: return 'text-blue-600 bg-blue-50'
  }
}

export function getStatusLabel(status: string): string {
  switch (status) {
    case 'PENDING': return 'Queued'
    case 'PARSING': return 'Reading PDF'
    case 'CATEGORIZING': return 'Categorizing'
    case 'EMBEDDING': return 'Indexing'
    case 'COMPLETED': return 'Ready'
    case 'FAILED': return 'Failed'
    default: return status
  }
}