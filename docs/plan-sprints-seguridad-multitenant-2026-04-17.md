# Plan en sprints: endurecimiento técnico Luka

Fecha base: 17 de abril de 2026.
Horizonte inicial: 30 días (4 sprints semanales).

## Objetivo del plan

Reducir riesgo operativo y de seguridad multi-tenant sin frenar entrega de producto, priorizando:

1. Aislamiento fuerte por tenant bajo concurrencia.
2. Evidencia E2E de seguridad entre organizaciones.
3. Observabilidad para operar por SLOs.
4. Optimización de feedback en CI y deuda de tipado.

## Principios de ejecución

- **Seguridad primero**: ningún sprint cierra sin pruebas de no-regresión de aislamiento.
- **Entrega incremental**: cada semana debe dejar artefactos desplegables y medibles.
- **Métricas antes de optimizar**: no ajustar performance sin baseline p95/p99.
- **Cambios reversibles**: feature flags/migración gradual para piezas críticas.

---

## Sprint 0 (preparación, 2–3 días)

> Recomendado antes de Semana 1 para reducir riesgos de implementación.

### Alcance

- Definir ADR corto para estrategia de contexto de tenant (AsyncLocalStorage vs inyección explícita).
- Acordar endpoints críticos para SLO inicial (auth, inventario, facturación, colas).
- Diseñar matriz de pruebas E2E multi-tenant (lectura cruzada, escritura cruzada, exportaciones, filtros por sucursal).

### Entregables

- ADR aprobado.
- Backlog técnico priorizado con estimaciones.
- Checklist de seguridad por release (v1).

### Criterios de salida

- Decisión de arquitectura documentada.
- Historias del Sprint 1 refinadas y listas para implementación.

---

## Sprint 1 (Semana 1): aislamiento de tenant en concurrencia

### Objetivo

Eliminar riesgo de contaminación de tenant entre requests concurrentes.

### Historias sugeridas

1. **Migrar `tenantCtx` global a contexto por request (AsyncLocalStorage)**.
2. **Propagar `organizationId` de forma explícita en servicios/repos críticos** (en rutas de más riesgo).
3. **Agregar pruebas de concurrencia** que simulen requests paralelos de múltiples organizaciones.
4. **Agregar guardrails** (validación centralizada para bloquear consultas sin tenant cuando aplique).

### Criterios de aceptación

- No existe estado mutable global para tenant en el path principal de requests.
- Suite de concurrencia falla si hay leak cross-tenant y pasa en implementación final.
- Logs de auditoría incluyen `organizationId` consistente por request.

### Riesgos y mitigación

- **Riesgo**: ruptura en servicios legacy que asumían contexto global.
  - **Mitigación**: migración por módulos + fallback temporal controlado por flag.

---

## Sprint 2 (Semana 2): observabilidad y trazabilidad operativa

### Objetivo

Poder detectar degradaciones y errores por módulo con datos accionables.

### Historias sugeridas

1. Instrumentar OpenTelemetry (traces + métricas básicas) en:
   - Auth
   - Inventarios
   - Facturación
   - Colas
2. Definir SLO iniciales (ejemplo):
   - p95 y p99 por endpoint crítico
   - Error rate por módulo
   - Latencia y tasa de fallo en jobs de cola
3. Fortalecer `forgotPassword`:
   - `await` en envío de email
   - logging estructurado
   - métricas de intento/éxito/fallo

### Criterios de aceptación

- Dashboard mínimo operativo con 4 dominios críticos.
- Alertas básicas por umbral de error y latencia.
- Flujo `forgotPassword` auditable de extremo a extremo.

### Riesgos y mitigación

- **Riesgo**: overhead de telemetría en endpoints críticos.
  - **Mitigación**: sampling configurable y revisión de cardinalidad de labels.

---

## Sprint 3 (Semana 3): velocidad de feedback + reducción de deuda de tipos

### Objetivo

Disminuir tiempo de ciclo en CI y reducir superficie de errores por tipado laxo.

### Historias sugeridas

1. Desacoplar `lint` de `^build` en Turborepo para feedback rápido en PR.
2. Priorizar remoción de `any` en módulos de mayor riesgo de negocio:
   - extensiones Prisma sensibles
   - colas
   - servicios core de dominio
3. Establecer regla incremental:
   - no introducir nuevos `any` en módulos priorizados
   - debt budget semanal para reducir existentes

### Criterios de aceptación

- Tiempo de validación de lint en CI reducido (objetivo sugerido: -30% o más vs baseline).
- Reducción medible de `any` en rutas críticas.
- PR template actualizado con chequeos de tipado.

### Riesgos y mitigación

- **Riesgo**: fricción inicial por errores de tipado emergentes.
  - **Mitigación**: rollout por carpetas y pairing técnico en módulos complejos.

---

## Sprint 4 (Semana 4): E2E de seguridad + performance focalizada

### Objetivo

Cerrar brechas de seguridad operacional y validar rendimiento en escenarios reales.

### Historias sugeridas

1. Implementar smoke E2E multi-tenant para release gate:
   - lectura cruzada bloqueada
   - escritura cruzada bloqueada
   - exportaciones aisladas por organización
   - filtros de sucursal respetan contexto de tenant
2. Aplicar checklist de seguridad por release en pipeline.
3. Revisar performance de reportes/consultas agregadas SQL-Prisma con datos representativos.
4. Ajustar índices y/o consultas de hot paths identificados por métricas.

### Criterios de aceptación

- Release bloqueado si falla cualquier test E2E de aislamiento multi-tenant.
- Mejora medible en p95/p99 de reportes priorizados.
- Documentación de runbook de incidentes actualizada.

### Riesgos y mitigación

- **Riesgo**: datasets de prueba no representativos.
  - **Mitigación**: fixtures cercanos a producción (anonimizados) y pruebas de carga dirigidas.

---

## Backlog transversal (corre en paralelo durante los 4 sprints)

1. **CORS multi-dominio por ambiente** (panel, admin, staging) con validación explícita.
2. **Unificación de manejo 401/redirect de sesión** para evitar edge cases entre cliente API y hooks.
3. **Reducir ruido de logging de email en desarrollo** (redacción parcial + flags de debug).
4. **Eliminar mantenimiento manual de `ORG_SCOPED_MODELS`**:
   - generación automática desde metadatos/schema
   - o enforcement central en capa de acceso a datos

---

## Métricas de éxito del plan de 30 días

- **Seguridad**: 0 incidentes de cross-tenant leak en pruebas de concurrencia y E2E.
- **Operación**: dashboard y alertas activas con cobertura de módulos críticos.
- **Velocidad**: reducción del tiempo medio de feedback de CI en PRs.
- **Calidad**: tendencia descendente de `any` en módulos priorizados.

## Propuesta de capacidad por sprint (equipo pequeño)

- 60% capacidad: iniciativas de prioridad alta del sprint.
- 25% capacidad: hardening transversal y deuda técnica.
- 15% capacidad: bugs/imprevistos operativos.

## Definición de Done (DoD) recomendada para este plan

Una historia solo se considera terminada si incluye:

- Implementación + pruebas automáticas relevantes.
- Telemetría/logs suficientes para operación.
- Documentación mínima (decisión técnica o runbook según aplique).
- Evidencia en CI y criterios de aceptación cumplidos.
