// A menu shuts when a press lands anywhere but on it. The listener sits on
// the window in the capture phase, so it hears the press before whatever
// took it can stop it, and it leaves with the host.

import type { ReactiveController } from "lit";

interface Dismissal {
  /** A click for a menu opened by one; a pointerdown for one opened under a held button. */
  event: "click" | "pointerdown";
  isOpen: () => boolean;
  close: () => void;
}

/** Shuts the host's menu when a press lands outside the host; the host adds it as a controller. */
export class DismissWhenOutside implements ReactiveController {
  private readonly host: EventTarget;
  private readonly dismissal: Dismissal;

  constructor(host: EventTarget, dismissal: Dismissal) {
    this.host = host;
    this.dismissal = dismissal;
  }

  hostConnected(): void {
    window.addEventListener(this.dismissal.event, this.outside, true);
  }

  hostDisconnected(): void {
    window.removeEventListener(this.dismissal.event, this.outside, true);
  }

  private readonly outside = (event: Event): void => {
    if (this.dismissal.isOpen() && !event.composedPath().includes(this.host)) {
      this.dismissal.close();
    }
  };
}
