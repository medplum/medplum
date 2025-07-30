export const KubeConfig = jest.fn().mockImplementation(() => ({
  loadFromDefault: jest.fn(),
  makeApiClient: jest.fn().mockReturnValue({
    createNamespacedCustomObject: jest.fn().mockResolvedValue({}),
    patchNamespacedCustomObject: jest.fn().mockResolvedValue({}),
  }),
}));

export const CustomObjectsApi = jest.fn().mockImplementation(() => ({
  createNamespacedCustomObject: jest.fn().mockResolvedValue({}),
  patchNamespacedCustomObject: jest.fn().mockResolvedValue({}),
}));

export const PatchStrategy = {
  ServerSideApply: 'patch-apply',
};

export const setHeaderOptions = jest.fn().mockReturnValue({});
