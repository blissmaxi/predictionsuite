/**
 * Hook for fetching and managing opportunities data
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchOpportunities } from '@/lib/api';

export function useOpportunities() {
  const queryClient = useQueryClient();

  const { data, error, isLoading, isFetching } = useQuery({
    queryKey: ['opportunities'],
    queryFn: () => fetchOpportunities(),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['opportunities'] });
  };

  return {
    opportunities: data?.opportunities ?? [],
    meta: data?.meta,
    isLoading,
    isFetching,
    error,
    refresh,
  };
}
