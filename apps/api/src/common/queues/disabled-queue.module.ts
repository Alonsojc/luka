import { DynamicModule, Module, Provider } from "@nestjs/common";
import { getQueueToken } from "@nestjs/bullmq";
import type { Queue } from "bullmq";

type DisabledQueue = Pick<
  Queue,
  "add" | "clean" | "getFailed" | "getJobCounts" | "getJobs" | "close" | "disconnect"
> & {
  name: string;
  client: Promise<{ ping: () => Promise<string> }>;
};

export function areQueuesDisabled(): boolean {
  return process.env.QUEUE_MODE === "disabled" || process.env.DISABLE_QUEUES === "true";
}

function createDisabledQueue(name: string): DisabledQueue {
  return {
    name,
    add: async () => {
      throw new Error(`Queue ${name} is disabled`);
    },
    clean: async () => [],
    getFailed: async () => [],
    getJobCounts: async () => ({
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
    }),
    getJobs: async () => [],
    close: async () => {},
    disconnect: async () => {},
    client: Promise.resolve({
      ping: async () => "DISABLED",
    }),
  };
}

@Module({})
export class DisabledQueueModule {
  static register(...queueNames: string[]): DynamicModule {
    const providers: Provider[] = queueNames.map((name) => ({
      provide: getQueueToken(name),
      useValue: createDisabledQueue(name),
    }));

    return {
      module: DisabledQueueModule,
      providers,
      exports: providers,
    };
  }
}
