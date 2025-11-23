import { PaginationMeta, PaginationParams } from '@rt/contracts';

/**
 * Calculate pagination metadata
 */
export function calculatePagination(
  total: number,
  params: PaginationParams
): PaginationMeta {
  const page = params.page || 1;
  const limit = params.limit || 20;
  const totalPages = Math.ceil(total / limit);

  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

/**
 * Calculate skip value for database queries
 */
export function calculateSkip(page: number, limit: number): number {
  return (page - 1) * limit;
}

/**
 * Validate and normalize pagination params
 */
export function normalizePaginationParams(
  params: Partial<PaginationParams>
): Required<PaginationParams> {
  return {
    page: Math.max(1, params.page || 1),
    limit: Math.min(100, Math.max(1, params.limit || 20)),
    sortBy: params.sortBy || 'createdAt',
    sortOrder: params.sortOrder === 'asc' ? 'asc' : 'desc',
  };
}
