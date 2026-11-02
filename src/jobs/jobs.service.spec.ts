import type { Queue } from 'bullmq';
import { JobsService } from './jobs.service.js';

type QueuedJob = { state: string };

function createQueue() {
  const jobs = new Map<string, QueuedJob>();
  const queue = {
    jobs,
    getJob: jest.fn((jobId: string) => {
      const job = jobs.get(jobId);

      return Promise.resolve(
        job && {
          getState: () => Promise.resolve(job.state),
          remove: () => Promise.resolve(void jobs.delete(jobId)),
        },
      );
    }),
    add: jest.fn((_name: string, _data: unknown, options: { jobId: string }) =>
      Promise.resolve(void jobs.set(options.jobId, { state: 'waiting' })),
    ),
  };

  return queue;
}

describe('JobsService', () => {
  let parsing: ReturnType<typeof createQueue>;
  let localTts: ReturnType<typeof createQueue>;
  let fishTts: ReturnType<typeof createQueue>;
  let merge: ReturnType<typeof createQueue>;
  let service: JobsService;

  beforeEach(() => {
    parsing = createQueue();
    localTts = createQueue();
    fishTts = createQueue();
    merge = createQueue();
    service = new JobsService(
      parsing as unknown as Queue,
      localTts as unknown as Queue,
      fishTts as unknown as Queue,
      merge as unknown as Queue,
    );
  });

  it('puts Fish chapters on the Fish queue and local chapters on the local queue', async () => {
    await service.enqueueChapterSynthesis('fish-job', 'FISH');
    await service.enqueueChapterSynthesis('local-job', 'LOCAL');

    expect([...fishTts.jobs.keys()]).toEqual(['fish-job']);
    expect([...localTts.jobs.keys()]).toEqual(['local-job']);
  });

  it('does not enqueue a chapter that is already running on either queue', async () => {
    localTts.jobs.set('job-id', { state: 'active' });

    await service.enqueueChapterSynthesis('job-id', 'FISH');

    expect(fishTts.add).not.toHaveBeenCalled();
    expect(localTts.jobs.get('job-id')).toEqual({ state: 'active' });
  });

  it('moves a waiting chapter to the queue that matches its model', async () => {
    localTts.jobs.set('job-id', { state: 'waiting' });

    await service.enqueueChapterSynthesis('job-id', 'FISH');

    expect(localTts.jobs.has('job-id')).toBe(false);
    expect(fishTts.jobs.get('job-id')).toEqual({ state: 'waiting' });
  });

  it('cancels a waiting chapter on whichever queue holds it', async () => {
    fishTts.jobs.set('fish-job', { state: 'waiting' });
    localTts.jobs.set('local-job', { state: 'delayed' });

    await service.cancelChapterSynthesis('fish-job');
    await service.cancelChapterSynthesis('local-job');

    expect(fishTts.jobs.size).toBe(0);
    expect(localTts.jobs.size).toBe(0);
  });

  it('removes inactive chapter jobs from both queues but leaves running ones', async () => {
    fishTts.jobs.set('job-id', { state: 'active' });
    localTts.jobs.set('job-id', { state: 'failed' });

    await service.removeChapterSynthesis('job-id');

    expect(fishTts.jobs.get('job-id')).toEqual({ state: 'active' });
    expect(localTts.jobs.has('job-id')).toBe(false);
  });
});
