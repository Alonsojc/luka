// ---------------------------------------------------------------------------
// Common API response types shared across frontend pages
// ---------------------------------------------------------------------------

/**
 * Generic paginated response wrapper returned by list endpoints.
 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Branch
// ---------------------------------------------------------------------------

export interface Branch {
  id: string;
  name: string;
  code: string;
  city?: string;
  branchType?: string;
}

// ---------------------------------------------------------------------------
// Category
// ---------------------------------------------------------------------------

export interface Category {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Product Presentation
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Product
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Supplier
// ---------------------------------------------------------------------------

export interface Supplier {
  id: string;
  name: string;
  rfc: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  paymentTermsDays: number;
  bankAccount: string | null;
  clabe: string | null;
  isActive: boolean;
}

// ---------------------------------------------------------------------------
// Purchase Order
// ---------------------------------------------------------------------------

export interface POItem {
  id: string;
  productId: string;
  quantity: string | number;
  unitPrice: string | number;
  receivedQuantity: string | number;
  unitOfMeasure: string;
  product: Product;
}

export type PurchaseOrderStatus =
  | "DRAFT"
  | "SENT"
  | "PARTIALLY_RECEIVED"
  | "RECEIVED"
  | "CANCELLED";

export interface PurchaseOrder {
  id: string;
  folio?: string;
  supplierId: string;
  branchId: string;
  status: PurchaseOrderStatus;
  subtotal: string | number;
  tax: string | number;
  total: string | number;
  currency: string;
  notes: string | null;
  createdAt: string;
  supplier: Supplier;
  branch: Branch;
  items: POItem[];
}

// ---------------------------------------------------------------------------
// Employee
// ---------------------------------------------------------------------------

export interface Employee {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  curp?: string | null;
  rfc?: string | null;
  nss?: string | null;
  email?: string | null;
  branchId: string;
  hireDate: string;
  contractType: "PERMANENT" | "TEMPORARY" | "SEASONAL";
  jobPosition: string;
  department?: string | null;
  dailySalary: number | string;
  paymentFrequency: "WEEKLY" | "BIWEEKLY" | "MONTHLY";
  bankAccount?: string | null;
  clabe?: string | null;
  isActive: boolean;
}

// ---------------------------------------------------------------------------
// Bank Account
// ---------------------------------------------------------------------------

export interface BankAccount {
  id: string;
  bankName: string;
  accountNumber: string;
  clabe: string;
  branchId: string | null;
  currency: string;
  currentBalance: number;
  branch?: { id: string; name: string } | null;
}

// ---------------------------------------------------------------------------
// Transaction
// ---------------------------------------------------------------------------

export interface Transaction {
  id: string;
  bankAccountId: string;
  transactionDate: string;
  amount: number;
  type: "credit" | "debit";
  reference: string;
  description: string;
  reconciled: boolean;
}
