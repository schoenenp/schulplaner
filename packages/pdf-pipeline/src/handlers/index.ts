import type { ModuleHandler } from "../types";

// Import all handlers explicitly
// To add a new handler:
// 1. Create your-handler.handler.ts in this directory
// 2. Import it below
// 3. Add it to the allHandlers array
import coverHandler from "./cover.handler";
import plannerHandler from "./planner.handler";
import defaultHandler from "./default.handler";

// Register all handlers here
const allHandlers: ModuleHandler[] = [
  coverHandler,
  plannerHandler,
  defaultHandler,
  // Add new handlers here:
  // calendarHandler,
  // infoHandler,
  // schoolRulesHandler,
];

/**
 * Handler Registry - manages all module handlers
 *
 * The registry maps module types to their handlers and provides
 * a fallback to the default handler for unknown types.
 */
class HandlerRegistry {
  private handlers: Map<string, ModuleHandler>;
  private defaultHandler: ModuleHandler;

  constructor(handlers: ModuleHandler[]) {
    this.handlers = new Map();
    this.defaultHandler = defaultHandler;

    for (const handler of handlers) {
      if (handler.moduleType === "default") {
        this.defaultHandler = handler;
      }
      this.handlers.set(handler.moduleType, handler);
    }
  }

  /**
   * Get a handler by module type
   * @returns The handler or undefined if not found
   */
  get(moduleType: string): ModuleHandler | undefined {
    return this.handlers.get(moduleType);
  }

  /**
   * Get a handler by module type, falling back to default handler
   * @returns The handler or the default handler
   */
  getOrDefault(moduleType: string): ModuleHandler {
    return this.handlers.get(moduleType) ?? this.defaultHandler;
  }

  /**
   * Check if a handler exists for a module type
   */
  has(moduleType: string): boolean {
    return this.handlers.has(moduleType);
  }

  /**
   * Get all registered handler types
   */
  getRegisteredTypes(): string[] {
    return Array.from(this.handlers.keys());
  }
}

// Export the singleton registry instance
export const registry = new HandlerRegistry(allHandlers);

// Re-export the base handler for creating new handlers
export { BaseHandler } from "./base.handler";
