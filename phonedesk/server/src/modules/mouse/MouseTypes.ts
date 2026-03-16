export interface MouseMovePayload {
  dx: number;
  dy: number;
}

export interface MouseClickPayload {
  button: "left" | "right";
}

export interface MouseScrollPayload {
  dy: number;
}
