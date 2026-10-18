import { Inject } from '@nestjs/common';

export const getQueueToken = (name = 'default'): string => `BullQueue_${name}`;

export const InjectQueue = (name?: string) => Inject(getQueueToken(name));
