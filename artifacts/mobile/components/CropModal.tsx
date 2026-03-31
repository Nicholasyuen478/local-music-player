import * as Haptics from "expo-haptics";
import React, { useCallback } from "react";
import { Platform, View, StyleSheet } from "react-native";
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
  
  // Use the exact same padding logic as ImagesScreen
  const topInset = Platform.OS === "web" ? 48 : insets.top;

  const handleComplete = useCallback(
    (data: { uri: string }) => {
      if (!uri) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSave(data.uri, uri);
    },
    [uri, onSave]
  );

  const handleCancel = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  }, [onClose]);

  if (!uri || !visible) return null;

  return (
    // We wrap the editor in a View that adds the exact same padding
    // you use in ImagesScreen, pushing the control bar safely down.
    <View style={[styles.container, { paddingTop: topInset }]}>
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
            height: 56, // Standard header height, no longer needs manual inset addition
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000", // Matches the editor background so the notch area isn't blank
  },
});