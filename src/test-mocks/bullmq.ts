import { Inject } from '@nestjs/common';

export const getQueueToken = (name = 'default'): string => `BullQueue_${name}`;

export const InjectQueue = (name?: string) => Inject(getQueueToken(name));

export const Processor = (...args: unknown[]): ClassDecorator => {
  void args;

  return () => undefined;
};

export class WorkerHost {
  process(...args: unknown[]): Promise<unknown> {
    void args;

    return Promise.resolve(undefined);
  }
}
