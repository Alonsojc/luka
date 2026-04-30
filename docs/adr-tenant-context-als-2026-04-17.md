# ADR: contexto de tenant por request con AsyncLocalStorage

Fecha: 17 de abril de 2026.
Estado: aceptado para Sprint 1 / PR 1.1.

## Contexto

El backend aplicaba scoping multi-tenant en Prisma leyendo `organizationId` desde un objeto global mutable. Bajo concurrencia, dos requests podían pisar ese valor compartido y contaminar consultas cruzadas entre organizaciones.

## Decision

Mover el contexto de tenant a `AsyncLocalStorage` y abrirlo desde un interceptor global por request. Prisma mantiene el guardrail de inyectar `organizationId` en lecturas de modelos multi-tenant, pero ahora obtiene ese dato desde un store aislado por request.

## Consecuencias

- Eliminamos el estado global compartido en el path principal de requests.
- El guardrail sigue centralizado en Prisma y no depende de recordar filtros manuales en cada servicio.
- Las pruebas de concurrencia validan que dos requests solapados no hereden el tenant incorrecto.
- Los jobs o tareas fuera del ciclo HTTP no reciben tenant implícito; deben seguir pasando `organizationId` de forma explicita cuando corresponda.
- Las requests autenticadas que lleguen sin `organizationId` fallan rapido en lecturas multi-tenant, en vez de ejecutar consultas sin scope.
