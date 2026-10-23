import 'vitest';

declare module 'vitest' {
  export interface ProvidedContext {
    megaSmokeLink: string;
  }
}
