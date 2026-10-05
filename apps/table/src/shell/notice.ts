/** Errors are named states on screen: what went wrong, and what to do. */
export function showNotice(message: string, level: "error" | "fatal" | "info" = "error"): void {
  document.querySelector(".notice")?.remove();
  const notice = document.createElement("p");
  notice.className = "notice";
  notice.dataset["level"] = level;
  notice.textContent = level === "fatal" ? message : `${message} Click to dismiss.`;
  if (level !== "fatal") {
    notice.addEventListener("click", () => notice.remove(), { once: true });
  }
  document.body.append(notice);
}

/** What went wrong, in the error's own words. */
export function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Do `action` in its own time, and if it fails say what the page could not
 * do, with the reason: `what` is the rest of "Could not …".
 */
export function attempt(what: string, action: () => Promise<void>): void {
  void (async () => {
    try {
      await action();
    } catch (error) {
      showNotice(`Could not ${what}: ${reasonOf(error)}`);
    }
  })();
}
