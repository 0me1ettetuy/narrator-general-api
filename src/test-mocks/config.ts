export class ConfigService {
  get<T = undefined>(key: string): T | undefined {
    void key;

    return undefined;
  }

  getOrThrow<T = never>(key: string): T {
    throw new Error(`${key} is not configured`);
  }
}
