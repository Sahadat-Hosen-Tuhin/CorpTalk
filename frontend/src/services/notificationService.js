export const notifyApp = (message, type = 'info') => {
  window.dispatchEvent(
    new CustomEvent('corptalk:notification', {
      detail: { message, type },
    }),
  );
};
