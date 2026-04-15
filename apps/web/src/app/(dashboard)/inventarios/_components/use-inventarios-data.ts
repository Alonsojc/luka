"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type {
  Product,
  Category,
  Branch,
  BranchInventoryItem,
  Recipe,
  FoodCostSummaryItem,
  TransfersResponse,
  CedisStockResponse,
  LoadHistoryGroup,
} from "./types";

// ---------------------------------------------------------------------------
// React Query hooks for Inventarios data fetching
// ---------------------------------------------------------------------------

/** Fetch all products + derive categories */
export function useProducts() {
  const query = useQuery<Product[]>({
    queryKey: ["inventarios", "products"],
    queryFn: () => api.get<Product[]>("/inventarios/products"),
  });

  const categories: Category[] = [];
  if (query.data) {
    const catMap = new Map<string, Category>();
    query.data.forEach((p) => {
      if (p.category) catMap.set(p.category.id, p.category);
    });
    Array.from(catMap.values())
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((c) => categories.push(c));
  }

  return { ...query, products: query.data ?? [], categories };
}

/** Fetch all branches */
export function useBranches() {
  const query = useQuery<Branch[]>({
    queryKey: ["branches"],
    queryFn: () => api.get<Branch[]>("/branches"),
  });
  return { ...query, branches: query.data ?? [] };
}

/** Fetch branch inventory stock */
export function useBranchStock(branchId: string) {
  const query = useQuery<BranchInventoryItem[]>({
    queryKey: ["inventarios", "stock", branchId],
    queryFn: () => api.get<BranchInventoryItem[]>(`/inventarios/inventory/branch/${branchId}`),
    enabled: !!branchId,
  });
  return { ...query, stockItems: query.data ?? [] };
}

/** Fetch all recipes */
export function useRecipes() {
  const query = useQuery<Recipe[]>({
    queryKey: ["inventarios", "recipes"],
    queryFn: () => api.get<Recipe[]>("/inventarios/recipes"),
  });
  return { ...query, recipes: query.data ?? [] };
}

/** Fetch food cost summary */
export function useFoodCostSummary() {
  const query = useQuery<FoodCostSummaryItem[]>({
    queryKey: ["inventarios", "food-cost-summary"],
    queryFn: () => api.get<FoodCostSummaryItem[]>("/inventarios/recipes/food-cost-summary"),
  });
  return { ...query, foodCostSummary: query.data ?? [] };
}

/** Fetch transfers with filters */
export function useTransfers(filters: {
  status?: string;
  fromBranchId?: string;
  toBranchId?: string;
}) {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.fromBranchId) params.set("fromBranchId", filters.fromBranchId);
  if (filters.toBranchId) params.set("toBranchId", filters.toBranchId);
  const qs = params.toString();

  const query = useQuery<TransfersResponse>({
    queryKey: ["inventarios", "transfers", filters],
    queryFn: () => api.get<TransfersResponse>(`/inventarios/transfers${qs ? `?${qs}` : ""}`),
  });
  return { ...query, transfers: query.data?.data ?? [] };
}

/** Fetch CEDIS stock for a branch */
export function useCedisStock(branchId: string) {
  const query = useQuery<CedisStockResponse>({
    queryKey: ["inventarios", "cedis-stock", branchId],
    queryFn: () => api.get<CedisStockResponse>(`/inventarios/stock/${branchId}`),
    enabled: !!branchId,
  });
  return { ...query, cargasStock: query.data ?? null };
}

/** Fetch load history for a branch */
export function useLoadHistory(branchId: string, dateFrom?: string, dateTo?: string) {
  const params = new URLSearchParams();
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  const qs = params.toString();

  const query = useQuery<LoadHistoryGroup[]>({
    queryKey: ["inventarios", "load-history", branchId, dateFrom, dateTo],
    queryFn: () =>
      api.get<LoadHistoryGroup[]>(`/inventarios/load-history/${branchId}${qs ? `?${qs}` : ""}`),
    enabled: !!branchId,
  });
  return { ...query, loadHistory: query.data ?? [] };
}

/** Helper to invalidate inventarios queries after mutations */
export function useInvalidateInventarios() {
  const queryClient = useQueryClient();
  return {
    invalidateProducts: () =>
      queryClient.invalidateQueries({ queryKey: ["inventarios", "products"] }),
    invalidateRecipes: () =>
      queryClient.invalidateQueries({ queryKey: ["inventarios", "recipes"] }),
    invalidateFoodCost: () =>
      queryClient.invalidateQueries({ queryKey: ["inventarios", "food-cost-summary"] }),
    invalidateTransfers: () =>
      queryClient.invalidateQueries({ queryKey: ["inventarios", "transfers"] }),
    invalidateStock: (branchId?: string) =>
      queryClient.invalidateQueries({
        queryKey: branchId
          ? ["inventarios", "stock", branchId]
          : ["inventarios", "stock"],
      }),
    invalidateCedisStock: (branchId?: string) =>
      queryClient.invalidateQueries({
        queryKey: branchId
          ? ["inventarios", "cedis-stock", branchId]
          : ["inventarios", "cedis-stock"],
      }),
    invalidateLoadHistory: () =>
      queryClient.invalidateQueries({ queryKey: ["inventarios", "load-history"] }),
    invalidateAll: () =>
      queryClient.invalidateQueries({ queryKey: ["inventarios"] }),
  };
}
