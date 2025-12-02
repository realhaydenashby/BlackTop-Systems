import { useQuery } from "@tanstack/react-query";

interface ConnectionStatus {
  hasActiveConnection: boolean;
  connections: {
    provider: string;
    status: string;
    accountCount: number;
  }[];
}

export function useConnectionStatus() {
  const { data, isLoading, error, refetch, isError } = useQuery<ConnectionStatus>({
    queryKey: ["/api/live/connections/status"],
    staleTime: 30000,
    refetchOnWindowFocus: true,
    retry: (failureCount, error: any) => {
      const errorMessage = error?.message || String(error);
      if (errorMessage.startsWith("401")) return false;
      return failureCount < 2;
    },
  });

  return {
    hasActiveConnection: isError ? false : (data?.hasActiveConnection || false),
    connections: isError ? [] : (data?.connections || []),
    isLoading,
    error,
    isError,
    refetch,
  };
}
