// ---------------------------------------------------------------------------
// Types for Inventarios page
// ---------------------------------------------------------------------------

export interface Category {
  id: string;
  name: string;
}

export interface ProductPresentation {
  id: string;
  productId: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  conversionFactor: number | string;
  conversionUnit: string;
  purchasePrice: number | string | null;
  salePrice: number | string | null;
  isDefault: boolean;
  isActive: boolean;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  description?: string;
  categoryId?: string;
  category?: Category | null;
  unitOfMeasure: string;
  costPerUnit: number | string;
  satClaveProdServ?: string;
  satClaveUnidad?: string;
  imageUrl?: string | null;
  isActive: boolean;
  presentations?: ProductPresentation[];
}

export interface Branch {
  id: string;
  name: string;
  code: string;
  branchType?: string;
}

export interface BranchInventoryItem {
  id: string;
  productId: string;
  product: { name: string; sku: string };
  currentQuantity: number | string;
  minimumStock: number | string;
}

export interface RecipeIngredient {
  id: string;
  productId: string;
  product: { name: string; costPerUnit: number | string };
  quantity: number | string;
  unitOfMeasure: string;
  wastePercentage: number | string;
}

export interface Recipe {
  id: string;
  menuItemName: string;
  yieldQuantity: number | string;
  yieldUnit: string;
  servings: number;
  totalCost: number | string | null;
  costPerServing: number | string | null;
  sellingPrice: number | string | null;
  targetFoodCost: number | string | null;
  isActive: boolean;
  ingredients: RecipeIngredient[];
}

export interface RecipeCostDetail {
  recipeName: string;
  servings: number;
  ingredients: Array<{
    productName: string;
    quantity: number;
    unit: string;
    wastePercentage: number;
    unitCost: number;
    totalCost: number;
  }>;
  totalCost: number;
  costPerServing: number;
  sellingPrice: number;
  foodCostPercentage: number;
  grossMargin: number;
  marginPercentage: number;
}

export interface FoodCostSummaryItem {
  id: string;
  name: string;
  servings: number;
  totalCost: number;
  costPerServing: number;
  sellingPrice: number;
  foodCostPercentage: number;
  status: "OPTIMAL" | "WARNING" | "CRITICAL";
}

export interface TransferItem {
  id: string;
  productId: string;
  product: { id: string; name: string; sku: string; unitOfMeasure: string };
  requestedQuantity: number | string;
  sentQuantity: number | string | null;
  receivedQuantity: number | string | null;
}

export interface Transfer {
  id: string;
  fromBranchId: string;
  toBranchId: string;
  fromBranch: { id: string; name: string; code: string };
  toBranch: { id: string; name: string; code: string };
  status: "PENDING" | "APPROVED" | "IN_TRANSIT" | "RECEIVED" | "CANCELLED";
  requestedById: string;
  approvedById?: string | null;
  createdAt: string;
  completedAt?: string | null;
  notes?: string | null;
  items: TransferItem[];
}

export interface TransfersResponse {
  data: Transfer[];
  total: number;
  page: number;
  totalPages: number;
}

// --- Cargas CEDIS types ---

export interface CedisStockItem {
  id: string;
  productId: string;
  currentQuantity: number;
  minimumStock: number;
  totalValue: number;
  belowMinimum: boolean;
  product: {
    id: string;
    name: string;
    sku: string;
    unitOfMeasure: string;
    costPerUnit: number | string;
    isActive: boolean;
    category?: { id: string; name: string } | null;
  };
}

export interface CedisStockResponse {
  branchId: string;
  branchName: string;
  branchType: string;
  totalValuation: number;
  items: CedisStockItem[];
}

export interface LoadHistoryGroup {
  date: string;
  items: Array<{
    id: string;
    productId: string;
    quantity: number | string;
    unitCost: number | string | null;
    notes: string | null;
    userId: string | null;
    timestamp: string;
    referenceType: string | null;
    product: {
      id: string;
      name: string;
      sku: string;
      unitOfMeasure: string;
      costPerUnit: number | string;
      category?: { id: string; name: string } | null;
    };
  }>;
  totalQuantity: number;
  totalCost: number;
}

export interface LoadItemRow {
  productId: string;
  quantity: string;
  unitCost: string;
  notes: string;
}

export interface CsvPreviewRow {
  sku: string;
  quantity: number;
  unitCost?: number;
  notes?: string;
  matched: boolean;
  productName?: string;
}
