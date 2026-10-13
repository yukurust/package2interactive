/** Compare against the last drawn frame, so tiny movements accumulate. */
export class RenderGate {
  private previous: number[] = [];
  private dirty = true;

  invalidate() { this.dirty = true; }

  changed(values: number[]) {
    if (!this.dirty && values.length === this.previous.length
      && values.every((value, i) => Math.abs(value - this.previous[i]) < 1e-5)) return false;
    this.previous = values;
    this.dirty = false;
    return true;
  }
}
