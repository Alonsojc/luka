import { Injectable } from "@nestjs/common";
import { AsyncLocalStorage } from "node:async_hooks";

export interface TenantContextStore {
  organizationId?: string;
  requireTenant?: boolean;
}

@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<TenantContextStore>();

  run<T>(store: TenantContextStore, callback: () => T): T {
    return this.storage.run(store, callback);
  }

  getStore(): TenantContextStore | undefined {
    return this.storage.getStore();
  }

  getOrganizationId(): string | undefined {
    return this.getStore()?.organizationId;
  }

  isTenantRequired(): boolean {
    return this.getStore()?.requireTenant ?? false;
  }
}
