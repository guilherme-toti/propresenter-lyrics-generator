import { createReadStream } from "node:fs";

/**
 * A file (or a byte range of it) as a web stream for a Response body. Pull-based on purpose:
 * `Readable.toWeb` keeps pushing chunks after the browser cancels — which <video> does on every
 * seek and after reading a first frame — and each late push throws "Controller is already closed"
 * as an uncaught exception in the server. Here a chunk is only read when the stream asks for one,
 * and cancelling closes the file. Only Node built-ins are imported, so `node --test` can load it.
 */
export function fileStream(filePath: string, range?: { start: number; end: number }): ReadableStream<Uint8Array> {
  const chunks = createReadStream(filePath, range)[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await chunks.next();
      if (done) controller.close();
      else controller.enqueue(value as Uint8Array);
    },
    async cancel() {
      // Ends the iteration, which destroys the file stream and closes its descriptor.
      await chunks.return?.();
    },
  });
}
