export function withTimeout(promise, timeoutMs, label = "Request") {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s.`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    window.clearTimeout(timeoutId);
  });
}

export const TIMEOUTS = {
  chat: 120000,
  plan: 300000,
  apply: 120000,
  intelligence: 30000,
};
