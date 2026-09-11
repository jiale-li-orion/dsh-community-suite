/**
 * The workbench's cross-plane protocol constant: where a listed file's bytes
 * are served. It lives here — with the domain, not with the route that
 * implements it — so the byte route, the listing that advertises it, and the
 * browser that builds URLs from it all read one value.
 * @module @deepseek-ai/dsh-workbench/protocol
 */

/**
 * Path prefix of the workbench byte route: `/workbench/file?sessionId=<id>&path=<path>`.
 * Registered by `dsh-workbench-bytes` and reported to clients through
 * {@link WorkbenchListing.fileRoute}.
 */
export const WORKBENCH_FILE_PATH = '/workbench/file'

/**
 * Path prefix of the workbench upload route:
 * `POST /workbench/upload?sessionId=<id>&name=<file name>` with the raw bytes as
 * the body. One file per request, so no multipart framing is involved and the
 * body streams to disk instead of being buffered.
 */
export const WORKBENCH_UPLOAD_PATH = '/workbench/upload'
