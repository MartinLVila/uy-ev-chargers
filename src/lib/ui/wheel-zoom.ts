export interface WheelZoom {
  enable(): void;
  disable(): void;
}

export interface FocusTarget {
  addEventListener(type: string, listener: (event: KeyboardEvent) => void): void;
  removeEventListener(type: string, listener: (event: KeyboardEvent) => void): void;
  blur(): void;
}

const TAKES_THE_WHEEL = "focusin";
const GIVES_IT_BACK = "focusout";
const HANDS_IT_BACK = "keydown";
const THE_WAY_OUT = "Escape";

export function wheelZoomFollowsFocus(target: FocusTarget, wheelZoom: WheelZoom): () => void {
  const take = () => wheelZoom.enable();
  const giveBack = () => wheelZoom.disable();
  const letGo = (event: KeyboardEvent) => {
    if (event.key === THE_WAY_OUT) target.blur();
  };

  wheelZoom.disable();
  target.addEventListener(TAKES_THE_WHEEL, take);
  target.addEventListener(GIVES_IT_BACK, giveBack);
  target.addEventListener(HANDS_IT_BACK, letGo);

  return () => {
    target.removeEventListener(TAKES_THE_WHEEL, take);
    target.removeEventListener(GIVES_IT_BACK, giveBack);
    target.removeEventListener(HANDS_IT_BACK, letGo);
    wheelZoom.disable();
  };
}
