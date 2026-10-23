export type LibraryOperations = {
  open: { args: { bytes: ArrayBuffer }; result: void };
  countBooks: { args: Record<string, never>; result: number };
};

export type Operation = keyof LibraryOperations;

export type LibraryRequest = {
  [Op in Operation]: { id: number; op: Op } & LibraryOperations[Op]['args'];
}[Operation];

export type LibraryResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: { name: string; message: string } };
