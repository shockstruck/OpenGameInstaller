export class RendererEventReadiness {
  private ready = false;
  private readonly waiters = new Set<() => void>();
  private readonly readyCallbacks = new Set<() => void>();

  public isReady(): boolean {
    return this.ready;
  }

  public markReady(): void {
    this.ready = true;
    for (const waiter of this.waiters) waiter();
    this.waiters.clear();
    for (const callback of this.readyCallbacks) callback();
    this.readyCallbacks.clear();
  }

  public reset(): void {
    this.ready = false;
  }

  /**
   * Runs `callback` immediately if already ready, otherwise queues it to run
   * once on the next `markReady()`. Queued callbacks survive `reset()` — they
   * still run on the next readiness, not the one that was reset away.
   */
  public whenReady(callback: () => void): void {
    if (this.ready) {
      callback();
      return;
    }
    this.readyCallbacks.add(callback);
  }

  public wait(timeoutMs: number, onTimeout: () => void): Promise<void> {
    if (this.ready) return Promise.resolve();

    return new Promise((resolve) => {
      const finish = (): void => {
        clearTimeout(timeout);
        this.waiters.delete(finish);
        resolve();
      };
      const timeout = setTimeout(() => {
        this.waiters.delete(finish);
        onTimeout();
        resolve();
      }, timeoutMs);
      this.waiters.add(finish);
    });
  }
}
