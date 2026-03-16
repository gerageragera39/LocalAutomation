export interface IMouseStrategy {
  move(dx: number, dy: number): Promise<void>;
  click(button: "left" | "right"): Promise<void>;
  scroll(dy: number): Promise<void>;
}
