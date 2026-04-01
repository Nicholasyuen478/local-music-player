import * as Haptics from "expo-haptics";
import React, { useCallback } from "react";
import { Platform, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ImageEditor } from "expo-dynamic-image-crop-expo54";

type Props = {
  visible: boolean;
  uri: string | null;
  onSave: (croppedUri: string, originalUri: string) => void;
  onClose: () => void;
};

export function CropModal({ visible, uri, onSave, onClose }: Props) {
  const insets = useSafeAreaInsets();

  // Push the control bar down enough to clear the status bar / notch
  const controlBarHeight = 80 + (Platform.OS === "web" ? 48 : insets.top);

  const handleComplete = useCallback(
    (data: { uri: string }) => {
      if (!uri) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSave(data.uri, uri);
    },
    [uri, onSave],
  );

  const handleCancel = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  }, [onClose]);

  if (!uri) return null;

  return (
    <ImageEditor
      isVisible={visible}
      imageUri={uri}
      onEditingComplete={handleComplete}
      onEditingCancel={handleCancel}
      fixedAspectRatio={1}
      minimumCropDimensions={{ width: 100, height: 100 }}
      editorOptions={{
        backgroundColor: "#000",
        controlBar: {
          position: "top",
          backgroundColor: "rgba(0,0,0,0.75)",
          height: controlBarHeight,
          cancelButton: {
            text: "Cancel",
            color: "#fff",
            iconName: "x",
          },
          saveButton: {
            text: "Done",
            color: "#fff",
            iconName: "check",
          },
          backButton: {
            text: "Back",
            color: "#fff",
            iconName: "arrow-left",
          },
          cropButton: {
            text: "Crop",
            color: "#fff",
            iconName: "crop",
          },
        },
        gridOverlayColor: "rgba(255,255,255,0.22)",
        overlayCropColor: "rgba(0,0,0,0.62)",
        coverMarker: {
          show: true,
          color: "#fff",
        },
      }}
    />
  );
}
