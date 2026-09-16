/** Send `name` from `host` with `detail`, bubbling and crossing shadow roots so the app hears it on the element. */
export function emit<T>(host: EventTarget, name: string, detail?: T): void {
  host.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
}
