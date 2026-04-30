"use client";

import { useMemo } from "react";
import {
  FileText,
  FileCode,
  Download,
  Plus,
  Trash2,
  Search,
  ChevronLeft,
  ChevronRight,
  Pencil,
  XCircle,
  Eye,
  Send,
  Paperclip,
  CreditCard,
  Clock,
  CheckCircle,
  DollarSign,
} from "lucide-react";
import { exportToCSV } from "@/lib/export-csv";
import { generateInvoicePDF } from "@/lib/pdf-generator";
import { getApiOrigin, getApiUrl } from "@/lib/api-url";
import { DataTable } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { FormField, Input, Select } from "@/components/ui/form-field";
import { formatMXN } from "@luka/shared";
import type {
  Cfdi,
  Concepto,
  CfdiAttachment,
  PendingPayment,
  PaymentComplement,
  PaymentComplementRelatedDoc,
} from "./_components/types";
import {
  REGIMEN_FISCAL,
  USO_CFDI,
  FORMA_PAGO,
  METODO_PAGO,
  MONEDA,
  EXPORTACION,
  CLAVE_UNIDAD,
  MOTIVOS_CANCELACION,
  ALL_CATALOGS,
  TABS,
  STATUS_VARIANT,
  STATUS_LABEL,
  normalize,
  num,
  formatDate,
  todayISO,
  EMPTY_CONCEPTO,
} from "./_components/types";
import { useFacturacion } from "./_components/use-facturacion";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FacturacionPage() {
  const {
    // Auth
    authFetch,
    user: _user,
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

    // Fetch helpers
    fetchCfdis,
    fetchBranches: _fetchBranches,
    fetchPendingPayments,
    fetchPaymentComplements,
  } = useFacturacion();

  // -------------------------------------------------------------------
  // Create form helpers
  // -------------------------------------------------------------------

  function resetCreateForm() {
    setFormSerie("A");
    setFormFecha(todayISO());
    setFormFormaPago("01");
    setFormMetodoPago("PUE");
    setFormMoneda("MXN");
    setFormLugarExpedicion("");
    setFormExportacion("01");
    setFormBranchId(branches[0]?.id ?? "");
    setFormEmisorRfc("");
    setFormEmisorNombre("");
    setFormEmisorRegimen("601");
    setFormReceptorRfc("");
    setFormReceptorNombre("");
    setFormReceptorRegimen("601");
    setFormReceptorUsoCfdi("G03");
    setFormReceptorDomicilio("");
    setFormConceptos([{ ...EMPTY_CONCEPTO }]);
    setFormErrors({});
  }

  const createSubtotal = useMemo(
    () => formConceptos.reduce((s, c) => s + c.quantity * c.unitPrice, 0),
    [formConceptos],
  );
  const createIva = useMemo(
    () => formConceptos.reduce((s, c) => s + (c.withIva ? c.quantity * c.unitPrice * 0.16 : 0), 0),
    [formConceptos],
  );
  const createTotal = createSubtotal + createIva;

  function updateConcepto(index: number, field: keyof Concepto, value: string | number | boolean) {
    setFormConceptos((prev) => {
      const next = [...prev];
      const updated = { ...next[index], [field]: value };
      updated.importe = updated.quantity * updated.unitPrice;
      next[index] = updated;
      return next;
    });
  }

  function removeConcepto(index: number) {
    setFormConceptos((prev) => prev.filter((_, i) => i !== index));
  }

  function addConcepto() {
    setFormConceptos((prev) => [...prev, { ...EMPTY_CONCEPTO }]);
  }

  // Edit form concepto helpers
  const editSubtotal = useMemo(
    () => editFormConceptos.reduce((s, c) => s + c.quantity * c.unitPrice, 0),
    [editFormConceptos],
  );
  const editIva = useMemo(
    () =>
      editFormConceptos.reduce((s, c) => s + (c.withIva ? c.quantity * c.unitPrice * 0.16 : 0), 0),
    [editFormConceptos],
  );
  const editTotal = editSubtotal + editIva;

  function updateEditConcepto(
    index: number,
    field: keyof Concepto,
    value: string | number | boolean,
  ) {
    setEditFormConceptos((prev) => {
      const next = [...prev];
      const updated = { ...next[index], [field]: value };
      updated.importe = updated.quantity * updated.unitPrice;
      next[index] = updated;
      return next;
    });
  }

  function removeEditConcepto(index: number) {
    setEditFormConceptos((prev) => prev.filter((_, i) => i !== index));
  }

  function addEditConcepto() {
    setEditFormConceptos((prev) => [...prev, { ...EMPTY_CONCEPTO }]);
  }

  // -------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------

  function validateCreateForm(): boolean {
    const errors: Record<string, string> = {};
    if (!formReceptorRfc.trim()) errors.receptorRfc = "RFC receptor es requerido";
    if (!formReceptorNombre.trim()) errors.receptorNombre = "Nombre receptor es requerido";
    if (!formLugarExpedicion.trim()) errors.lugarExpedicion = "Lugar de expedicion es requerido";
    if (formConceptos.length === 0) errors.conceptos = "Agrega al menos un concepto";
    formConceptos.forEach((c, i) => {
      if (!c.satClaveProdServ.trim()) errors[`concepto_${i}_clave`] = "Clave SAT requerida";
      if (!c.description.trim()) errors[`concepto_${i}_desc`] = "Descripcion requerida";
      if (c.quantity <= 0) errors[`concepto_${i}_qty`] = "Cantidad > 0";
      if (c.unitPrice <= 0) errors[`concepto_${i}_price`] = "Precio > 0";
    });
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function validateEditForm(): boolean {
    const errors: Record<string, string> = {};
    if (!editFormReceptorRfc.trim()) errors.receptorRfc = "RFC receptor es requerido";
    if (!editFormReceptorNombre.trim()) errors.receptorNombre = "Nombre receptor es requerido";
    if (editFormConceptos.length === 0) errors.conceptos = "Agrega al menos un concepto";
    editFormConceptos.forEach((c, i) => {
      if (!c.satClaveProdServ.trim()) errors[`concepto_${i}_clave`] = "Clave SAT requerida";
      if (!c.description.trim()) errors[`concepto_${i}_desc`] = "Descripcion requerida";
      if (c.quantity <= 0) errors[`concepto_${i}_qty`] = "Cantidad > 0";
      if (c.unitPrice <= 0) errors[`concepto_${i}_price`] = "Precio > 0";
    });
    setEditFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  // -------------------------------------------------------------------
  // Build payloads
  // -------------------------------------------------------------------

  function buildCreatePayload() {
    return {
      branchId: formBranchId || branches[0]?.id,
      series: formSerie.trim(),
      folio: formFolio,
      fecha: formFecha,
      paymentForm: formFormaPago,
      paymentMethod: formMetodoPago,
      currency: formMoneda,
      lugarExpedicion: formLugarExpedicion.trim(),
      exportacion: formExportacion,
      issuerRfc: formEmisorRfc.trim(),
      issuerName: formEmisorNombre.trim(),
      issuerRegimen: formEmisorRegimen,
      receiverRfc: formReceptorRfc.trim(),
      receiverName: formReceptorNombre.trim(),
      receiverRegimen: formReceptorRegimen,
      receiverUsoCfdi: formReceptorUsoCfdi,
      receiverDomicilioFiscal: formReceptorDomicilio.trim(),
      items: formConceptos.map((c) => ({
        satClaveProdServ: c.satClaveProdServ.trim(),
        quantity: c.quantity,
        satClaveUnidad: c.satClaveUnidad,
        unitOfMeasure:
          c.unitOfMeasure ||
          CLAVE_UNIDAD.find((u) => u.clave === c.satClaveUnidad)?.descripcion ||
          "",
        description: c.description.trim(),
        unitPrice: c.unitPrice,
        withIva: c.withIva,
      })),
    };
  }

  function buildEditPayload() {
    return {
      series: editFormSerie.trim(),
      fecha: editFormFecha,
      paymentForm: editFormFormaPago,
      paymentMethod: editFormMetodoPago,
      currency: editFormMoneda,
      lugarExpedicion: editFormLugarExpedicion.trim(),
      exportacion: editFormExportacion,
      receiverRfc: editFormReceptorRfc.trim(),
      receiverName: editFormReceptorNombre.trim(),
      receiverRegimen: editFormReceptorRegimen,
      receiverUsoCfdi: editFormReceptorUsoCfdi,
      receiverDomicilioFiscal: editFormReceptorDomicilio.trim(),
      items: editFormConceptos.map((c) => ({
        satClaveProdServ: c.satClaveProdServ.trim(),
        quantity: c.quantity,
        satClaveUnidad: c.satClaveUnidad,
        unitOfMeasure:
          c.unitOfMeasure ||
          CLAVE_UNIDAD.find((u) => u.clave === c.satClaveUnidad)?.descripcion ||
          "",
        description: c.description.trim(),
        unitPrice: c.unitPrice,
        withIva: c.withIva,
      })),
    };
  }

  // -------------------------------------------------------------------
  // CRUD handlers
  // -------------------------------------------------------------------

  async function handleCreate(generateXml = false) {
    if (!validateCreateForm()) return;
    setSaving(true);
    setError(null);
    try {
      const created = await authFetch<Cfdi>("post", "/facturacion/invoices", buildCreatePayload());
      if (generateXml && created.id) {
        try {
          await authFetch("post", `/facturacion/invoices/${created.id}/xml`);
        } catch (err) {
          toast(err instanceof Error ? err.message : "Error al generar XML", "error");
        }
      }
      await fetchCfdis();
      resetCreateForm();
      setActiveTab("Facturas");
    } catch (err: any) {
      setFormErrors({ _form: err?.message ?? "Error al crear factura" });
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate() {
    if (!editingCfdi) return;
    if (!validateEditForm()) return;
    setSaving(true);
    setError(null);
    try {
      await authFetch("patch", `/facturacion/invoices/${editingCfdi.id}`, buildEditPayload());
      await fetchCfdis();
      setEditModalOpen(false);
      setEditingCfdi(null);
    } catch (err: any) {
      setEditFormErrors({ _form: err?.message ?? "Error al actualizar factura" });
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateXml(cfdi: Cfdi) {
    setError(null);
    try {
      await authFetch("post", `/facturacion/invoices/${cfdi.id}/xml`);
      await fetchCfdis();
    } catch (err: any) {
      setError(err?.message ?? "Error al generar XML");
    }
  }

  async function handleDownloadXml(cfdi: Cfdi) {
    if (!cfdi.xmlContent) {
      setError("No hay XML disponible para esta factura");
      return;
    }
    const blob = new Blob([cfdi.xmlContent], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `CFDI_${cfdi.series || "A"}_${cfdi.folio}.xml`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleCancel() {
    if (!cancellingCfdi) return;
    setSaving(true);
    setError(null);
    try {
      await authFetch("post", `/facturacion/invoices/${cancellingCfdi.id}/cancel`, {
        motivo: cancelMotivo,
      });
      await fetchCfdis();
      setCancelModalOpen(false);
      setCancellingCfdi(null);
      setCancelMotivo("02");
    } catch (err: any) {
      setError(err?.message ?? "Error al cancelar factura");
    } finally {
      setSaving(false);
    }
  }

  function openEditModal(cfdi: Cfdi) {
    setEditingCfdi(cfdi);
    setEditFormSerie(cfdi.series || "A");
    setEditFormFecha(cfdi.createdAt ? cfdi.createdAt.slice(0, 10) : todayISO());
    setEditFormFormaPago(cfdi.paymentForm || "01");
    setEditFormMetodoPago(cfdi.paymentMethod || "PUE");
    setEditFormMoneda(cfdi.currency || "MXN");
    setEditFormLugarExpedicion(cfdi.lugarExpedicion || "");
    setEditFormExportacion(cfdi.exportacion || "01");
    setEditFormReceptorRfc(cfdi.receiverRfc || "");
    setEditFormReceptorNombre(cfdi.receiverName || "");
    setEditFormReceptorRegimen(cfdi.receiverRegimen || "601");
    setEditFormReceptorUsoCfdi(cfdi.receiverUsoCfdi || "G03");
    setEditFormReceptorDomicilio(cfdi.receiverDomicilioFiscal || "");
    setEditFormConceptos(
      cfdi.concepts && cfdi.concepts.length > 0
        ? cfdi.concepts.map((c) => ({
            satClaveProdServ: c.satClaveProdServ,
            quantity: num(c.quantity),
            satClaveUnidad: c.satClaveUnidad,
            unitOfMeasure: c.unitOfMeasure || "",
            description: c.description,
            unitPrice: num(c.unitPrice),
            importe: num(c.amount),
            withIva: true,
          }))
        : [{ ...EMPTY_CONCEPTO }],
    );
    setEditFormErrors({});
    setEditModalOpen(true);
  }

  function openViewModal(cfdi: Cfdi) {
    setViewingCfdi(cfdi);
    setViewModalOpen(true);
  }

  function openCancelModal(cfdi: Cfdi) {
    setCancellingCfdi(cfdi);
    setCancelMotivo("02");
    setCancelModalOpen(true);
  }

  // -------------------------------------------------------------------
  // CSV Export
  // -------------------------------------------------------------------

  function handleExportCSV() {
    exportToCSV(
      filteredCfdis.map((c) => ({
        folio: `${c.series || ""}-${c.folio}`,
        fecha: formatDate(c.createdAt),
        cliente: c.receiverName,
        rfc: c.receiverRfc,
        subtotal: num(c.subtotal),
        total: num(c.total),
        moneda: c.currency,
        estado: STATUS_LABEL[c.status] || c.status,
        uuid: c.uuid || "",
      })),
      "facturas",
      [
        { key: "folio", label: "Folio" },
        { key: "fecha", label: "Fecha" },
        { key: "cliente", label: "Cliente" },
        { key: "rfc", label: "RFC" },
        { key: "subtotal", label: "Subtotal" },
        { key: "total", label: "Total" },
        { key: "moneda", label: "Moneda" },
        { key: "estado", label: "Estado" },
        { key: "uuid", label: "UUID" },
      ],
    );
  }

  // -------------------------------------------------------------------
  // Payment Complement helpers
  // -------------------------------------------------------------------

  function resetComplementForm() {
    setCompPaymentDate(todayISO());
    setCompPaymentForm("03");
    setCompCurrency("MXN");
    setCompSelectedDocs([]);
    setCompErrors({});
  }

  function addPendingToComplement(pp: PendingPayment) {
    if (compSelectedDocs.some((d) => d.cfdiId === pp.id)) return;
    setCompSelectedDocs((prev) => [
      ...prev,
      {
        cfdiId: pp.id,
        amountPaid: pp.saldoPendiente,
        maxAmount: pp.saldoPendiente,
        label: `${pp.series || "A"}-${pp.folio} (${pp.receiverName})`,
      },
    ]);
  }

  function removeDocFromComplement(cfdiId: string) {
    setCompSelectedDocs((prev) => prev.filter((d) => d.cfdiId !== cfdiId));
  }

  function updateDocAmount(cfdiId: string, amount: number) {
    setCompSelectedDocs((prev) =>
      prev.map((d) => (d.cfdiId === cfdiId ? { ...d, amountPaid: amount } : d)),
    );
  }

  const compTotalAmount = useMemo(
    () => compSelectedDocs.reduce((sum, d) => sum + d.amountPaid, 0),
    [compSelectedDocs],
  );

  function validateComplementForm(): boolean {
    const errors: Record<string, string> = {};
    if (!compPaymentDate) errors.paymentDate = "Fecha de pago requerida";
    if (!compPaymentForm) errors.paymentForm = "Forma de pago requerida";
    if (compSelectedDocs.length === 0) errors.docs = "Seleccione al menos una factura";
    compSelectedDocs.forEach((d, i) => {
      if (d.amountPaid <= 0) errors[`doc_${i}_amount`] = "Monto > 0";
      if (d.amountPaid > d.maxAmount)
        errors[`doc_${i}_amount`] = `Monto maximo: ${formatMXN(d.maxAmount)}`;
    });
    setCompErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleCreateComplement() {
    if (!validateComplementForm()) return;
    setComplementSaving(true);
    setError(null);
    try {
      await authFetch("post", "/facturacion/payment-complement", {
        paymentDate: new Date(compPaymentDate).toISOString(),
        paymentForm: compPaymentForm,
        amount: Math.round(compTotalAmount * 100) / 100,
        currency: compCurrency,
        relatedDocuments: compSelectedDocs.map((d) => ({
          cfdiId: d.cfdiId,
          amountPaid: d.amountPaid,
        })),
      });
      resetComplementForm();
      setComplementModalOpen(false);
      await Promise.all([fetchPendingPayments(), fetchPaymentComplements()]);
    } catch (err: any) {
      setCompErrors({ _form: err?.message ?? "Error al crear complemento de pago" });
    } finally {
      setComplementSaving(false);
    }
  }

  function openViewComplementModal(comp: PaymentComplement) {
    setViewingComplement(comp);
    setViewComplementModalOpen(true);
  }

  function handleDownloadComplementXml(comp: PaymentComplement) {
    if (!comp.xmlContent) {
      setError("No hay XML disponible para este complemento");
      return;
    }
    const blob = new Blob([comp.xmlContent], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `CFDI_${comp.series || "P"}_${comp.folio}.xml`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const filteredPendingPayments = useMemo(() => {
    if (!pendingSearchTerm) return pendingPayments;
    const q = normalize(pendingSearchTerm);
    return pendingPayments.filter(
      (p) =>
        (p.folio && normalize(p.folio).includes(q)) ||
        (p.series && normalize(p.series).includes(q)) ||
        normalize(p.receiverName || "").includes(q) ||
        normalize(p.receiverRfc || "").includes(q),
    );
  }, [pendingPayments, pendingSearchTerm]);

  const filteredComplements = useMemo(() => {
    if (!complementSearchTerm) return paymentComplements;
    const q = normalize(complementSearchTerm);
    return paymentComplements.filter(
      (c) =>
        (c.folio && normalize(c.folio).includes(q)) ||
        normalize(c.receiverName || "").includes(q) ||
        normalize(c.receiverRfc || "").includes(q),
    );
  }, [paymentComplements, complementSearchTerm]);

  // -------------------------------------------------------------------
  // Attachment helpers
  // -------------------------------------------------------------------

  const UPLOAD_API_URL = getApiUrl();
  const fileBaseUrl = getApiOrigin();

  async function handleAttachFile(e: React.ChangeEvent<HTMLInputElement>, cfdi: Cfdi) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachmentUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${UPLOAD_API_URL}/uploads/document`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();

      const existing: CfdiAttachment[] = Array.isArray(cfdi.attachments) ? cfdi.attachments : [];
      const newAttachment: CfdiAttachment = {
        filename: data.filename,
        url: data.url,
        size: data.size,
        uploadedAt: new Date().toISOString(),
      };
      const updated = [...existing, newAttachment];

      await authFetch("patch", `/facturacion/invoices/${cfdi.id}`, {
        attachments: updated,
      });

      // Update local state
      const refreshed = { ...cfdi, attachments: updated };
      setCfdis((prev) => prev.map((c) => (c.id === cfdi.id ? refreshed : c)));
      if (viewingCfdi?.id === cfdi.id) setViewingCfdi(refreshed);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al guardar", "error");
    } finally {
      setAttachmentUploading(false);
    }
    e.target.value = "";
  }

  async function handleRemoveAttachment(cfdi: Cfdi, index: number) {
    const existing: CfdiAttachment[] = Array.isArray(cfdi.attachments) ? cfdi.attachments : [];
    const updated = existing.filter((_, i) => i !== index);

    try {
      await authFetch("patch", `/facturacion/invoices/${cfdi.id}`, {
        attachments: updated.length > 0 ? updated : null,
      });

      const refreshed = { ...cfdi, attachments: updated.length > 0 ? updated : null };
      setCfdis((prev) => prev.map((c) => (c.id === cfdi.id ? refreshed : c)));
      if (viewingCfdi?.id === cfdi.id) setViewingCfdi(refreshed);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al eliminar", "error");
    }
  }

  function formatFileSize(bytes?: number) {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // -------------------------------------------------------------------
  // Table columns
  // -------------------------------------------------------------------

  const invoiceColumns = useMemo(
    () => [
      {
        key: "folio",
        header: "Folio",
        render: (row: Cfdi) => (
          <span className="font-mono font-medium">
            {row.series || "A"}-{row.folio}
          </span>
        ),
      },
      {
        key: "createdAt",
        header: "Fecha",
        render: (row: Cfdi) => formatDate(row.createdAt),
      },
      {
        key: "receiverName",
        header: "Cliente",
        render: (row: Cfdi) => (
          <span className="max-w-[200px] truncate block" title={row.receiverName}>
            {row.receiverName}
          </span>
        ),
      },
      {
        key: "receiverRfc",
        header: "RFC",
        render: (row: Cfdi) => <span className="font-mono text-xs">{row.receiverRfc}</span>,
      },
      {
        key: "total",
        header: "Total",
        className: "text-right",
        render: (row: Cfdi) => <span className="font-medium">{formatMXN(num(row.total))}</span>,
      },
      {
        key: "status",
        header: "Estado",
        className: "text-center",
        render: (row: Cfdi) => (
          <StatusBadge
            label={STATUS_LABEL[row.status] ?? row.status}
            variant={(STATUS_VARIANT[row.status] as any) ?? "gray"}
          />
        ),
      },
      {
        key: "actions",
        header: "Acciones",
        className: "text-center",
        render: (row: Cfdi) => (
          <div className="flex items-center justify-center gap-1">
            {/* View / Edit */}
            {row.status === "DRAFT" ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openEditModal(row);
                }}
                className="p-1 hover:bg-muted rounded"
                title="Editar"
              >
                <Pencil className="h-4 w-4 text-gray-500" />
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openViewModal(row);
                }}
                className="p-1 hover:bg-muted rounded"
                title="Ver detalle"
              >
                <Eye className="h-4 w-4 text-gray-500" />
              </button>
            )}
            {/* Generate XML - only DRAFT */}
            {row.status === "DRAFT" && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleGenerateXml(row);
                }}
                className="p-1 hover:bg-blue-50 rounded"
                title="Generar XML"
              >
                <FileCode className="h-4 w-4 text-blue-600" />
              </button>
            )}
            {/* Download XML - only STAMPED */}
            {row.status === "STAMPED" && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownloadXml(row);
                }}
                className="p-1 hover:bg-green-50 rounded"
                title="Descargar XML"
              >
                <Download className="h-4 w-4 text-green-600" />
              </button>
            )}
            {/* Download PDF - only STAMPED */}
            {row.status === "STAMPED" && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  generateInvoicePDF(row);
                }}
                className="p-1 hover:bg-purple-50 rounded"
                title="Descargar PDF"
              >
                <FileText className="h-4 w-4 text-purple-600" />
              </button>
            )}
            {/* Cancel - only STAMPED */}
            {row.status === "STAMPED" && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openCancelModal(row);
                }}
                className="p-1 hover:bg-red-50 rounded"
                title="Cancelar factura"
              >
                <XCircle className="h-4 w-4 text-red-500" />
              </button>
            )}
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cfdis, branches],
  );

  // -------------------------------------------------------------------
  // Catalogs filtered
  // -------------------------------------------------------------------

  const filteredCatalogData = useMemo(() => {
    const catalog = ALL_CATALOGS.find((c) => c.name === activeCatalog);
    if (!catalog) return [];
    if (!catalogSearch) return catalog.data;
    const q = normalize(catalogSearch);
    return catalog.data.filter(
      (item) => normalize(item.clave).includes(q) || normalize(item.descripcion).includes(q),
    );
  }, [activeCatalog, catalogSearch]);

  // -------------------------------------------------------------------
  // Concepto row render helper
  // -------------------------------------------------------------------

  function renderConceptoRow(
    c: Concepto,
    idx: number,
    conceptos: Concepto[],
    updateFn: (i: number, f: keyof Concepto, v: string | number | boolean) => void,
    removeFn: (i: number) => void,
    errors: Record<string, string>,
  ) {
    return (
      <div
        key={idx}
        className={`grid grid-cols-12 gap-2 items-end border rounded-md p-3 ${
          idx % 2 === 0 ? "bg-white" : "bg-gray-50"
        }`}
      >
        <div className="col-span-2">
          <FormField label="ClaveProdServ" error={errors[`concepto_${idx}_clave`]}>
            <Input
              value={c.satClaveProdServ}
              onChange={(e) => updateFn(idx, "satClaveProdServ", e.target.value)}
              placeholder="01010101"
            />
          </FormField>
        </div>
        <div className="col-span-1">
          <FormField label="Cant." error={errors[`concepto_${idx}_qty`]}>
            <Input
              type="number"
              min={0.01}
              step="0.01"
              value={c.quantity}
              onChange={(e) => updateFn(idx, "quantity", Number(e.target.value))}
            />
          </FormField>
        </div>
        <div className="col-span-1">
          <FormField label="ClaveUni.">
            <Select
              value={c.satClaveUnidad}
              onChange={(e) => {
                updateFn(idx, "satClaveUnidad", e.target.value);
                const unit = CLAVE_UNIDAD.find((u) => u.clave === e.target.value);
                if (unit) updateFn(idx, "unitOfMeasure", unit.descripcion);
              }}
            >
              {CLAVE_UNIDAD.map((u) => (
                <option key={u.clave} value={u.clave}>
                  {u.clave}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        <div className="col-span-1">
          <FormField label="Unidad">
            <Input
              value={c.unitOfMeasure}
              onChange={(e) => updateFn(idx, "unitOfMeasure", e.target.value)}
              placeholder="Pieza"
            />
          </FormField>
        </div>
        <div className="col-span-2">
          <FormField label="Descripcion" error={errors[`concepto_${idx}_desc`]}>
            <Input
              value={c.description}
              onChange={(e) => updateFn(idx, "description", e.target.value)}
              placeholder="Descripcion del concepto"
            />
          </FormField>
        </div>
        <div className="col-span-2">
          <FormField label="Valor Unitario" error={errors[`concepto_${idx}_price`]}>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={c.unitPrice}
              onChange={(e) => updateFn(idx, "unitPrice", Number(e.target.value))}
            />
          </FormField>
        </div>
        <div className="col-span-1 text-right text-sm font-medium pt-6">
          {formatMXN(c.quantity * c.unitPrice)}
        </div>
        <div className="col-span-1 flex items-center justify-center gap-1 pt-6">
          <label className="flex items-center gap-1 text-xs" title="IVA 16%">
            <input
              type="checkbox"
              checked={c.withIva}
              onChange={(e) => updateFn(idx, "withIva", e.target.checked)}
              className="rounded"
            />
            IVA
          </label>
        </div>
        <div className="col-span-1 flex justify-end pt-6">
          {conceptos.length > 1 && (
            <button
              onClick={() => removeFn(idx)}
              className="p-1 hover:bg-red-50 rounded"
              title="Eliminar concepto"
            >
              <Trash2 className="h-4 w-4 text-red-500" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  if (authLoading) {
    return <div className="p-8 text-center text-gray-400">Cargando...</div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Facturacion</h1>
            <p className="text-sm text-gray-500">
              Gestion de comprobantes fiscales digitales CFDI 4.0
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 border-b border-gray-200">
        <div className="flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`border-b-2 pb-3 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-700 font-medium"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 1: FACTURAS (Invoice List)                                    */}
      {/* ================================================================= */}
      {activeTab === "Facturas" && (
        <div className="mt-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="rounded-lg border bg-white p-4">
              <p className="text-sm text-gray-500">Total Facturas</p>
              <p className="text-2xl font-bold text-gray-900">{summaryData.totalFacturas}</p>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <p className="text-sm text-gray-500">Facturas Timbradas</p>
              <p className="text-2xl font-bold text-green-600">{summaryData.timbradas}</p>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <p className="text-sm text-gray-500">Facturas Canceladas</p>
              <p className="text-2xl font-bold text-red-600">{summaryData.canceladas}</p>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <p className="text-sm text-gray-500">Total Facturado</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatMXN(summaryData.totalFacturado)}
              </p>
            </div>
          </div>

          {/* Search bar + Export */}
          <div className="flex items-center justify-between mb-4">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por folio, cliente o RFC..."
                className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm focus:border-gray-400 focus:outline-none focus:ring-0"
              />
            </div>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors ml-4"
            >
              <Download className="h-4 w-4" />
              Exportar CSV
            </button>
          </div>

          {/* Data Table */}
          <DataTable
            columns={invoiceColumns}
            data={paginatedCfdis}
            loading={loadingData}
            emptyMessage="No hay facturas registradas"
          />

          {/* Pagination */}
          {filteredCfdis.length > 0 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Mostrando {paginationStart}-{paginationEnd} de {filteredCfdis.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm text-gray-500">
                  {currentPage} / {totalPages || 1}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages || totalPages === 0}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 2: NUEVA FACTURA (Create Invoice Form)                        */}
      {/* ================================================================= */}
      {activeTab === "Nueva Factura" && (
        <div className="mt-6 space-y-6">
          {formErrors._form && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {formErrors._form}
            </div>
          )}

          {/* Section 1: Datos Generales */}
          <div className="rounded-lg border bg-white p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Datos Generales</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <FormField label="Serie">
                <Input
                  value={formSerie}
                  onChange={(e) => setFormSerie(e.target.value)}
                  placeholder="A"
                />
              </FormField>
              <FormField label="Folio">
                <Input value={formFolio} readOnly className="bg-gray-50" />
              </FormField>
              <FormField label="Fecha">
                <Input
                  type="date"
                  value={formFecha}
                  onChange={(e) => setFormFecha(e.target.value)}
                />
              </FormField>
              <FormField label="Forma de Pago" required>
                <Select value={formFormaPago} onChange={(e) => setFormFormaPago(e.target.value)}>
                  {FORMA_PAGO.map((fp) => (
                    <option key={fp.clave} value={fp.clave}>
                      {fp.clave} - {fp.descripcion}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Metodo de Pago" required>
                <Select value={formMetodoPago} onChange={(e) => setFormMetodoPago(e.target.value)}>
                  {METODO_PAGO.map((mp) => (
                    <option key={mp.clave} value={mp.clave}>
                      {mp.clave} - {mp.descripcion}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Moneda">
                <Select value={formMoneda} onChange={(e) => setFormMoneda(e.target.value)}>
                  {MONEDA.map((m) => (
                    <option key={m.clave} value={m.clave}>
                      {m.clave} - {m.descripcion}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField
                label="Lugar de Expedicion (CP)"
                required
                error={formErrors.lugarExpedicion}
              >
                <Input
                  value={formLugarExpedicion}
                  onChange={(e) => setFormLugarExpedicion(e.target.value)}
                  placeholder="44100"
                  maxLength={5}
                />
              </FormField>
              <FormField label="Exportacion">
                <Select
                  value={formExportacion}
                  onChange={(e) => setFormExportacion(e.target.value)}
                >
                  {EXPORTACION.map((ex) => (
                    <option key={ex.clave} value={ex.clave}>
                      {ex.clave} - {ex.descripcion}
                    </option>
                  ))}
                </Select>
              </FormField>
              {branches.length > 0 && (
                <FormField label="Sucursal">
                  <Select value={formBranchId} onChange={(e) => setFormBranchId(e.target.value)}>
                    <option value="">Seleccionar sucursal</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
              )}
            </div>
          </div>

          {/* Section 2: Emisor */}
          <div className="rounded-lg border bg-white p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Emisor</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <FormField label="RFC Emisor">
                <Input
                  value={formEmisorRfc}
                  onChange={(e) => setFormEmisorRfc(e.target.value)}
                  placeholder="XAXX010101000"
                />
              </FormField>
              <FormField label="Nombre Emisor">
                <Input
                  value={formEmisorNombre}
                  onChange={(e) => setFormEmisorNombre(e.target.value)}
                  placeholder="Razon social del emisor"
                />
              </FormField>
              <FormField label="Regimen Fiscal Emisor">
                <Select
                  value={formEmisorRegimen}
                  onChange={(e) => setFormEmisorRegimen(e.target.value)}
                >
                  {REGIMEN_FISCAL.map((rf) => (
                    <option key={rf.clave} value={rf.clave}>
                      {rf.clave} - {rf.descripcion}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
          </div>

          {/* Section 3: Receptor */}
          <div className="rounded-lg border bg-white p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Receptor</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <FormField label="RFC Receptor" required error={formErrors.receptorRfc}>
                <Input
                  value={formReceptorRfc}
                  onChange={(e) => setFormReceptorRfc(e.target.value)}
                  placeholder="XAXX010101000"
                />
              </FormField>
              <FormField label="Nombre Receptor" required error={formErrors.receptorNombre}>
                <Input
                  value={formReceptorNombre}
                  onChange={(e) => setFormReceptorNombre(e.target.value)}
                  placeholder="Nombre o razon social"
                />
              </FormField>
              <FormField label="Regimen Fiscal Receptor" required>
                <Select
                  value={formReceptorRegimen}
                  onChange={(e) => setFormReceptorRegimen(e.target.value)}
                >
                  {REGIMEN_FISCAL.map((rf) => (
                    <option key={rf.clave} value={rf.clave}>
                      {rf.clave} - {rf.descripcion}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Uso CFDI" required>
                <Select
                  value={formReceptorUsoCfdi}
                  onChange={(e) => setFormReceptorUsoCfdi(e.target.value)}
                >
                  {USO_CFDI.map((u) => (
                    <option key={u.clave} value={u.clave}>
                      {u.clave} - {u.descripcion}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Domicilio Fiscal Receptor (CP)">
                <Input
                  value={formReceptorDomicilio}
                  onChange={(e) => setFormReceptorDomicilio(e.target.value)}
                  placeholder="44100"
                  maxLength={5}
                />
              </FormField>
            </div>
          </div>

          {/* Section 4: Conceptos */}
          <div className="rounded-lg border bg-white p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900">Conceptos</h2>
              {formErrors.conceptos && (
                <p className="text-destructive text-xs">{formErrors.conceptos}</p>
              )}
            </div>
            <div className="space-y-3">
              {formConceptos.map((c, idx) =>
                renderConceptoRow(
                  c,
                  idx,
                  formConceptos,
                  updateConcepto,
                  removeConcepto,
                  formErrors,
                ),
              )}
            </div>
            <Button variant="outline" size="sm" className="mt-3" onClick={addConcepto}>
              <Plus className="h-4 w-4" />
              Agregar Concepto
            </Button>
          </div>

          {/* Section 5: Totals */}
          <div className="rounded-lg border bg-white p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Totales</h2>
            <div className="space-y-2 text-right">
              <div className="flex justify-end gap-8">
                <span className="text-sm text-gray-500">Subtotal:</span>
                <span className="text-sm font-medium w-32">{formatMXN(createSubtotal)}</span>
              </div>
              <div className="flex justify-end gap-8">
                <span className="text-sm text-gray-500">IVA (16%):</span>
                <span className="text-sm font-medium w-32">{formatMXN(createIva)}</span>
              </div>
              <div className="flex justify-end gap-8 border-t pt-2">
                <span className="text-base font-semibold">Total:</span>
                <span className="text-base font-bold w-32">{formatMXN(createTotal)}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => resetCreateForm()} disabled={saving}>
              Limpiar
            </Button>
            <Button variant="outline" onClick={() => handleCreate(false)} disabled={saving}>
              <FileText className="h-4 w-4" />
              {saving ? "Guardando..." : "Guardar Borrador"}
            </Button>
            <Button onClick={() => handleCreate(true)} disabled={saving}>
              <FileCode className="h-4 w-4" />
              {saving ? "Generando..." : "Generar XML"}
            </Button>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 3: COMPLEMENTOS DE PAGO                                      */}
      {/* ================================================================= */}
      {activeTab === "Complementos de Pago" && (
        <div className="mt-6 space-y-8">
          {/* Section 1: Facturas Pendientes de Pago (PPD) */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-yellow-600" />
                <h2 className="text-lg font-semibold text-gray-900">
                  Facturas Pendientes de Pago (PPD)
                </h2>
              </div>
              <Button
                onClick={() => {
                  resetComplementForm();
                  setComplementModalOpen(true);
                }}
              >
                <CreditCard className="h-4 w-4" />
                Registrar Pago
              </Button>
            </div>

            {/* Search pending */}
            <div className="relative max-w-sm mb-4">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={pendingSearchTerm}
                onChange={(e) => setPendingSearchTerm(e.target.value)}
                placeholder="Buscar por folio, cliente o RFC..."
                className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm focus:border-gray-400 focus:outline-none focus:ring-0"
              />
            </div>

            {loadingComplements ? (
              <div className="text-center text-gray-400 py-8">Cargando...</div>
            ) : filteredPendingPayments.length === 0 ? (
              <div className="rounded-lg border bg-white px-4 py-8 text-center text-gray-400">
                No hay facturas PPD pendientes de pago
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left text-sm font-medium text-muted-foreground px-4 py-3">
                        Folio
                      </th>
                      <th className="text-left text-sm font-medium text-muted-foreground px-4 py-3">
                        Cliente
                      </th>
                      <th className="text-left text-sm font-medium text-muted-foreground px-4 py-3">
                        RFC
                      </th>
                      <th className="text-right text-sm font-medium text-muted-foreground px-4 py-3">
                        Total
                      </th>
                      <th className="text-right text-sm font-medium text-muted-foreground px-4 py-3">
                        Pagado
                      </th>
                      <th className="text-right text-sm font-medium text-muted-foreground px-4 py-3">
                        Saldo
                      </th>
                      <th className="text-left text-sm font-medium text-muted-foreground px-4 py-3">
                        Fecha
                      </th>
                      <th className="text-center text-sm font-medium text-muted-foreground px-4 py-3">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPendingPayments.map((pp, i) => (
                      <tr
                        key={pp.id}
                        className={`border-b last:border-0 ${
                          i % 2 === 0 ? "bg-white" : "bg-gray-50"
                        }`}
                      >
                        <td className="px-4 py-2.5 text-sm font-mono font-medium">
                          {pp.series || "A"}-{pp.folio}
                        </td>
                        <td className="px-4 py-2.5 text-sm max-w-[200px] truncate">
                          {pp.receiverName}
                        </td>
                        <td className="px-4 py-2.5 text-sm font-mono text-xs">{pp.receiverRfc}</td>
                        <td className="px-4 py-2.5 text-sm text-right font-medium">
                          {formatMXN(pp.total)}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-right text-green-600">
                          {formatMXN(pp.totalPaid)}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-right font-semibold text-yellow-600">
                          {formatMXN(pp.saldoPendiente)}
                        </td>
                        <td className="px-4 py-2.5 text-sm">{formatDate(pp.createdAt)}</td>
                        <td className="px-4 py-2.5 text-center">
                          <button
                            onClick={() => {
                              resetComplementForm();
                              addPendingToComplement(pp);
                              setComplementModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                          >
                            <DollarSign className="h-3 w-3" />
                            Registrar Pago
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section 2: Complementos Emitidos */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <h2 className="text-lg font-semibold text-gray-900">Complementos Emitidos</h2>
            </div>

            {/* Search complements */}
            <div className="relative max-w-sm mb-4">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={complementSearchTerm}
                onChange={(e) => setComplementSearchTerm(e.target.value)}
                placeholder="Buscar por folio, cliente o RFC..."
                className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm focus:border-gray-400 focus:outline-none focus:ring-0"
              />
            </div>

            {loadingComplements ? (
              <div className="text-center text-gray-400 py-8">Cargando...</div>
            ) : filteredComplements.length === 0 ? (
              <div className="rounded-lg border bg-white px-4 py-8 text-center text-gray-400">
                No hay complementos de pago emitidos
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left text-sm font-medium text-muted-foreground px-4 py-3">
                        Folio
                      </th>
                      <th className="text-left text-sm font-medium text-muted-foreground px-4 py-3">
                        Fecha Pago
                      </th>
                      <th className="text-left text-sm font-medium text-muted-foreground px-4 py-3">
                        Forma Pago
                      </th>
                      <th className="text-right text-sm font-medium text-muted-foreground px-4 py-3">
                        Monto
                      </th>
                      <th className="text-left text-sm font-medium text-muted-foreground px-4 py-3">
                        Cliente
                      </th>
                      <th className="text-left text-sm font-medium text-muted-foreground px-4 py-3">
                        Docs Relacionados
                      </th>
                      <th className="text-center text-sm font-medium text-muted-foreground px-4 py-3">
                        Estado
                      </th>
                      <th className="text-center text-sm font-medium text-muted-foreground px-4 py-3">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredComplements.map((comp, i) => {
                      const rawDocs = comp.complement?.relatedDocuments;
                      const relDocs: PaymentComplementRelatedDoc[] = Array.isArray(rawDocs)
                        ? rawDocs
                        : typeof rawDocs === "string"
                          ? (() => {
                              try {
                                return JSON.parse(rawDocs);
                              } catch {
                                return [];
                              }
                            })()
                          : [];
                      const formaPagoLabel =
                        FORMA_PAGO.find((fp) => fp.clave === comp.complement?.paymentForm)
                          ?.descripcion ||
                        comp.complement?.paymentForm ||
                        "---";
                      return (
                        <tr
                          key={comp.id}
                          className={`border-b last:border-0 ${
                            i % 2 === 0 ? "bg-white" : "bg-gray-50"
                          }`}
                        >
                          <td className="px-4 py-2.5 text-sm font-mono font-medium">
                            {comp.series || "P"}-{comp.folio}
                          </td>
                          <td className="px-4 py-2.5 text-sm">
                            {comp.complement?.paymentDate
                              ? formatDate(comp.complement.paymentDate)
                              : "---"}
                          </td>
                          <td className="px-4 py-2.5 text-sm">{formaPagoLabel}</td>
                          <td className="px-4 py-2.5 text-sm text-right font-medium">
                            {comp.complement ? formatMXN(num(comp.complement.amount)) : "---"}
                          </td>
                          <td className="px-4 py-2.5 text-sm max-w-[150px] truncate">
                            {comp.receiverName}
                          </td>
                          <td className="px-4 py-2.5 text-sm">
                            {relDocs.length > 0 ? (
                              <span className="text-xs text-gray-500">
                                {relDocs
                                  .map((d: PaymentComplementRelatedDoc) => `${d.serie}-${d.folio}`)
                                  .join(", ")}
                              </span>
                            ) : (
                              "---"
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <StatusBadge
                              label={STATUS_LABEL[comp.status] ?? comp.status}
                              variant={(STATUS_VARIANT[comp.status] as any) ?? "gray"}
                            />
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => openViewComplementModal(comp)}
                                className="p-1 hover:bg-muted rounded"
                                title="Ver detalle"
                              >
                                <Eye className="h-4 w-4 text-gray-500" />
                              </button>
                              {comp.xmlContent && (
                                <button
                                  onClick={() => handleDownloadComplementXml(comp)}
                                  className="p-1 hover:bg-green-50 rounded"
                                  title="Descargar XML"
                                >
                                  <Download className="h-4 w-4 text-green-600" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* Create Payment Complement Modal                                   */}
      {/* ================================================================= */}
      <Modal
        open={complementModalOpen}
        onClose={() => {
          setComplementModalOpen(false);
          resetComplementForm();
        }}
        title="Registrar Complemento de Pago"
        wide
      >
        <div className="space-y-6">
          {compErrors._form && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {compErrors._form}
            </div>
          )}

          {/* Payment info */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Datos del Pago</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField label="Fecha de Pago" required error={compErrors.paymentDate}>
                <Input
                  type="date"
                  value={compPaymentDate}
                  onChange={(e) => setCompPaymentDate(e.target.value)}
                />
              </FormField>
              <FormField label="Forma de Pago" required error={compErrors.paymentForm}>
                <Select
                  value={compPaymentForm}
                  onChange={(e) => setCompPaymentForm(e.target.value)}
                >
                  {FORMA_PAGO.filter((fp) => fp.clave !== "99").map((fp) => (
                    <option key={fp.clave} value={fp.clave}>
                      {fp.clave} - {fp.descripcion}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Moneda">
                <Select value={compCurrency} onChange={(e) => setCompCurrency(e.target.value)}>
                  {MONEDA.map((m) => (
                    <option key={m.clave} value={m.clave}>
                      {m.clave} - {m.descripcion}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
          </div>

          {/* Select related invoices */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Facturas Relacionadas</h3>
            {compErrors.docs && <p className="text-destructive text-xs mb-2">{compErrors.docs}</p>}

            {/* Add from pending list */}
            {pendingPayments.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-2">Seleccione facturas PPD pendientes:</p>
                <div className="max-h-40 overflow-y-auto border rounded-lg">
                  {pendingPayments
                    .filter((pp) => !compSelectedDocs.some((d) => d.cfdiId === pp.id))
                    .map((pp, i) => (
                      <button
                        key={pp.id}
                        onClick={() => addPendingToComplement(pp)}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center justify-between transition-colors ${
                          i % 2 === 0 ? "bg-white" : "bg-gray-50"
                        }`}
                      >
                        <span>
                          <span className="font-mono font-medium">
                            {pp.series || "A"}-{pp.folio}
                          </span>{" "}
                          - {pp.receiverName}
                        </span>
                        <span className="text-yellow-600 font-medium">
                          Saldo: {formatMXN(pp.saldoPendiente)}
                        </span>
                      </button>
                    ))}
                  {pendingPayments.filter((pp) => !compSelectedDocs.some((d) => d.cfdiId === pp.id))
                    .length === 0 && (
                    <p className="text-xs text-gray-400 px-3 py-4 text-center">
                      Todas las facturas pendientes ya fueron seleccionadas
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Selected documents with amount inputs */}
            {compSelectedDocs.length > 0 && (
              <div className="space-y-3">
                {compSelectedDocs.map((doc, idx) => (
                  <div
                    key={doc.cfdiId}
                    className="flex items-center gap-3 border rounded-lg p-3 bg-white"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{doc.label}</p>
                      <p className="text-xs text-gray-500">
                        Saldo anterior: {formatMXN(doc.maxAmount)}
                      </p>
                    </div>
                    <div className="w-40">
                      <FormField label="Monto a Aplicar" error={compErrors[`doc_${idx}_amount`]}>
                        <Input
                          type="number"
                          min={0.01}
                          max={doc.maxAmount}
                          step="0.01"
                          value={doc.amountPaid}
                          onChange={(e) => updateDocAmount(doc.cfdiId, Number(e.target.value))}
                        />
                      </FormField>
                    </div>
                    <div className="text-right w-32">
                      <p className="text-xs text-gray-500">Saldo insoluto</p>
                      <p className="text-sm font-medium">
                        {formatMXN(
                          Math.max(0, Math.round((doc.maxAmount - doc.amountPaid) * 100) / 100),
                        )}
                      </p>
                    </div>
                    <button
                      onClick={() => removeDocFromComplement(doc.cfdiId)}
                      className="p-1 hover:bg-red-50 rounded"
                      title="Quitar"
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Total */}
          <div className="border-t pt-4">
            <div className="flex justify-end gap-8">
              <span className="text-base font-semibold">Monto Total del Pago:</span>
              <span className="text-base font-bold w-32 text-right">
                {formatMXN(compTotalAmount)}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setComplementModalOpen(false);
                resetComplementForm();
              }}
              disabled={complementSaving}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreateComplement}
              disabled={complementSaving || compSelectedDocs.length === 0}
            >
              <CreditCard className="h-4 w-4" />
              {complementSaving ? "Generando..." : "Generar Complemento"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ================================================================= */}
      {/* View Payment Complement Modal                                     */}
      {/* ================================================================= */}
      <Modal
        open={viewComplementModalOpen}
        onClose={() => {
          setViewComplementModalOpen(false);
          setViewingComplement(null);
        }}
        title={`Complemento de Pago ${viewingComplement?.series || "P"}-${viewingComplement?.folio || ""}`}
        wide
      >
        {viewingComplement && (
          <div className="space-y-6">
            {/* Status */}
            <div className="flex items-center gap-3">
              <StatusBadge
                label={STATUS_LABEL[viewingComplement.status] ?? viewingComplement.status}
                variant={(STATUS_VARIANT[viewingComplement.status] as any) ?? "gray"}
              />
              {viewingComplement.uuid && (
                <span className="text-xs font-mono text-gray-400">
                  UUID: {viewingComplement.uuid}
                </span>
              )}
            </div>

            {/* Payment info */}
            {viewingComplement.complement && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Fecha de Pago</p>
                  <p className="font-medium">
                    {formatDate(viewingComplement.complement.paymentDate)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Forma de Pago</p>
                  <p className="font-medium">
                    {FORMA_PAGO.find((fp) => fp.clave === viewingComplement.complement?.paymentForm)
                      ?.descripcion || viewingComplement.complement.paymentForm}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Moneda</p>
                  <p className="font-medium">{viewingComplement.complement.currency}</p>
                </div>
                <div>
                  <p className="text-gray-500">Monto</p>
                  <p className="font-medium text-lg">
                    {formatMXN(num(viewingComplement.complement.amount))}
                  </p>
                </div>
              </div>
            )}

            {/* Receptor */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold mb-2">Receptor</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Nombre</p>
                  <p className="font-medium">{viewingComplement.receiverName}</p>
                </div>
                <div>
                  <p className="text-gray-500">RFC</p>
                  <p className="font-mono font-medium">{viewingComplement.receiverRfc}</p>
                </div>
              </div>
            </div>

            {/* Related documents */}
            {viewingComplement.complement &&
              Array.isArray(viewingComplement.complement.relatedDocuments) &&
              viewingComplement.complement.relatedDocuments.length > 0 && (
                <div className="border-t pt-4">
                  <h3 className="text-sm font-semibold mb-2">Documentos Relacionados</h3>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2">
                            Folio
                          </th>
                          <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2">
                            UUID
                          </th>
                          <th className="text-center text-xs font-medium text-muted-foreground px-3 py-2">
                            Parcialidad
                          </th>
                          <th className="text-right text-xs font-medium text-muted-foreground px-3 py-2">
                            Saldo Ant.
                          </th>
                          <th className="text-right text-xs font-medium text-muted-foreground px-3 py-2">
                            Pagado
                          </th>
                          <th className="text-right text-xs font-medium text-muted-foreground px-3 py-2">
                            Saldo Ins.
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewingComplement.complement.relatedDocuments.map(
                          (doc: PaymentComplementRelatedDoc, i: number) => (
                            <tr key={i} className="border-b last:border-0">
                              <td className="px-3 py-2 text-xs font-mono font-medium">
                                {doc.serie}-{doc.folio}
                              </td>
                              <td className="px-3 py-2 text-[11px] font-mono text-gray-400 max-w-[150px] truncate">
                                {doc.uuid}
                              </td>
                              <td className="px-3 py-2 text-xs text-center">
                                {doc.numParcialidad}
                              </td>
                              <td className="px-3 py-2 text-xs text-right">
                                {formatMXN(doc.saldoAnterior)}
                              </td>
                              <td className="px-3 py-2 text-xs text-right font-medium text-green-600">
                                {formatMXN(doc.amountPaid)}
                              </td>
                              <td className="px-3 py-2 text-xs text-right font-medium">
                                {formatMXN(doc.saldoInsoluto)}
                              </td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              {viewingComplement.xmlContent && (
                <Button
                  variant="outline"
                  onClick={() => handleDownloadComplementXml(viewingComplement)}
                >
                  <Download className="h-4 w-4" />
                  Descargar XML
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => {
                  setViewComplementModalOpen(false);
                  setViewingComplement(null);
                }}
              >
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ================================================================= */}
      {/* TAB 4: CATALOGOS SAT                                              */}
      {/* ================================================================= */}
      {activeTab === "Catalogos SAT" && (
        <div className="mt-6">
          {/* Catalog sub-tabs */}
          <div className="flex flex-wrap gap-2 mb-4">
            {ALL_CATALOGS.map((cat) => (
              <button
                key={cat.name}
                onClick={() => {
                  setActiveCatalog(cat.name);
                  setCatalogSearch("");
                }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  activeCatalog === cat.name
                    ? "bg-primary text-primary-foreground"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative max-w-sm mb-4">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              placeholder="Buscar por clave o descripcion..."
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm focus:border-gray-400 focus:outline-none focus:ring-0"
            />
          </div>

          {/* Catalog table */}
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left text-sm font-medium text-muted-foreground px-4 py-3 w-32">
                    Clave
                  </th>
                  <th className="text-left text-sm font-medium text-muted-foreground px-4 py-3">
                    Descripcion
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredCatalogData.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-4 py-8 text-center text-muted-foreground">
                      No se encontraron resultados
                    </td>
                  </tr>
                ) : (
                  filteredCatalogData.map((item, i) => (
                    <tr
                      key={item.clave}
                      className={`border-b last:border-0 ${
                        i % 2 === 0 ? "bg-white" : "bg-gray-50"
                      }`}
                    >
                      <td className="px-4 py-2.5 text-sm font-mono font-medium">{item.clave}</td>
                      <td className="px-4 py-2.5 text-sm text-gray-700">{item.descripcion}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* View Modal (read-only for non-DRAFT invoices)                     */}
      {/* ================================================================= */}
      <Modal
        open={viewModalOpen}
        onClose={() => {
          setViewModalOpen(false);
          setViewingCfdi(null);
        }}
        title={`Factura ${viewingCfdi?.series || "A"}-${viewingCfdi?.folio || ""}`}
        wide
      >
        {viewingCfdi && (
          <div className="space-y-6">
            {/* Status */}
            <div className="flex items-center gap-3">
              <StatusBadge
                label={STATUS_LABEL[viewingCfdi.status] ?? viewingCfdi.status}
                variant={(STATUS_VARIANT[viewingCfdi.status] as any) ?? "gray"}
              />
              {viewingCfdi.uuid && (
                <span className="text-xs font-mono text-gray-400">UUID: {viewingCfdi.uuid}</span>
              )}
            </div>

            {/* General info */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Fecha</p>
                <p className="font-medium">{formatDate(viewingCfdi.createdAt)}</p>
              </div>
              <div>
                <p className="text-gray-500">Forma de Pago</p>
                <p className="font-medium">
                  {FORMA_PAGO.find((fp) => fp.clave === viewingCfdi.paymentForm)?.descripcion ||
                    viewingCfdi.paymentForm ||
                    "---"}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Metodo de Pago</p>
                <p className="font-medium">
                  {METODO_PAGO.find((mp) => mp.clave === viewingCfdi.paymentMethod)?.descripcion ||
                    viewingCfdi.paymentMethod ||
                    "---"}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Moneda</p>
                <p className="font-medium">{viewingCfdi.currency}</p>
              </div>
              <div>
                <p className="text-gray-500">Lugar de Expedicion</p>
                <p className="font-medium">{viewingCfdi.lugarExpedicion || "---"}</p>
              </div>
            </div>

            {/* Emisor */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold mb-2">Emisor</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">RFC</p>
                  <p className="font-mono font-medium">{viewingCfdi.issuerRfc}</p>
                </div>
                <div>
                  <p className="text-gray-500">Nombre</p>
                  <p className="font-medium">{viewingCfdi.issuerName}</p>
                </div>
                <div>
                  <p className="text-gray-500">Regimen Fiscal</p>
                  <p className="font-medium">
                    {REGIMEN_FISCAL.find((rf) => rf.clave === viewingCfdi.issuerRegimen)
                      ?.descripcion || viewingCfdi.issuerRegimen}
                  </p>
                </div>
              </div>
            </div>

            {/* Receptor */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold mb-2">Receptor</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">RFC</p>
                  <p className="font-mono font-medium">{viewingCfdi.receiverRfc}</p>
                </div>
                <div>
                  <p className="text-gray-500">Nombre</p>
                  <p className="font-medium">{viewingCfdi.receiverName}</p>
                </div>
                <div>
                  <p className="text-gray-500">Regimen Fiscal</p>
                  <p className="font-medium">
                    {REGIMEN_FISCAL.find((rf) => rf.clave === viewingCfdi.receiverRegimen)
                      ?.descripcion ||
                      viewingCfdi.receiverRegimen ||
                      "---"}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Uso CFDI</p>
                  <p className="font-medium">
                    {USO_CFDI.find((u) => u.clave === viewingCfdi.receiverUsoCfdi)?.descripcion ||
                      viewingCfdi.receiverUsoCfdi}
                  </p>
                </div>
              </div>
            </div>

            {/* Conceptos */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold mb-2">Conceptos</h3>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2">
                        Clave
                      </th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2">
                        Descripcion
                      </th>
                      <th className="text-right text-xs font-medium text-muted-foreground px-3 py-2">
                        Cantidad
                      </th>
                      <th className="text-right text-xs font-medium text-muted-foreground px-3 py-2">
                        P. Unitario
                      </th>
                      <th className="text-right text-xs font-medium text-muted-foreground px-3 py-2">
                        Importe
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(viewingCfdi.concepts || []).map((c, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-3 py-2 text-xs font-mono">{c.satClaveProdServ}</td>
                        <td className="px-3 py-2 text-xs">{c.description}</td>
                        <td className="px-3 py-2 text-xs text-right">{num(c.quantity)}</td>
                        <td className="px-3 py-2 text-xs text-right">
                          {formatMXN(num(c.unitPrice))}
                        </td>
                        <td className="px-3 py-2 text-xs text-right font-medium">
                          {formatMXN(num(c.amount))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Totals */}
            <div className="border-t pt-4 space-y-1 text-sm text-right">
              <div>
                Subtotal:{" "}
                <span className="font-medium">{formatMXN(num(viewingCfdi.subtotal))}</span>
              </div>
              <div className="text-base font-semibold">
                Total: {formatMXN(num(viewingCfdi.total))}
              </div>
            </div>

            {/* Attachments */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Archivos Adjuntos</h3>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  <Paperclip className="h-3.5 w-3.5" />
                  {attachmentUploading ? "Subiendo..." : "Adjuntar Archivo"}
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => handleAttachFile(e, viewingCfdi)}
                    disabled={attachmentUploading}
                  />
                </label>
              </div>
              {Array.isArray(viewingCfdi.attachments) && viewingCfdi.attachments.length > 0 ? (
                <ul className="space-y-2">
                  {viewingCfdi.attachments.map((att, idx) => (
                    <li
                      key={idx}
                      className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 shrink-0 text-gray-400" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{att.filename}</p>
                          <p className="text-[11px] text-gray-400">
                            {formatFileSize(att.size)}
                            {att.uploadedAt && ` - ${formatDate(att.uploadedAt)}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <a
                          href={`${fileBaseUrl}${att.url}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted transition-colors"
                          title="Descargar"
                        >
                          <Download className="h-4 w-4" />
                        </a>
                        <button
                          onClick={() => handleRemoveAttachment(viewingCfdi, idx)}
                          className="p-1 text-muted-foreground hover:text-destructive rounded hover:bg-red-50 transition-colors"
                          title="Eliminar adjunto"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-gray-400">No hay archivos adjuntos</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              {viewingCfdi.status === "STAMPED" && (
                <>
                  <Button variant="outline" onClick={() => handleDownloadXml(viewingCfdi)}>
                    <Download className="h-4 w-4" />
                    Descargar XML
                  </Button>
                  <Button variant="outline" onClick={() => generateInvoicePDF(viewingCfdi)}>
                    <FileText className="h-4 w-4" />
                    Descargar PDF
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      setViewModalOpen(false);
                      openCancelModal(viewingCfdi);
                    }}
                  >
                    <XCircle className="h-4 w-4" />
                    Cancelar Factura
                  </Button>
                </>
              )}
              <Button
                variant="outline"
                onClick={() => {
                  setViewModalOpen(false);
                  setViewingCfdi(null);
                }}
              >
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ================================================================= */}
      {/* Edit Modal (only for DRAFT invoices)                              */}
      {/* ================================================================= */}
      <Modal
        open={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setEditingCfdi(null);
        }}
        title={`Editar Factura ${editingCfdi?.series || "A"}-${editingCfdi?.folio || ""}`}
        wide
      >
        <div className="space-y-6">
          {editFormErrors._form && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {editFormErrors._form}
            </div>
          )}

          {/* General */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Datos Generales</h3>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Serie">
                <Input value={editFormSerie} onChange={(e) => setEditFormSerie(e.target.value)} />
              </FormField>
              <FormField label="Fecha">
                <Input
                  type="date"
                  value={editFormFecha}
                  onChange={(e) => setEditFormFecha(e.target.value)}
                />
              </FormField>
              <FormField label="Forma de Pago">
                <Select
                  value={editFormFormaPago}
                  onChange={(e) => setEditFormFormaPago(e.target.value)}
                >
                  {FORMA_PAGO.map((fp) => (
                    <option key={fp.clave} value={fp.clave}>
                      {fp.clave} - {fp.descripcion}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Metodo de Pago">
                <Select
                  value={editFormMetodoPago}
                  onChange={(e) => setEditFormMetodoPago(e.target.value)}
                >
                  {METODO_PAGO.map((mp) => (
                    <option key={mp.clave} value={mp.clave}>
                      {mp.clave} - {mp.descripcion}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Moneda">
                <Select value={editFormMoneda} onChange={(e) => setEditFormMoneda(e.target.value)}>
                  {MONEDA.map((m) => (
                    <option key={m.clave} value={m.clave}>
                      {m.clave} - {m.descripcion}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Lugar de Expedicion (CP)">
                <Input
                  value={editFormLugarExpedicion}
                  onChange={(e) => setEditFormLugarExpedicion(e.target.value)}
                  placeholder="44100"
                  maxLength={5}
                />
              </FormField>
              <FormField label="Exportacion">
                <Select
                  value={editFormExportacion}
                  onChange={(e) => setEditFormExportacion(e.target.value)}
                >
                  {EXPORTACION.map((ex) => (
                    <option key={ex.clave} value={ex.clave}>
                      {ex.clave} - {ex.descripcion}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
          </div>

          {/* Receptor */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Receptor</h3>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="RFC Receptor" required error={editFormErrors.receptorRfc}>
                <Input
                  value={editFormReceptorRfc}
                  onChange={(e) => setEditFormReceptorRfc(e.target.value)}
                  placeholder="XAXX010101000"
                />
              </FormField>
              <FormField label="Nombre Receptor" required error={editFormErrors.receptorNombre}>
                <Input
                  value={editFormReceptorNombre}
                  onChange={(e) => setEditFormReceptorNombre(e.target.value)}
                  placeholder="Nombre o razon social"
                />
              </FormField>
              <FormField label="Regimen Fiscal Receptor">
                <Select
                  value={editFormReceptorRegimen}
                  onChange={(e) => setEditFormReceptorRegimen(e.target.value)}
                >
                  {REGIMEN_FISCAL.map((rf) => (
                    <option key={rf.clave} value={rf.clave}>
                      {rf.clave} - {rf.descripcion}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Uso CFDI">
                <Select
                  value={editFormReceptorUsoCfdi}
                  onChange={(e) => setEditFormReceptorUsoCfdi(e.target.value)}
                >
                  {USO_CFDI.map((u) => (
                    <option key={u.clave} value={u.clave}>
                      {u.clave} - {u.descripcion}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Domicilio Fiscal Receptor (CP)">
                <Input
                  value={editFormReceptorDomicilio}
                  onChange={(e) => setEditFormReceptorDomicilio(e.target.value)}
                  placeholder="44100"
                  maxLength={5}
                />
              </FormField>
            </div>
          </div>

          {/* Conceptos */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Conceptos</h3>
              {editFormErrors.conceptos && (
                <p className="text-destructive text-xs">{editFormErrors.conceptos}</p>
              )}
            </div>
            <div className="space-y-3">
              {editFormConceptos.map((c, idx) =>
                renderConceptoRow(
                  c,
                  idx,
                  editFormConceptos,
                  updateEditConcepto,
                  removeEditConcepto,
                  editFormErrors,
                ),
              )}
            </div>
            <Button variant="outline" size="sm" className="mt-3" onClick={addEditConcepto}>
              <Plus className="h-4 w-4" />
              Agregar Concepto
            </Button>
          </div>

          {/* Totals */}
          <div className="border-t pt-4 space-y-1 text-sm text-right">
            <div>
              Subtotal: <span className="font-medium">{formatMXN(editSubtotal)}</span>
            </div>
            <div>
              IVA 16%: <span className="font-medium">{formatMXN(editIva)}</span>
            </div>
            <div className="text-base font-semibold">Total: {formatMXN(editTotal)}</div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setEditModalOpen(false);
                setEditingCfdi(null);
              }}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button onClick={handleUpdate} disabled={saving}>
              <Send className="h-4 w-4" />
              {saving ? "Guardando..." : "Actualizar Factura"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ================================================================= */}
      {/* Cancel Confirmation Modal                                         */}
      {/* ================================================================= */}
      <Modal
        open={cancelModalOpen}
        onClose={() => {
          setCancelModalOpen(false);
          setCancellingCfdi(null);
        }}
        title="Cancelar Factura"
      >
        {cancellingCfdi && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Estas a punto de cancelar la factura{" "}
              <span className="font-semibold">
                {cancellingCfdi.series || "A"}-{cancellingCfdi.folio}
              </span>
              . Esta accion no se puede deshacer.
            </p>

            <FormField label="Motivo de Cancelacion" required>
              <Select value={cancelMotivo} onChange={(e) => setCancelMotivo(e.target.value)}>
                {MOTIVOS_CANCELACION.map((m) => (
                  <option key={m.clave} value={m.clave}>
                    {m.clave} - {m.descripcion}
                  </option>
                ))}
              </Select>
            </FormField>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setCancelModalOpen(false);
                  setCancellingCfdi(null);
                }}
                disabled={saving}
              >
                No, regresar
              </Button>
              <Button variant="destructive" onClick={handleCancel} disabled={saving}>
                <XCircle className="h-4 w-4" />
                {saving ? "Cancelando..." : "Si, cancelar factura"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
