export class SerialActionQueue<T> {
  private items: T[] = [];

  get length(): number {
    return this.items.length;
  }

  enqueue(item: T): void {
    this.items.push(item);
  }

  shift(): T | undefined {
    return this.items.shift();
  }

  clear(): void {
    this.items = [];
  }
}
