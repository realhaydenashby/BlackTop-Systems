import type { IntegrationProvider, IntegrationRegistry } from "./types";
import { yodleeProvider } from "./yodlee";

class ProviderRegistry implements IntegrationRegistry {
  private providers: Map<string, IntegrationProvider> = new Map();

  register(provider: IntegrationProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: string): IntegrationProvider | undefined {
    return this.providers.get(name);
  }

  list(): string[] {
    return Array.from(this.providers.keys());
  }
}

export const integrationRegistry = new ProviderRegistry();

integrationRegistry.register(yodleeProvider);
