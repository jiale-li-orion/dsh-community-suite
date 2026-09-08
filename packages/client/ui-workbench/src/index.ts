/**
 * Web workbench plugin, node half. Pure UI plugin: the empty apply exists so
 * the plugin appears in the host cordis.yml / Loader (load and lifecycle
 * follow the host; the browser half ships via exports["./client"], discovered
 * through the package.json dsh.client declaration).
 */

/** Host plugin body — the workbench is a browser-side composition surface. */
export function apply(): void {}
