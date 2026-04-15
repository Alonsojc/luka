"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";

/**
 * Generic hook for GET requests with React Query caching.
 *
 * @example
 * const { data, isLoading } = useApiQuery<Branch[]>("/branches", ["branches"]);
 */
export function useApiQuery<T>(path: string, queryKey: string[], options?: { enabled?: boolean }) {
  return useQuery<T>({
    queryKey,
    queryFn: () => api.get<T>(path),
    enabled: options?.enabled,
  });
}

/**
 * Generic hook for mutations (POST/PATCH/DELETE) with automatic cache invalidation.
 *
 * @example
 * const create = useApiMutation<Product>("/products", "POST", ["products"]);
 * create.mutate(newProduct);
 */
export function useApiMutation<TResponse = unknown, TBody = unknown>(
  path: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  invalidateKeys?: string[][],
  options?: { successMessage?: string },
) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<TResponse, Error, TBody>({
    mutationFn: async (body: TBody) => {
      switch (method) {
        case "POST":
          return api.post<TResponse>(path, body);
        case "PATCH":
          return api.patch<TResponse>(path, body);
        case "PUT":
          return api.put<TResponse>(path, body);
        case "DELETE":
          return api.delete<TResponse>(path);
      }
    },
    onSuccess: () => {
      if (invalidateKeys) {
        for (const key of invalidateKeys) {
          queryClient.invalidateQueries({ queryKey: key });
        }
      }
      if (options?.successMessage) {
        toast(options.successMessage, "success");
      }
    },
    onError: (err) => {
      toast(err.message || "Ocurrio un error", "error");
    },
  });
}
