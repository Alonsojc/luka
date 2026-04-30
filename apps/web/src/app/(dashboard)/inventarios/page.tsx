"use client";

import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Package,
  Warehouse,
  ChefHat,
  ArrowLeftRight,
  Search,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Upload,
  ImageIcon,
  RefreshCw,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Eye,
  Truck,
  PackageCheck,
  Check,
  Ban,
  Layers,
  Barcode,
  ChevronDown,
  ChevronUp,
  PackagePlus,
} from "lucide-react";
import { exportToCSV } from "@/lib/export-csv";
import { generateInventoryPDF } from "@/lib/pdf-generator";
import { getApiOrigin, getApiUrl } from "@/lib/api-url";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/components/ui/toast";
import { DataTable } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select, Textarea } from "@/components/ui/form-field";
import { formatMXN } from "@luka/shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Safely convert a value (possibly null, undefined, or Prisma Decimal) to a
 *  finite number. Returns 0 when the conversion would produce NaN. */
function safeNum(value: unknown): number {
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Category {
  id: string;
  name: string;
}

interface ProductPresentation {
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

interface Product {
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

interface Branch {
  id: string;
  name: string;
  code: string;
  branchType?: string;
}

interface BranchInventoryItem {
  id: string;
  productId: string;
  product: { name: string; sku: string };
  currentQuantity: number | string;
  minimumStock: number | string;
}

interface RecipeIngredient {
  id: string;
  productId: string;
  product: { name: string; costPerUnit: number | string };
  quantity: number | string;
  unitOfMeasure: string;
  wastePercentage: number | string;
}

interface Recipe {
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

interface RecipeCostDetail {
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

interface FoodCostSummaryItem {
  id: string;
  name: string;
  servings: number;
  totalCost: number;
  costPerServing: number;
  sellingPrice: number;
  foodCostPercentage: number;
  status: "OPTIMAL" | "WARNING" | "CRITICAL";
}

interface TransferItem {
  id: string;
  productId: string;
  product: { id: string; name: string; sku: string; unitOfMeasure: string };
  requestedQuantity: number | string;
  sentQuantity: number | string | null;
  receivedQuantity: number | string | null;
}

interface Transfer {
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

interface TransfersResponse {
  data: Transfer[];
  total: number;
  page: number;
  totalPages: number;
}

// --- Cargas CEDIS types ---

interface CedisStockItem {
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

interface CedisStockResponse {
  branchId: string;
  branchName: string;
  branchType: string;
  totalValuation: number;
  items: CedisStockItem[];
}

interface LoadHistoryGroup {
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

interface LoadItemRow {
  productId: string;
  quantity: string;
  unitCost: string;
  notes: string;
}

interface CsvPreviewRow {
  sku: string;
  quantity: number;
  unitCost?: number;
  notes?: string;
  matched: boolean;
  productName?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TABS = [
  { key: "productos", label: "Productos", icon: Package },
  { key: "stock", label: "Stock por Sucursal", icon: Warehouse },
  { key: "recetas", label: "Recetas", icon: ChefHat },
  { key: "transferencias", label: "Transferencias", icon: ArrowLeftRight },
  { key: "cargas", label: "Cargas CEDIS", icon: PackagePlus },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const UNIT_OPTIONS = [
  { value: "KG", label: "Kilogramo (kg)" },
  { value: "LT", label: "Litro (lt)" },
  { value: "PIEZA", label: "Pieza (pza)" },
  { value: "PAQUETE", label: "Paquete (paq)" },
  { value: "CAJA", label: "Caja" },
];

// Normalize legacy lowercase unit values to the DTO's required uppercase enum.
// NOTE: We do NOT map "g"→"KG" or "ml"→"LT" because that would silently change
// the unit scale by 1000x without adjusting costPerUnit. Those values fall
// through to the default "PIEZA" which is safe for test stability; real
// migration of g/ml products requires an explicit numeric conversion.
function normalizeUnit(unit: string): string {
  const map: Record<string, string> = {
    kg: "KG",
    lt: "LT",
    pza: "PIEZA",
    pieza: "PIEZA",
    paq: "PAQUETE",
    paquete: "PAQUETE",
    caja: "CAJA",
  };
  const normalized = map[unit?.toLowerCase()] || unit?.toUpperCase();
  return ["KG", "LT", "PIEZA", "PAQUETE", "CAJA"].includes(normalized) ? normalized : "PIEZA";
}

const TRANSFER_STATUS_STYLES: Record<Transfer["status"], string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-blue-100 text-blue-800",
  IN_TRANSIT: "bg-purple-100 text-purple-800",
  RECEIVED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
};

const TRANSFER_STATUS_LABELS: Record<Transfer["status"], string> = {
  PENDING: "Pendiente",
  APPROVED: "Aprobada",
  IN_TRANSIT: "En Transito",
  RECEIVED: "Recibida",
  CANCELLED: "Cancelada",
};

const CONVERSION_UNIT_OPTIONS = [
  { value: "kg", label: "Kilogramo (kg)" },
  { value: "g", label: "Gramo (g)" },
  { value: "lt", label: "Litro (lt)" },
  { value: "ml", label: "Mililitro (ml)" },
  { value: "pza", label: "Pieza (pza)" },
  { value: "caja", label: "Caja" },
  { value: "bolsa", label: "Bolsa" },
];

const _BRANCH_TYPE_STYLES: Record<string, string> = {
  CEDIS: "bg-blue-100 text-blue-800",
  ALMACEN: "bg-purple-100 text-purple-800",
  TIENDA: "bg-gray-100 text-gray-600",
};

const EMPTY_LOAD_ITEM: LoadItemRow = {
  productId: "",
  quantity: "",
  unitCost: "",
  notes: "",
};

const EMPTY_PRESENTATION_FORM = {
  name: "",
  sku: "",
  barcode: "",
  conversionFactor: "",
  conversionUnit: "kg",
  purchasePrice: "",
  salePrice: "",
  isDefault: false,
};

type PresentationForm = typeof EMPTY_PRESENTATION_FORM;

const EMPTY_PRODUCT_FORM = {
  sku: "",
  name: "",
  description: "",
  categoryId: "",
  unitOfMeasure: "KG",
  costPerUnit: "",
  satClaveProdServ: "",
  satClaveUnidad: "",
  imageUrl: "",
};

type ProductForm = typeof EMPTY_PRODUCT_FORM;

const EMPTY_RECIPE_INGREDIENT = {
  productId: "",
  quantity: "",
  unitOfMeasure: "KG",
  wastePercentage: "0",
};

const EMPTY_RECIPE_FORM = {
  menuItemName: "",
  yieldQuantity: "",
  yieldUnit: "pza",
  sellingPrice: "",
  ingredients: [{ ...EMPTY_RECIPE_INGREDIENT }],
};

type RecipeIngredientForm = typeof EMPTY_RECIPE_INGREDIENT;

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export default function InventariosPage() {
  const { authFetch, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>("productos");

  // ---- Search & Pagination state ----
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);
  // Reset search when tab changes
  useEffect(() => {
    setSearchTerm("");
    setCurrentPage(1);
  }, [activeTab]);

  // ---- Products state ----
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState<ProductForm>({ ...EMPTY_PRODUCT_FORM });
  const [productSaving, setProductSaving] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);

  // ---- Presentations state ----
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [presentationModalOpen, setPresentationModalOpen] = useState(false);
  const [presentationProductId, setPresentationProductId] = useState<string | null>(null);
  const [editingPresentation, setEditingPresentation] = useState<ProductPresentation | null>(null);
  const [presentationForm, setPresentationForm] = useState<PresentationForm>({
    ...EMPTY_PRESENTATION_FORM,
  });
  const [presentationSaving, setPresentationSaving] = useState(false);
  const [productFormPresentations, setProductFormPresentations] = useState<PresentationForm[]>([]);

  // ---- Stock state ----
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [stockItems, setStockItems] = useState<BranchInventoryItem[]>([]);
  const [stockLoading, setStockLoading] = useState(false);

  // ---- Recipes state ----
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipesLoading, setRecipesLoading] = useState(false);
  const [recipeModalOpen, setRecipeModalOpen] = useState(false);
  const [recipeForm, setRecipeForm] = useState({ ...EMPTY_RECIPE_FORM });
  const [recipeSaving, setRecipeSaving] = useState(false);

  // ---- Recipe costing state ----
  const [foodCostSummary, setFoodCostSummary] = useState<FoodCostSummaryItem[]>([]);
  const [recipeCostDetail, setRecipeCostDetail] = useState<RecipeCostDetail | null>(null);
  const [costDetailModalOpen, setCostDetailModalOpen] = useState(false);
  const [costDetailLoading, setCostDetailLoading] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  // ---- Transfers state ----
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [transfersLoading, setTransfersLoading] = useState(false);
  const [transferStatusFilter, setTransferStatusFilter] = useState("");
  const [transferFromFilter, setTransferFromFilter] = useState("");
  const [transferToFilter, setTransferToFilter] = useState("");

  // Transfer create modal
  const [createTransferOpen, setCreateTransferOpen] = useState(false);
  const [transferSaving, setTransferSaving] = useState(false);
  const [newTransferFrom, setNewTransferFrom] = useState("");
  const [newTransferTo, setNewTransferTo] = useState("");
  const [newTransferNotes, setNewTransferNotes] = useState("");
  const [newTransferItems, setNewTransferItems] = useState<
    Array<{ productId: string; requestedQuantity: string }>
  >([{ productId: "", requestedQuantity: "" }]);

  // Transfer detail modal
  const [selectedTransfer, setSelectedTransfer] = useState<Transfer | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [transferActionLoading, setTransferActionLoading] = useState(false);

  // Ship modal (enter sent quantities)
  const [shipModalOpen, setShipModalOpen] = useState(false);
  const [shipQuantities, setShipQuantities] = useState<Record<string, string>>({});

  // Receive modal (enter received quantities)
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [receiveQuantities, setReceiveQuantities] = useState<Record<string, string>>({});

  // ---- Cargas CEDIS state ----
  const [cargasSection, _setCargasSection] = useState<"stock" | "load" | "adjust" | "history">(
    "stock",
  );
  const [cargasBranchId, setCargasBranchId] = useState("");
  const [cargasStock, setCargasStock] = useState<CedisStockResponse | null>(null);
  const [_cargasStockLoading, setCargasStockLoading] = useState(false);
  const [cargasStockSearch, _setCargasStockSearch] = useState("");
  const [cargasStockCategory, _setCargasStockCategory] = useState("");

  // Manual load
  const [loadItems, setLoadItems] = useState<LoadItemRow[]>([{ ...EMPTY_LOAD_ITEM }]);
  const [_loadSaving, setLoadSaving] = useState(false);
  const [_loadResult, setLoadResult] = useState<{
    totalItems: number;
    totalQuantity: number;
    totalCost: number;
  } | null>(null);

  // CSV import
  const [csvPreview, setCsvPreview] = useState<CsvPreviewRow[]>([]);
  const [_csvFileName, setCsvFileName] = useState("");
  const [_csvImporting, setCsvImporting] = useState(false);
  const [_csvResult, setCsvResult] = useState<{
    matched: number;
    unmatched: Array<{ sku: string; row: number }>;
    loaded: number;
  } | null>(null);

  // Adjustment
  const [adjustProductId, setAdjustProductId] = useState("");
  const [adjustNewQty, setAdjustNewQty] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [_adjustSaving, setAdjustSaving] = useState(false);
  const [_adjustResult, setAdjustResult] = useState<{
    productName: string;
    previousQuantity: number;
    newQuantity: number;
    difference: number;
  } | null>(null);

  // Load history
  const [_loadHistory, setLoadHistory] = useState<LoadHistoryGroup[]>([]);
  const [_loadHistoryLoading, setLoadHistoryLoading] = useState(false);
  const [historyDateFrom, _setHistoryDateFrom] = useState("");
  const [historyDateTo, _setHistoryDateTo] = useState("");
  const [_expandedHistoryDate, _setExpandedHistoryDate] = useState<string | null>(null);

  // =======================================================================
  // Data-fetching helpers
  // =======================================================================

  const fetchProducts = useCallback(async () => {
    setProductsLoading(true);
    try {
      const data = await authFetch<Product[]>("get", "/inventarios/products");
      setProducts(data);
      // Derive unique categories from products
      const catMap = new Map<string, Category>();
      data.forEach((p) => {
        if (p.category) catMap.set(p.category.id, p.category);
      });
      setCategories(Array.from(catMap.values()).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al cargar datos", "error");
    } finally {
      setProductsLoading(false);
    }
  }, [authFetch, toast]);

  const fetchBranches = useCallback(async () => {
    try {
      const data = await authFetch<Branch[]>("get", "/branches");
      setBranches(data);
      if (data.length > 0 && !selectedBranchId) {
        setSelectedBranchId(data[0].id);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al cargar datos", "error");
    }
  }, [authFetch, toast, selectedBranchId]);

  const fetchStock = useCallback(
    async (branchId: string) => {
      if (!branchId) return;
      setStockLoading(true);
      try {
        const data = await authFetch<BranchInventoryItem[]>(
          "get",
          `/inventarios/inventory/branch/${branchId}`,
        );
        setStockItems(data);
      } catch (err) {
        toast(err instanceof Error ? err.message : "Error al cargar datos", "error");
      } finally {
        setStockLoading(false);
      }
    },
    [authFetch, toast],
  );

  const fetchRecipes = useCallback(async () => {
    setRecipesLoading(true);
    try {
      const data = await authFetch<Recipe[]>("get", "/inventarios/recipes");
      setRecipes(data);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al cargar datos", "error");
    } finally {
      setRecipesLoading(false);
    }
  }, [authFetch, toast]);

  const fetchFoodCostSummary = useCallback(async () => {
    try {
      const data = await authFetch<FoodCostSummaryItem[]>(
        "get",
        "/inventarios/recipes/food-cost-summary",
      );
      setFoodCostSummary(data);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al cargar datos", "error");
    }
  }, [authFetch, toast]);

  const fetchRecipeCostDetail = useCallback(
    async (recipeId: string) => {
      setCostDetailLoading(true);
      try {
        const data = await authFetch<RecipeCostDetail>(
          "get",
          `/inventarios/recipes/${recipeId}/cost`,
        );
        setRecipeCostDetail(data);
        setCostDetailModalOpen(true);
      } catch (err) {
        toast(err instanceof Error ? err.message : "Error al cargar datos", "error");
      } finally {
        setCostDetailLoading(false);
      }
    },
    [authFetch, toast],
  );

  const handleRecalculateAll = useCallback(async () => {
    setRecalculating(true);
    try {
      await authFetch("post", "/inventarios/recipes/recalculate");
      await fetchRecipes();
      await fetchFoodCostSummary();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al actualizar", "error");
    } finally {
      setRecalculating(false);
    }
  }, [authFetch, toast, fetchRecipes, fetchFoodCostSummary]);

  const fetchTransfers = useCallback(async () => {
    setTransfersLoading(true);
    try {
      const params = new URLSearchParams();
      if (transferStatusFilter) params.set("status", transferStatusFilter);
      if (transferFromFilter) params.set("fromBranchId", transferFromFilter);
      if (transferToFilter) params.set("toBranchId", transferToFilter);
      const qs = params.toString();
      const resp = await authFetch<TransfersResponse>(
        "get",
        `/inventarios/transfers${qs ? `?${qs}` : ""}`,
      );
      setTransfers(resp.data);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al cargar datos", "error");
    } finally {
      setTransfersLoading(false);
    }
  }, [authFetch, toast, transferStatusFilter, transferFromFilter, transferToFilter]);

  // =======================================================================
  // Cargas CEDIS fetching helpers
  // =======================================================================

  const fetchCargasStock = useCallback(
    async (branchId: string) => {
      if (!branchId) return;
      setCargasStockLoading(true);
      try {
        const data = await authFetch<CedisStockResponse>("get", `/inventarios/stock/${branchId}`);
        setCargasStock(data);
      } catch (err) {
        toast(err instanceof Error ? err.message : "Error al cargar datos", "error");
      } finally {
        setCargasStockLoading(false);
      }
    },
    [authFetch, toast],
  );

  const fetchLoadHistory = useCallback(
    async (branchId: string, dateFrom?: string, dateTo?: string) => {
      if (!branchId) return;
      setLoadHistoryLoading(true);
      try {
        const params = new URLSearchParams();
        if (dateFrom) params.set("dateFrom", dateFrom);
        if (dateTo) params.set("dateTo", dateTo);
        const qs = params.toString();
        const data = await authFetch<LoadHistoryGroup[]>(
          "get",
          `/inventarios/load-history/${branchId}${qs ? `?${qs}` : ""}`,
        );
        setLoadHistory(data);
      } catch (err) {
        toast(err instanceof Error ? err.message : "Error al cargar datos", "error");
      } finally {
        setLoadHistoryLoading(false);
      }
    },
    [authFetch, toast],
  );

  async function _handleManualLoad() {
    if (!cargasBranchId) return;
    setLoadSaving(true);
    setLoadResult(null);
    try {
      const validItems = loadItems
        .filter((i) => i.productId && i.quantity)
        .map((i) => ({
          productId: i.productId,
          quantity: parseFloat(i.quantity),
          unitCost: i.unitCost ? parseFloat(i.unitCost) : undefined,
          notes: i.notes || undefined,
        }));
      if (validItems.length === 0) return;

      const result = await authFetch<{
        totalItems: number;
        totalQuantity: number;
        totalCost: number;
      }>("post", "/inventarios/load", { branchId: cargasBranchId, items: validItems });
      setLoadResult(result);
      setLoadItems([{ ...EMPTY_LOAD_ITEM }]);
      // Refresh stock
      fetchCargasStock(cargasBranchId);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al guardar", "error");
    } finally {
      setLoadSaving(false);
    }
  }

  function _handleCsvFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    setCsvResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      // Skip header if first line contains text like "SKU"
      let startIdx = 0;
      if (lines.length > 0 && lines[0].toLowerCase().includes("sku")) {
        startIdx = 1;
      }

      const rows: CsvPreviewRow[] = [];
      for (let i = startIdx; i < lines.length; i++) {
        const cols = lines[i].split(",").map((c) => c.trim());
        if (cols.length < 2) continue;
        const sku = cols[0];
        const quantity = parseFloat(cols[1]);
        if (!sku || isNaN(quantity) || quantity <= 0) continue;

        const unitCost = cols[2] ? parseFloat(cols[2]) : undefined;
        const notes = cols[3] || undefined;

        // Check if the product matches any in the org
        const matchedProduct = products.find(
          (p) => p.sku.toLowerCase().trim() === sku.toLowerCase().trim(),
        );

        rows.push({
          sku,
          quantity,
          unitCost: unitCost && !isNaN(unitCost) ? unitCost : undefined,
          notes,
          matched: !!matchedProduct,
          productName: matchedProduct?.name,
        });
      }
      setCsvPreview(rows);
    };
    reader.readAsText(file);
    // Reset file input
    e.target.value = "";
  }

  async function _handleCsvImport() {
    if (!cargasBranchId || csvPreview.length === 0) return;
    setCsvImporting(true);
    setCsvResult(null);
    try {
      const rows = csvPreview.map((r) => ({
        sku: r.sku,
        quantity: r.quantity,
        unitCost: r.unitCost,
        notes: r.notes,
      }));
      const result = await authFetch<{
        matched: number;
        unmatched: Array<{ sku: string; row: number }>;
        loaded: number;
      }>("post", "/inventarios/load-csv", { branchId: cargasBranchId, rows });
      setCsvResult(result);
      setCsvPreview([]);
      setCsvFileName("");
      // Refresh stock
      fetchCargasStock(cargasBranchId);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al guardar", "error");
    } finally {
      setCsvImporting(false);
    }
  }

  async function _handleAdjustInventory() {
    if (!cargasBranchId || !adjustProductId || !adjustNewQty || !adjustReason) return;
    setAdjustSaving(true);
    setAdjustResult(null);
    try {
      const result = await authFetch<{
        productName: string;
        previousQuantity: number;
        newQuantity: number;
        difference: number;
      }>("post", "/inventarios/adjust", {
        branchId: cargasBranchId,
        productId: adjustProductId,
        newQuantity: parseFloat(adjustNewQty),
        reason: adjustReason,
      });
      setAdjustResult(result);
      setAdjustProductId("");
      setAdjustNewQty("");
      setAdjustReason("");
      // Refresh stock
      fetchCargasStock(cargasBranchId);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al actualizar", "error");
    } finally {
      setAdjustSaving(false);
    }
  }

  // Helper: current stock for selected adjust product
  const _adjustCurrentStock = useMemo(() => {
    if (!adjustProductId || !cargasStock) return null;
    return cargasStock.items.find((i) => i.productId === adjustProductId);
  }, [adjustProductId, cargasStock]);

  // Helper: filtered stock for cargas tab
  const _filteredCargasStock = useMemo(() => {
    if (!cargasStock) return [];
    let items = cargasStock.items;
    if (cargasStockSearch) {
      const q = normalize(cargasStockSearch);
      items = items.filter(
        (i) => normalize(i.product.name).includes(q) || normalize(i.product.sku).includes(q),
      );
    }
    if (cargasStockCategory) {
      items = items.filter((i) => i.product.category?.id === cargasStockCategory);
    }
    return items;
  }, [cargasStock, cargasStockSearch, cargasStockCategory]);

  // Derive categories from cargas stock for filter
  const _cargasCategories = useMemo(() => {
    if (!cargasStock) return [];
    const catMap = new Map<string, { id: string; name: string }>();
    cargasStock.items.forEach((i) => {
      if (i.product.category) catMap.set(i.product.category.id, i.product.category);
    });
    return Array.from(catMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [cargasStock]);

  // Warehouse branches (CEDIS/ALMACEN) for the cargas branch selector
  const warehouseBranches = useMemo(() => {
    return branches.filter((b) => b.branchType === "CEDIS" || b.branchType === "ALMACEN");
  }, [branches]);

  // =======================================================================
  // Load data when tab changes
  // =======================================================================

  useEffect(() => {
    if (authLoading) return;
    if (activeTab === "productos") {
      fetchProducts();
    } else if (activeTab === "stock") {
      fetchBranches();
    } else if (activeTab === "recetas") {
      fetchRecipes();
      fetchFoodCostSummary();
      // Also make sure products are loaded for the recipe ingredient dropdown
      if (products.length === 0) fetchProducts();
    } else if (activeTab === "transferencias") {
      fetchTransfers();
      if (branches.length === 0) fetchBranches();
      if (products.length === 0) fetchProducts();
    } else if (activeTab === "cargas") {
      if (branches.length === 0) fetchBranches();
      if (products.length === 0) fetchProducts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, authLoading]);

  // Fetch stock when branch changes
  useEffect(() => {
    if (activeTab === "stock" && selectedBranchId) {
      fetchStock(selectedBranchId);
    }
  }, [activeTab, selectedBranchId, fetchStock]);

  // Auto-select first warehouse branch for cargas tab
  useEffect(() => {
    if (activeTab === "cargas" && !cargasBranchId && warehouseBranches.length > 0) {
      setCargasBranchId(warehouseBranches[0].id);
    }
  }, [activeTab, cargasBranchId, warehouseBranches]);

  // Fetch cargas stock when branch changes
  useEffect(() => {
    if (activeTab === "cargas" && cargasBranchId) {
      fetchCargasStock(cargasBranchId);
    }
  }, [activeTab, cargasBranchId, fetchCargasStock]);

  // Fetch history when switching to history section or date filters change
  useEffect(() => {
    if (activeTab === "cargas" && cargasSection === "history" && cargasBranchId) {
      fetchLoadHistory(cargasBranchId, historyDateFrom || undefined, historyDateTo || undefined);
    }
  }, [activeTab, cargasSection, cargasBranchId, historyDateFrom, historyDateTo, fetchLoadHistory]);

  // Re-fetch transfers when filters change
  useEffect(() => {
    if (activeTab === "transferencias" && !authLoading) {
      fetchTransfers();
    }
  }, [transferStatusFilter, transferFromFilter, transferToFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // =======================================================================
  // Image upload helper
  // =======================================================================

  const API_URL = getApiUrl();

  async function uploadImage(file: File): Promise<string> {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`${API_URL}/uploads/image`, {
      method: "POST",
      credentials: "include",
      body: formData,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ message: "Error al subir imagen" }));
      throw new Error(body.message || "Error al subir imagen");
    }
    const data = await res.json();
    return data.url;
  }

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageUploading(true);
    try {
      const url = await uploadImage(file);
      setProductForm((f) => ({ ...f, imageUrl: url }));
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al guardar", "error");
    } finally {
      setImageUploading(false);
    }
    // Reset file input so the same file can be re-selected
    e.target.value = "";
  }

  // =======================================================================
  // Product CRUD handlers
  // =======================================================================

  function openCreateProduct() {
    setEditingProduct(null);
    setProductForm({ ...EMPTY_PRODUCT_FORM });
    setProductFormPresentations([]);
    setProductModalOpen(true);
  }

  function openEditProduct(product: Product) {
    setEditingProduct(product);
    setProductForm({
      sku: product.sku,
      name: product.name,
      description: product.description ?? "",
      categoryId: product.categoryId ?? "",
      unitOfMeasure: normalizeUnit(product.unitOfMeasure),
      costPerUnit: String(product.costPerUnit),
      satClaveProdServ: product.satClaveProdServ ?? "",
      satClaveUnidad: product.satClaveUnidad ?? "",
      imageUrl: product.imageUrl ?? "",
    });
    setProductFormPresentations([]);
    setProductModalOpen(true);
  }

  function openDeleteProduct(product: Product) {
    setDeletingProduct(product);
    setDeleteConfirmOpen(true);
  }

  async function handleSaveProduct() {
    setProductSaving(true);
    try {
      const payload = {
        sku: productForm.sku,
        name: productForm.name,
        description: productForm.description || undefined,
        categoryId: productForm.categoryId || undefined,
        unitOfMeasure: normalizeUnit(productForm.unitOfMeasure),
        costPerUnit: parseFloat(productForm.costPerUnit),
        satClaveProdServ: productForm.satClaveProdServ || undefined,
        satClaveUnidad: productForm.satClaveUnidad || undefined,
        imageUrl: productForm.imageUrl || undefined,
      };

      let savedProduct: Product;
      if (editingProduct) {
        savedProduct = await authFetch<Product>(
          "patch",
          `/inventarios/products/${editingProduct.id}`,
          payload,
        );
      } else {
        savedProduct = await authFetch<Product>("post", "/inventarios/products", payload);
      }

      // Create inline presentations if any were added during product creation
      if (!editingProduct && productFormPresentations.length > 0) {
        for (const pf of productFormPresentations) {
          if (!pf.name || !pf.conversionFactor) continue;
          const presPayload: any = {
            name: pf.name,
            conversionFactor: parseFloat(pf.conversionFactor),
            conversionUnit: pf.conversionUnit,
            isDefault: pf.isDefault,
          };
          if (pf.sku) presPayload.sku = pf.sku;
          if (pf.barcode) presPayload.barcode = pf.barcode;
          if (pf.purchasePrice) presPayload.purchasePrice = parseFloat(pf.purchasePrice);
          if (pf.salePrice) presPayload.salePrice = parseFloat(pf.salePrice);
          await authFetch(
            "post",
            `/inventarios/products/${savedProduct.id}/presentations`,
            presPayload,
          );
        }
      }

      setProductModalOpen(false);
      fetchProducts();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al guardar", "error");
    } finally {
      setProductSaving(false);
    }
  }

  async function handleDeleteProduct() {
    if (!deletingProduct) return;
    try {
      await authFetch<void>("delete", `/inventarios/products/${deletingProduct.id}`);
      setDeleteConfirmOpen(false);
      setDeletingProduct(null);
      fetchProducts();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al eliminar", "error");
    }
  }

  // =======================================================================
  // Presentation CRUD handlers
  // =======================================================================

  function toggleExpandProduct(productId: string) {
    setExpandedProductId((prev) => (prev === productId ? null : productId));
  }

  function openCreatePresentation(productId: string) {
    setPresentationProductId(productId);
    setEditingPresentation(null);
    setPresentationForm({ ...EMPTY_PRESENTATION_FORM });
    setPresentationModalOpen(true);
  }

  function openEditPresentation(presentation: ProductPresentation) {
    setPresentationProductId(presentation.productId);
    setEditingPresentation(presentation);
    setPresentationForm({
      name: presentation.name,
      sku: presentation.sku ?? "",
      barcode: presentation.barcode ?? "",
      conversionFactor: String(presentation.conversionFactor),
      conversionUnit: presentation.conversionUnit,
      purchasePrice: presentation.purchasePrice != null ? String(presentation.purchasePrice) : "",
      salePrice: presentation.salePrice != null ? String(presentation.salePrice) : "",
      isDefault: presentation.isDefault,
    });
    setPresentationModalOpen(true);
  }

  async function handleSavePresentation() {
    if (!presentationProductId) return;
    setPresentationSaving(true);
    try {
      const payload: any = {
        name: presentationForm.name,
        conversionFactor: parseFloat(presentationForm.conversionFactor),
        conversionUnit: presentationForm.conversionUnit,
        isDefault: presentationForm.isDefault,
      };
      if (presentationForm.sku) payload.sku = presentationForm.sku;
      if (presentationForm.barcode) payload.barcode = presentationForm.barcode;
      if (presentationForm.purchasePrice)
        payload.purchasePrice = parseFloat(presentationForm.purchasePrice);
      if (presentationForm.salePrice) payload.salePrice = parseFloat(presentationForm.salePrice);

      if (editingPresentation) {
        await authFetch("patch", `/inventarios/presentations/${editingPresentation.id}`, payload);
      } else {
        await authFetch(
          "post",
          `/inventarios/products/${presentationProductId}/presentations`,
          payload,
        );
      }
      setPresentationModalOpen(false);
      fetchProducts();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al guardar", "error");
    } finally {
      setPresentationSaving(false);
    }
  }

  async function handleDeletePresentation(presentationId: string) {
    try {
      await authFetch("delete", `/inventarios/presentations/${presentationId}`);
      fetchProducts();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al eliminar", "error");
    }
  }

  // helpers for inline presentations in product create/edit modal
  function addProductFormPresentation() {
    setProductFormPresentations((prev) => [...prev, { ...EMPTY_PRESENTATION_FORM }]);
  }

  function removeProductFormPresentation(index: number) {
    setProductFormPresentations((prev) => prev.filter((_, i) => i !== index));
  }

  function updateProductFormPresentation(
    index: number,
    field: keyof PresentationForm,
    value: string | boolean,
  ) {
    setProductFormPresentations((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)),
    );
  }

  // =======================================================================
  // Recipe create handler
  // =======================================================================

  function openCreateRecipe() {
    setRecipeForm({ ...EMPTY_RECIPE_FORM, ingredients: [{ ...EMPTY_RECIPE_INGREDIENT }] });
    setRecipeModalOpen(true);
  }

  function addIngredientRow() {
    setRecipeForm((prev) => ({
      ...prev,
      ingredients: [...prev.ingredients, { ...EMPTY_RECIPE_INGREDIENT }],
    }));
  }

  function removeIngredientRow(index: number) {
    setRecipeForm((prev) => ({
      ...prev,
      ingredients: prev.ingredients.filter((_, i) => i !== index),
    }));
  }

  function updateIngredient(index: number, field: keyof RecipeIngredientForm, value: string) {
    setRecipeForm((prev) => ({
      ...prev,
      ingredients: prev.ingredients.map((ing, i) =>
        i === index ? { ...ing, [field]: value } : ing,
      ),
    }));
  }

  async function handleSaveRecipe() {
    setRecipeSaving(true);
    try {
      const payload = {
        menuItemName: recipeForm.menuItemName,
        yieldQuantity: parseFloat(recipeForm.yieldQuantity),
        yieldUnit: recipeForm.yieldUnit,
        sellingPrice: recipeForm.sellingPrice ? parseFloat(recipeForm.sellingPrice) : undefined,
        ingredients: recipeForm.ingredients
          .filter((ing) => ing.productId && ing.quantity)
          .map((ing) => ({
            productId: ing.productId,
            quantity: parseFloat(ing.quantity),
            unitOfMeasure: ing.unitOfMeasure,
            wastePercentage: parseFloat(ing.wastePercentage) || 0,
          })),
      };
      await authFetch<Recipe>("post", "/inventarios/recipes", payload);
      setRecipeModalOpen(false);
      fetchRecipes();
      fetchFoodCostSummary();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al guardar", "error");
    } finally {
      setRecipeSaving(false);
    }
  }

  // =======================================================================
  // Transfer CRUD handlers
  // =======================================================================

  function openCreateTransfer() {
    setNewTransferFrom("");
    setNewTransferTo("");
    setNewTransferNotes("");
    setNewTransferItems([{ productId: "", requestedQuantity: "" }]);
    setCreateTransferOpen(true);
  }

  function addTransferItemRow() {
    setNewTransferItems((prev) => [...prev, { productId: "", requestedQuantity: "" }]);
  }

  function removeTransferItemRow(index: number) {
    setNewTransferItems((prev) => prev.filter((_, i) => i !== index));
  }

  function updateTransferItem(
    index: number,
    field: "productId" | "requestedQuantity",
    value: string,
  ) {
    setNewTransferItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );
  }

  async function handleCreateTransfer() {
    setTransferSaving(true);
    try {
      const payload = {
        fromBranchId: newTransferFrom,
        toBranchId: newTransferTo,
        notes: newTransferNotes || undefined,
        items: newTransferItems
          .filter((i) => i.productId && i.requestedQuantity)
          .map((i) => ({
            productId: i.productId,
            requestedQuantity: parseFloat(i.requestedQuantity),
          })),
      };
      await authFetch<Transfer>("post", "/inventarios/transfers", payload);
      setCreateTransferOpen(false);
      fetchTransfers();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al guardar", "error");
    } finally {
      setTransferSaving(false);
    }
  }

  async function openTransferDetail(transfer: Transfer) {
    try {
      const detail = await authFetch<Transfer>("get", `/inventarios/transfers/${transfer.id}`);
      setSelectedTransfer(detail);
      setDetailModalOpen(true);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al cargar datos", "error");
    }
  }

  async function handleApproveTransfer() {
    if (!selectedTransfer) return;
    setTransferActionLoading(true);
    try {
      const updated = await authFetch<Transfer>(
        "patch",
        `/inventarios/transfers/${selectedTransfer.id}/approve`,
      );
      setSelectedTransfer(updated);
      fetchTransfers();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al actualizar", "error");
    } finally {
      setTransferActionLoading(false);
    }
  }

  async function handleCancelTransfer() {
    if (!selectedTransfer) return;
    setTransferActionLoading(true);
    try {
      const updated = await authFetch<Transfer>(
        "patch",
        `/inventarios/transfers/${selectedTransfer.id}/cancel`,
      );
      setSelectedTransfer(updated);
      fetchTransfers();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al actualizar", "error");
    } finally {
      setTransferActionLoading(false);
    }
  }

  function openShipModal() {
    if (!selectedTransfer) return;
    const quantities: Record<string, string> = {};
    selectedTransfer.items.forEach((item) => {
      quantities[item.id] = String(safeNum(item.requestedQuantity));
    });
    setShipQuantities(quantities);
    setShipModalOpen(true);
  }

  async function handleShipTransfer() {
    if (!selectedTransfer) return;
    setTransferActionLoading(true);
    try {
      const payload = {
        items: Object.entries(shipQuantities).map(([itemId, qty]) => ({
          itemId,
          sentQuantity: parseFloat(qty),
        })),
      };
      const updated = await authFetch<Transfer>(
        "patch",
        `/inventarios/transfers/${selectedTransfer.id}/ship`,
        payload,
      );
      setShipModalOpen(false);
      setSelectedTransfer(updated);
      fetchTransfers();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al actualizar", "error");
    } finally {
      setTransferActionLoading(false);
    }
  }

  function openReceiveModal() {
    if (!selectedTransfer) return;
    const quantities: Record<string, string> = {};
    selectedTransfer.items.forEach((item) => {
      quantities[item.id] = String(safeNum(item.sentQuantity ?? item.requestedQuantity));
    });
    setReceiveQuantities(quantities);
    setReceiveModalOpen(true);
  }

  async function handleReceiveTransfer() {
    if (!selectedTransfer) return;
    setTransferActionLoading(true);
    try {
      const payload = {
        items: Object.entries(receiveQuantities).map(([itemId, qty]) => ({
          itemId,
          receivedQuantity: parseFloat(qty),
        })),
      };
      const updated = await authFetch<Transfer>(
        "patch",
        `/inventarios/transfers/${selectedTransfer.id}/receive`,
        payload,
      );
      setReceiveModalOpen(false);
      setSelectedTransfer(updated);
      fetchTransfers();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al actualizar", "error");
    } finally {
      setTransferActionLoading(false);
    }
  }

  // =======================================================================
  // Search & Pagination logic
  // =======================================================================

  const filteredProducts = useMemo(() => {
    if (!searchTerm) return products;
    const q = normalize(searchTerm);
    return products.filter(
      (p) =>
        normalize(p.name || "").includes(q) ||
        normalize(p.sku || "").includes(q) ||
        normalize(p.category?.name || "").includes(q),
    );
  }, [products, searchTerm]);

  const filteredStockItems = useMemo(() => {
    if (!searchTerm) return stockItems;
    const q = normalize(searchTerm);
    return stockItems.filter(
      (s) =>
        normalize(s.product.name || "").includes(q) || normalize(s.product.sku || "").includes(q),
    );
  }, [stockItems, searchTerm]);

  const filteredRecipes = useMemo(() => {
    if (!searchTerm) return recipes;
    const q = normalize(searchTerm);
    return recipes.filter((r) => normalize(r.menuItemName || "").includes(q));
  }, [recipes, searchTerm]);

  const filteredTransfers = useMemo(() => {
    if (!searchTerm) return transfers;
    const q = normalize(searchTerm);
    return transfers.filter(
      (t) =>
        normalize(t.fromBranch.name || "").includes(q) ||
        normalize(t.toBranch.name || "").includes(q),
    );
  }, [transfers, searchTerm]);

  const currentFiltered =
    activeTab === "productos"
      ? filteredProducts
      : activeTab === "stock"
        ? filteredStockItems
        : activeTab === "recetas"
          ? filteredRecipes
          : filteredTransfers;

  const totalPages = Math.ceil(currentFiltered.length / PAGE_SIZE);
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const paginatedStockItems = filteredStockItems.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const paginatedRecipes = filteredRecipes.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const paginatedTransfers = filteredTransfers.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const paginationStart = currentFiltered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const paginationEnd = Math.min(currentPage * PAGE_SIZE, currentFiltered.length);

  // =======================================================================
  // Column definitions
  // =======================================================================

  const imgBase = getApiOrigin();

  const productColumns = [
    {
      key: "expand",
      header: "",
      render: (r: Product) => {
        const _count = r.presentations?.length ?? 0;
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleExpandProduct(r.id);
            }}
            className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted transition-colors"
            title={expandedProductId === r.id ? "Colapsar" : "Expandir presentaciones"}
          >
            {expandedProductId === r.id ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        );
      },
    },
    { key: "sku", header: "SKU", className: "font-mono" },
    {
      key: "name",
      header: "Nombre",
      render: (r: Product) => (
        <div className="flex items-center gap-2">
          {r.imageUrl ? (
            <img
              src={`${imgBase}${r.imageUrl}`}
              alt={r.name}
              className="h-8 w-8 rounded object-cover border border-gray-200"
            />
          ) : (
            <div className="h-8 w-8 rounded border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center">
              <ImageIcon className="h-4 w-4 text-gray-300" />
            </div>
          )}
          <span className="font-medium">{r.name}</span>
          {(r.presentations?.length ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
              <Layers className="h-3 w-3" />
              {r.presentations!.length}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "category",
      header: "Categoria",
      render: (r: Product) => r.category?.name ?? "-",
    },
    { key: "unitOfMeasure", header: "U. Medida" },
    {
      key: "costPerUnit",
      header: "Costo",
      className: "text-right",
      render: (r: Product) => formatMXN(r.costPerUnit),
    },
    {
      key: "isActive",
      header: "Activo",
      render: (r: Product) => (
        <span
          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
            r.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
          }`}
        >
          {r.isActive ? "Si" : "No"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Acciones",
      render: (r: Product) => (
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              openEditProduct(r);
            }}
            className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted transition-colors"
            title="Editar"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              openDeleteProduct(r);
            }}
            className="p-1 text-muted-foreground hover:text-destructive rounded hover:bg-red-50 transition-colors"
            title="Eliminar"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  const stockColumns = [
    {
      key: "product.name",
      header: "Producto",
      render: (r: BranchInventoryItem) => (
        <div>
          <span className="font-medium">{r.product.name}</span>
          <span className="ml-2 text-xs text-muted-foreground font-mono">{r.product.sku}</span>
        </div>
      ),
    },
    {
      key: "currentQuantity",
      header: "Cantidad Actual",
      className: "text-right",
      render: (r: BranchInventoryItem) => safeNum(r.currentQuantity).toLocaleString("es-MX"),
    },
    {
      key: "minimumStock",
      header: "Stock Minimo",
      className: "text-right",
      render: (r: BranchInventoryItem) => safeNum(r.minimumStock).toLocaleString("es-MX"),
    },
    {
      key: "status",
      header: "Estado",
      render: (r: BranchInventoryItem) => {
        const current = safeNum(r.currentQuantity);
        const min = safeNum(r.minimumStock);
        if (min > 0 && current <= min) {
          return (
            <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium bg-red-100 text-red-700">
              Bajo
            </span>
          );
        }
        return (
          <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium bg-green-100 text-green-700">
            OK
          </span>
        );
      },
    },
  ];

  // Helper to get food cost info from summary for a given recipe
  const getFoodCostInfo = (recipeId: string) => foodCostSummary.find((s) => s.id === recipeId);

  const recipeColumns = [
    {
      key: "menuItemName",
      header: "Platillo",
      render: (r: Recipe) => <span className="font-medium">{r.menuItemName}</span>,
    },
    {
      key: "ingredients",
      header: "Ingr.",
      render: (r: Recipe) => (
        <span className="inline-block rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
          {r.ingredients.length}
        </span>
      ),
    },
    {
      key: "costPerServing",
      header: "Costo/Porcion",
      className: "text-right",
      render: (r: Recipe) => {
        const info = getFoodCostInfo(r.id);
        return info ? formatMXN(info.costPerServing) : "-";
      },
    },
    {
      key: "sellingPrice",
      header: "Precio Venta",
      className: "text-right",
      render: (r: Recipe) => {
        const price = safeNum(r.sellingPrice || 0);
        return price > 0 ? formatMXN(price) : "-";
      },
    },
    {
      key: "foodCost",
      header: "Food Cost %",
      render: (r: Recipe) => {
        const info = getFoodCostInfo(r.id);
        if (!info || info.sellingPrice === 0)
          return <span className="text-muted-foreground">-</span>;
        const pct = info.foodCostPercentage;
        const color =
          pct <= 30
            ? "bg-green-100 text-green-700"
            : pct <= 35
              ? "bg-yellow-100 text-yellow-800"
              : "bg-red-100 text-red-700";
        const label = pct <= 30 ? "Optimo" : pct <= 35 ? "Atencion" : "Critico";
        return (
          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>
            {safeNum(pct).toFixed(1)}% {label}
          </span>
        );
      },
    },
    {
      key: "margin",
      header: "Margen",
      className: "text-right",
      render: (r: Recipe) => {
        const info = getFoodCostInfo(r.id);
        if (!info || info.sellingPrice === 0) return "-";
        return formatMXN(info.sellingPrice - info.costPerServing);
      },
    },
    {
      key: "actions",
      header: "",
      render: (r: Recipe) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            fetchRecipeCostDetail(r.id);
          }}
          className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted transition-colors"
          title="Ver detalle de costos"
        >
          <Eye className="h-4 w-4" />
        </button>
      ),
    },
  ];

  const transferColumns = [
    {
      key: "fromBranch",
      header: "Origen",
      render: (r: Transfer) => r.fromBranch.name,
    },
    {
      key: "toBranch",
      header: "Destino",
      render: (r: Transfer) => r.toBranch.name,
    },
    {
      key: "items",
      header: "Productos",
      render: (r: Transfer) => (
        <span className="inline-block rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
          {r.items.length}
        </span>
      ),
    },
    {
      key: "status",
      header: "Estado",
      render: (r: Transfer) => (
        <span
          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${TRANSFER_STATUS_STYLES[r.status]}`}
        >
          {TRANSFER_STATUS_LABELS[r.status]}
        </span>
      ),
    },
    {
      key: "createdAt",
      header: "Fecha",
      render: (r: Transfer) =>
        new Date(r.createdAt).toLocaleDateString("es-MX", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }),
    },
  ];

  // =======================================================================
  // Render
  // =======================================================================

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Cargando...
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Inventarios</h1>
        <div className="flex gap-3">
          {activeTab === "productos" && (
            <>
              <button
                onClick={() =>
                  exportToCSV(
                    filteredProducts.map((p) => ({
                      sku: p.sku,
                      name: p.name,
                      category: p.category?.name ?? "",
                      unitOfMeasure: p.unitOfMeasure,
                      costPerUnit: safeNum(p.costPerUnit),
                      satClaveProdServ: p.satClaveProdServ ?? "",
                    })),
                    "productos",
                    [
                      { key: "sku", label: "SKU" },
                      { key: "name", label: "Nombre" },
                      { key: "category", label: "Categoria" },
                      { key: "unitOfMeasure", label: "Unidad" },
                      { key: "costPerUnit", label: "Precio" },
                      { key: "satClaveProdServ", label: "Clave SAT" },
                    ],
                  )
                }
                className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Download className="h-4 w-4" />
                Exportar
              </button>
              <button
                onClick={() => generateInventoryPDF(filteredProducts)}
                className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <FileText className="h-4 w-4" />
                PDF
              </button>
              <Button onClick={openCreateProduct}>
                <Plus className="h-4 w-4" />
                Nuevo Producto
              </Button>
            </>
          )}
          {activeTab === "recetas" && (
            <>
              <Button variant="outline" onClick={handleRecalculateAll} disabled={recalculating}>
                <RefreshCw className={`h-4 w-4 ${recalculating ? "animate-spin" : ""}`} />
                {recalculating ? "Recalculando..." : "Recalcular Costos"}
              </Button>
              <Button onClick={openCreateRecipe}>
                <Plus className="h-4 w-4" />
                Nueva Receta
              </Button>
            </>
          )}
          {activeTab === "transferencias" && (
            <Button onClick={openCreateTransfer}>
              <ArrowLeftRight className="h-4 w-4" />
              Nueva Transferencia
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 border-b border-border">
        <div className="flex gap-4 sm:gap-6 overflow-x-auto flex-nowrap pb-px -mb-px scrollbar-hide">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 border-b-2 pb-3 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === tab.key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Search bar (hidden for cargas tab which has its own search) */}
      {activeTab !== "cargas" && (
        <div className="mt-6">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={
                activeTab === "productos"
                  ? "Buscar por nombre o SKU..."
                  : activeTab === "stock"
                    ? "Buscar por producto o SKU..."
                    : activeTab === "recetas"
                      ? "Buscar por platillo..."
                      : "Buscar por sucursal..."
              }
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm focus:border-gray-400 focus:outline-none focus:ring-0"
            />
          </div>
        </div>
      )}

      {/* Tab content */}
      <div className="mt-4">
        {/* ============================================================ */}
        {/* PRODUCTOS TAB                                                */}
        {/* ============================================================ */}
        {activeTab === "productos" &&
          (productsLoading ? (
            <div className="border rounded-lg p-8 text-center text-muted-foreground">
              Cargando...
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    {productColumns.map((col) => (
                      <th
                        key={col.key}
                        className={`text-left text-sm font-medium text-muted-foreground px-4 py-3 ${col.className || ""}`}
                      >
                        {col.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedProducts.length === 0 ? (
                    <tr>
                      <td
                        colSpan={productColumns.length}
                        className="px-4 py-8 text-center text-muted-foreground"
                      >
                        No hay productos registrados
                      </td>
                    </tr>
                  ) : (
                    paginatedProducts.map((product) => (
                      <Fragment key={product.id}>
                        <tr
                          className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                          onClick={() => toggleExpandProduct(product.id)}
                        >
                          {productColumns.map((col) => (
                            <td
                              key={col.key}
                              className={`px-4 py-3 text-sm ${col.className || ""}`}
                            >
                              {col.render ? col.render(product) : (product as any)[col.key]}
                            </td>
                          ))}
                        </tr>
                        {expandedProductId === product.id && (
                          <tr key={`${product.id}-presentations`}>
                            <td colSpan={productColumns.length} className="px-4 py-0 bg-gray-50/80">
                              <div className="py-3">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                                    <Layers className="h-4 w-4" />
                                    Presentaciones de {product.name}
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openCreatePresentation(product.id);
                                    }}
                                  >
                                    <Plus className="h-3 w-3" />
                                    Agregar Presentacion
                                  </Button>
                                </div>
                                {!product.presentations || product.presentations.length === 0 ? (
                                  <div className="text-sm text-muted-foreground py-3 text-center border rounded-lg bg-white">
                                    No hay presentaciones para este producto.
                                  </div>
                                ) : (
                                  <div className="border rounded-lg overflow-hidden bg-white">
                                    <table className="w-full">
                                      <thead>
                                        <tr className="border-b bg-muted/30">
                                          <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2">
                                            Nombre
                                          </th>
                                          <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2">
                                            SKU
                                          </th>
                                          <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2">
                                            <div className="flex items-center gap-1">
                                              <Barcode className="h-3 w-3" />
                                              Codigo Barras
                                            </div>
                                          </th>
                                          <th className="text-right text-xs font-medium text-muted-foreground px-3 py-2">
                                            Factor Conv.
                                          </th>
                                          <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2">
                                            Unidad
                                          </th>
                                          <th className="text-right text-xs font-medium text-muted-foreground px-3 py-2">
                                            P. Compra
                                          </th>
                                          <th className="text-right text-xs font-medium text-muted-foreground px-3 py-2">
                                            P. Venta
                                          </th>
                                          <th className="text-center text-xs font-medium text-muted-foreground px-3 py-2">
                                            Default
                                          </th>
                                          <th className="text-center text-xs font-medium text-muted-foreground px-3 py-2">
                                            Acciones
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {product.presentations!.map((pres) => (
                                          <tr
                                            key={pres.id}
                                            className="border-b last:border-0 hover:bg-muted/20"
                                          >
                                            <td className="px-3 py-2 text-sm font-medium">
                                              {pres.name}
                                            </td>
                                            <td className="px-3 py-2 text-sm font-mono text-muted-foreground">
                                              {pres.sku || "-"}
                                            </td>
                                            <td className="px-3 py-2 text-sm font-mono text-muted-foreground">
                                              {pres.barcode || "-"}
                                            </td>
                                            <td className="px-3 py-2 text-sm text-right">
                                              {safeNum(pres.conversionFactor)}
                                            </td>
                                            <td className="px-3 py-2 text-sm">
                                              {pres.conversionUnit}
                                            </td>
                                            <td className="px-3 py-2 text-sm text-right">
                                              {pres.purchasePrice != null
                                                ? formatMXN(pres.purchasePrice)
                                                : "-"}
                                            </td>
                                            <td className="px-3 py-2 text-sm text-right">
                                              {pres.salePrice != null
                                                ? formatMXN(pres.salePrice)
                                                : "-"}
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                              {pres.isDefault && (
                                                <span className="inline-block rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-xs font-medium">
                                                  Default
                                                </span>
                                              )}
                                            </td>
                                            <td className="px-3 py-2">
                                              <div className="flex items-center justify-center gap-1">
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    openEditPresentation(pres);
                                                  }}
                                                  className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted transition-colors"
                                                  title="Editar"
                                                >
                                                  <Pencil className="h-3.5 w-3.5" />
                                                </button>
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeletePresentation(pres.id);
                                                  }}
                                                  className="p-1 text-muted-foreground hover:text-destructive rounded hover:bg-red-50 transition-colors"
                                                  title="Desactivar"
                                                >
                                                  <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                              </div>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ))}

        {/* ============================================================ */}
        {/* STOCK TAB                                                    */}
        {/* ============================================================ */}
        {activeTab === "stock" && (
          <div className="space-y-4">
            <div className="max-w-xs">
              <FormField label="Sucursal">
                <Select
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                >
                  {branches.length === 0 && <option value="">Cargando sucursales...</option>}
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
            <DataTable
              columns={stockColumns}
              data={paginatedStockItems}
              loading={stockLoading}
              emptyMessage="No hay inventario para esta sucursal"
            />
          </div>
        )}

        {/* ============================================================ */}
        {/* RECETAS TAB                                                  */}
        {/* ============================================================ */}
        {activeTab === "recetas" && (
          <div className="space-y-4">
            {/* Food Cost Summary Cards */}
            {foodCostSummary.length > 0 &&
              (() => {
                const withPrice = foodCostSummary.filter((s) => s.sellingPrice > 0);
                const avgCost =
                  withPrice.length > 0
                    ? withPrice.reduce((sum, s) => sum + s.costPerServing, 0) / withPrice.length
                    : 0;
                const avgFoodCostPct =
                  withPrice.length > 0
                    ? withPrice.reduce((sum, s) => sum + s.foodCostPercentage, 0) / withPrice.length
                    : 0;
                const avgMargin =
                  withPrice.length > 0
                    ? withPrice.reduce((sum, s) => sum + (s.sellingPrice - s.costPerServing), 0) /
                      withPrice.length
                    : 0;
                const atRiskCount = withPrice.filter((s) => s.foodCostPercentage > 35).length;

                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="rounded-lg border bg-white p-4">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <DollarSign className="h-4 w-4" />
                        Costo Promedio por Bowl
                      </div>
                      <div className="text-2xl font-bold">{formatMXN(avgCost)}</div>
                    </div>
                    <div className="rounded-lg border bg-white p-4">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <ChefHat className="h-4 w-4" />
                        Food Cost %
                      </div>
                      <div
                        className={`text-2xl font-bold ${avgFoodCostPct <= 30 ? "text-green-600" : avgFoodCostPct <= 35 ? "text-yellow-600" : "text-red-600"}`}
                      >
                        {safeNum(avgFoodCostPct).toFixed(1)}%
                      </div>
                    </div>
                    <div className="rounded-lg border bg-white p-4">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <TrendingUp className="h-4 w-4" />
                        Margen Bruto Promedio
                      </div>
                      <div className="text-2xl font-bold">{formatMXN(avgMargin)}</div>
                    </div>
                    <div className="rounded-lg border bg-white p-4">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <AlertTriangle className="h-4 w-4" />
                        Recetas en Riesgo
                      </div>
                      <div
                        className={`text-2xl font-bold ${atRiskCount > 0 ? "text-red-600" : "text-green-600"}`}
                      >
                        {atRiskCount}
                      </div>
                    </div>
                  </div>
                );
              })()}

            <DataTable
              columns={recipeColumns}
              data={paginatedRecipes}
              loading={recipesLoading}
              emptyMessage="No hay recetas registradas"
              onRowClick={(r: Recipe) => fetchRecipeCostDetail(r.id)}
            />
          </div>
        )}

        {/* ============================================================ */}
        {/* TRANSFERENCIAS TAB                                           */}
        {/* ============================================================ */}
        {activeTab === "transferencias" && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-3">
              <div className="w-44">
                <Select
                  value={transferStatusFilter}
                  onChange={(e) => {
                    setTransferStatusFilter(e.target.value);
                  }}
                >
                  <option value="">Todos los estados</option>
                  <option value="PENDING">Pendiente</option>
                  <option value="APPROVED">Aprobada</option>
                  <option value="IN_TRANSIT">En Transito</option>
                  <option value="RECEIVED">Recibida</option>
                  <option value="CANCELLED">Cancelada</option>
                </Select>
              </div>
              <div className="w-44">
                <Select
                  value={transferFromFilter}
                  onChange={(e) => {
                    setTransferFromFilter(e.target.value);
                  }}
                >
                  <option value="">Todas las origenes</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="w-44">
                <Select
                  value={transferToFilter}
                  onChange={(e) => {
                    setTransferToFilter(e.target.value);
                  }}
                >
                  <option value="">Todos los destinos</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <DataTable
              columns={transferColumns}
              data={paginatedTransfers}
              loading={transfersLoading}
              emptyMessage="No hay transferencias registradas"
              onRowClick={(t: Transfer) => openTransferDetail(t)}
            />
          </div>
        )}

        {/* Pagination controls */}
        {currentFiltered.length > 0 && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Mostrando {paginationStart}-{paginationEnd} de {currentFiltered.length}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm disabled:opacity-50"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ================================================================ */}
      {/* Product Create / Edit Modal                                      */}
      {/* ================================================================ */}
      <Modal
        open={productModalOpen}
        onClose={() => setProductModalOpen(false)}
        title={editingProduct ? "Editar Producto" : "Nuevo Producto"}
        wide
      >
        <div className="space-y-4">
          {/* Image upload */}
          <div className="flex items-start gap-4">
            <div className="relative h-[120px] w-[120px] shrink-0 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center overflow-hidden">
              {productForm.imageUrl ? (
                <img
                  src={`${imgBase}${productForm.imageUrl}`}
                  alt="Producto"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="text-center">
                  <ImageIcon className="mx-auto h-8 w-8 text-gray-300" />
                  <p className="mt-1 text-[10px] text-gray-400">Sin imagen</p>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                <Upload className="h-4 w-4" />
                {imageUploading ? "Subiendo..." : "Subir Imagen"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  className="hidden"
                  onChange={handleImageSelect}
                  disabled={imageUploading}
                />
              </label>
              {productForm.imageUrl && (
                <button
                  type="button"
                  onClick={() => setProductForm((f) => ({ ...f, imageUrl: "" }))}
                  className="text-xs text-red-500 hover:text-red-700 text-left"
                >
                  Quitar imagen
                </button>
              )}
              <p className="text-[11px] text-gray-400">JPG, PNG, GIF o WebP. Max 5 MB.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="SKU" required>
              <Input
                value={productForm.sku}
                onChange={(e) => setProductForm((f) => ({ ...f, sku: e.target.value }))}
                placeholder="Ej: PKE-001"
              />
            </FormField>
            <FormField label="Nombre" required>
              <Input
                value={productForm.name}
                onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Nombre del producto"
              />
            </FormField>
          </div>

          <FormField label="Descripcion">
            <Input
              value={productForm.description}
              onChange={(e) => setProductForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Descripcion opcional"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Categoria">
              <Select
                value={productForm.categoryId}
                onChange={(e) => setProductForm((f) => ({ ...f, categoryId: e.target.value }))}
              >
                <option value="">Sin categoria</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Unidad de Medida" required>
              <Select
                value={productForm.unitOfMeasure}
                onChange={(e) => setProductForm((f) => ({ ...f, unitOfMeasure: e.target.value }))}
              >
                {UNIT_OPTIONS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <FormField label="Costo por Unidad" required>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={productForm.costPerUnit}
              onChange={(e) => setProductForm((f) => ({ ...f, costPerUnit: e.target.value }))}
              placeholder="0.00"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Clave Prod/Serv SAT">
              <Input
                value={productForm.satClaveProdServ}
                onChange={(e) =>
                  setProductForm((f) => ({ ...f, satClaveProdServ: e.target.value }))
                }
                placeholder="Ej: 50202201"
              />
            </FormField>
            <FormField label="Clave Unidad SAT">
              <Input
                value={productForm.satClaveUnidad}
                onChange={(e) => setProductForm((f) => ({ ...f, satClaveUnidad: e.target.value }))}
                placeholder="Ej: KGM"
              />
            </FormField>
          </div>

          {/* Presentations section — only for new products */}
          {!editingProduct && (
            <div className="border-t pt-4 mt-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-gray-500" />
                  <span className="text-sm font-medium">Presentaciones</span>
                  <span className="text-xs text-muted-foreground">(opcional)</span>
                </div>
                <Button size="sm" variant="outline" onClick={addProductFormPresentation}>
                  <Plus className="h-3 w-3" />
                  Agregar
                </Button>
              </div>
              {productFormPresentations.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">
                  Puedes agregar presentaciones despues de crear el producto.
                </p>
              ) : (
                <div className="space-y-3">
                  {productFormPresentations.map((pf, idx) => (
                    <div key={idx} className="rounded-lg border p-3 bg-gray-50 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-500">
                          Presentacion {idx + 1}
                        </span>
                        <button
                          onClick={() => removeProductFormPresentation(idx)}
                          className="p-1 text-muted-foreground hover:text-destructive rounded hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-medium mb-0.5">Nombre *</label>
                          <Input
                            value={pf.name}
                            onChange={(e) =>
                              updateProductFormPresentation(idx, "name", e.target.value)
                            }
                            placeholder="Ej: Bolsa 1kg"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-0.5">SKU</label>
                          <Input
                            value={pf.sku}
                            onChange={(e) =>
                              updateProductFormPresentation(idx, "sku", e.target.value)
                            }
                            placeholder="Opcional"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-xs font-medium mb-0.5">
                            Factor Conversion *
                          </label>
                          <Input
                            type="number"
                            step="0.000001"
                            min="0"
                            value={pf.conversionFactor}
                            onChange={(e) =>
                              updateProductFormPresentation(idx, "conversionFactor", e.target.value)
                            }
                            placeholder="1.0"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-0.5">Unidad *</label>
                          <Select
                            value={pf.conversionUnit}
                            onChange={(e) =>
                              updateProductFormPresentation(idx, "conversionUnit", e.target.value)
                            }
                          >
                            {CONVERSION_UNIT_OPTIONS.map((u) => (
                              <option key={u.value} value={u.value}>
                                {u.label}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-0.5">Codigo Barras</label>
                          <Input
                            value={pf.barcode}
                            onChange={(e) =>
                              updateProductFormPresentation(idx, "barcode", e.target.value)
                            }
                            placeholder="Opcional"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-xs font-medium mb-0.5">P. Compra</label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={pf.purchasePrice}
                            onChange={(e) =>
                              updateProductFormPresentation(idx, "purchasePrice", e.target.value)
                            }
                            placeholder="0.00"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-0.5">P. Venta</label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={pf.salePrice}
                            onChange={(e) =>
                              updateProductFormPresentation(idx, "salePrice", e.target.value)
                            }
                            placeholder="0.00"
                          />
                        </div>
                        <div className="flex items-end pb-1">
                          <label className="flex items-center gap-2 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={pf.isDefault as boolean}
                              onChange={(e) =>
                                updateProductFormPresentation(idx, "isDefault", e.target.checked)
                              }
                              className="rounded"
                            />
                            Default
                          </label>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setProductModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveProduct}
              disabled={
                productSaving || !productForm.sku || !productForm.name || !productForm.costPerUnit
              }
            >
              {productSaving ? "Guardando..." : editingProduct ? "Actualizar" : "Crear"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ================================================================ */}
      {/* Delete Confirmation Modal                                        */}
      {/* ================================================================ */}
      <Modal
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Confirmar Eliminacion"
      >
        <p className="text-sm text-muted-foreground mb-6">
          Estas seguro de que deseas eliminar el producto{" "}
          <strong className="text-foreground">{deletingProduct?.name}</strong> (
          {deletingProduct?.sku})? Esta accion lo marcara como inactivo.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleDeleteProduct}>
            Eliminar
          </Button>
        </div>
      </Modal>

      {/* ================================================================ */}
      {/* Presentation Create / Edit Modal                                 */}
      {/* ================================================================ */}
      <Modal
        open={presentationModalOpen}
        onClose={() => setPresentationModalOpen(false)}
        title={editingPresentation ? "Editar Presentacion" : "Nueva Presentacion"}
      >
        <div className="space-y-4">
          <FormField label="Nombre" required>
            <Input
              value={presentationForm.name}
              onChange={(e) => setPresentationForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ej: Bolsa 1kg, Caja 12 pzas"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="SKU">
              <Input
                value={presentationForm.sku}
                onChange={(e) => setPresentationForm((f) => ({ ...f, sku: e.target.value }))}
                placeholder="SKU opcional"
              />
            </FormField>
            <FormField label="Codigo de Barras">
              <div className="relative">
                <Barcode className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  value={presentationForm.barcode}
                  onChange={(e) => setPresentationForm((f) => ({ ...f, barcode: e.target.value }))}
                  placeholder="Escanear o ingresar"
                  className="pl-10"
                />
              </div>
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Factor de Conversion" required>
              <Input
                type="number"
                step="0.000001"
                min="0"
                value={presentationForm.conversionFactor}
                onChange={(e) =>
                  setPresentationForm((f) => ({ ...f, conversionFactor: e.target.value }))
                }
                placeholder="Ej: 1.0, 0.5, 25.0"
              />
            </FormField>
            <FormField label="Unidad de Conversion" required>
              <Select
                value={presentationForm.conversionUnit}
                onChange={(e) =>
                  setPresentationForm((f) => ({ ...f, conversionUnit: e.target.value }))
                }
              >
                {CONVERSION_UNIT_OPTIONS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Precio de Compra">
              <Input
                type="number"
                step="0.01"
                min="0"
                value={presentationForm.purchasePrice}
                onChange={(e) =>
                  setPresentationForm((f) => ({ ...f, purchasePrice: e.target.value }))
                }
                placeholder="0.00"
              />
            </FormField>
            <FormField label="Precio de Venta">
              <Input
                type="number"
                step="0.01"
                min="0"
                value={presentationForm.salePrice}
                onChange={(e) => setPresentationForm((f) => ({ ...f, salePrice: e.target.value }))}
                placeholder="0.00"
              />
            </FormField>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={presentationForm.isDefault as boolean}
                onChange={(e) =>
                  setPresentationForm((f) => ({ ...f, isDefault: e.target.checked }))
                }
                className="rounded"
              />
              Presentacion por defecto
            </label>
            <p className="text-xs text-muted-foreground mt-1">
              Solo puede haber una presentacion por defecto por producto.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setPresentationModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSavePresentation}
              disabled={
                presentationSaving || !presentationForm.name || !presentationForm.conversionFactor
              }
            >
              {presentationSaving ? "Guardando..." : editingPresentation ? "Actualizar" : "Crear"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ================================================================ */}
      {/* Recipe Create Modal                                              */}
      {/* ================================================================ */}
      <Modal
        open={recipeModalOpen}
        onClose={() => setRecipeModalOpen(false)}
        title="Nueva Receta"
        wide
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <FormField label="Nombre del Platillo" required>
              <Input
                value={recipeForm.menuItemName}
                onChange={(e) => setRecipeForm((f) => ({ ...f, menuItemName: e.target.value }))}
                placeholder="Ej: Poke de Salmon"
              />
            </FormField>
            <FormField label="Rendimiento" required>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={recipeForm.yieldQuantity}
                onChange={(e) => setRecipeForm((f) => ({ ...f, yieldQuantity: e.target.value }))}
                placeholder="1"
              />
            </FormField>
            <FormField label="Unidad de Rendimiento" required>
              <Select
                value={recipeForm.yieldUnit}
                onChange={(e) => setRecipeForm((f) => ({ ...f, yieldUnit: e.target.value }))}
              >
                {UNIT_OPTIONS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Precio de Venta (MXN)">
              <Input
                type="number"
                step="0.01"
                min="0"
                value={recipeForm.sellingPrice}
                onChange={(e) => setRecipeForm((f) => ({ ...f, sellingPrice: e.target.value }))}
                placeholder="Ej: 189.00"
              />
            </FormField>
          </div>

          {/* Ingredients */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Ingredientes</label>
              <Button size="sm" variant="outline" onClick={addIngredientRow}>
                <Plus className="h-3 w-3" />
                Agregar
              </Button>
            </div>

            <div className="space-y-2">
              {recipeForm.ingredients.map((ing, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-4">
                    <Select
                      value={ing.productId}
                      onChange={(e) => updateIngredient(idx, "productId", e.target.value)}
                    >
                      <option value="">Seleccionar producto</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.sku})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Cantidad"
                      value={ing.quantity}
                      onChange={(e) => updateIngredient(idx, "quantity", e.target.value)}
                    />
                  </div>
                  <div className="col-span-3">
                    <Select
                      value={ing.unitOfMeasure}
                      onChange={(e) => updateIngredient(idx, "unitOfMeasure", e.target.value)}
                    >
                      {UNIT_OPTIONS.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      placeholder="Merma %"
                      value={ing.wastePercentage}
                      onChange={(e) => updateIngredient(idx, "wastePercentage", e.target.value)}
                    />
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {recipeForm.ingredients.length > 1 && (
                      <button
                        onClick={() => removeIngredientRow(idx)}
                        className="p-1 text-muted-foreground hover:text-destructive rounded hover:bg-red-50 transition-colors"
                        title="Quitar ingrediente"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setRecipeModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveRecipe}
              disabled={
                recipeSaving ||
                !recipeForm.menuItemName ||
                !recipeForm.yieldQuantity ||
                recipeForm.ingredients.every((ing) => !ing.productId)
              }
            >
              {recipeSaving ? "Guardando..." : "Crear Receta"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ================================================================ */}
      {/* Recipe Cost Detail Modal                                         */}
      {/* ================================================================ */}
      <Modal
        open={costDetailModalOpen}
        onClose={() => {
          setCostDetailModalOpen(false);
          setRecipeCostDetail(null);
        }}
        title={recipeCostDetail ? `Costeo: ${recipeCostDetail.recipeName}` : "Detalle de Costos"}
        wide
      >
        {costDetailLoading && (
          <div className="text-center py-8 text-muted-foreground">Calculando costos...</div>
        )}
        {recipeCostDetail && !costDetailLoading && (
          <div className="space-y-5">
            {/* Summary header */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div className="rounded-lg border p-3">
                <div className="text-muted-foreground mb-0.5">Porciones</div>
                <div className="font-semibold text-lg">{recipeCostDetail.servings}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-muted-foreground mb-0.5">Costo Total</div>
                <div className="font-semibold text-lg">{formatMXN(recipeCostDetail.totalCost)}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-muted-foreground mb-0.5">Costo por Porcion</div>
                <div className="font-semibold text-lg">
                  {formatMXN(recipeCostDetail.costPerServing)}
                </div>
              </div>
            </div>

            {/* Ingredients table */}
            <div>
              <h3 className="text-sm font-medium mb-2">Ingredientes</h3>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2">
                        Ingrediente
                      </th>
                      <th className="text-right text-xs font-medium text-muted-foreground px-3 py-2">
                        Cantidad
                      </th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2">
                        Unidad
                      </th>
                      <th className="text-right text-xs font-medium text-muted-foreground px-3 py-2">
                        Merma %
                      </th>
                      <th className="text-right text-xs font-medium text-muted-foreground px-3 py-2">
                        Costo Unit.
                      </th>
                      <th className="text-right text-xs font-medium text-muted-foreground px-3 py-2">
                        Costo Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recipeCostDetail.ingredients.map((ing, idx) => (
                      <tr key={idx} className="border-b last:border-0">
                        <td className="px-3 py-2 text-sm">{ing.productName}</td>
                        <td className="px-3 py-2 text-sm text-right">
                          {safeNum(ing.quantity).toFixed(4)}
                        </td>
                        <td className="px-3 py-2 text-sm">{ing.unit}</td>
                        <td className="px-3 py-2 text-sm text-right">
                          {ing.wastePercentage > 0 ? `${ing.wastePercentage}%` : "-"}
                        </td>
                        <td className="px-3 py-2 text-sm text-right">{formatMXN(ing.unitCost)}</td>
                        <td className="px-3 py-2 text-sm text-right font-medium">
                          {formatMXN(ing.totalCost)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/30 font-medium">
                      <td colSpan={5} className="px-3 py-2 text-sm text-right">
                        Total:
                      </td>
                      <td className="px-3 py-2 text-sm text-right">
                        {formatMXN(recipeCostDetail.totalCost)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Food cost metrics */}
            {recipeCostDetail.sellingPrice > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium">Analisis de Rentabilidad</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div className="rounded-lg border p-3">
                    <div className="text-muted-foreground mb-0.5">Precio de Venta</div>
                    <div className="font-semibold">{formatMXN(recipeCostDetail.sellingPrice)}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-muted-foreground mb-0.5">Food Cost %</div>
                    <div
                      className={`font-semibold ${recipeCostDetail.foodCostPercentage <= 30 ? "text-green-600" : recipeCostDetail.foodCostPercentage <= 35 ? "text-yellow-600" : "text-red-600"}`}
                    >
                      {safeNum(recipeCostDetail.foodCostPercentage).toFixed(1)}%
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-muted-foreground mb-0.5">Margen Bruto</div>
                    <div className="font-semibold">{formatMXN(recipeCostDetail.grossMargin)}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-muted-foreground mb-0.5">Margen %</div>
                    <div className="font-semibold">
                      {safeNum(recipeCostDetail.marginPercentage).toFixed(1)}%
                    </div>
                  </div>
                </div>

                {/* Food cost visual indicator */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Food Cost</span>
                    <span>
                      {safeNum(recipeCostDetail.foodCostPercentage).toFixed(1)}% de{" "}
                      {formatMXN(recipeCostDetail.sellingPrice)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                    <div
                      className={`h-3 rounded-full transition-all ${recipeCostDetail.foodCostPercentage <= 30 ? "bg-green-500" : recipeCostDetail.foodCostPercentage <= 35 ? "bg-yellow-500" : "bg-red-500"}`}
                      style={{ width: `${Math.min(recipeCostDetail.foodCostPercentage, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>0%</span>
                    <span className="text-green-600">30% Optimo</span>
                    <span className="text-yellow-600">35%</span>
                    <span>100%</span>
                  </div>
                </div>

                {/* Status badge */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Estado:</span>
                  {recipeCostDetail.foodCostPercentage <= 30 ? (
                    <span className="inline-block rounded-full px-3 py-1 text-xs font-medium bg-green-100 text-green-700">
                      Optimo — Costo bajo control
                    </span>
                  ) : recipeCostDetail.foodCostPercentage <= 35 ? (
                    <span className="inline-block rounded-full px-3 py-1 text-xs font-medium bg-yellow-100 text-yellow-800">
                      Atencion — Monitorear costos
                    </span>
                  ) : (
                    <span className="inline-block rounded-full px-3 py-1 text-xs font-medium bg-red-100 text-red-700">
                      Critico — Revisar ingredientes y precios
                    </span>
                  )}
                </div>
              </div>
            )}

            {recipeCostDetail.sellingPrice === 0 && (
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                Esta receta no tiene precio de venta configurado. Agrega un precio de venta para ver
                el analisis de food cost y rentabilidad.
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setCostDetailModalOpen(false);
                  setRecipeCostDetail(null);
                }}
              >
                Cerrar
              </Button>
              <Button
                onClick={async () => {
                  if (!recipeCostDetail) return;
                  const recipeId = foodCostSummary.find(
                    (s) => s.name === recipeCostDetail.recipeName,
                  )?.id;
                  if (recipeId) {
                    await fetchRecipeCostDetail(recipeId);
                    await fetchFoodCostSummary();
                  }
                }}
              >
                <RefreshCw className="h-4 w-4" />
                Recalcular
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ================================================================ */}
      {/* Transfer Create Modal                                            */}
      {/* ================================================================ */}
      <Modal
        open={createTransferOpen}
        onClose={() => setCreateTransferOpen(false)}
        title="Nueva Transferencia"
        wide
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Sucursal Origen" required>
              <Select value={newTransferFrom} onChange={(e) => setNewTransferFrom(e.target.value)}>
                <option value="">Seleccionar origen</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Sucursal Destino" required>
              <Select value={newTransferTo} onChange={(e) => setNewTransferTo(e.target.value)}>
                <option value="">Seleccionar destino</option>
                {branches
                  .filter((b) => b.id !== newTransferFrom)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
              </Select>
            </FormField>
          </div>

          <FormField label="Notas">
            <Textarea
              value={newTransferNotes}
              onChange={(e) => setNewTransferNotes(e.target.value)}
              placeholder="Notas opcionales sobre la transferencia..."
            />
          </FormField>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Productos</label>
              <Button size="sm" variant="outline" onClick={addTransferItemRow}>
                <Plus className="h-3 w-3" />
                Agregar
              </Button>
            </div>
            <div className="space-y-2">
              {newTransferItems.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-7">
                    <Select
                      value={item.productId}
                      onChange={(e) => updateTransferItem(idx, "productId", e.target.value)}
                    >
                      <option value="">Seleccionar producto</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.sku})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="col-span-4">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Cantidad"
                      value={item.requestedQuantity}
                      onChange={(e) => updateTransferItem(idx, "requestedQuantity", e.target.value)}
                    />
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {newTransferItems.length > 1 && (
                      <button
                        onClick={() => removeTransferItemRow(idx)}
                        className="p-1 text-muted-foreground hover:text-destructive rounded hover:bg-red-50 transition-colors"
                        title="Quitar producto"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setCreateTransferOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreateTransfer}
              disabled={
                transferSaving ||
                !newTransferFrom ||
                !newTransferTo ||
                newTransferItems.every((i) => !i.productId || !i.requestedQuantity)
              }
            >
              {transferSaving ? "Creando..." : "Crear Transferencia"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ================================================================ */}
      {/* Transfer Detail Modal                                            */}
      {/* ================================================================ */}
      <Modal
        open={detailModalOpen}
        onClose={() => {
          setDetailModalOpen(false);
          setSelectedTransfer(null);
        }}
        title={selectedTransfer ? `Transferencia` : "Detalle"}
        wide
      >
        {selectedTransfer && (
          <div className="space-y-5">
            {/* Transfer info */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div className="rounded-lg border p-3">
                <div className="text-muted-foreground mb-0.5">Origen</div>
                <div className="font-semibold">{selectedTransfer.fromBranch.name}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-muted-foreground mb-0.5">Destino</div>
                <div className="font-semibold">{selectedTransfer.toBranch.name}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-muted-foreground mb-0.5">Estado</div>
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${TRANSFER_STATUS_STYLES[selectedTransfer.status]}`}
                >
                  {TRANSFER_STATUS_LABELS[selectedTransfer.status]}
                </span>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-muted-foreground mb-0.5">Fecha</div>
                <div className="font-semibold">
                  {new Date(selectedTransfer.createdAt).toLocaleDateString("es-MX", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </div>
              </div>
            </div>

            {selectedTransfer.notes && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                <span className="font-medium">Notas:</span> {selectedTransfer.notes}
              </div>
            )}

            {selectedTransfer.completedAt && (
              <div className="text-sm text-muted-foreground">
                Completada:{" "}
                {new Date(selectedTransfer.completedAt).toLocaleDateString("es-MX", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            )}

            {/* Items table */}
            <div>
              <h3 className="text-sm font-medium mb-2">Productos</h3>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2">
                        Producto
                      </th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2">
                        SKU
                      </th>
                      <th className="text-right text-xs font-medium text-muted-foreground px-3 py-2">
                        Solicitado
                      </th>
                      <th className="text-right text-xs font-medium text-muted-foreground px-3 py-2">
                        Enviado
                      </th>
                      <th className="text-right text-xs font-medium text-muted-foreground px-3 py-2">
                        Recibido
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTransfer.items.map((item) => (
                      <tr key={item.id} className="border-b last:border-0">
                        <td className="px-3 py-2 text-sm font-medium">{item.product.name}</td>
                        <td className="px-3 py-2 text-sm font-mono text-muted-foreground">
                          {item.product.sku}
                        </td>
                        <td className="px-3 py-2 text-sm text-right">
                          {safeNum(item.requestedQuantity).toLocaleString("es-MX")}
                        </td>
                        <td className="px-3 py-2 text-sm text-right">
                          {item.sentQuantity != null
                            ? safeNum(item.sentQuantity).toLocaleString("es-MX")
                            : "-"}
                        </td>
                        <td className="px-3 py-2 text-sm text-right">
                          {item.receivedQuantity != null
                            ? safeNum(item.receivedQuantity).toLocaleString("es-MX")
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setDetailModalOpen(false);
                  setSelectedTransfer(null);
                }}
              >
                Cerrar
              </Button>

              {selectedTransfer.status === "PENDING" && (
                <>
                  <Button
                    variant="destructive"
                    onClick={handleCancelTransfer}
                    disabled={transferActionLoading}
                  >
                    <Ban className="h-4 w-4" />
                    {transferActionLoading ? "Cancelando..." : "Cancelar"}
                  </Button>
                  <Button onClick={handleApproveTransfer} disabled={transferActionLoading}>
                    <Check className="h-4 w-4" />
                    {transferActionLoading ? "Aprobando..." : "Aprobar"}
                  </Button>
                </>
              )}

              {selectedTransfer.status === "APPROVED" && (
                <>
                  <Button
                    variant="destructive"
                    onClick={handleCancelTransfer}
                    disabled={transferActionLoading}
                  >
                    <Ban className="h-4 w-4" />
                    {transferActionLoading ? "Cancelando..." : "Cancelar"}
                  </Button>
                  <Button onClick={openShipModal} disabled={transferActionLoading}>
                    <Truck className="h-4 w-4" />
                    Enviar
                  </Button>
                </>
              )}

              {selectedTransfer.status === "IN_TRANSIT" && (
                <>
                  <Button
                    variant="destructive"
                    onClick={handleCancelTransfer}
                    disabled={transferActionLoading}
                  >
                    <Ban className="h-4 w-4" />
                    {transferActionLoading ? "Cancelando..." : "Cancelar"}
                  </Button>
                  <Button onClick={openReceiveModal} disabled={transferActionLoading}>
                    <PackageCheck className="h-4 w-4" />
                    Recibir
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ================================================================ */}
      {/* Ship Transfer Modal (enter sent quantities)                      */}
      {/* ================================================================ */}
      <Modal
        open={shipModalOpen}
        onClose={() => setShipModalOpen(false)}
        title="Enviar Transferencia"
        wide
      >
        {selectedTransfer && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Ingrese las cantidades que seran enviadas desde{" "}
              <strong className="text-foreground">{selectedTransfer.fromBranch.name}</strong>.
            </p>

            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2">
                      Producto
                    </th>
                    <th className="text-right text-xs font-medium text-muted-foreground px-3 py-2">
                      Solicitado
                    </th>
                    <th className="text-right text-xs font-medium text-muted-foreground px-3 py-2 w-32">
                      Enviado
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {selectedTransfer.items.map((item) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="px-3 py-2 text-sm">
                        <span className="font-medium">{item.product.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground font-mono">
                          {item.product.sku}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-sm text-right">
                        {safeNum(item.requestedQuantity).toLocaleString("es-MX")}
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={shipQuantities[item.id] || ""}
                          onChange={(e) =>
                            setShipQuantities((prev) => ({ ...prev, [item.id]: e.target.value }))
                          }
                          className="text-right"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setShipModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleShipTransfer}
                disabled={
                  transferActionLoading ||
                  Object.values(shipQuantities).every((v) => !v || parseFloat(v) <= 0)
                }
              >
                <Truck className="h-4 w-4" />
                {transferActionLoading ? "Enviando..." : "Confirmar Envio"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ================================================================ */}
      {/* Receive Transfer Modal (enter received quantities)               */}
      {/* ================================================================ */}
      <Modal
        open={receiveModalOpen}
        onClose={() => setReceiveModalOpen(false)}
        title="Recibir Transferencia"
        wide
      >
        {selectedTransfer && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Ingrese las cantidades recibidas en{" "}
              <strong className="text-foreground">{selectedTransfer.toBranch.name}</strong>.
            </p>

            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2">
                      Producto
                    </th>
                    <th className="text-right text-xs font-medium text-muted-foreground px-3 py-2">
                      Enviado
                    </th>
                    <th className="text-right text-xs font-medium text-muted-foreground px-3 py-2 w-32">
                      Recibido
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {selectedTransfer.items.map((item) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="px-3 py-2 text-sm">
                        <span className="font-medium">{item.product.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground font-mono">
                          {item.product.sku}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-sm text-right">
                        {item.sentQuantity != null
                          ? safeNum(item.sentQuantity).toLocaleString("es-MX")
                          : "-"}
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={receiveQuantities[item.id] || ""}
                          onChange={(e) =>
                            setReceiveQuantities((prev) => ({ ...prev, [item.id]: e.target.value }))
                          }
                          className="text-right"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setReceiveModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleReceiveTransfer}
                disabled={
                  transferActionLoading ||
                  Object.values(receiveQuantities).every((v) => !v || parseFloat(v) < 0)
                }
              >
                <PackageCheck className="h-4 w-4" />
                {transferActionLoading ? "Recibiendo..." : "Confirmar Recepcion"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
