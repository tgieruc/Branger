export const MediaTypeOptions = {
  All: 'All',
  Videos: 'Videos',
  Images: 'Images',
};

export const launchImageLibraryAsync = jest.fn().mockResolvedValue({
  canceled: false,
  assets: [
    {
      uri: 'file://test-image.jpg',
      width: 100,
      height: 100,
      type: 'image',
    },
  ],
});

export const launchCameraAsync = jest.fn().mockResolvedValue({
  canceled: false,
  assets: [
    {
      uri: 'file://test-camera-image.jpg',
      width: 100,
      height: 100,
      type: 'image',
    },
  ],
});

export const requestMediaLibraryPermissionsAsync = jest.fn().mockResolvedValue({
  status: 'granted',
  granted: true,
});

export const requestCameraPermissionsAsync = jest.fn().mockResolvedValue({
  status: 'granted',
  granted: true,
});
