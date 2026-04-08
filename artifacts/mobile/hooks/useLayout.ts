import { Platform, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Screen height threshold below which we switch to compact mode.
 * Samsung Galaxy S23+ = ~851dp  (NOT compact)
 * Sony NW-ZX707       = ~640dp  (compact)
 */
const COMPACT_H = 700;

export const TAB_BAR_H_NORMAL = 64;   // taller — includes label text
export const TAB_BAR_H_COMPACT = 50;  // compact — icon only, no label

export function useLayout() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const isCompact = height < COMPACT_H;
  const tabBarH = isCompact ? TAB_BAR_H_COMPACT : TAB_BAR_H_NORMAL;

  const topInset = Platform.OS === "web" ? 48 : insets.top;

  const rawBottom = Platform.OS === "web" ? 0 : insets.bottom;
  const bottomInset =
    isCompact && Platform.OS === "android"
      ? Math.max(rawBottom, 40)
      : rawBottom;

  const artPadV   = isCompact ? 8  : 14;
  const infoRowH  = isCompact ? 54 : 68;
  const seekH     = isCompact ? 52 : 64;
  const ctrlBtnH  = isCompact ? 44 : 56;
  const ctrlGap   = isCompact ? 8  : 24;
  const topBarH   = isCompact ? 40 : 48;

  const fixedBelowTop =
    topBarH +
    artPadV * 2 +
    infoRowH +
    seekH +
    ctrlBtnH +
    bottomInset +
    tabBarH +
    ctrlGap;

  const availableForArt = height - topInset - fixedBelowTop;
  const maxFromWidth = width - 40;
  const artSize = Math.max(Math.min(availableForArt, maxFromWidth, 340), 120);

  const controlsBottomPad = bottomInset + tabBarH + ctrlGap;
  const fontScale = isCompact ? 0.87 : 1;

  return {
    width,
    height,
    isCompact,
    tabBarH,
    topInset,
    bottomInset,
    artSize,
    artPadV,
    controlsBottomPad,
    fontScale,
  };
}
