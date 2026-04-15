"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/components/ui/toast";
import type { Cfdi, Branch, PendingPayment, PaymentComplement, Concepto } from "./types";
import { num, PAGE_SIZE, normalize, todayISO, EMPTY_CONCEPTO, ALL_CATALOGS, TABS } from "./types";

export function useFacturacion() {
  const { authFetch, user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  // Data state
  const [cfdis, setCfdis] = useState<Cfdi[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>("Facturas");
  const [saving, setSaving] = useState(false);

  // Search & Pagination
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // View/Edit modal
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [viewingCfdi, setViewingCfdi] = useState<Cfdi | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingCfdi, setEditingCfdi] = useState<Cfdi | null>(null);

  // Cancel modal
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancellingCfdi, setCancellingCfdi] = useState<Cfdi | null>(null);
  const [cancelMotivo, setCancelMotivo] = useState("02");

  // Catalog search
  const [catalogSearch, setCatalogSearch] = useState("");
  const [activeCatalog, setActiveCatalog] = useState(ALL_CATALOGS[0].name);

  // Create form state
  const [formSerie, setFormSerie] = useState("A");
  const [formFolio, setFormFolio] = useState("");
  const [formFecha, setFormFecha] = useState(todayISO());
  const [formFormaPago, setFormFormaPago] = useState("01");
  const [formMetodoPago, setFormMetodoPago] = useState("PUE");
  const [formMoneda, setFormMoneda] = useState("MXN");
  const [formLugarExpedicion, setFormLugarExpedicion] = useState("");
  const [formExportacion, setFormExportacion] = useState("01");
  const [formBranchId, setFormBranchId] = useState("");

  // Emisor
  const [formEmisorRfc, setFormEmisorRfc] = useState("");
  const [formEmisorNombre, setFormEmisorNombre] = useState("");
  const [formEmisorRegimen, setFormEmisorRegimen] = useState("601");

  // Receptor
  const [formReceptorRfc, setFormReceptorRfc] = useState("");
  const [formReceptorNombre, setFormReceptorNombre] = useState("");
  const [formReceptorRegimen, setFormReceptorRegimen] = useState("601");
  const [formReceptorUsoCfdi, setFormReceptorUsoCfdi] = useState("G03");
  const [formReceptorDomicilio, setFormReceptorDomicilio] = useState("");

  // Conceptos
  const [formConceptos, setFormConceptos] = useState<Concepto[]>([{ ...EMPTY_CONCEPTO }]);

  // Form errors
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Edit form state (mirrors create)
  const [editFormSerie, setEditFormSerie] = useState("");
  const [editFormFecha, setEditFormFecha] = useState("");
  const [editFormFormaPago, setEditFormFormaPago] = useState("01");
  const [editFormMetodoPago, setEditFormMetodoPago] = useState("PUE");
  const [editFormMoneda, setEditFormMoneda] = useState("MXN");
  const [editFormLugarExpedicion, setEditFormLugarExpedicion] = useState("");
  const [editFormExportacion, setEditFormExportacion] = useState("01");
  const [editFormReceptorRfc, setEditFormReceptorRfc] = useState("");
  const [editFormReceptorNombre, setEditFormReceptorNombre] = useState("");
  const [editFormReceptorRegimen, setEditFormReceptorRegimen] = useState("601");
  const [editFormReceptorUsoCfdi, setEditFormReceptorUsoCfdi] = useState("G03");
  const [editFormReceptorDomicilio, setEditFormReceptorDomicilio] = useState("");
  const [editFormConceptos, setEditFormConceptos] = useState<Concepto[]>([]);
  const [editFormErrors, setEditFormErrors] = useState<Record<string, string>>({});

  // Payment Complement state
  const [pendingPayments, setPendingPayments] = useState<PendingPayment[]>([]);
  const [paymentComplements, setPaymentComplements] = useState<PaymentComplement[]>([]);
  const [loadingComplements, setLoadingComplements] = useState(false);
  const [complementModalOpen, setComplementModalOpen] = useState(false);
  const [viewComplementModalOpen, setViewComplementModalOpen] = useState(false);
  const [viewingComplement, setViewingComplement] = useState<PaymentComplement | null>(null);
  const [complementSaving, setComplementSaving] = useState(false);

  // Complement form state
  const [compPaymentDate, setCompPaymentDate] = useState(todayISO());
  const [compPaymentForm, setCompPaymentForm] = useState("03");
  const [compCurrency, setCompCurrency] = useState("MXN");
  const [compSelectedDocs, setCompSelectedDocs] = useState<
    Array<{ cfdiId: string; amountPaid: number; maxAmount: number; label: string }>
  >([]);
  const [compErrors, setCompErrors] = useState<Record<string, string>>({});
  const [complementSearchTerm, setComplementSearchTerm] = useState("");
  const [pendingSearchTerm, setPendingSearchTerm] = useState("");

  // Attachment state for view modal
  const [attachmentUploading, setAttachmentUploading] = useState(false);

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);
  // Reset search when tab changes
  useEffect(() => {
    setSearchTerm("");
    setCurrentPage(1);
  }, [activeTab]);

  // -------------------------------------------------------------------
  // Fetch helpers
  // -------------------------------------------------------------------

  const fetchCfdis = useCallback(async () => {
    try {
      const data = await authFetch<Cfdi[]>("get", "/facturacion/invoices");
      setCfdis(data);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al cargar datos", "error");
      setCfdis([]);
    }
  }, [authFetch]);

  const fetchBranches = useCallback(async () => {
    try {
      const data = await authFetch<Branch[]>("get", "/branches");
      setBranches(data);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al cargar datos", "error");
    }
  }, [authFetch]);

  const fetchPendingPayments = useCallback(async () => {
    try {
      const data = await authFetch<PendingPayment[]>("get", "/facturacion/pending-payments");
      setPendingPayments(data);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al cargar datos", "error");
      setPendingPayments([]);
    }
  }, [authFetch]);

  const fetchPaymentComplements = useCallback(async () => {
    try {
      const data = await authFetch<PaymentComplement[]>("get", "/facturacion/payment-complements");
      setPaymentComplements(data);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al cargar datos", "error");
      setPaymentComplements([]);
    }
  }, [authFetch]);

  useEffect(() => {
    if (authLoading) return;
    setLoadingData(true);
    Promise.all([fetchCfdis(), fetchBranches()]).finally(() =>
      setLoadingData(false)
    );
  }, [authLoading, fetchCfdis, fetchBranches]);

  // Fetch complement data when tab is active
  useEffect(() => {
    if (authLoading || activeTab !== "Complementos de Pago") return;
    setLoadingComplements(true);
    Promise.all([fetchPendingPayments(), fetchPaymentComplements()]).finally(
      () => setLoadingComplements(false)
    );
  }, [authLoading, activeTab, fetchPendingPayments, fetchPaymentComplements]);

  // Auto-calculate folio from existing invoices
  useEffect(() => {
    if (cfdis.length > 0) {
      const maxFolio = cfdis.reduce((max, c) => {
        const f = parseInt(c.folio) || 0;
        return f > max ? f : max;
      }, 0);
      setFormFolio(String(maxFolio + 1));
    } else {
      setFormFolio("1");
    }
  }, [cfdis]);

  // -------------------------------------------------------------------
  // Computed: Summary cards
  // -------------------------------------------------------------------

  const summaryData = useMemo(() => {
    const totalFacturas = cfdis.length;
    const timbradas = cfdis.filter(
      (c) => c.status === "STAMPED"
    ).length;
    const canceladas = cfdis.filter((c) => c.status === "CANCELLED").length;
    const totalFacturado = cfdis.reduce((sum, c) => sum + num(c.total), 0);
    return { totalFacturas, timbradas, canceladas, totalFacturado };
  }, [cfdis]);

  // -------------------------------------------------------------------
  // Search & Pagination
  // -------------------------------------------------------------------

  const filteredCfdis = useMemo(() => {
    if (!searchTerm) return cfdis;
    const q = normalize(searchTerm);
    return cfdis.filter(
      (c) =>
        (c.folio && normalize(c.folio).includes(q)) ||
        (c.series && normalize(c.series).includes(q)) ||
        normalize(c.receiverName || "").includes(q) ||
        normalize(c.receiverRfc || "").includes(q) ||
        (c.uuid && normalize(c.uuid).includes(q))
    );
  }, [cfdis, searchTerm]);

  const totalPages = Math.ceil(filteredCfdis.length / PAGE_SIZE);
  const paginatedCfdis = filteredCfdis.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );
  const paginationStart =
    filteredCfdis.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const paginationEnd = Math.min(
    currentPage * PAGE_SIZE,
    filteredCfdis.length
  );

  return {
    // Auth
    authFetch,
    user,
    authLoading,
    toast,

    // Data state
    cfdis,
    setCfdis,
    branches,
    loadingData,
    error,
    setError,

    // UI state
    activeTab,
    setActiveTab,
    saving,
    setSaving,

    // Search & Pagination
    searchTerm,
    setSearchTerm,
    currentPage,
    setCurrentPage,
    filteredCfdis,
    totalPages,
    paginatedCfdis,
    paginationStart,
    paginationEnd,

    // View/Edit modal
    viewModalOpen,
    setViewModalOpen,
    viewingCfdi,
    setViewingCfdi,
    editModalOpen,
    setEditModalOpen,
    editingCfdi,
    setEditingCfdi,

    // Cancel modal
    cancelModalOpen,
    setCancelModalOpen,
    cancellingCfdi,
    setCancellingCfdi,
    cancelMotivo,
    setCancelMotivo,

    // Catalog search
    catalogSearch,
    setCatalogSearch,
    activeCatalog,
    setActiveCatalog,

    // Create form state
    formSerie,
    setFormSerie,
    formFolio,
    formFecha,
    setFormFecha,
    formFormaPago,
    setFormFormaPago,
    formMetodoPago,
    setFormMetodoPago,
    formMoneda,
    setFormMoneda,
    formLugarExpedicion,
    setFormLugarExpedicion,
    formExportacion,
    setFormExportacion,
    formBranchId,
    setFormBranchId,

    // Emisor
    formEmisorRfc,
    setFormEmisorRfc,
    formEmisorNombre,
    setFormEmisorNombre,
    formEmisorRegimen,
    setFormEmisorRegimen,

    // Receptor
    formReceptorRfc,
    setFormReceptorRfc,
    formReceptorNombre,
    setFormReceptorNombre,
    formReceptorRegimen,
    setFormReceptorRegimen,
    formReceptorUsoCfdi,
    setFormReceptorUsoCfdi,
    formReceptorDomicilio,
    setFormReceptorDomicilio,

    // Conceptos
    formConceptos,
    setFormConceptos,

    // Form errors
    formErrors,
    setFormErrors,

    // Edit form state
    editFormSerie,
    setEditFormSerie,
    editFormFecha,
    setEditFormFecha,
    editFormFormaPago,
    setEditFormFormaPago,
    editFormMetodoPago,
    setEditFormMetodoPago,
    editFormMoneda,
    setEditFormMoneda,
    editFormLugarExpedicion,
    setEditFormLugarExpedicion,
    editFormExportacion,
    setEditFormExportacion,
    editFormReceptorRfc,
    setEditFormReceptorRfc,
    editFormReceptorNombre,
    setEditFormReceptorNombre,
    editFormReceptorRegimen,
    setEditFormReceptorRegimen,
    editFormReceptorUsoCfdi,
    setEditFormReceptorUsoCfdi,
    editFormReceptorDomicilio,
    setEditFormReceptorDomicilio,
    editFormConceptos,
    setEditFormConceptos,
    editFormErrors,
    setEditFormErrors,

    // Payment Complement state
    pendingPayments,
    paymentComplements,
    loadingComplements,
    complementModalOpen,
    setComplementModalOpen,
    viewComplementModalOpen,
    setViewComplementModalOpen,
    viewingComplement,
    setViewingComplement,
    complementSaving,
    setComplementSaving,

    // Complement form state
    compPaymentDate,
    setCompPaymentDate,
    compPaymentForm,
    setCompPaymentForm,
    compCurrency,
    setCompCurrency,
    compSelectedDocs,
    setCompSelectedDocs,
    compErrors,
    setCompErrors,
    complementSearchTerm,
    setComplementSearchTerm,
    pendingSearchTerm,
    setPendingSearchTerm,

    // Attachment state
    attachmentUploading,
    setAttachmentUploading,

    // Summary
    summaryData,

    // Fetch helpers (exposed for re-fetching after mutations)
    fetchCfdis,
    fetchBranches,
    fetchPendingPayments,
    fetchPaymentComplements,
  };
}
