import { Platform, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Screen height threshold below which we switch to compact mode.
 * Samsung Galaxy S23+ = ~851dp  (NOT compact)
 * Sony NW-ZX707       = ~640dp  (compact)
 */
const COMPACT_H = 700;

export const TAB_BAR_H_NORMAL = 52;
export const TAB_BAR_H_COMPACT = 48;

/**
 * Central hook that provides layout metrics for both large phones (S23+)
 * and small/compact players (NW-ZX707, 16:9 devices).
 *
 * Handles:
 *  • Artwork size capped by both width AND available vertical space
 *  • Extra bottom inset for Sony's persistent hardware playback bar
 *  • Compact spacing/font scale factor
 */
export function useLayout() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const isCompact = height < COMPACT_H;
  const tabBarH = isCompact ? TAB_BAR_H_COMPACT : TAB_BAR_H_NORMAL;

  // Safe-area top — already handles status bar + camera cutouts on all devices
  const topInset = Platform.OS === "web" ? 48 : insets.top;

  // Sony NW-ZX707 has persistent hardware playback controls at the bottom.
  // The OS may not include them in the safe-area inset, so we enforce a minimum.
  const rawBottom = Platform.OS === "web" ? 0 : insets.bottom;
  const bottomInset =
    isCompact && Platform.OS === "android"
      ? Math.max(rawBottom, 40) // floor for Sony hardware bar
      : rawBottom;

  // --- Player-screen layout arithmetic ---
  // We need to know how much vertical space remains for artwork after all
  // fixed-height siblings are accounted for.
  const artPadV = isCompact ? 10 : 16; // artWrapper paddingVertical (each side)
  const infoRowH = isCompact ? 54 : 66;
  const seekH = isCompact ? 52 : 64;
  const ctrlBtnH = isCompact ? 44 : 52; // visible button row height
  const ctrlGap = isCompact ? 12 : 28; // gap between controls and tab bar

  // All vertical space consumed BELOW topInset (except the artwork itself)
  const fixedBelowTop =
    44 + // topBar (buttons + its own padding)
    artPadV * 2 + // artWrapper padding top + bottom
    infoRowH + // title + artist + margin
    seekH + // slider + labels + margin
    ctrlBtnH + // prev / play / next buttons
    bottomInset + // safe-area floor (incl. Sony bar)
    tabBarH + // tab bar (absolutely positioned, overlaps content)
    ctrlGap; // visual gap between controls and tab bar

  const availableForArt = height - topInset - fixedBelowTop;
  const maxFromWidth = width - 48;
  const artSize = Math.max(Math.min(availableForArt, maxFromWidth, 340), 130);

  // Bottom padding applied to the controls row so it clears tab bar + safe area
  const controlsBottomPad = bottomInset + tabBarH + ctrlGap;

  // Compact scale factor for font sizes (1 = normal, <1 = smaller)
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
