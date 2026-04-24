import JSZip from "jszip";

/**
 * Build a ZIP blob from an array of file tuples.
 *
 * @param {{fileName: string, fileContent: string}[]} files - Ordered array of files to include.
 * @param {{compression?: string, type?: string}} [opts]
 * @returns {Promise<Blob|string>} Generated ZIP in the requested `type` (default: `blob`).
 *
 * Notes:
 * - This helper intentionally expects plain objects with `fileName` and
 *   `fileContent` properties so callers cannot accidentally pass arbitrary
 *   values to JSZip. Missing `fileName` entries are skipped.
 */
export async function buildZip(files, opts = {}) {
  const { compression = "DEFLATE", type = "blob" } = opts;
  const zip = new JSZip();

  if (!Array.isArray(files)) throw new TypeError("files must be an array of {fileName,fileContent} objects");

  for (const f of files) {
    if (!f || !f.fileName) continue;
    zip.file(String(f.fileName), f.fileContent == null ? "" : f.fileContent);
  }

  return await zip.generateAsync({ type, compression });
}
