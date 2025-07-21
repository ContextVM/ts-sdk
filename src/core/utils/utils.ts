/**
 * Sleeps for a specified number of milliseconds.
 * @param ms The number of milliseconds to sleep.
 * @returns A promise that resolves after the specified number of milliseconds.
 */
export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));
