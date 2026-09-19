import { PACKAGE_VERSION } from "./const";
import type { LovelaceCardInfo } from "./types";

export const registerLovelaceCard = (info: LovelaceCardInfo): void => {
  window.customCards = window.customCards || [];
  if (window.customCards.some((card) => card.type === info.type)) {
    return;
  }
  window.customCards.push(info);
  console.info(
    `%c ${info.name.toUpperCase()} %c ${PACKAGE_VERSION} `,
    "color: white; background: #03a9f4; font-weight: 700;",
    "color: #03a9f4; background: white; font-weight: 700;",
  );
};
