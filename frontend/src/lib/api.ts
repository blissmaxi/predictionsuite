/**
 * API client for the PolyOracle backend
 */

import type { OpportunitiesResponse } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function fetchOpportunities(
  refresh = false
): Promise<OpportunitiesResponse> {
  const url = `${API_URL}/api/opportunities${refresh ? '?refresh=true' : ''}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch opportunities: ${response.status}`);
  }

  return response.json();
}

export async function fetchHealth(): Promise<{ status: string }> {
  const response = await fetch(`${API_URL}/api/health`);

  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`);
  }

  return response.json();
}
