"use client";

import { QueryClient } from "@tanstack/react-query";

let queryClient: QueryClient | null = null;

export function getQueryClient(): QueryClient {
  if (!queryClient) {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 30 * 1000, // 30 seconds
          gcTime: 5 * 60 * 1000, // 5 minutes (formerly cacheTime)
          retry: 1,
          refetchOnWindowFocus: false,
        },
      },
    });
  }
  return queryClient;
}
